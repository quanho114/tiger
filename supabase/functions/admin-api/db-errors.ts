import { AppError } from '../_shared/errors.ts'

export function handleDbError(err: unknown): never {
  if (err instanceof AppError) throw err
  if (err && typeof err === 'object') {
    const pgErr = err as { code?: string; message?: string }
    const msg = pgErr.message || ''
    if (pgErr.code === '23505') {
      if (msg.includes('dining_tables_code') || msg.includes('dining_tables_code_key')) {
        throw new AppError('DUPLICATE_CODE', 'Mã bàn đã tồn tại', 409)
      }
      if (msg.includes('idx_table_visits_single_open') || msg.includes('VISIT_ALREADY_OPEN')) {
        throw new AppError('VISIT_ALREADY_OPEN', 'Bàn đã có phiên phục vụ đang mở', 409)
      }
      throw new AppError('CONFLICT', 'Dữ liệu bị trùng lặp trong hệ thống', 409)
    }
    if (pgErr.code === 'P0001') {
      throw new AppError('TABLE_UNAVAILABLE', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0002') {
      throw AppError.notFound(msg.replace(/^[^:]+:\s*/, ''))
    }
    if (pgErr.code === 'P0003') {
      if (msg.includes('ORDER_LIST_MISMATCH')) {
        throw new AppError('ORDER_LIST_MISMATCH', msg.replace(/^[^:]+:\s*/, ''), 400)
      }
      throw AppError.versionConflict(msg.replace(/^[^:]+:\s*/, ''))
    }
    if (pgErr.code === 'P0004') {
      if (msg.includes('INVALID_TRANSITION')) {
        throw new AppError('INVALID_TRANSITION', msg.replace(/^[^:]+:\s*/, ''), 422)
      }
      if (msg.includes('VISIT_HAS_ACTIVE_ORDERS')) {
        throw new AppError('VISIT_HAS_ACTIVE_ORDERS', msg.replace(/^[^:]+:\s*/, ''), 409)
      }
      throw new AppError('VISIT_NOT_SETTLED', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0005') {
      throw new AppError('TABLE_HAS_ACTIVE_VISIT', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0012') {
      throw new AppError('VALIDATION_ERROR', msg.replace(/^[^:]+:\s*/, ''), 422)
    }
    if (pgErr.code === 'P0018') {
      throw new AppError('PAYMENT_REQUIRED', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0019') {
      if (msg.includes('RESERVATION_TERMINAL')) {
        throw new AppError('RESERVATION_TERMINAL', msg.replace(/^[^:]+:\s*/, ''), 409)
      }
      throw new AppError('ORDER_TERMINAL', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0020') {
      if (msg.includes('ORDER_LIST_MISMATCH')) {
        throw new AppError('ORDER_LIST_MISMATCH', msg.replace(/^[^:]+:\s*/, ''), 400)
      }
      throw new AppError('INVALID_TRANSITION', msg.replace(/^[^:]+:\s*/, ''), 422)
    }
    if (pgErr.code === 'P0021') {
      throw new AppError('PAID_ORDER_NOT_REFUNDED', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0023') {
      if (msg.includes('ALREADY_PAID')) {
        throw new AppError('ALREADY_PAID', msg.replace(/^[^:]+:\s*/, ''), 409)
      }
      throw new AppError('NO_SHOW_GRACE_ACTIVE', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0024') {
      throw new AppError('CANCEL_NOTICE_EXPIRED', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0026') {
      throw new AppError('REASON_REQUIRED', msg.replace(/^[^:]+:\s*/, ''), 422)
    }
    if (pgErr.code === 'P0029') {
      throw new AppError('VISIT_HAS_PENDING_REFUNDS', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
  }
  throw err
}
