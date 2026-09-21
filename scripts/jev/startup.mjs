// Only readiness probes repeat, never browser mutations.
export async function waitForDaemon(daemon, ping) {
  let stopped = false;
  const exited = daemon.done.then(
    () => { throw Error('DAEMON_EXITED'); },
    () => { throw Error('DAEMON_EXITED'); },
  );
  const ready = async () => {
    while (!stopped) {
      if (await ping()) return;
      if (!stopped) await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  try { await Promise.race([exited, ready()]); }
  finally { stopped = true; }
}
