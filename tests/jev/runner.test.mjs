import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseArgs, publicEnv, outcome, withTimeout } from '../../scripts/jev/safety.mjs';
import { startFixture } from '../../scripts/jev/fixture.mjs';

test('only explicit modes and allowlisted scenario; no arbitrary input', () => {
  assert.equal(parseArgs(['--check']).live, false);
  assert.equal(parseArgs(['--live', '--scenario', 'menu']).live, true);
  for (const args of [[], ['--live','--check'], ['--url','https://evil.test'], ['--scenario','../../.env'], ['--live','--goal','buy'], ['--live','--timeout','0'], ['--live','--timeout','Infinity'], ['--live','--timeout','3;echo hi']]) assert.throws(() => parseArgs(args));
});
test('provider secrets and existing browser config never reach ordinary children', () => {
  const env = publicEnv({ PATH: '/bin', TEXT_MODEL_API_KEY: 'secret', TYPESAFE_API_KEY: 'secret', BU_NAME: 'default', VITE_SUPABASE_URL: 'https://production', NODE_OPTIONS: '--require evil' });
  assert.deepEqual(env, { PATH: '/bin' });
});
test('DONE alone never passes; actions and independent assertions required', () => {
  assert.equal(outcome({status:'done', actions:1, assertions:{menu:false, delivery:true}}), 'FAILED');
  assert.equal(outcome({status:'done', actions:0, assertions:{menu:true, delivery:true}}), 'FAILED');
  assert.equal(outcome({status:'done', actions:1, assertions:{menu:true, delivery:true}}), 'PASSED');
});
test('bounded wait times out', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 10), /TIMEOUT/);
});
test('fixture public envelopes and deny every mutation including auth and concierge', async () => {
  const fixture = await startFixture();
  try {
    const res = await fetch(`${fixture.url}/functions/v1/public-api/menu`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.items[0].id, 'jev-beef');
    for (const path of ['/functions/v1/public-api/orders','/functions/v1/public-api/reservations','/auth/v1/token','/functions/v1/concierge/chat']) {
      for (const method of ['POST','PUT','PATCH','DELETE']) assert.equal((await fetch(fixture.url + path, {method})).status, 403);
    }
    assert.equal((await fetch(fixture.url + '/unknown')).status, 403);
  } finally { await fixture.close(); }
});
test('missing text key blocks live before execution and never leaks inherited secret', () => {
  const result = spawnSync(process.execPath, ['scripts/jev/run.mjs','--live'], {
    env: {...publicEnv(process.env), PI_SCRATCH_DIR: process.env.PI_SCRATCH_DIR, TYPESAFE_API_KEY: 'sentinel-do-not-print'}, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 2);
  assert.equal(result.stdout.includes('sentinel-do-not-print'), false);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.executed, false);
  assert.ok(report.missing.includes('TEXT_MODEL_API_KEY'));
});
