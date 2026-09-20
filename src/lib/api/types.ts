export interface ClientRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  idempotencyKey?: string
  timeoutMs?: number
  signal?: AbortSignal
}

export class ApiError extends Error {
  public readonly code: string
  public readonly status: number
  public readonly requestId: string
  public readonly fieldErrors?: Record<string, string[]>

  constructor(
    code: string,
    message: string,
    status: number,
    requestId: string,
    fieldErrors?: Record<string, string[]>
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.requestId = requestId
    this.fieldErrors = fieldErrors
  }
}

export class NetworkError extends Error {
  constructor(message = 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.') {
    super(message)
    this.name = 'NetworkError'
  }
}

export class TimeoutError extends Error {
  constructor(message = 'Yêu cầu vượt quá thời gian chờ (timeout). Vui lòng thử lại.') {
    super(message)
    this.name = 'TimeoutError'
  }
}
