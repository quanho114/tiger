import { describe, expect, it } from 'vitest'
import {
  ConciergeV2MemoryFactInputSchema,
  ConciergeV2MemoryFactSchema,
  ConciergeV2MemorySettingsSchema,
  ConciergeV2MemoryWriteInputSchema,
} from '../../supabase/functions/_shared/contracts/concierge-v2.js'

const FACT_ID = '11111111-1111-4111-8111-111111111111'

function createFactInput() {
  return {
    memory_type: 'preference',
    memory_key: 'likes-grilled-beef',
    value: { food: 'Bò nướng' },
    source: 'explicit',
    confidence: 100,
    observed_at: '2026-09-22T12:00:00.000Z',
    expires_at: null,
    schema_version: 1,
  }
}

describe('Concierge V2 memory contract', () => {
  it('accepts a compact food fact without an owner identifier', () => {
    const input = createFactInput()

    expect(ConciergeV2MemoryFactInputSchema.parse(input)).toEqual(input)
    expect(
      ConciergeV2MemoryWriteInputSchema.parse({
        expected_memory_epoch: 0,
        fact: input,
      })
    ).toEqual({
      expected_memory_epoch: 0,
      fact: input,
    })
  })

  it('accepts only an allowlisted strict food value', () => {
    const input = createFactInput()

    expect(
      ConciergeV2MemoryFactInputSchema.safeParse({
        ...input,
        value: { food: 'Bò nướng', raw_utterance: 'Tôi muốn ăn bò nướng' },
      }).success
    ).toBe(false)
    expect(
      ConciergeV2MemoryFactInputSchema.safeParse({
        ...input,
        value: { food: '' },
      }).success
    ).toBe(false)
    expect(
      ConciergeV2MemoryFactInputSchema.safeParse({
        ...input,
        value: { food: 'x'.repeat(121) },
      }).success
    ).toBe(false)
  })

  it('restricts durable facts to food constraints and known sources', () => {
    const input = createFactInput()

    expect(
      ConciergeV2MemoryFactInputSchema.safeParse({
        ...input,
        memory_type: 'diagnosis',
      }).success
    ).toBe(false)
    expect(
      ConciergeV2MemoryFactInputSchema.safeParse({
        ...input,
        source: 'model_output',
      }).success
    ).toBe(false)
    expect(
      ConciergeV2MemoryFactInputSchema.safeParse({
        ...input,
        memory_key: 'Likes Grilled Beef',
      }).success
    ).toBe(false)
  })

  it('returns only whitelisted persisted fields', () => {
    const fact = {
      id: FACT_ID,
      ...createFactInput(),
      updated_at: '2026-09-22T12:00:00.000Z',
    }

    expect(ConciergeV2MemoryFactSchema.parse(fact)).toEqual(fact)
    expect(
      ConciergeV2MemoryFactSchema.safeParse({
        ...fact,
        user_id: '22222222-2222-4222-8222-222222222222',
      }).success
    ).toBe(false)
  })

  it('keeps disabled memory as the default settings state', () => {
    expect(
      ConciergeV2MemorySettingsSchema.parse({
        enabled: false,
        consent_version: 1,
        memory_epoch: 0,
        updated_at: '2026-09-22T12:00:00.000Z',
      })
    ).toEqual({
      enabled: false,
      consent_version: 1,
      memory_epoch: 0,
      updated_at: '2026-09-22T12:00:00.000Z',
    })
  })
})
