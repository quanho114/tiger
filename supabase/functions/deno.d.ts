/**
 * Ambient type declarations for Deno runtime globals
 * Allows Node-based TypeScript compiler (tsconfig.server.json) to typecheck
 * Edge function entrypoints without errors.
 */

declare namespace Deno {
  export interface ServeHandlerInfo {
    remoteAddr: {
      transport: 'tcp' | 'udp'
      hostname: string
      port: number
    }
  }

  export type ServeHandler = (
    req: Request,
    info: ServeHandlerInfo
  ) => Response | Promise<Response>

  export interface ServeOptions {
    port?: number
    hostname?: string
    signal?: AbortSignal
    onListen?: (params: { hostname: string; port: number }) => void
    onError?: (error: unknown) => Response | Promise<Response>
  }

  export function serve(handler: (req: Request) => Response | Promise<Response>): void
  export function serve(options: ServeOptions, handler: ServeHandler): void

  export namespace env {
    export function get(key: string): string | undefined
    export function set(key: string, value: string): void
    export function has(key: string): boolean
    export function delete_(key: string): void
  }
}
