#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, mkdtemp, mkdir, open, readFile, realpath, writeFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { parseArgs, publicEnv, outcome, withTimeout } from './safety.mjs';
import { startFixture } from './fixture.mjs';
import { cleanupOwned, guardedContext } from './isolation.mjs';
import { waitForDaemon } from './startup.mjs';
import { adapterDiagnostic } from './diagnostics.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const project = path.join(root, 'jev-ultrafast');
const adapter = path.join(root, 'scripts/jev/adapter.py');
const baseEnv = publicEnv(process.env);
const children = [];
let work, runtimeHandle, fixture, browserConnection, cancelled = false;
let report = { status: 'BLOCKED', executed: false, scenario: 'menu', guide: 'docs/jev-automation.md' };
function child(cmd, args, env = baseEnv, ipc = false, diagnostic = false) {
  if (cancelled) throw Error('INTERRUPTED');
  const proc = spawn(cmd, args, { cwd: work || root, env, detached: true, stdio: ['ignore', 'pipe', 'ignore', ...(ipc ? ['ipc'] : [])] });
  children.push(proc);
  let output = '';
  proc.stdout.on('data', b => { output = (output + b.toString()).slice(0, 16384); });
  proc.done = new Promise((resolve, reject) => {
    proc.once('error', () => reject(Error('CHILD_FAILED')));
    proc.once('close', code => code === 0 ? resolve(output) : reject(Object.assign(Error('CHILD_FAILED'),
      diagnostic ? { diagnostic: adapterDiagnostic(output) } : {})));
  });
  proc.done.catch(() => {});
  return proc;
}
async function executable(names) {
  for (const name of names) for (const dir of name.startsWith('/') ? [''] : (baseEnv.PATH || '').split(path.delimiter)) {
    const candidate = path.join(dir, name);
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* next */ }
  }
  return null;
}
const sleep = async ms => { await new Promise(resolve => setTimeout(resolve, ms)); };
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function cleanup() {
  cancelled = true;
  await cleanupOwned({ children,
    disconnect: () => browserConnection?.close(),
    closeFixture: () => fixture?.close(),
    removeWork: () => work && rm(work, { recursive: true, force: true }),
  });
  await runtimeHandle?.close();
}
let interrupted;
for (const sig of ['SIGINT','SIGTERM']) process.once(sig, () => { interrupted?.(); });
try {
  const options = parseArgs(process.argv.slice(2));
  const uv = await executable(['uv']);
  const chrome = await executable(['google-chrome','chromium','chromium-browser','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']);
  const missing = [];
  if (process.platform === 'win32') missing.push('POSIX_REQUIRED');
  if (!uv) missing.push('UV');
  if (!chrome) missing.push('CHROME');
  for (const file of ['node_modules/vite/package.json','jev-ultrafast/uv.lock','jev-ultrafast/pyproject.toml']) {
    try { await access(path.join(root, file)); } catch { missing.push('DEPENDENCIES'); }
  }
  for (const key of ['TYPESAFE_API_KEY','TEXT_MODEL_API_KEY']) if (!process.env[key]?.trim()) missing.push(key);
  report.missing = missing;
  if (missing.some(k => !['TYPESAFE_API_KEY','TEXT_MODEL_API_KEY'].includes(k)) || (options.live && missing.length)) report.reason = 'SETUP_REQUIRED';
  else {
    work = await mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'tiger-jev-work-'));
    const runtime = path.join(work, 'runtime');
    await mkdir(runtime, { mode: 0o700 });
    let runtimeAlias;
    if (process.platform === 'linux') {
      // Parent owns this descriptor until all children are stopped; no CLOEXEC
      // inheritance through uv/Python is needed and nothing is created in /tmp.
      runtimeHandle = await open(runtime, 'r');
      runtimeAlias = `/proc/${process.pid}/fd/${runtimeHandle.fd}`;
      await access(runtimeAlias);
    } else if (Buffer.byteLength(path.join(await realpath(runtime), 'bu.sock')) >= 104) {
      throw Error('SOCKET_PATH_UNSUPPORTED');
    }
    const env = { ...baseEnv, HOME: work, TMPDIR: runtimeAlias || runtime,
      BH_HOME: path.join(work, 'harness'), BH_RUNTIME_DIR: runtime,
      ...(runtimeAlias ? { JEV_RUNTIME_ALIAS: runtimeAlias } : {}),
      UV_NO_ENV_FILE: '1', PYTHONDONTWRITEBYTECODE: '1' };
    const python = args => ['run','--no-sync','--no-env-file','--project',project,'python',adapter,...args];
    const operation = async () => {
      // Frozen dependency installation is not a model/API call.
      await child(uv, ['sync','--frozen','--project',project], { ...baseEnv, TMPDIR: env.TMPDIR }).done;
      const support = JSON.parse(await child(uv, python(['--check']), env).done);
      if (support.supported !== true) throw Error('HARNESS_UNSUPPORTED');
      if (!options.live) { report.status = missing.length ? 'BLOCKED' : 'READY'; if (missing.length) report.reason = 'SETUP_REQUIRED'; return; }
      fixture = await startFixture();
      const port = await freePort();
      const vite = child(process.execPath, [path.join(root,'scripts/jev/vite.mjs'),root], {
        ...env, JEV_PORT: String(port), JEV_CACHE: path.join(work,'vite-cache'),
        VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_ANON_KEY: 'jev-synthetic-anon-not-a-secret',
      }, true);
      await Promise.race([new Promise(resolve => vite.once('message', m => { if (m.ready === true) resolve(); })), vite.done.then(() => { throw Error('VITE_EXITED'); })]);
      const profile = path.join(work,'chrome');
      await mkdir(profile);
      child(chrome, ['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
        '--disable-sync','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`, 'about:blank'], env);
      let ws;
      while (!ws) {
        if (cancelled) throw Error('INTERRUPTED');
        try {
          const [p, suffix] = (await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
          if (/^\d+$/.test(p) && Number(p) > 0 && Number(p) < 65536 && /^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(suffix)) ws = `ws://127.0.0.1:${p}${suffix}`;
        } catch {}
        if (!ws) await sleep(100);
      }
      const { chromium } = await import('playwright-core');
      browserConnection = await chromium.connectOverCDP(ws);
      const { contextId } = await guardedContext(browserConnection, [`http://127.0.0.1:${port}`, fixture.url]);
      const owned = { ...env, BU_NAME: `jev-${randomBytes(12).toString('hex')}`, BU_CDP_WS: ws, JEV_CONTEXT_ID: contextId, JEV_URL: `http://127.0.0.1:${port}/menu` };
      const daemon = child(uv, python(['--daemon']), owned);
      await waitForDaemon(daemon, async () => {
        if (cancelled) throw Error('INTERRUPTED');
        return JSON.parse(await child(uv, python(['--ping']), owned).done).ready === true;
      });
      const paidEnv = { ...owned };
      for (const key of ['TYPESAFE_API_KEY','TEXT_MODEL_API_KEY','TEXT_MODEL','TEXT_MODEL_BASE_URL']) if (process.env[key]) paidEnv[key] = process.env[key];
      report.executed = true;
      const result = JSON.parse(await child(uv, python([]), paidEnv, false, true).done);
      report.status = outcome(result);
      report.assertions = { menu: result.assertions?.menu === true, delivery: result.assertions?.delivery === true };
      for (const key of ['actions','decisions','text_calls']) report[key] = Number.isSafeInteger(result[key]) ? result[key] : 0;
    };
    await withTimeout(Promise.race([operation(), new Promise((_, reject) => { interrupted = () => reject(Error('INTERRUPTED')); })]), options.timeout * 1000);
  }
} catch (error) {
  report.status = report.executed ? 'FAILED' : 'BLOCKED';
  report.reason = ['INVALID_ARGUMENTS','TIMEOUT','HARNESS_UNSUPPORTED','INTERRUPTED','DAEMON_EXITED','SOCKET_PATH_UNSUPPORTED'].includes(error.message) ? error.message : 'RUNNER_ERROR';
  if (report.executed && error.diagnostic) Object.assign(report, error.diagnostic);
} finally {
  await cleanup();
  const dir = await mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'tiger-jev-report-'));
  await writeFile(path.join(dir,'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ ...report, report: path.join(dir,'report.json') }));
  process.exitCode = ['READY','PASSED'].includes(report.status) ? 0 : 2;
}
