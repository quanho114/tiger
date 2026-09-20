/**
 * Tiger 345 - Single LLM Orchestration & Multi-Provider Adapter
 * Defined according to plans/tiger-345/09-concierge-agent-design.md
 *
 * Guarantees:
 * - Single LLM runtime (no multi-agent or supervisor)
 * - Multi-provider support: 'openai' | 'anthropic' | 'gemini' | 'stub'
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
import { extractReservationDetails } from './date-resolver.ts'
import { AppError } from '../errors.ts'

export type LlmProvider = 'stub' | 'openai' | 'anthropic' | 'gemini'

export const TOOL_ALLOWLIST = [
  'search_menu_items',
  'recommend_meal',
  'create_order_quote',
  'prepare_reservation_summary',
  'lookup_restaurant_info',
  'get_customer_context',
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
    context: {
      constraints?: CustomerConstraints
      customerUserId?: string | null
      actorScope?: string
      currentStep?: string
      pendingReservation?: Record<string, unknown>
    } = {}
  ): Promise<LlmResponse> {
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
        this.circuitBreaker.recordFailure()
        throw err
      }
    }

    // 2. Deterministic stub provider
    if (this.provider === 'stub') {
      const res = this.orchestrateStubTurn(userMessage, context)
      this.circuitBreaker.recordSuccess()
      return {
        reply_text: stripReasoningBlocks(res.reply_text),
        tool_calls: this.validateToolCalls(res.tool_calls),
        tokens_used: res.tokens_used,
      }
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
    } catch (err: unknown) {
      this.circuitBreaker.recordFailure()
      if (this.circuitBreaker.getState() === 'OPEN') {
        throw new AppError(
          'SERVICE_UNAVAILABLE',
          `Dịch vụ LLM (${this.provider}) tạm ngừng do lỗi kết nối lặp lại (Circuit Breaker OPEN). Vui lòng thử lại sau giây lát.`,
          503
        )
      }
      // Single transient failure: fallback to deterministic stub while breaker tracks failure
      const fallback = this.orchestrateStubTurn(userMessage, context)
      return {
        reply_text: stripReasoningBlocks(fallback.reply_text),
        tool_calls: this.validateToolCalls(fallback.tool_calls),
        tokens_used: fallback.tokens_used,
      }
    }
  }

  /**
   * Deterministic Stub Orchestrator for offline testing and fallback
   */
  private orchestrateStubTurn(
    userMessage: string,
    context: {
      constraints?: CustomerConstraints
      customerUserId?: string | null
      currentStep?: string
      pendingReservation?: Record<string, unknown>
    }
  ): LlmResponse {
    const lower = userMessage.toLowerCase()
    const toolCalls: LlmToolCall[] = []
    let replyText = ''

    // 1. Check info lookup (contact, hotline, address, hours, policies)
    if (
      lower.includes('số điện thoại') ||
      lower.includes('hotline') ||
      lower.includes('liên hệ') ||
      lower.includes('địa chỉ') ||
      lower.includes('ở đâu') ||
      lower.includes('mấy giờ') ||
      lower.includes('giờ') ||
      lower.includes('mở cửa') ||
      lower.includes('đóng cửa') ||
      lower.includes('bãi xe') ||
      lower.includes('đỗ xe') ||
      lower.includes('đậu xe') ||
      lower.includes('gửi xe') ||
      lower.includes('vị trí') ||
      lower.includes('wifi') ||
      lower.includes('thanh toán') ||
      lower.includes('giữ bàn tối đa') ||
      lower.includes('chính sách') ||
      lower.includes('phí ship') ||
      lower.includes('phí giao') ||
      lower.includes('phòng riêng') ||
      lower.includes('phòng vip') ||
      lower.includes('quản lý')
    ) {
      toolCalls.push({
        id: 'stub_info_1',
        name: 'lookup_restaurant_info',
        arguments: { query: userMessage },
      })
    }
    // 2. Check reservation intent or ongoing reservation collection
    else if (
      lower.includes('đặt bàn') ||
      lower.includes('giữ chỗ') ||
      lower.includes('tóm tắt thông tin đặt bàn') ||
      lower.includes('phiếu giữ chỗ') ||
      lower.includes('đổi giờ') ||
      lower.includes('đổi số lượng') ||
      lower.includes('đổi ngày') ||
      context.currentStep === 'RESERVING_COLLECTING' ||
      context.currentStep === 'RESERVING_CONFIRMING'
    ) {
      const extracted = extractReservationDetails(
        userMessage,
        context.pendingReservation as any
      )

      toolCalls.push({
        id: 'stub_resv_1',
        name: 'prepare_reservation_summary',
        arguments: {
          customer_name: extracted.customer_name,
          phone: extracted.phone,
          guest_count: extracted.guest_count,
          starts_at_iso: extracted.starts_at_iso,
          seating_area_name: extracted.seating_area_name,
          note: extracted.note,
        },
      })
    }
    // 2. Check food recommendation intent (including modifications: rau, thêm món, đổi món)
    else if (
      lower.includes('gợi ý') ||
      lower.includes('tư vấn') ||
      lower.includes('mâm') ||
      lower.includes('combo') ||
      lower.includes('thêm món') ||
      lower.includes('bổ sung') ||
      lower.includes('món rau') ||
      lower.includes('thêm rau') ||
      lower.includes('bớt món') ||
      lower.includes('đổi món') ||
      lower.includes('thay món') ||
      lower.includes('ăn gì') ||
      (lower.includes('cho') && (lower.includes('người') || lower.includes('khách'))) ||
      lower.includes('ngân sách')
    ) {
      toolCalls.push({
        id: 'stub_rec_1',
        name: 'recommend_meal',
        arguments: {
          adults: context.constraints?.adults || 2,
          children: context.constraints?.children || 0,
          appetite: context.constraints?.appetite || 'normal',
          budget_vnd: context.constraints?.budget_vnd || null,
          allergies: context.constraints?.allergies || [],
        },
      })
    }
    // 3. Check order / quote intent
    else if (
      lower.includes('báo giá') ||
      lower.includes('tính tiền') ||
      lower.includes('lên đơn') ||
      lower.includes('giao về') ||
      lower.includes('ship') ||
      lower.includes('đặt giao') ||
      lower.includes('giao hàng') ||
      lower.includes('đặt món') ||
      lower.includes('đặt hàng')
    ) {
      replyText =
        'Để lên đơn giao hàng tận nơi hoặc đặt món trước, bạn vui lòng chọn các món ưa thích vào giỏ hàng hoặc cho mình biết danh sách món để mình tạo báo giá chính xác kèm phí vận chuyển nhé!'
    }
    // 4. Check customer context / history intent
    else if (
      lower.includes('lịch sử') || lower.includes('món quen') || lower.includes('đặt lại') || lower.includes('đơn cũ')
    ) {
      if (context.customerUserId) {
        toolCalls.push({
          id: 'stub_ctx_1',
          name: 'get_customer_context',
          arguments: {
            customer_user_id: context.customerUserId,
          },
        })
      } else {
        replyText =
          'Để xem lịch sử đơn hàng hoặc đặt lại các món quen thuộc, bạn vui lòng đăng nhập tài khoản nhé!'
      }
    }
    // 5. Default menu lookup
    else if (
      lower.includes('món') ||
      lower.includes('giá') ||
      lower.includes('menu') ||
      lower.includes('thực đơn') ||
      lower.includes('bán gì') ||
      lower.includes('quán có') ||
      lower.includes('có bán') ||
      lower.includes('nướng') ||
      lower.includes('lẩu') ||
      lower.includes('gỏi') ||
      lower.includes('cơm niêu') ||
      lower.includes('đặc sản')
    ) {
      toolCalls.push({
        id: 'stub_search_1',
        name: 'search_menu_items',
        arguments: {
          query:
            userMessage
              .replace(/(thực đơn|menu|món|giá|quán có|có bán|quán|không|\?)/gi, '')
              .trim() || 'đặc sản',
        },
      })
    } else {
      replyText = 'Chào bạn! Mình là Tiger Concierge. Mình có thể giúp bạn tư vấn mâm ăn, tra cứu thực đơn hoặc hỗ trợ đặt bàn.'
    }

    return {
      reply_text: replyText,
      tool_calls: toolCalls,
      tokens_used: {
        prompt_tokens: Math.ceil(userMessage.length / 4),
        completion_tokens: Math.ceil(replyText.length / 4),
        total_tokens: Math.ceil((userMessage.length + replyText.length) / 4),
      },
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
    const messages = [
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

    const tools = CONCIERGE_TOOL_DEFINITIONS.map((t) => ({
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
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          tools,
          tool_choice: 'auto',
          max_tokens: this.maxTokens,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`)
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
    const messages = [
      ...history.slice(-6).map((m) => ({
        role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text,
      })),
      { role: 'user' as const, content: userMessage },
    ]

    const tools = CONCIERGE_TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }))

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey || '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          system:
            'Bạn là Tiger Concierge - trợ lý ẩm thực tại nhà hàng Tiger 345. Hãy sử dụng tools được cung cấp để hỗ trợ khách.',
          messages,
          tools,
          max_tokens: this.maxTokens,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`Anthropic API error: ${res.status}`)
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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`
      const functionDeclarations = CONCIERGE_TOOL_DEFINITIONS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }))

      const contents = [
        ...history.slice(-6).map((m) => ({
          role: m.sender === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        })),
        { role: 'user', parts: [{ text: userMessage }] },
      ]

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          tools: [{ functionDeclarations }],
          generationConfig: {
            maxOutputTokens: this.maxTokens,
          },
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`Gemini API error: ${res.status}`)
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
