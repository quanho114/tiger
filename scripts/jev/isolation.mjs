import { withTimeout } from './safety.mjs';

// Never serialize process termination behind a potentially stalled CDP disconnect.
export async function cleanupOwned({ children, disconnect = async () => {}, closeFixture = async () => {}, removeWork = async () => {}, kill = process.kill, graceMs = 250, budgetMs = 2500 }) {
  const signal = sig => {
    for (const child of [...children].reverse()) {
      if (Number.isInteger(child.pid) && child.pid > 0) {
        try { kill(-child.pid, sig); } catch { /* already exited */ }
      }
    }
  };
  signal('SIGTERM');
  const disconnected = Promise.resolve().then(disconnect).catch(() => {});
  await new Promise(resolve => setTimeout(resolve, graceMs));
  signal('SIGKILL');
  await withTimeout(Promise.allSettled([
    disconnected, Promise.resolve().then(closeFixture), Promise.resolve().then(removeWork),
  ]), budgetMs).catch(() => {});
}

export async function guardedContext(browser, origins) {
  // A fresh non-default context prevents existing workers and applies Playwright's
  // Chromium service-worker blocking policy before any Jev target is created.
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const request = route.request();
    const allowed = origins.includes(new URL(request.url()).origin);
    return allowed && ['GET', 'HEAD', 'OPTIONS'].includes(request.method()) ? route.continue() : route.abort();
  });
  // Routing a socket without connectToServer prevents the network handshake.
  await context.routeWebSocket('**/*', socket => socket.close());
  const bootstrap = await context.newPage();
  const session = await context.newCDPSession(bootstrap);
  const { targetInfo } = await session.send('Target.getTargetInfo');
  if (!targetInfo.browserContextId) throw Error('CONTEXT_UNAVAILABLE');
  await session.detach();
  await bootstrap.close();
  return { context, contextId: targetInfo.browserContextId };
}
