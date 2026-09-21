import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { chromium } from 'playwright-core';
import { startFixture } from '../../scripts/jev/fixture.mjs';
import { publicEnv, withTimeout } from '../../scripts/jev/safety.mjs';

test('offline owned Vite renders fixture; manual DOM check is NOT a Jev live pass', { skip: !process.env.JEV_OFFLINE_CHROME, timeout: 30000 }, async () => {
  const work = await mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'jev-offline-'));
  const fixture = await startFixture();
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const vite = spawn(process.execPath, ['scripts/jev/vite.mjs', process.cwd()], {
    env: { ...publicEnv(process.env), JEV_PORT: String(port), JEV_CACHE: path.join(work,'cache'), VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_ANON_KEY: 'synthetic-anon' },
    stdio: ['ignore','ignore','ignore','ipc'],
  });
  let browser;
  try {
    await withTimeout(new Promise(resolve => vite.once('message', resolve)), 10000);
    browser = await chromium.launch({ executablePath: process.env.JEV_OFFLINE_CHROME, headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/menu`);
    await page.locator('article[data-dish-id="jev-beef"]').waitFor();
    await page.getByRole('tab', { name: /giao tận nơi/i }).first().click();
    assert.match(page.url(), /mode=delivery/);
    assert.equal(await page.locator('article[data-dish-id="jev-beef"]').isVisible(), true);
  } finally {
    await browser?.close();
    vite.kill('SIGTERM');
    await fixture.close();
    await rm(work, {recursive:true,force:true});
  }
});
