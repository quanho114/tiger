import { createServer } from 'node:http'
import type pg from 'pg'
import { handlePublicApi } from '../../supabase/functions/public-api/index.ts'
import type { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'
import type { ConciergeV2SessionStore } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'

export async function createConciergeHttpBridge(options: { pool: pg.Pool; store: ConciergeV2SessionStore;
  orchestrator: ConciergeLlmOrchestrator; onSession: (id: string) => void }) {
  const server = createServer(async (incoming, outgoing) => {
    const abort = new AbortController()
    outgoing.once('close', () => { if (!outgoing.writableEnded) abort.abort() })
    try {
      let body = ''
      for await (const chunk of incoming) body += chunk.toString()
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      headers.set('x-forwarded-for', '127.0.0.1')
      const response = await handlePublicApi(new Request(`http://localhost${incoming.url}`, {
        method: incoming.method, headers, signal: abort.signal,
        ...(body ? { body } : {}),
      }), { pool: options.pool, conciergeSessionStore: options.store, orchestrator: options.orchestrator })
      outgoing.writeHead(response.status, Object.fromEntries(response.headers))
      outgoing.flushHeaders()
      if (response.body) {
        const reader = response.body.getReader()
        const stop = () => { void reader.cancel().catch(() => {}) }
        abort.signal.addEventListener('abort', stop, { once: true })
        try {
          for (;;) {
            const read = await reader.read()
            if (read.done || abort.signal.aborted) break
            const wire = new TextDecoder().decode(read.value)
            for (const line of wire.split('\n')) {
              if (!line.startsWith('data: ')) continue
              const frame = JSON.parse(line.slice(6))
              if (frame.data?.session?.session_id) options.onSession(frame.data.session.session_id)
            }
            outgoing.write(read.value)
          }
        } finally { reader.releaseLock(); abort.signal.removeEventListener('abort', stop) }
      }
      outgoing.end()
    } catch { if (!outgoing.destroyed) outgoing.destroy() }
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('HTTP fixture unavailable')
  return { url: `http://127.0.0.1:${address.port}`, close: async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  } }
}
