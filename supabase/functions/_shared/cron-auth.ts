import { timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { AppError } from './errors.ts'

const CRON_ROUTES = new Set([
  'POST /retention/run',
  'POST /retention/retry-deletions',
  'POST /account-deletions/retry',
])

export function authorizeCron(req: Request, path: string, secret: string | undefined): boolean {
  const configured = secret?.trim()
  const supplied = req.headers.get('x-cron-secret')?.trim()
  if (!configured || !supplied) return false
  const expected = Buffer.from(configured)
  const actual = Buffer.from(supplied)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false
  if (!CRON_ROUTES.has(`${req.method} ${path}`)) {
    throw AppError.forbidden('Cron credentials cannot access this endpoint')
  }
  return true
}
