import { afterEach, describe, expect, it, vi } from 'vitest'
import type pg from 'pg'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'
import { getConciergeFeatureFlags, setConciergeFeatureFlagsForTesting } from '../../supabase/functions/_shared/concierge/flags.ts'

describe('V2 fail-closed integration boundaries', () => {
  afterEach(() => { vi.unstubAllGlobals(); setConciergeFeatureFlagsForTesting(null) })
  it('does not convert an external provider failure to a successful stub response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('private provider failure', { status: 500 })))
    const orchestrator = new ConciergeLlmOrchestrator({ provider: 'openai', apiKey: 'synthetic-test-key' })
    await expect(orchestrator.orchestrateTurn('Gợi ý món ăn')).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE', status: 503, message: 'Dịch vụ trợ lý tạm thời không khả dụng.',
    })
  })
  it('does not downgrade to legacy storage if the rollout flag cannot be read', async () => {
    const pool = { query: async () => { throw new Error('Database unavailable') } } as unknown as pg.Pool
    await expect(getConciergeFeatureFlags(pool, true)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 503 })
  })
})
