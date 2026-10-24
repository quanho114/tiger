import type { TurnScope } from './turn-context.ts'
import { createConciergeV2MemoryRepository } from '../memory-repository.ts'
import { retrieveSelectiveMemory } from '../memory-retrieval.ts'
import { aggregateBehavioralMemory } from '../behavioral-memory.ts'
import { extractExplicitFacts } from '../memory-extractor.ts'
import { applyEffectiveMemory } from '../memory-state.ts'

/** Runtime holds the account barrier through ingestion, CAS and safe emission. */
export async function prepareTurnMemory(scope: TurnScope): Promise<void> {
  const context = scope.next.memory_context!
  const prior = JSON.stringify(context.imported)
  const userId = scope.record.actor.authenticated_user_id
  const message = scope.request.message ?? ''
  const extraction = extractExplicitFacts(message)
  const scopedDeclaration = ['TEMPORARY_STATEMENT', 'THIRD_PARTY_STATEMENT'].includes(extraction.rejection_reason ?? '') &&
    /(?:không thích|không ăn|kiêng|thích|dị ứng)/iu.test(message)
  const food = scope.understanding?.readNeeds.some(need => need.kind === 'menu') || extraction.extracted || scopedDeclaration
  let facts = context.imported
  if (!userId || process.env.CONCIERGE_MEMORY_DISABLED === 'true') {
    context.imported = []
    delete context.epoch
  } else if (food || facts.length) {
    const repository = createConciergeV2MemoryRepository(scope.pool, { role: 'customer', userId })
    const settings = await repository.getSettings().catch(() => undefined)
    if (!settings?.enabled) {
      context.imported = []
      delete context.epoch
    } else {
      if (context.epoch !== settings.memory_epoch) facts = []
      context.epoch = settings.memory_epoch
      if (food && context.behavioral_refreshed_epoch !== settings.memory_epoch) {
        // Once per session/epoch, even when a greeting came before the food turn.
        context.behavioral_refreshed_epoch = settings.memory_epoch
        await aggregateBehavioralMemory({ pool: scope.pool, actor: scope.record.actor, repository }).catch(() => {})
      }
      if (food) {
        const retrieved = await retrieveSelectiveMemory({ message: scope.request.message ?? '', actor: scope.record.actor,
          repository, intent: 'food_or_draft', currentSessionConstraints: [...context.current.dislikes, ...context.current.allergies] })
        applyEffectiveMemory(scope.next, retrieved.facts, settings.memory_epoch)
      } else applyEffectiveMemory(scope.next, facts, settings.memory_epoch)
    }
  }
  if (!context.imported.length) scope.next.constraints = structuredClone(context.current)
  if (prior !== JSON.stringify(context.imported)) {
    // Historical assistant prose may paraphrase a deleted/expired fact. It is
    // never used to reconstruct memory after the authoritative snapshot changes.
    scope.next.transcript = []; scope.next.summary = ''
    if (prior !== '[]') {
      scope.next.pending_items = []; scope.next.pending_suggestion_ids = []
      if (scope.next.conversation_context) delete scope.next.conversation_context.displayed
    }
  }
}
