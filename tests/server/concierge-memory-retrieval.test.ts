import { describe, expect, it, vi } from 'vitest'
import {
  classifyMemoryIntent,
  estimateTokenCount,
  formatMemoryPrompt,
  retrieveSelectiveMemory,
} from '../../supabase/functions/_shared/concierge/memory-retrieval.ts'
import type {
  ConciergeV2ActorBinding,
  ConciergeV2MemoryFact,
  ConciergeV2MemoryRepository,
  ConciergeV2RetrievedMemoryFact,
} from '../../supabase/functions/_shared/contracts/concierge-v2.ts'

describe('Concierge V2 Memory Retrieval (V07 Server Tests)', () => {
  const mockCustomerActor: ConciergeV2ActorBinding = {
    authenticated_user_id: '00000000-0000-0000-0000-000000000001',
  }

  const mockGuestActor: ConciergeV2ActorBinding = {
    authenticated_user_id: null,
  }

  function createMockRepository(overrides?: Partial<ConciergeV2MemoryRepository>): ConciergeV2MemoryRepository {
    return {
      getSettings: vi.fn().mockResolvedValue({
        user_id: '00000000-0000-0000-0000-000000000001',
        enabled: true,
        memory_epoch: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      setEnabled: vi.fn(),
      listFacts: vi.fn().mockResolvedValue([]),
      writeFact: vi.fn(),
      deleteFact: vi.fn(),
      forgetAll: vi.fn(),
      restoreBehavioralFact: vi.fn(),
      ...overrides,
    }
  }

  describe('classifyMemoryIntent', () => {
    it('classifies operational and FAQ questions as faq', () => {
      expect(classifyMemoryIntent('Quán có bãi đậu xe ô tô không?')).toBe('faq')
      expect(classifyMemoryIntent('Chỗ gửi xe ở đâu vậy ạ?')).toBe('faq')
      expect(classifyMemoryIntent('Mấy giờ quán mở cửa?')).toBe('faq')
      expect(classifyMemoryIntent('Opening hours please')).toBe('faq')
      expect(classifyMemoryIntent('Địa chỉ nhà hàng ở đâu?')).toBe('faq')
      expect(classifyMemoryIntent('Cho mình xin pass wifi')).toBe('faq')
      expect(classifyMemoryIntent('Quán có cho mang thú cưng vào không?')).toBe('faq')
      expect(classifyMemoryIntent('Số điện thoại hotline của quán là gì?')).toBe('faq')
    })

    it('classifies food, drink, and ordering questions as food_or_draft', () => {
      expect(classifyMemoryIntent('Gợi ý cho mình món ăn tối nay nhé')).toBe('food_or_draft')
      expect(classifyMemoryIntent('Có món gì không cay cho trẻ em không?')).toBe('food_or_draft')
      expect(classifyMemoryIntent('Tư vấn thực đơn cho 4 người')).toBe('food_or_draft')
      expect(classifyMemoryIntent('Thêm 2 phần cơm chiên dưa bò')).toBe('food_or_draft')
      expect(classifyMemoryIntent('Recommend some seafood dishes')).toBe('food_or_draft')
      expect(classifyMemoryIntent('Chốt đơn giúp mình')).toBe('food_or_draft')
    })

    it('classifies mixed query with food as food_or_draft', () => {
      expect(classifyMemoryIntent('Quán mở mấy giờ và có món bò nào ngon không?')).toBe('food_or_draft')
    })
  })

  describe('A08: FAQ intent skips storage lookups completely', () => {
    it('returns zero facts and fetched_from_storage: false without querying repository for FAQ inquiry', async () => {
      const repo = createMockRepository()

      const result = await retrieveSelectiveMemory({
        message: 'Quán có bãi đậu xe ô tô không shop ơi?',
        actor: mockCustomerActor,
        repository: repo,
      })

      expect(result.intent_type).toBe('faq')
      expect(result.fetched_from_storage).toBe(false)
      expect(result.facts).toEqual([])
      expect(result.formatted_prompt).toBe('')
      expect(result.estimated_tokens).toBe(0)

      // Zero repository calls performed!
      expect(repo.getSettings).not.toHaveBeenCalled()
      expect(repo.listFacts).not.toHaveBeenCalled()
    })
  })

  describe('Guest and Opt-Out Behavior (A06)', () => {
    it('returns zero facts and fetched_from_storage: false for guest actor without reading facts', async () => {
      const repo = createMockRepository()

      const result = await retrieveSelectiveMemory({
        message: 'Gợi ý món ăn tối nay cho 2 người',
        actor: mockGuestActor,
        repository: repo,
      })

      expect(result.intent_type).toBe('food_or_draft')
      expect(result.fetched_from_storage).toBe(false)
      expect(result.facts).toEqual([])
      expect(result.formatted_prompt).toBe('')
      expect(repo.listFacts).not.toHaveBeenCalled()
    })

    it('returns zero facts when customer has opted out (enabled: false)', async () => {
      const repo = createMockRepository({
        getSettings: vi.fn().mockResolvedValue({
          enabled: false,
          memory_epoch: 2,
          updated_at: new Date().toISOString(),
        }),
      })

      const result = await retrieveSelectiveMemory({
        message: 'Gợi ý món ăn tối nay cho 2 người',
        actor: mockCustomerActor,
        repository: repo,
      })

      expect(result.intent_type).toBe('food_or_draft')
      expect(result.fetched_from_storage).toBe(false)
      expect(result.facts).toEqual([])
      expect(repo.listFacts).not.toHaveBeenCalled()
    })
  })

  describe('Precedence: Dietary Constraints & Dislikes Defeating Favorites', () => {
    it('strictly defeats behavioral favorites when customer has an explicit dislike', async () => {
      const storedFacts: ConciergeV2MemoryFact[] = [
        {
          id: 'fact-1',
          memory_type: 'dislike',
          memory_key: 'bo',
          value: { food: 'thịt bò' },
          source: 'explicit',
          confidence: 90,
          observed_at: '2026-09-20T10:00:00.000Z',
          expires_at: null,
          schema_version: 1,
          updated_at: '2026-09-20T10:00:00.000Z',
        },
        {
          id: 'fact-2',
          memory_type: 'preference',
          memory_key: 'pho-bo-tai-lan',
          value: { food: 'phở bò tái lăn' },
          source: 'order_history',
          confidence: 80,
          observed_at: '2026-09-21T10:00:00.000Z',
          expires_at: '2026-12-20T10:00:00.000Z',
          schema_version: 1,
          updated_at: '2026-09-21T10:00:00.000Z',
        },
        {
          id: 'fact-3',
          memory_type: 'preference',
          memory_key: 'goi-cuon-tom-thit',
          value: { food: 'gỏi cuốn tôm thịt' },
          source: 'order_history',
          confidence: 75,
          observed_at: '2026-09-21T10:00:00.000Z',
          expires_at: '2026-12-20T10:00:00.000Z',
          schema_version: 1,
          updated_at: '2026-09-21T10:00:00.000Z',
        },
      ]

      const repo = createMockRepository({
        listFacts: vi.fn().mockResolvedValue(storedFacts),
      })

      const result = await retrieveSelectiveMemory({
        message: 'Gợi ý món ăn tối nay cho 2 người',
        actor: mockCustomerActor,
        repository: repo,
      })

      expect(result.intent_type).toBe('food_or_draft')
      expect(result.fetched_from_storage).toBe(true)

      // 'phở bò tái lăn' MUST be defeated because customer has explicit dislike for 'thịt bò'
      const foods = result.facts.map((f) => f.food)
      expect(foods).toContain('thịt bò')
      expect(foods).toContain('gỏi cuốn tôm thịt')
      expect(foods).not.toContain('phở bò tái lăn')

      // Check formatted prompt formatting and tags
      expect(result.formatted_prompt).toContain('- [Không thích (tự khai)]: thịt bò')
      expect(result.formatted_prompt).toContain('- [Yêu thích (từ lịch sử gọi món)]: gỏi cuốn tôm thịt')
      expect(result.formatted_prompt).not.toContain('phở bò tái lăn')
    })

    it('defeats behavioral favorites when conflicting with session constraints', async () => {
      const storedFacts: ConciergeV2MemoryFact[] = [
        {
          id: 'fact-1',
          memory_type: 'preference',
          memory_key: 'muc-hap-gung',
          value: { food: 'mực hấp gừng' },
          source: 'order_history',
          confidence: 85,
          observed_at: '2026-09-20T10:00:00.000Z',
          expires_at: '2026-12-20T10:00:00.000Z',
          schema_version: 1,
          updated_at: '2026-09-20T10:00:00.000Z',
        },
      ]

      const repo = createMockRepository({
        listFacts: vi.fn().mockResolvedValue(storedFacts),
      })

      const result = await retrieveSelectiveMemory({
        message: 'Gợi ý món ăn tối nay',
        actor: mockCustomerActor,
        repository: repo,
        currentSessionConstraints: ['mực'],
      })

      // The favorite 'mực hấp gừng' is defeated by current session constraint 'mực'
      expect(result.facts.map((f) => f.food)).not.toContain('mực hấp gừng')
      expect(result.facts).toEqual([])
    })

    it('prioritizes explicit allergy over all other facts', async () => {
      const storedFacts: ConciergeV2MemoryFact[] = [
        {
          id: 'fact-pref',
          memory_type: 'preference',
          memory_key: 'ga-nuong-mat-ong',
          value: { food: 'gà nướng mật ong' },
          source: 'explicit',
          confidence: 90,
          observed_at: '2026-09-20T10:00:00.000Z',
          expires_at: null,
          schema_version: 1,
          updated_at: '2026-09-20T10:00:00.000Z',
        },
        {
          id: 'fact-allergy',
          memory_type: 'allergy',
          memory_key: 'dau-phong',
          value: { food: 'đậu phộng' },
          source: 'explicit',
          confidence: 100,
          observed_at: '2026-09-20T10:00:00.000Z',
          expires_at: null,
          schema_version: 1,
          updated_at: '2026-09-20T10:00:00.000Z',
        },
      ]

      const repo = createMockRepository({
        listFacts: vi.fn().mockResolvedValue(storedFacts),
      })

      const result = await retrieveSelectiveMemory({
        message: 'Tư vấn món ăn tối nay',
        actor: mockCustomerActor,
        repository: repo,
      })

      expect(result.facts.length).toBe(2)
      // Allergy is first in line
      expect(result.facts[0].memory_type).toBe('allergy')
      expect(result.facts[0].food).toBe('đậu phộng')
      expect(result.facts[1].memory_type).toBe('preference')
      expect(result.facts[1].food).toBe('gà nướng mật ong')
    })
  })

  describe('Prompt Boundaries and Bounded Sizes', () => {
    it('caps results to at most 12 facts and produces estimated tokens under 400', () => {
      const manyFacts: ConciergeV2RetrievedMemoryFact[] = Array.from({ length: 15 }, (_, i) => ({
        memory_type: 'preference',
        memory_key: `mon-ngon-${i}`,
        food: `Món ngon gia truyền số ${i + 1}`,
        source: 'order_history',
        confidence: 75,
      }))

      const capped = manyFacts.slice(0, 12)
      const prompt = formatMemoryPrompt(capped)
      const tokenCount = estimateTokenCount(prompt)

      expect(capped.length).toBe(12)
      expect(tokenCount).toBeLessThanOrEqual(400)
      // Ensure no prohibited information
      expect(prompt).not.toContain('00000000')
      expect(prompt).not.toContain('09')
      expect(prompt).not.toContain('VND')
      expect(prompt).not.toContain('customer')
      expect(prompt).not.toContain('transcript')
    })
  })

  describe('Graceful Degradation on Repository Failure', () => {
    it('returns empty facts and does not crash chat when repository fails', async () => {
      const repo = createMockRepository({
        listFacts: vi.fn().mockRejectedValue(new Error('Connection to memory store timed out')),
      })

      const result = await retrieveSelectiveMemory({
        message: 'Gợi ý món ăn',
        actor: mockCustomerActor,
        repository: repo,
      })

      expect(result.intent_type).toBe('food_or_draft')
      expect(result.fetched_from_storage).toBe(true)
      expect(result.facts).toEqual([])
      expect(result.formatted_prompt).toBe('')
      expect(result.estimated_tokens).toBe(0)
    })
  })
})
