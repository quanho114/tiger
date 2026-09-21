import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, open, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { publicEnv, withTimeout } from '../../scripts/jev/safety.mjs';
import { waitForDaemon } from '../../scripts/jev/startup.mjs';

const root = process.cwd();
const python = path.join(root, 'jev-ultrafast/.venv/bin/python');
const adapter = path.join(root, 'scripts/jev/adapter.py');
function launch(command, args, env) {
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'ignore'] });
  let output = '';
  child.stdout.on('data', b => { output += b; });
  child.done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve(output) : reject(Error('CHILD_FAILED')));
  });
  child.done.catch(() => {});
  return child;
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 500);
  try { await child.done; } catch {} finally { clearTimeout(timer); }
}

test('real unpaid daemon starts in deep scratch and socket stays in scratch', {
  skip: !process.env.JEV_OFFLINE_CHROME || process.platform !== 'linux', timeout: 20000,
}, async () => {
  assert.ok(process.env.PI_SCRATCH_DIR, 'scratch required for offline Chrome');
  const work = await mkdtemp(path.join(process.env.PI_SCRATCH_DIR, 'jev-startup-'));
  const deep = path.join(work, 'deep-'.repeat(35));
  const runtime = path.join(deep, 'runtime');
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const directory = await open(runtime, 'r');
  const alias = `/proc/${process.pid}/fd/${directory.fd}`;
  const env = { ...publicEnv(process.env), HOME: deep, TMPDIR: alias, BH_HOME: path.join(deep, 'harness'),
    BH_RUNTIME_DIR: runtime, JEV_RUNTIME_ALIAS: alias, PYTHONDONTWRITEBYTECODE: '1',
    BU_NAME: `jev-${'a'.repeat(24)}` };
  let chrome, daemon;
  try {
    chrome = launch(process.env.JEV_OFFLINE_CHROME, ['--headless=new', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-sync', '--remote-debugging-port=0',
      `--user-data-dir=${path.join(deep, 'chrome')}`, 'about:blank'], env);
    const readyChrome = async () => {
      for (let i = 0; i < 100; i++) {
        try {
          const [port, suffix] = (await readFile(path.join(deep, 'chrome/DevToolsActivePort'), 'utf8')).trim().split('\n');
          return `ws://127.0.0.1:${port}${suffix}`;
        } catch { await new Promise(r => setTimeout(r, 50)); }
      }
      throw Error('CHROME_TIMEOUT');
    };
    env.BU_CDP_WS = await withTimeout(Promise.race([readyChrome(), chrome.done.then(() => { throw Error('CHROME_EXITED'); })]), 8000);
    daemon = launch(python, [adapter, '--daemon'], env);
    const ping = async () => JSON.parse(await launch(python, [adapter, '--ping'], env).done).ready;
    assert.ok(Buffer.byteLength(path.join(runtime, 'bu.sock')) > 108);
    await withTimeout(waitForDaemon(daemon, ping), 5000);
    assert.equal((await stat(path.join(runtime, 'bu.sock'))).isSocket(), true);
    assert.equal(await ping(), true);
  } finally {
    await stop(daemon);
    await stop(chrome);
    await directory.close();
    await rm(work, { recursive: true, force: true });
  }
  await assert.rejects(stat(work), { code: 'ENOENT' });
  await assert.rejects(stat(alias), { code: 'ENOENT' });
});

test('daemon exits fail immediately and sanitize both success and error exits', async () => {
  for (const done of [Promise.resolve('secret output'), Promise.reject(Error('secret stderr'))]) {
    done.catch(() => {});
    await assert.rejects(withTimeout(waitForDaemon({ done }, () => new Promise(() => {})), 500),
      { message: 'DAEMON_EXITED' });
  }
});

test('daemon failure stops readiness polling; late rejection is handled', async () => {
  let fail, rejectPing, calls = 0;
  const done = new Promise((_, reject) => { fail = reject; });
  const waiting = waitForDaemon({ done }, () => {
    calls++;
    return new Promise((_, reject) => { rejectPing = reject; });
  });
  fail(Error('private error'));
  await assert.rejects(waiting, { message: 'DAEMON_EXITED' });
  rejectPing(Error('late private error'));
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(calls, 1);
});
