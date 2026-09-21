/**
 * Tiger 345 - CORS & Security Headers
 */

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://tiger345.vn',
  'https://www.tiger345.vn',
  'https://tiger-alpha-five.vercel.app',
]

export function getCorsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('origin') || ''
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin.endsWith('.vercel.app')

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-request-id, idempotency-key',
    'Access-Control-Expose-Headers': 'x-request-id, retry-after',
    'Access-Control-Max-Age': '86400',
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
