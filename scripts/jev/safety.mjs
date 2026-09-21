export function parseArgs(args) {
  let mode; let scenario = 'menu'; let timeout = 120;
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (seen.has(key)) throw Error('INVALID_ARGUMENTS');
    seen.add(key);
    if (key === '--check' || key === '--live') {
      if (mode) throw Error('INVALID_ARGUMENTS');
      mode = key;
    } else if (key === '--scenario') {
      scenario = args[++i];
      if (scenario !== 'menu') throw Error('INVALID_ARGUMENTS');
    } else if (key === '--timeout') {
      const value = args[++i];
      if (!/^\d+$/.test(value ?? '')) throw Error('INVALID_ARGUMENTS');
      timeout = Number(value);
      if (timeout < 10 || timeout > 300) throw Error('INVALID_ARGUMENTS');
    } else throw Error('INVALID_ARGUMENTS');
  }
  if (!mode) throw Error('INVALID_ARGUMENTS');
  return { live: mode === '--live', scenario, timeout };
}
export function publicEnv(env) {
  return Object.fromEntries(['PATH','HOME','LANG','SYSTEMROOT','TMPDIR'].filter(k => env[k]).map(k => [k, env[k]]));
}
export function outcome(result) {
  return result.status === 'done' && result.actions > 0 && result.assertions?.menu === true && result.assertions?.delivery === true ? 'PASSED' : 'FAILED';
}
export async function withTimeout(promise, ms) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('TIMEOUT')), ms); })]); }
  finally { clearTimeout(timer); }
}
