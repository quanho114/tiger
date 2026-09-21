import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { chromium } from 'playwright-core';
import { cleanupOwned, guardedContext } from '../../scripts/jev/isolation.mjs';
import { withTimeout } from '../../scripts/jev/safety.mjs';
const stalled = () => new Promise(() => {});

test('cleanup signals groups even with stalled disconnect, fixture and removal', async () => {
  const signals = [];
  const started = Date.now();
  await cleanupOwned({ children: [{pid:42}], disconnect: stalled, closeFixture: stalled, removeWork: stalled,
    kill: (...args) => signals.push(args), graceMs: 10, budgetMs: 30 });
  assert.deepEqual(signals, [[-42,'SIGTERM'],[-42,'SIGKILL']]);
  assert.ok(Date.now() - started < 500);
});

test('cleanup kills real TERM-resistant owned child despite stalled disconnect', {timeout:3000}, async () => {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{}); console.log('ready'); setInterval(()=>{},1000)"], {detached:true,stdio:['ignore','pipe','ignore']});
  const exited = once(child, 'exit');
  try {
    await once(child.stdout, 'data');
    await cleanupOwned({children:[child], disconnect:stalled, graceMs:20,budgetMs:30});
    const [, signal] = await withTimeout(exited, 1000);
    assert.equal(signal, 'SIGKILL');
  } finally { try { process.kill(-child.pid,'SIGKILL'); } catch {} }
});

test('CDP-created target blocks external HTTP, WebSocket and service worker traffic', {skip:!process.env.JEV_OFFLINE_CHROME,timeout:20000}, async () => {
  let canaryRequests = 0, workerScripts = 0;
  const canary = http.createServer((req,res) => { canaryRequests++; res.end('canary'); });
  canary.on('upgrade', (req,socket) => { canaryRequests++; socket.destroy(); });
  await new Promise(resolve => canary.listen(0,'127.0.0.1',resolve));
  const external = `http://127.0.0.1:${canary.address().port}`;
  const source = http.createServer((req,res) => {
    if (req.url === '/sw.js') { workerScripts++; res.setHeader('Content-Type','application/javascript'); res.end(`fetch('${external}/worker');`); }
    else { res.setHeader('Content-Type','text/html'); res.end('<!doctype html><title>guard test</title>'); }
  });
  await new Promise(resolve => source.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${source.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.JEV_OFFLINE_CHROME,headless:true});
    const {context,contextId} = await guardedContext(browser,[origin]);
    const cdp = await browser.newBrowserCDPSession();
    const created = context.waitForEvent('page');
    const {targetId} = await cdp.send('Target.createTarget',{url:'about:blank',browserContextId:contextId});
    const page = await created;
    assert.equal((await cdp.send('Target.getTargetInfo',{targetId})).targetInfo.browserContextId, contextId);
    await page.goto(origin);
    const result = await page.evaluate(async external => {
      let httpBlocked = false;
      try { await fetch(external + '/http'); } catch { httpBlocked = true; }
      const wsClosed = await new Promise(resolve => {
        const ws = new WebSocket(external.replace('http:','ws:') + '/socket');
        ws.onclose = () => resolve(true); ws.onerror = () => resolve(true);
        setTimeout(() => resolve(false),1000);
      });
      let workerBlocked = false;
      try { workerBlocked = !(await navigator.serviceWorker.register('/sw.js')); } catch { workerBlocked = true; }
      return {httpBlocked,wsClosed,workerBlocked};
    },external);
    await new Promise(resolve => setTimeout(resolve,300));
    assert.deepEqual(result,{httpBlocked:true,wsClosed:true,workerBlocked:true});
    assert.equal(workerScripts,0);
    assert.equal(canaryRequests,0);
    assert.equal(context.serviceWorkers().length,0);
  } finally {
    await browser?.close();
    for (const server of [source,canary]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
});
