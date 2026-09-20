/**
 * Tiger 345 - Application Error Handling
 * Formats errors into standardized envelopes per plans/tiger-345/04-api-contracts.md
 */

import { ApiErrorCode, type ApiErrorEnvelope } from './types.ts'
import { getCorsHeaders } from './cors.ts'

export class AppError extends Error {
  public readonly code: ApiErrorCode | string
  public readonly status: number
  public readonly field_errors?: Record<string, string[]>
  public readonly retryAfter?: number

  get statusCode(): number {
    return this.status
  }

  constructor(
    code: ApiErrorCode | string,
    message: string,
    status = 400,
    field_errors?: Record<string, string[]>,
    retryAfter?: number
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.field_errors = field_errors
    this.retryAfter = retryAfter
  }

  static validation(
    message = 'Dữ liệu không hợp lệ',
    field_errors?: Record<string, string[]>
  ): AppError {
    return new AppError(ApiErrorCode.VALIDATION_ERROR, message, 400, field_errors)
  }

  static authRequired(
    message = 'Yêu cầu đăng nhập để thực hiện thao tác này'
  ): AppError {
    return new AppError(ApiErrorCode.AUTH_REQUIRED, message, 401)
  }

  static forbidden(
    message = 'Bạn không có quyền thực hiện thao tác này'
  ): AppError {
    return new AppError(ApiErrorCode.FORBIDDEN, message, 403)
  }

  static notFound(message = 'Không tìm thấy tài nguyên yêu cầu'): AppError {
    return new AppError(ApiErrorCode.NOT_FOUND, message, 404)
  }

  static versionConflict(
    message = 'Dữ liệu đã được cập nhật bởi phiên làm việc khác. Vui lòng làm mới trang.'
  ): AppError {
    return new AppError(ApiErrorCode.VERSION_CONFLICT, message, 409)
  }

  static idempotencyConflict(
    message = 'Yêu cầu đang được xử lý hoặc xung đột khóa giao dịch'
  ): AppError {
    return new AppError(ApiErrorCode.IDEMPOTENCY_CONFLICT, message, 409)
  }

  static rateLimited(retryAfterSeconds = 60): AppError {
    return new AppError(
      ApiErrorCode.RATE_LIMITED,
      `Quá nhiều yêu cầu. Vui lòng thử lại sau ${retryAfterSeconds} giây.`,
      429,
      undefined,
      retryAfterSeconds
    )
  }

  static internal(message = 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau'): AppError {
    return new AppError(ApiErrorCode.INTERNAL_ERROR, message, 500)
  }
}

export function toErrorResponse(
  err: unknown,
  requestId: string,
  req: Request
): Response {
  let status = 500
  let code: string = ApiErrorCode.INTERNAL_ERROR
  let message = 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau'
  let field_errors: Record<string, string[]> | undefined
  let retryAfter: number | undefined

  if (err instanceof AppError) {
    status = err.status
    code = err.code
    message = err.message
    field_errors = err.field_errors
    retryAfter = err.retryAfter
  } else if (err instanceof Error) {
    // Sanitize any generic unexpected error message to prevent SQL/internal leaks
    console.error(`[InternalError] [${requestId}]`, err)
  }

  const payload: ApiErrorEnvelope = {
    error: {
      code,
      message,
      ...(field_errors ? { field_errors, details: field_errors } : {}),
    },
    request_id: requestId,
  }

  const headers = new Headers(getCorsHeaders(req))
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('X-Request-Id', requestId)
  if (retryAfter) {
    headers.set('Retry-After', String(retryAfter))
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers,
  })
}
