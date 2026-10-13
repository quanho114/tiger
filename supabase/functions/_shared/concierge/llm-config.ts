/**
 * Tiger 345 - DB-driven Concierge LLM config loader.
 *
 * Admin manages provider/base_url/api_key/model in Admin UI (single row,
 * id = 1, in public.concierge_llm_config). The concierge runtime loads it
 * per turn so every user shares the same AI backend without redeploys.
 *
 * Fail-closed: any error, missing row, disabled flag, or missing key
 * uses the environment provider; missing provider configuration is rejected.
 */

import type pg from 'pg'
import { ConciergeLlmOrchestrator, type LlmProvider } from './llm.ts'
import { AppError } from '../errors.ts'
import { validateProviderBaseUrl } from './provider-url.ts'

export interface DbLlmConfig {
  provider: LlmProvider
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
}

const VALID_PROVIDERS: LlmProvider[] = ['stub', 'openai', 'anthropic', 'gemini']

function sanitizeBaseUrl(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return validateProviderBaseUrl(raw.trim())
}

/**
 * Load the shared LLM config from DB. Returns null when the chatbot
 * should use the environment provider.
 */
export async function loadDbLlmConfig(pool?: pg.Pool): Promise<DbLlmConfig | null> {
  if (!pool) return null
  try {
    const res = await pool.query(
      'SELECT provider, base_url, api_key, model, enabled FROM public.concierge_llm_config WHERE id = 1'
    )
    if (res.rows.length === 0) return null
    const row = res.rows[0]
    if (!row.enabled) return null

    const provider: LlmProvider = VALID_PROVIDERS.includes(row.provider) ? row.provider : 'stub'
    if (provider === 'stub') return null

    const apiKey = typeof row.api_key === 'string' ? row.api_key.trim() : ''
    if (!apiKey) return null

    const model = typeof row.model === 'string' ? row.model.trim() : ''
    return {
      provider,
      baseUrl: sanitizeBaseUrl(row.base_url),
      apiKey,
      model,
      enabled: true,
    }
  } catch {
    // Fail-closed: DB errors must never break the chat flow.
    return null
  }
}

/**
 * Build the orchestrator for a turn: DB config wins when present and
 * complete, otherwise use the environment provider. Scripted stub replies
 * are never used for customer conversations.
 */
export async function createTurnOrchestrator(
  pool?: pg.Pool,
  fallback?: ConciergeLlmOrchestrator,
): Promise<ConciergeLlmOrchestrator> {
  if (fallback) return fallback
  const dbConfig = await loadDbLlmConfig(pool)
  if (!dbConfig) {
    const orchestrator = new ConciergeLlmOrchestrator()
    if (orchestrator.getProvider() === 'stub') {
      throw new AppError('SERVICE_UNAVAILABLE', 'Dịch vụ trợ lý chưa được cấu hình.', 503)
    }
    return orchestrator
  }
  return new ConciergeLlmOrchestrator({
    provider: dbConfig.provider,
    apiKey: dbConfig.apiKey,
    model: dbConfig.model || undefined,
    baseUrl: dbConfig.baseUrl || undefined,
  })
}
