/**
 * Tiger 345 - CORS & Security Headers
 */

import { readEnv } from './environment.ts'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://tiger345.vn',
  'https://www.tiger345.vn',
  'https://tiger-alpha-five.vercel.app',
]

function isProduction(): boolean {
  return readEnv('DENO_DEPLOYMENT_ID') !== undefined
    || readEnv('NODE_ENV') === 'production'
    || readEnv('ENVIRONMENT') === 'production'
}

export function getCorsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('origin') || ''
  const production = isProduction()
  // Production: exact allowlist only. Wildcard vercel suffix and localhost-any-port
  // are dev conveniences and must not widen the production trust boundary.
  // Preview deployments must be added explicitly to ALLOWED_ORIGINS.
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    (!production && (
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.endsWith('.vercel.app')
    ))

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-request-id, idempotency-key, x-concierge-protocol-version, x-concierge-stream-version',
    'Access-Control-Expose-Headers': 'x-request-id, retry-after',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  }
}

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(req),
    })
  }
  return null
}
