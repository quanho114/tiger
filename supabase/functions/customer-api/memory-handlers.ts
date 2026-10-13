import { z } from 'zod'
import type pg from 'pg'
import type { AuthActor } from '../_shared/types.ts'
import { AppError } from '../_shared/errors.ts'
import { jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { createConciergeV2MemoryRepository } from '../_shared/concierge/memory-repository.ts'
import { ConciergeV2MemorySettingsInputSchema, ConciergeV2MemoryFactSelectorSchema, ConciergeV2BehavioralMemorySelectorSchema } from '../_shared/contracts/concierge-v2.ts'
import { cleanFoodText, slugifyFoodKey } from '../_shared/concierge/memory-extractor.ts'

const customerFactSelectorSchema = ConciergeV2MemoryFactSelectorSchema.extend({ expected_memory_epoch: z.number().int().nonnegative() })
const editSchema = z.object({ selector: customerFactSelectorSchema, food: z.string().trim().min(1).max(120) }).strict()
function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw AppError.validation('Yêu cầu ký ức không hợp lệ. Hãy tải lại và thử lại.')
  return parsed.data
}

export async function handleMemoryRoute(req: Request, path: string, actor: AuthActor, pool: pg.Pool, requestId: string) {
  if (!path.startsWith('/me/ai-memory')) return null
  const repo = createConciergeV2MemoryRepository(pool, actor)
  const reply = (value: unknown) => jsonResponse(value, requestId, req, 200, { 'Cache-Control': 'no-store' })
  const checked = <T extends { ok: boolean }>(value: T) => {
    if (!value.ok) throw new AppError('VERSION_CONFLICT', 'Không thể cập nhật ký ức. Hãy tải lại và thử lại.', 409)
    return reply(value)
  }
  if (path === '/me/ai-memory' && req.method === 'GET') {
    const suppressed = await pool.query('SELECT memory_type, memory_key FROM public.user_ai_memory_suppressions WHERE user_id = $1 ORDER BY memory_key', [actor.userId])
    return reply({ settings: await repo.getSettings(), facts: await repo.listFacts(), suppressions: suppressed.rows.map(row => ConciergeV2BehavioralMemorySelectorSchema.parse(row)) })
  }
  const body = await parseJsonBody(req)
  if (path === '/me/ai-memory/settings' && req.method === 'PUT') return checked(await repo.setEnabled(parseInput(ConciergeV2MemorySettingsInputSchema, body)))
  if (path === '/me/ai-memory/forget' && req.method === 'POST') {
    parseInput(z.object({}).strict(), body)
    return checked(await repo.forgetAll())
  }
  if (path === '/me/ai-memory/delete' && req.method === 'POST') return checked(await repo.deleteFact(parseInput(customerFactSelectorSchema, body)))
  if (path === '/me/ai-memory/restore' && req.method === 'POST') return checked(await repo.restoreBehavioralFact(parseInput(ConciergeV2BehavioralMemorySelectorSchema, body)))
  if (path === '/me/ai-memory/edit' && req.method === 'PUT') {
    const input = parseInput(editSchema, body)
    const food = cleanFoodText(input.food)
    if (!food || food.toLocaleLowerCase() !== input.food.toLocaleLowerCase() || /[@\d]|https?:|\b(?:phone|address)\b/i.test(food)) throw new AppError('VALIDATION_ERROR', 'Chỉ nhập tên món hoặc nguyên liệu.', 400)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const tx = createConciergeV2MemoryRepository(client as unknown as pg.Pool, actor)
      const deletion = await tx.deleteFact(input.selector)
      if (!deletion.ok) throw new AppError('VERSION_CONFLICT', 'Ký ức đã thay đổi.', 409)
      const settings = await tx.getSettings()
      const write = await tx.writeFact({ expected_memory_epoch: settings.memory_epoch,
        fact: { memory_type: input.selector.memory_type, memory_key: slugifyFoodKey(food, input.selector.memory_type),
          value: { food }, source: 'explicit', confidence: 100, observed_at: new Date().toISOString(), expires_at: null, schema_version: 1 } })
      if (!write.ok) throw new AppError('VERSION_CONFLICT', 'Không thể sửa ký ức.', 409)
      await client.query('COMMIT')
      return checked(write)
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  }
  throw new AppError('NOT_FOUND', 'Không tìm thấy thao tác ký ức.', 404)
}
