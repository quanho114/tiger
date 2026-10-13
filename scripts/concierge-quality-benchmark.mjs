import { randomUUID } from 'node:crypto'
import * as module from 'node:module'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { load } from './concierge-ts-loader.mjs'

if (typeof module.registerHooks === 'function') module.registerHooks({ load })
else module.register('./concierge-ts-loader.mjs', import.meta.url)
const [{ ConciergeLlmOrchestrator }, { emptyConciergeSession }, { orchestrateGroundedTurn }] = await Promise.all([
  import('../supabase/functions/_shared/concierge/llm.ts'),
  import('../supabase/functions/_shared/concierge/runtime.ts'),
  import('../supabase/functions/_shared/concierge/orchestrator.ts'),
])

const MAX_REQUESTS = 16
const menu = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Bò nướng', price_vnd: 125000,
    published: true, is_available: true, allow_dine_in: true, allow_delivery: true },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Tôm nướng', price_vnd: 180000,
    published: true, is_available: true, allow_dine_in: true, allow_delivery: true },
]

export const scenarios = [
  { id: 'greeting', turns: ['Chào bạn'], evaluate: turn => turn.result.message.length > 0 && turn.result.cards.length === 0 },
  { id: 'known-price', turns: ['Bò nướng giá bao nhiêu?'], evaluate: turn =>
    turn.result.cards.some(card => card.item?.name === 'Bò nướng' && card.item.price_vnd === 125000) &&
    !/189[.,]?000|đã đặt|đã đặt/iu.test(turn.result.message) && !turn.next.draft },
  { id: 'missing-item', turns: ['Có pizza không?'], evaluate: turn =>
    turn.result.cards.length === 0 && turn.result.message.includes('Chưa tìm được món') && !turn.next.draft },
  { id: 'group-budget', turns: ['4 người 800k'], evaluate: turn =>
    turn.next.constraints.adults === 4 && turn.next.constraints.budget_vnd === 800000 && !turn.next.draft },
  { id: 'budget-revision', turns: ['4 người nha', 'budget còn 700k'], evaluate: turn =>
    turn.next.constraints.adults === 4 && turn.next.constraints.budget_vnd === 700000 && !turn.next.draft },
  { id: 'operational-hours', turns: ['Mấy giờ đóng cửa?'], evaluate: turn =>
    turn.result.message.includes('11:00–20:00') && !turn.result.message.includes('22:30') },
  { id: 'delivery-fee', turns: ['Phí giao hàng bao nhiêu?'], evaluate: turn =>
    turn.result.cards.some(card => card.type === 'service_link' && card.destination === 'cart') &&
    !/\d[.,]?\d*\s*(?:đ|vnd|k)\b/iu.test(turn.result.message) },
  { id: 'guest-order', turns: ['Đơn hàng của tôi đâu?'], evaluate: turn =>
    turn.result.message.includes('đăng nhập') && turn.result.cards.length === 0 },
]

export function syntheticPool() {
  return {
    async query(sql) {
      if (/^\s*SELECT kind, key, payload FROM public\.concierge_knowledge\b/i.test(sql)) return { rows: [] }
      if (/\bFROM public\.menu_items m\b/i.test(sql)) return { rows: menu }
      if (/\bFROM public\.business_closures\b/i.test(sql)) return { rows: [{ closed: false }] }
      if (/\bFROM public\.business_hours\b/i.test(sql)) return { rows: [{ open_time: '11:00:00', close_time: '20:00:00' }] }
      throw new Error('UNEXPECTED_BENCHMARK_QUERY')
    },
  }
}

function newGuestRecord() {
  const now = new Date().toISOString()
  return { ...emptyConciergeSession(), session_id: randomUUID(), actor: { authenticated_user_id: null },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: now,
    idle_expires_at: now, absolute_expires_at: now, idempotency: [] }
}

function percentile(values, fraction) {
  if (!values.length) return null
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[Math.ceil(fraction * ordered.length) - 1]
}

function failureType(error) {
  const message = String(error?.message ?? '')
  const httpStatus = /OpenAI API error: (\d{3})/.exec(message)?.[1]
  if (httpStatus) return `provider_http_${httpStatus}`
  if (message.includes('BENCHMARK_REQUEST_LIMIT')) return 'benchmark_request_limit'
  if (message.includes('UNEXPECTED_BENCHMARK_QUERY')) return 'unsupported_fixture_query'
  if (message.includes('CONTEXT_BUDGET')) return 'context_budget'
  if (error?.name === 'ZodError') return 'tool_schema_validation'
  if (error?.name === 'SyntaxError') return 'tool_json_parse'
  if (error?.name === 'AbortError') return 'provider_timeout'
  if (error?.name === 'AppError') return error.code === 'SERVICE_UNAVAILABLE' ? 'unsafe_model_reply' : 'app_failure'
  return 'provider_or_orchestrator_failure'
}

export async function runBenchmark({ llm, fetchCount = () => 0, caseIds = scenarios.map(scenario => scenario.id) } = {}) {
  const pool = syntheticPool()
  const results = []
  for (const scenario of scenarios.filter(entry => caseIds.includes(entry.id))) {
    const firstRequest = fetchCount()
    let record = newGuestRecord()
    let latest
    let elapsed = 0
    let calls = 0
    let inputTokens = 0
    let outputTokens = 0
    try {
      for (const message of scenario.turns) {
        const started = performance.now()
        latest = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: randomUUID(), message }, record, pool, llm)
        elapsed += performance.now() - started
        calls += latest.metrics.model_calls
        inputTokens += latest.metrics.reported_input_tokens
        outputTokens += latest.metrics.output_tokens
        record = { ...record, ...latest.next, state_version: record.state_version + 1 }
      }
      results.push({ id: scenario.id, passed: Boolean(scenario.evaluate(latest)), latency_ms: Math.round(elapsed),
        provider_requests: fetchCount() - firstRequest, model_calls: calls, input_tokens: inputTokens, output_tokens: outputTokens })
    } catch (error) {
      results.push({ id: scenario.id, passed: false, error: failureType(error), latency_ms: Math.round(elapsed),
        provider_requests: fetchCount() - firstRequest, model_calls: calls, input_tokens: inputTokens, output_tokens: outputTokens })
    }
  }
  const latencies = results.filter(result => result.model_calls > 0 && !result.error).map(result => result.latency_ms)
  return { timestamp: new Date().toISOString(), fixture: 'synthetic-restaurant-v1',
    summary: { passed: results.filter(result => result.passed).length, total: results.length,
      provider_requests: fetchCount(), reported_input_tokens: results.reduce((total, result) => total + result.input_tokens, 0),
      reported_output_tokens: results.reduce((total, result) => total + result.output_tokens, 0),
      p50_model_scenario_ms: percentile(latencies, 0.5), p95_model_scenario_ms: percentile(latencies, 0.95) }, results }
}

export function benchmarkEndpoint(value) {
  const parsed = new URL(value)
  if (parsed.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
      !/^\/v1\/?$/.test(parsed.pathname) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Benchmark requires an HTTP loopback /v1 endpoint without embedded credentials')
  }
  return parsed
}

async function main() {
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ mode: 'dry-run', network_requests: 0, scenario_ids: scenarios.map(scenario => scenario.id) }))
    return
  }
  const { BENCHMARK_LLM_BASE_URL, BENCHMARK_LLM_API_KEY, BENCHMARK_LLM_MODEL } = process.env
  if (process.argv.includes('--list-models')) {
    if (!BENCHMARK_LLM_BASE_URL || !BENCHMARK_LLM_API_KEY) throw new Error('Set endpoint and key in the shell environment')
    const endpoint = benchmarkEndpoint(BENCHMARK_LLM_BASE_URL)
    const response = await fetch(`${endpoint.href.replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${BENCHMARK_LLM_API_KEY}` }, redirect: 'error', signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error('MODEL_LIST_UNAVAILABLE')
    const body = await response.json()
    if (!Array.isArray(body?.data)) throw new Error('MODEL_LIST_UNAVAILABLE')
    console.log(JSON.stringify({ models: body.data.slice(0, 20).map(model => model.id).filter(id => typeof id === 'string') }))
    return
  }
  if (!process.argv.includes('--confirm-live')) throw new Error('Explicit --confirm-live flag required')
  const caseIndex = process.argv.indexOf('--case')
  const caseId = caseIndex === -1 ? null : process.argv[caseIndex + 1]
  if (caseIndex !== -1 && !scenarios.some(scenario => scenario.id === caseId)) throw new Error('Unknown benchmark case ID')
  if (!BENCHMARK_LLM_BASE_URL || !BENCHMARK_LLM_API_KEY || !BENCHMARK_LLM_MODEL) {
    throw new Error('Set BENCHMARK_LLM_BASE_URL, BENCHMARK_LLM_API_KEY, and BENCHMARK_LLM_MODEL in the shell environment')
  }
  const endpoint = benchmarkEndpoint(BENCHMARK_LLM_BASE_URL)
  let requestCount = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (url, init) => {
    if (String(url) !== `${endpoint.href.replace(/\/+$/, '')}/chat/completions` || requestCount >= MAX_REQUESTS) {
      throw new Error('BENCHMARK_REQUEST_LIMIT')
    }
    requestCount++
    return originalFetch(url, { ...init, redirect: 'error' })
  }
  try {
    const llm = new ConciergeLlmOrchestrator({ provider: 'openai', apiKey: BENCHMARK_LLM_API_KEY,
      model: BENCHMARK_LLM_MODEL, baseUrl: endpoint.href, maxTokens: 256, timeoutMs: 10000 })
    const result = await runBenchmark({ llm, fetchCount: () => requestCount,
      caseIds: caseId ? [caseId] : scenarios.map(scenario => scenario.id) })
    console.log(JSON.stringify(result, null, 2))
    if (result.summary.passed !== result.summary.total) process.exitCode = 1
  } finally {
    globalThis.fetch = originalFetch
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Benchmark blocked or failed; check endpoint, model ID, and environment without sharing the key.'); process.exitCode = 1 })
}
