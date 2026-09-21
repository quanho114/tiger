#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const py = `
import keyring, json
keys = ['TYPESAFE_API_KEY', 'TEXT_MODEL_API_KEY', 'TEXT_MODEL_BASE_URL', 'TEXT_MODEL']
res = {k: keyring.get_password('tiger-jev', k) for k in keys}
print(json.dumps({k: v for k, v in res.items() if v}))
`;

let creds = {};
try {
  const out = spawnSync('python3', ['-c', py], { encoding: 'utf8', timeout: 3000 });
  if (out.status === 0 && out.stdout.trim()) {
    creds = JSON.parse(out.stdout.trim());
  }
} catch {}

const args = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['--live', '--scenario', 'menu'];
const child = spawnSync(process.execPath, ['scripts/jev/run.mjs', ...args], {
  env: { ...process.env, ...creds },
  stdio: 'inherit',
});

process.exit(child.status ?? 1);
