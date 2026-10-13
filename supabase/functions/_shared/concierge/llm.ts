import type { BoundedContext } from './context.ts'
/**
 * Tiger 345 - Single LLM Orchestration & Multi-Provider Adapter
 * Defined according to plans/tiger-345/09-concierge-agent-design.md
 *
 * Guarantees:
 * - Single LLM runtime (no multi-agent or supervisor)
 * - Multi-provider support: 'openai' | 'anthropic' | 'gemini'
 * - Strict tool allowlist enforcement
 * - Tool call budget (max 3 per turn) & token budget (max 1024 tokens)
 * - Runtime schema validation for tool calls
 * - Fail-closed safety on API errors / timeouts
 * - Circuit breaker with CLOSED, OPEN, HALF_OPEN states
 * - Hidden reasoning (<think> / <reasoning>) stripping
 */

import type {
  ChatMessage,
  CustomerConstraints,
} from './types.ts'
import { AppError } from '../errors.ts'
import { assertPublicProviderDestination, validateProviderBaseUrl } from './provider-url.ts'

async function readProviderStream(response: Response, onEvent: (event: string, data: any) => void): Promise<void> {
  if (!response.body) throw new Error('PROVIDER_STREAM_MISSING')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let received = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (value) received += value.byteLength
      if (received > 1_048_576) throw new Error('PROVIDER_STREAM_TOO_LARGE')
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const event = block.split('\n').find(line => line.startsWith('event:'))?.slice(6).trim() ?? 'message'
        const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (!data || data === '[DONE]') continue
        onEvent(event, JSON.parse(data))
      }
      if (done) break
    }
  } finally {
    reader.releaseLock()
  }
}

export type LlmProvider = 'stub' | 'openai' | 'anthropic' | 'gemini'

export const TOOL_ALLOWLIST = [
  'add_draft_item', 'remove_draft_item', 'update_draft_quantity', 'get_draft_cart', 'calculate_draft_total',
  'search_menu_items',
  'get_menu_item',
  'recommend_meal',
  'create_order_quote',
  'prepare_reservation_summary',
  'lookup_restaurant_info',
  'get_customer_context',
  'get_recent_orders',
  'get_saved_addresses',
  'check_reservation_availability',
] as const

export type AllowedToolName = (typeof TOOL_ALLOWLIST)[number]

export interface LlmToolDefinition {
  name: AllowedToolName
  description: string
  parameters: Record<string, unknown>
}

export const CONCIERGE_TOOL_DEFINITIONS: LlmToolDefinition[] = [
  {
    name: 'search_menu_items',
    description: 'Tra cứu món ăn trong thực đơn Tiger 345 theo tên, danh mục, hoặc nguyên liệu.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Từ khóa tìm kiếm món ăn' },
        limit: { type: 'number', description: 'Số lượng kết quả tối đa' },
        category_id: { type: 'string', description: 'ID danh mục món (nếu có)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'recommend_meal',
    description: 'Tạo mâm cơm gợi ý cân đối dinh dưỡng dựa trên số khách, khẩu vị, ngân sách và dị ứng.',
    parameters: {
      type: 'object',
      properties: {
        adults: { type: 'number', description: 'Số người lớn (mặc định 2)' },
        children: { type: 'number', description: 'Số trẻ em (mặc định 0)' },
        appetite: { type: 'string', enum: ['light', 'normal', 'heavy'], description: 'Mức độ ăn' },
        budget_vnd: { type: 'number', description: 'Ngân sách tối đa tính bằng VNĐ' },
        is_hard_budget: { type: 'boolean', description: 'Có phải ngân sách cứng không' },
        allergies: {
          type: 'array',
          items: { type: 'string', enum: ['seafood', 'peanuts', 'eggs', 'dairy', 'gluten', 'soy', 'sesame'] },
          description: 'Danh sách các chất dị ứng của khách',
        },
        preferences: { type: 'array', items: { type: 'string' }, description: 'Món hoặc hương vị yêu thích' },
        dislikes: { type: 'array', items: { type: 'string' }, description: 'Món hoặc hương vị không thích' },
      },
      required: ['adults'],
    },
  },
  {
    name: 'create_order_quote',
    description: 'Tạo báo giá đơn hàng có chữ ký HMAC kèm thời hạn 5 phút.',
    parameters: {
      type: 'object',
      properties: {
        order_type: { type: 'string', enum: ['dine_in', 'delivery'], description: 'Loại đơn hàng' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              menu_item_id: { type: 'string' },
              quantity: { type: 'number' },
              note: { type: 'string' },
            },
            required: ['menu_item_id', 'quantity'],
          },
        },
        delivery_zone_id: { type: 'string', description: 'ID khu vực giao hàng (nếu là delivery)' },
        table_id: { type: 'string', description: 'ID bàn (nếu là dine_in)' },
        table_visit_id: { type: 'string', description: 'ID phiên bàn (nếu là dine_in)' },
      },
      required: ['order_type', 'items'],
    },
  },
  {
    name: 'prepare_reservation_summary',
    description: 'Chuẩn bị tóm tắt đặt bàn để khách xác nhận trước khi lưu vào hệ thống.',
    parameters: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Tên người đặt bàn (tối thiểu 2 ký tự)' },
        phone: { type: 'string', description: 'Số điện thoại liên hệ' },
        guest_count: { type: 'number', description: 'Số lượng khách (1-30)' },
        starts_at_iso: { type: 'string', description: 'Thời gian đến theo chuẩn ISO 8601' },
        seating_area_name: { type: 'string', description: 'Tên khu vực ngồi yêu cầu' },
        note: { type: 'string', description: 'Ghi chú thêm cho nhà hàng' },
      },
      required: ['customer_name', 'phone', 'guest_count', 'starts_at_iso'],
    },
  },
  {
    name: 'lookup_restaurant_info',
    description: 'Tra cứu thông tin chính sách nhà hàng (giờ mở cửa, vị trí, thanh toán, bãi đỗ xe).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nội dung cần tra cứu' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_customer_context',
    description: 'Lấy thông tin cá nhân hóa của khách hàng đã đăng nhập (món ưa thích, đơn gần đây, địa chỉ mặc định).',
    parameters: {
      type: 'object',
      properties: {
        customer_user_id: { type: 'string', description: 'UUID của người dùng đã xác thực' },
      },
      required: ['customer_user_id'],
    },
  },
]

export interface LlmToolCall {
  id: string
  name: AllowedToolName
  arguments: Record<string, unknown>
}

export interface LlmResponse {
  reply_text: string
  tool_calls: LlmToolCall[]
  tokens_used: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerConfig {
  failureThreshold?: number
  resetTimeoutMs?: number
}

export class LlmCircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private failureCount = 0
  private lastFailureTime = 0
  private readonly failureThreshold: number
  private readonly resetTimeoutMs: number

  constructor(config?: CircuitBreakerConfig) {
    this.failureThreshold = config?.failureThreshold ?? 3
    this.resetTimeoutMs = config?.resetTimeoutMs ?? 30000
  }

  public getState(): CircuitState {
    if (this.state === 'OPEN' && Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
      this.state = 'HALF_OPEN'
    }
    return this.state
  }

  public canExecute(): boolean {
    const current = this.getState()
    return current === 'CLOSED' || current === 'HALF_OPEN'
  }

  public recordSuccess(): void {
    this.failureCount = 0
    this.state = 'CLOSED'
  }

  public recordFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    if (this.failureCount >= this.failureThreshold || this.state === 'HALF_OPEN') {
      this.state = 'OPEN'
    }
  }

  public reset(): void {
    this.state = 'CLOSED'
    this.failureCount = 0
    this.lastFailureTime = 0
  }

  public getFailureCount(): number {
    return this.failureCount
  }
}

export function stripReasoningBlocks(text: string): string {
  if (!text) return ''
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim()
}

export type CustomLlmAdapter = (
  userMessage: string,
  history: ChatMessage[],
  context: {
    bounded?: BoundedContext
    onTextDelta?: (delta: string) => void
    signal?: AbortSignal
    requestId?: string
    constraints?: CustomerConstraints
    customerUserId?: string | null
    actorScope?: string
    currentStep?: string
    pendingReservation?: Record<string, unknown>
  }
) => Promise<LlmResponse>

export interface LlmOrchestratorConfig {
  provider?: LlmProvider
  apiKey?: string
  model?: string
  /** Optional OpenAI-compatible base URL (no trailing slash), e.g. a gateway or local model server. */
  baseUrl?: string
  maxTokens?: number
  maxToolCalls?: number
  timeoutMs?: number
  circuitBreaker?: LlmCircuitBreaker
  customAdapter?: CustomLlmAdapter
}

const DEFAULT_MAX_TOKENS = 1024
const DEFAULT_MAX_TOOL_CALLS = 3
const DEFAULT_TIMEOUT_MS = 10000

export class ConciergeLlmOrchestrator {
  private provider: LlmProvider
  private apiKey?: string
  private model?: string
  private baseUrl?: string
  private maxTokens: number
  private maxToolCalls: number
  private timeoutMs: number
  private circuitBreaker: LlmCircuitBreaker
  private customAdapter?: CustomLlmAdapter

  constructor(config?: LlmOrchestratorConfig) {
    const envProvider = (typeof process !== 'undefined' ? process.env.CONCIERGE_LLM_PROVIDER : undefined) as LlmProvider | undefined
    this.provider = config?.provider || envProvider || 'stub'
    this.apiKey = config?.apiKey || this.resolveApiKey(this.provider)
    this.model = config?.model || this.defaultModel(this.provider)
    this.baseUrl = config?.baseUrl ? validateProviderBaseUrl(config.baseUrl) || undefined : undefined
    this.maxTokens = Math.min(config?.maxTokens || DEFAULT_MAX_TOKENS, 2048)
    this.maxToolCalls = config?.maxToolCalls || DEFAULT_MAX_TOOL_CALLS
    this.timeoutMs = config?.timeoutMs || DEFAULT_TIMEOUT_MS
    this.circuitBreaker = config?.circuitBreaker || new LlmCircuitBreaker()
    this.customAdapter = config?.customAdapter
  }

  private resolveApiKey(provider: LlmProvider): string | undefined {
    if (typeof process === 'undefined') return undefined
    switch (provider) {
      case 'openai':
        return process.env.OPENAI_API_KEY
      case 'anthropic':
        return process.env.ANTHROPIC_API_KEY
      case 'gemini':
        return process.env.GEMINI_API_KEY
      default:
        return undefined
    }
  }

  private defaultModel(provider: LlmProvider): string {
    switch (provider) {
      case 'openai':
        return 'gpt-4o-mini'
      case 'anthropic':
        return 'claude-3-5-sonnet-latest'
      case 'gemini':
        return 'gemini-1.5-flash'
      default:
        return 'stub-v1'
    }
  }

  public getProvider(): LlmProvider {
    return this.provider
  }

  public getCircuitBreaker(): LlmCircuitBreaker {
    return this.circuitBreaker
  }

  public setCustomAdapter(adapter?: CustomLlmAdapter): void {
    this.customAdapter = adapter
  }

  /**
   * Validate and enforce tool allowlist on raw tool calls
   */
  public validateToolCalls(rawCalls: { id?: string; name: string; arguments: unknown }[]): LlmToolCall[] {
    const validCalls: LlmToolCall[] = []

    for (const call of rawCalls) {
      if (validCalls.length >= this.maxToolCalls) {
        break // Enforce tool call budget per turn
      }

      if (!TOOL_ALLOWLIST.includes(call.name as AllowedToolName)) {
        // Disallowed tool - strictly reject/ignore outside allowlist
        continue
      }

      let parsedArgs: Record<string, unknown> = {}
      if (typeof call.arguments === 'string') {
        try {
          parsedArgs = JSON.parse(call.arguments)
        } catch {
          continue // Malformed JSON arguments rejected
        }
      } else if (call.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments)) {
        parsedArgs = call.arguments as Record<string, unknown>
      } else {
        continue // Invalid non-object argument structure rejected
      }

      // Schema validation per tool
      if (call.name === 'recommend_meal') {
        if (typeof parsedArgs.adults !== 'number' || isNaN(parsedArgs.adults) || parsedArgs.adults < 0) {
          parsedArgs.adults = 2
        }
        if (parsedArgs.allergies && !Array.isArray(parsedArgs.allergies)) {
          parsedArgs.allergies = []
        }
      } else if (call.name === 'search_menu_items') {
        if (typeof parsedArgs.query !== 'string') {
          parsedArgs.query = ''
        }
      } else if (call.name === 'lookup_restaurant_info') {
        if (typeof parsedArgs.query !== 'string') {
          parsedArgs.query = ''
        }
      } else if (call.name === 'get_customer_context') {
        if (typeof parsedArgs.customer_user_id !== 'string' || !parsedArgs.customer_user_id.trim()) {
          continue // Missing customer_user_id
        }
      }

      validCalls.push({
        id: call.id || `call_${Math.random().toString(36).slice(2, 11)}`,
        name: call.name as AllowedToolName,
        arguments: parsedArgs,
      })
    }

    return validCalls
  }

  /**
   * Execute single turn orchestration
   */
  public async orchestrateTurn(
    userMessage: string,
    history: ChatMessage[] = [],
    context: Parameters<CustomLlmAdapter>[2] = {}
  ): Promise<LlmResponse> {
    context.signal?.throwIfAborted()
    if (!this.circuitBreaker.canExecute()) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'Dịch vụ trợ lý thông minh tạm thời gián đoạn do lỗi kết nối lặp lại (Circuit Breaker OPEN). Vui lòng thử lại sau giây lát.',
        503
      )
    }

    // 1. If custom adapter is provided (adapter spy in test/production entrypoint)
    if (this.customAdapter) {
      try {
        const rawRes = await this.customAdapter(userMessage, history, context)
        context.signal?.throwIfAborted()
        this.circuitBreaker.recordSuccess()
        return {
          reply_text: stripReasoningBlocks(rawRes.reply_text),
          tool_calls: this.validateToolCalls(rawRes.tool_calls || []),
          tokens_used: rawRes.tokens_used || {
            prompt_tokens: Math.ceil(userMessage.length / 4),
            completion_tokens: Math.ceil((rawRes.reply_text || '').length / 4),
            total_tokens: Math.ceil((userMessage.length + (rawRes.reply_text || '').length) / 4),
          },
        }
      } catch (err: unknown) {
        context.signal?.throwIfAborted()
        this.circuitBreaker.recordFailure()
        throw err
      }
    }

    // Never fabricate a conversation when no model provider is configured.
    if (this.provider === 'stub') {
      this.circuitBreaker.recordFailure()
      throw new AppError('SERVICE_UNAVAILABLE', 'Trợ lý chưa được cấu hình nhà cung cấp mô hình.', 503)
    }

    // 3. For real external providers: MUST fail-closed if API key is missing
    if (!this.apiKey) {
      this.circuitBreaker.recordFailure()
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        `Nhà cung cấp LLM '${this.provider}' chưa được cấu hình API key hợp lệ.`,
        503
      )
    }

    // 4. Dispatch to provider adapter with circuit breaker failure tracking
    try {
      let res: LlmResponse
      switch (this.provider) {
        case 'openai':
          res = await this.orchestrateOpenAiTurn(userMessage, history, context)
          break
        case 'anthropic':
          res = await this.orchestrateAnthropicTurn(userMessage, history, context)
          break
        case 'gemini':
          res = await this.orchestrateGeminiTurn(userMessage, history, context)
          break
        default:
          throw new AppError(
            'SERVICE_UNAVAILABLE',
            `Nhà cung cấp LLM không được hỗ trợ: ${this.provider}`,
            503
          )
      }

      this.circuitBreaker.recordSuccess()
      return {
        reply_text: stripReasoningBlocks(res.reply_text),
        tool_calls: this.validateToolCalls(res.tool_calls),
        tokens_used: res.tokens_used,
      }
    } catch (error) {
      context.signal?.throwIfAborted()
      this.circuitBreaker.recordFailure()
      const message = error instanceof Error ? error.message : ''
      const statusMatch = message.match(/(?:API error:?\s*)([45]\d{2})/i)
      const knownFailures: Record<string, string> = {
        INVALID_PROVIDER_URL: 'invalid_provider_url',
        UNSAFE_PROVIDER_DESTINATION: 'provider_destination_rejected',
        PROVIDER_STREAM_MISSING: 'provider_stream_missing',
        PROVIDER_STREAM_TOO_LARGE: 'provider_stream_too_large',
        UNEXPECTED_STREAM_TOOL: 'unexpected_tool_call_in_stream',
      }
      const failureClass = statusMatch ? 'upstream_http_error'
        : knownFailures[message] ?? (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
          ? 'provider_timeout'
          : error instanceof TypeError ? 'network_or_response_type_error' : 'provider_request_failed')
      const requestId = typeof context.requestId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.requestId)
        ? context.requestId : undefined
      console.error(JSON.stringify({ event: 'concierge_provider_failure', provider: this.provider,
        failure_class: failureClass, ...(statusMatch ? { upstream_status: Number(statusMatch[1]) } : {}),
        ...(requestId ? { request_id: requestId } : {}) }))
      throw new AppError('SERVICE_UNAVAILABLE', 'Dịch vụ trợ lý tạm thời không khả dụng.', 503)
    }
  }

  /**
   * OpenAI Adapter
   */
  private async orchestrateOpenAiTurn(
    userMessage: string,
    history: ChatMessage[],
    _context: Record<string, unknown>
  ): Promise<LlmResponse> {
    const bounded = _context.bounded as BoundedContext | undefined
    const onTextDelta = _context.onTextDelta as ((delta: string) => void) | undefined
    const messages: unknown[] = bounded ? [{ role: 'system', content: bounded.system }, ...bounded.messages] : [
      {
        role: 'system',
        content:
          'Bạn là Tiger Concierge - trợ lý ẩm thực thông minh tại nhà hàng Tiger 345 (TT. Vĩnh An, Vĩnh Cửu, Đồng Nai). Hãy dùng các tool được cung cấp để tra cứu thực đơn, gợi ý mâm ăn, kiểm tra dị ứng hoặc chuẩn bị đặt bàn.',
      },
      ...history.slice(-6).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text,
      })),
      { role: 'user', content: userMessage },
    ]

    for (const exchange of bounded?.exchanges ?? []) {
      messages.push({ role: 'assistant', content: null, tool_calls: [{ id: exchange.id, type: 'function',
        function: { name: exchange.name, arguments: JSON.stringify(exchange.arguments) } }] })
      messages.push({ role: 'tool', tool_call_id: exchange.id, content: JSON.stringify(exchange.result) })
    }
    const tools = (bounded?.tools ?? CONCIERGE_TOOL_DEFINITIONS).map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const endpoint = this.baseUrl
        ? `${this.baseUrl}/chat/completions`
        : 'https://api.openai.com/v1/chat/completions'
      if (this.baseUrl) await assertPublicProviderDestination(endpoint)
      const stream = Boolean(onTextDelta)
      const res = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
          max_tokens: this.maxTokens,
          stream,
          ...(stream ? { stream_options: { include_usage: true } } : {}),
        }),
        signal: _context.signal instanceof AbortSignal ? AbortSignal.any([controller.signal, _context.signal]) : controller.signal,
      })

      if (!res.ok) {
        throw new Error(`OpenAI API error: ${res.status}`)
      }

      if (stream) {
        let reply = ''
        let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        await readProviderStream(res, (_event, data) => {
          const delta = data.choices?.[0]?.delta?.content
          if (typeof delta === 'string') { reply += delta; onTextDelta?.(delta) }
          if (data.usage) usage = { prompt_tokens: data.usage.prompt_tokens || 0,
            completion_tokens: data.usage.completion_tokens || 0, total_tokens: data.usage.total_tokens || 0 }
          if (data.choices?.[0]?.delta?.tool_calls?.length) throw new Error('UNEXPECTED_STREAM_TOOL')
        })
        return { reply_text: reply, tool_calls: [], tokens_used: usage }
      }
      const data = await res.json()
      const choice = data.choices?.[0]?.message
      const rawToolCalls = (choice?.tool_calls || []).map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name,
        arguments: tc.function?.arguments,
      }))

      return {
        reply_text: choice?.content || '',
        tool_calls: this.validateToolCalls(rawToolCalls),
        tokens_used: {
          prompt_tokens: data.usage?.prompt_tokens || 0,
          completion_tokens: data.usage?.completion_tokens || 0,
          total_tokens: data.usage?.total_tokens || 0,
        },
      }
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Anthropic Adapter
   */
  private async orchestrateAnthropicTurn(
    userMessage: string,
    history: ChatMessage[],
    _context: Record<string, unknown>
  ): Promise<LlmResponse> {
    const bounded = _context.bounded as BoundedContext | undefined
    const onTextDelta = _context.onTextDelta as ((delta: string) => void) | undefined
    const messages: unknown[] = bounded ? [...bounded.messages] : [
      ...history.slice(-6).map((m) => ({
        role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text,
      })),
      { role: 'user' as const, content: userMessage },
    ]

    for (const exchange of bounded?.exchanges ?? []) {
      messages.push({ role: 'assistant', content: [{ type: 'tool_use', id: exchange.id, name: exchange.name, input: exchange.arguments }] })
      messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: exchange.id, content: JSON.stringify(exchange.result) }] })
    }
    const tools = (bounded?.tools ?? CONCIERGE_TOOL_DEFINITIONS).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }))

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        redirect: 'error',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey || '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          system: bounded?.system ??
            'Bạn là Tiger Concierge - trợ lý ẩm thực tại nhà hàng Tiger 345. Hãy sử dụng tools được cung cấp để hỗ trợ khách.',
          messages,
          ...(tools.length ? { tools } : {}),
          max_tokens: this.maxTokens,
          ...(onTextDelta ? { stream: true } : {}),
        }),
        signal: _context.signal instanceof AbortSignal ? AbortSignal.any([controller.signal, _context.signal]) : controller.signal,
      })

      if (!res.ok) {
        throw new Error(`Anthropic API error: ${res.status}`)
      }

      if (onTextDelta) {
        let reply = ''
        let inputTokens = 0
        let outputTokens = 0
        await readProviderStream(res, (event, data) => {
          if (event === 'error') throw new Error('PROVIDER_STREAM_ERROR')
          if (event === 'message_start') inputTokens = data.message?.usage?.input_tokens || 0
          if (event === 'message_delta') outputTokens = data.usage?.output_tokens || outputTokens
          if (event === 'content_block_start' && data.content_block?.type === 'tool_use') throw new Error('UNEXPECTED_STREAM_TOOL')
          if (event === 'content_block_delta' && data.delta?.type === 'text_delta') {
            const delta = data.delta.text
            if (typeof delta === 'string') { reply += delta; onTextDelta(delta) }
          }
        })
        return { reply_text: reply, tool_calls: [], tokens_used: { prompt_tokens: inputTokens,
          completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens } }
      }
      const data = await res.json()
      const toolBlocks = (data.content || []).filter((c: any) => c.type === 'tool_use')
      const textBlocks = (data.content || []).filter((c: any) => c.type === 'text')

      const rawToolCalls = toolBlocks.map((tb: any) => ({
        id: tb.id,
        name: tb.name,
        arguments: tb.input,
      }))

      return {
        reply_text: textBlocks.map((tb: any) => tb.text).join('\n'),
        tool_calls: this.validateToolCalls(rawToolCalls),
        tokens_used: {
          prompt_tokens: data.usage?.input_tokens || 0,
          completion_tokens: data.usage?.output_tokens || 0,
          total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        },
      }
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Gemini Adapter
   */
  private async orchestrateGeminiTurn(
    userMessage: string,
    history: ChatMessage[],
    _context: Record<string, unknown>
  ): Promise<LlmResponse> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const onTextDelta = _context.onTextDelta as ((delta: string) => void) | undefined
      const method = onTextDelta ? 'streamGenerateContent' : 'generateContent'
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:${method}?key=${this.apiKey}${onTextDelta ? '&alt=sse' : ''}`
      const bounded = _context.bounded as BoundedContext | undefined
      const functionDeclarations = (bounded?.tools ?? CONCIERGE_TOOL_DEFINITIONS).map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }))

      const contents: unknown[] = bounded ? bounded.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) : [
        ...history.slice(-6).map((m) => ({
          role: m.sender === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        })),
        { role: 'user', parts: [{ text: userMessage }] },
      ]

      for (const exchange of bounded?.exchanges ?? []) {
        contents.push({ role: 'model', parts: [{ functionCall: { id: exchange.id, name: exchange.name, args: exchange.arguments } }] })
        contents.push({ role: 'user', parts: [{ functionResponse: { id: exchange.id, name: exchange.name, response: { result: exchange.result } } }] })
      }

      const res = await fetch(url, {
        redirect: 'error',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: bounded ? { parts: [{ text: bounded.system }] } : undefined,
          ...(functionDeclarations.length ? { tools: [{ functionDeclarations }] } : {}),
          generationConfig: {
            maxOutputTokens: this.maxTokens,
          },
        }),
        signal: _context.signal instanceof AbortSignal ? AbortSignal.any([controller.signal, _context.signal]) : controller.signal,
      })

      if (!res.ok) {
        throw new Error(`Gemini API error: ${res.status}`)
      }

      if (onTextDelta) {
        let reply = ''
        let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        await readProviderStream(res, (_event, data) => {
          const parts = data.candidates?.[0]?.content?.parts ?? []
          if (parts.some((part: { functionCall?: unknown }) => part.functionCall)) throw new Error('UNEXPECTED_STREAM_TOOL')
          const text = parts.map((part: { text?: string }) => part.text ?? '').join('')
          if (text) { reply += text; onTextDelta(text) }
          if (data.usageMetadata) usage = { prompt_tokens: data.usageMetadata.promptTokenCount || 0,
            completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
            total_tokens: data.usageMetadata.totalTokenCount || 0 }
        })
        return { reply_text: reply, tool_calls: [], tokens_used: usage }
      }
      const data = await res.json()
      const candidate = data.candidates?.[0]?.content
      const parts = candidate?.parts || []

      const rawToolCalls: any[] = []
      let replyText = ''

      for (const part of parts) {
        if (part.functionCall) {
          rawToolCalls.push({
            id: `call_gem_${Math.random().toString(36).slice(2, 9)}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args,
          })
        }
        if (part.text) {
          replyText += part.text
        }
      }

      return {
        reply_text: replyText,
        tool_calls: this.validateToolCalls(rawToolCalls),
        tokens_used: {
          prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
          completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
          total_tokens: data.usageMetadata?.totalTokenCount || 0,
        },
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
