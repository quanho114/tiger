import { supabase } from '../supabase'
import { ApiError, NetworkError, TimeoutError, type ClientRequestOptions } from './types'

export interface ApiSuccessResponse<T> {
  data: T
  requestId: string
}

const DEFAULT_TIMEOUT_MS = 15_000

function getBaseUrl(): string {
  return import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
}

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function apiClient<T>(
  endpoint: string,
  options: ClientRequestOptions = {}
): Promise<ApiSuccessResponse<T>> {
  const method = options.method || 'GET'
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const requestId = generateRequestId()

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'X-Request-Id': requestId,
    ...(options.headers || {}),
  }

  // Auto attach Supabase JWT if user is signed in
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`
    }
  } catch {
    // Guest or no session
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey
  }

  let bodyPayload: BodyInit | undefined = undefined
  if (options.body !== undefined && options.body !== null) {
    if (
      (typeof FormData !== 'undefined' && options.body instanceof FormData) ||
      (typeof Blob !== 'undefined' && options.body instanceof Blob) ||
      (typeof ArrayBuffer !== 'undefined' && options.body instanceof ArrayBuffer) ||
      (typeof Uint8Array !== 'undefined' && options.body instanceof Uint8Array)
    ) {
      bodyPayload = options.body as BodyInit
    } else {
      headers['Content-Type'] = 'application/json'
      bodyPayload = JSON.stringify(options.body)
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort())
  }

  const url = endpoint.startsWith('http') ? endpoint : `${getBaseUrl()}${endpoint}`

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: bodyPayload,
      signal: controller.signal,
    })

    const responseRequestId = response.headers.get('X-Request-Id') || requestId
    const responseText = await response.text()
    let parsedJson: unknown = null
    if (responseText) {
      try {
        parsedJson = JSON.parse(responseText)
      } catch {
        parsedJson = null
      }
    }

    if (!response.ok) {
      if (parsedJson && typeof parsedJson === 'object' && 'error' in parsedJson) {
        const errObj = (parsedJson as { error: { code?: string; message?: string; field_errors?: Record<string, string[]> } }).error
        throw new ApiError(
          errObj?.code || 'UNKNOWN_ERROR',
          errObj?.message || response.statusText || 'Yêu cầu không thành công',
          response.status,
          responseRequestId,
          errObj?.field_errors
        )
      }

      throw new ApiError(
        'HTTP_ERROR',
        `Lỗi hệ thống (${response.status})`,
        response.status,
        responseRequestId
      )
    }

    // Success response: expectation is { data: T, request_id?: string } or plain T
    if (parsedJson && typeof parsedJson === 'object' && 'data' in parsedJson) {
      const envelope = parsedJson as { data: T; request_id?: string }
      return {
        data: envelope.data,
        requestId: envelope.request_id || responseRequestId,
      }
    }

    return {
      data: parsedJson as T,
      requestId: responseRequestId,
    }
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err
    }

    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new TimeoutError()
    }

    if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) {
      throw new NetworkError()
    }

    if (err instanceof Error) {
      throw new NetworkError(err.message)
    }

    throw new NetworkError('Lỗi mạng không xác định')
  } finally {
    clearTimeout(timeoutId)
  }
}

export const publicApi = {
  get: <T>(path: string, options?: Omit<ClientRequestOptions, 'method'>) =>
    apiClient<T>(`/functions/v1/public-api${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      method: 'GET',
    }),
  post: <T>(path: string, body?: unknown, options?: Omit<ClientRequestOptions, 'method' | 'body'>) =>
    apiClient<T>(`/functions/v1/public-api${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      method: 'POST',
      body,
    }),
}

export const customerApi = {
  get: <T>(path: string, options?: Omit<ClientRequestOptions, 'method'>) =>
    apiClient<T>(`/functions/v1/customer-api${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      method: 'GET',
    }),
  post: <T>(path: string, body?: unknown, options?: Omit<ClientRequestOptions, 'method' | 'body'>) =>
    apiClient<T>(`/functions/v1/customer-api${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      method: 'POST',
      body,
    }),
  put: <T>(path: string, body?: unknown, options?: Omit<ClientRequestOptions, 'method' | 'body'>) =>
    apiClient<T>(`/functions/v1/customer-api${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      method: 'PUT',
      body,
    }),
  patch: <T>(path: string, body?: unknown, options?: Omit<ClientRequestOptions, 'method' | 'body'>) =>
    apiClient<T>(`/functions/v1/customer-api${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      method: 'PATCH',
      body,
    }),
  delete: <T>(path: string, options?: Omit<ClientRequestOptions, 'method'>) =>
    apiClient<T>(`/functions/v1/customer-api${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      method: 'DELETE',
    }),
}

export const adminApi = {
  get: <T>(path: string, options?: Omit<ClientRequestOptions, 'method'>) =>
    apiClient<T>(`/functions/v1/admin-api${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      method: 'GET',
    }),
  post: <T>(path: string, body?: unknown, options?: Omit<ClientRequestOptions, 'method' | 'body'>) =>
    apiClient<T>(`/functions/v1/admin-api${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      method: 'POST',
      body,
    }),
  put: <T>(path: string, body?: unknown, options?: Omit<ClientRequestOptions, 'method' | 'body'>) =>
    apiClient<T>(`/functions/v1/admin-api${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      method: 'PUT',
      body,
    }),
  patch: <T>(path: string, body?: unknown, options?: Omit<ClientRequestOptions, 'method' | 'body'>) =>
    apiClient<T>(`/functions/v1/admin-api${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      method: 'PATCH',
      body,
    }),
  delete: <T>(path: string, options?: Omit<ClientRequestOptions, 'method'>) =>
    apiClient<T>(`/functions/v1/admin-api${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      method: 'DELETE',
    }),
}
