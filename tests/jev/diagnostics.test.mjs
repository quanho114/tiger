import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { adapterDiagnostic } from '../../scripts/jev/diagnostics.mjs';
import { publicEnv } from '../../scripts/jev/safety.mjs';

test('adapter diagnostics classify known failures without exposing exception text', () => {
  const script = `
import runpy, json
m = runpy.run_path('scripts/jev/adapter.py')
d = m['diagnostic']
cases = [
 (RuntimeError('sentinel-secret'), 'agent_init'),
 (RuntimeError('Model provider returned HTTP 401; no action executed.'), 'predict'),
 (RuntimeError('Model connection failed; no action executed.'), 'action'),
 (ValueError('Invalid TypeSafe response; no action executed.'), 'predict'),
 (json.JSONDecodeError('sentinel-secret', 'sentinel-secret', 0), 'predict'),
 (RuntimeError('sentinel-secret'), 'action'),
 (RuntimeError('sentinel-secret'), 'assertions'),
 (RuntimeError('sentinel-secret'), 'cleanup'),
 (RuntimeError('Model provider returned HTTP 401; no action executed. sentinel-secret'), 'predict'),
]
print(json.dumps([d(e, s) for e, s in cases]))
`;
  const result = spawnSync('jev-ultrafast/.venv/bin/python', ['-B', '-c', script], {
    env: publicEnv(process.env), encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes('sentinel-secret'), false);
  const values = JSON.parse(result.stdout);
  assert.deepEqual(values.map(v => v.reason), ['BROWSER_ERROR', 'MODEL_HTTP_ERROR', 'MODEL_CONNECTION_ERROR',
    'MODEL_INVALID_RESPONSE', 'MODEL_INVALID_RESPONSE', 'ACTION_ERROR', 'ASSERTIONS_ERROR', 'CLEANUP_ERROR', 'BROWSER_ERROR']);
  assert.equal(values[1].http_status, 401);
  for (const value of values) assert.equal(adapterDiagnostic(JSON.stringify(value)).reason, value.reason);
});

test('runner only accepts allowlisted fields and bounded integer HTTP status', () => {
  assert.deepEqual(adapterDiagnostic(JSON.stringify({status:'error', stage:'predict', reason:'MODEL_HTTP_ERROR', http_status:403, secret:'sentinel'})),
    {stage:'predict', reason:'MODEL_HTTP_ERROR', http_status:403});
  for (const input of ['secret', 'null', '{', JSON.stringify({status:'error',stage:'secret',reason:'ACTION_ERROR'}),
    JSON.stringify({status:'error',stage:'action',reason:'secret'})]) assert.deepEqual(adapterDiagnostic(input), {});
  const value = {status:'error',stage:'predict',reason:'MODEL_HTTP_ERROR'};
  for (const http_status of ['401', 999, 399, 401.5]) assert.deepEqual(adapterDiagnostic(JSON.stringify({...value,http_status})),
    {stage:'predict',reason:'MODEL_HTTP_ERROR'});
});

test('adapter setup failure remains nonzero with sanitized structured output', () => {
  const result = spawnSync('jev-ultrafast/.venv/bin/python', ['-B', 'scripts/jev/adapter.py'], {
    env: {...publicEnv(process.env), BU_NAME:'sentinel-secret'}, encoding:'utf8', timeout:10000,
  });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {status:'error',stage:'setup',reason:'ADAPTER_ERROR'});
  assert.equal(result.stderr, '');
});
