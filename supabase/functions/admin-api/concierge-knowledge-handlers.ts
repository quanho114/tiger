/**
 * Tiger 345 - Admin Concierge Knowledge & RAG Governance Handlers
 * Task: C03 (Requirement R04, Acceptance AT07, AT08, Invariant §13, §14)
 *
 * Importers / Callers:
 * - supabase/functions/admin-api/index.ts
 * - tests/integration/concierge-knowledge.test.ts
 *
 * Affected APIs:
 * - GET /admin-api/concierge/knowledge/audit
 * - GET /admin-api/concierge/knowledge/config
 * - PATCH /admin-api/concierge/knowledge/config
 * - GET /admin-api/concierge/knowledge/serving-profiles
 * - GET /admin-api/concierge/knowledge/serving-profiles/:itemId
 * - PUT/PATCH /admin-api/concierge/knowledge/serving-profiles/:itemId
 * - GET /admin-api/concierge/knowledge/allergens
 * - GET /admin-api/concierge/knowledge/allergens/:itemId
 * - PUT/PATCH /admin-api/concierge/knowledge/allergens/:itemId
 * - GET /admin-api/concierge/knowledge/documents
 * - POST /admin-api/concierge/knowledge/documents
 * - GET /admin-api/concierge/knowledge/documents/:docId
 * - PATCH /admin-api/concierge/knowledge/documents/:docId
 * - POST /admin-api/concierge/knowledge/documents/:docId/retire
 * - GET /admin-api/concierge/knowledge/search
 *
 * Data Schemas:
 * - public.audit_logs, ServingProfile, ItemAllergenProfile, RecommendationConfig, KnowledgeDocument, KnowledgeAuditReport
 *
 * Verbatim Instruction:
 * - "Task C03 Tri thức và quản trị dữ liệu (AT07, AT08). Admin endpoints (/admin-api/concierge/...) protected by requireAdmin verifying active admin profile in PostgreSQL. Non-admin calls strictly rejected with 401/403. Strict validation of serving profiles (range constraints, macro contribution limits, valid roles and units). Allergen Fail-Closed Safety Gate: An item's verified_by_kitchen cannot self-verify from seed or demo estimates; setting verified_by_kitchen: true strictly requires admin attribution and non-empty kitchen verification notes. Full audit logging: all administrative modifications write an immutable row to public.audit_logs capturing admin_id, action, entity_type, entity_id, and metadata."
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type pg from 'pg'
import { jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import type { AuthActor } from '../_shared/types.ts'
import {
  adminAuditKnowledge,
  adminCreateDocument,
  adminRetireDocument,
  adminUpdateConfig,
  adminUpdateDocument,
  type KnowledgeDocument,
  type RecommendationConfig,
  type ServingProfile,
  type ItemAllergenProfile,
} from '../_shared/concierge/knowledge.ts'
import {
  getAllergenProfile,
  getServingProfile,
  listAllergenProfiles,
  listServingProfiles,
  upsertAllergenProfile,
  upsertServingProfile,
} from '../_shared/concierge/menu/profile-repository.ts'
import { upsertTasteProfile } from '../_shared/concierge/menu/taste-repository.ts'
import {
  acceptProfileDraft,
  generateProfileDraft,
  listProfileDrafts,
  rejectProfileDraft,
} from '../_shared/concierge/menu/ai-draft.ts'
import {
  coverageReport,
  findStaleSeedIds,
  profileStatusOf,
  profileWarningsOf,
} from '../_shared/concierge/menu/profile-quality.ts'
import {
  snapshotById,
} from '../_shared/concierge/menu/domain.ts'
import { loadMenuSnapshot } from '../_shared/concierge/menu/repository.ts'
import {
  ALLERGEN_PROFILES,
  SERVING_PROFILES,
} from '../_shared/concierge/knowledge.ts'
import { searchRestaurantKnowledge } from '../_shared/concierge/rag.ts'
import { loadKnowledgeSnapshot, persistKnowledgeMutation } from '../_shared/concierge/knowledge-repository.ts'

export async function handleConciergeKnowledgeRoutes(
  req: Request,
  path: string,
  actor: AuthActor,
  pool: pg.Pool,
  supabaseAdmin: SupabaseClient,
  requestId: string
): Promise<Response | null> {
  if (!path.startsWith('/concierge/knowledge')) {
    return null
  }

  const url = new URL(req.url)

  // 1. Audit Report
  if (path === '/concierge/knowledge/audit' && req.method === 'GET') {
    const report = adminAuditKnowledge(await loadKnowledgeSnapshot(pool))
    return jsonResponse(report, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  // 2. Recommendation Config (GET & PATCH)
  if (path === '/concierge/knowledge/config' && req.method === 'GET') {
    return jsonResponse((await loadKnowledgeSnapshot(pool)).config, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  if (
    path === '/concierge/knowledge/config' &&
    (req.method === 'PATCH' || req.method === 'PUT')
  ) {
    const body = await parseJsonBody<Partial<RecommendationConfig>>(req)
    const updated = await persistKnowledgeMutation(pool, { kind: 'config', key: 'global', actorId: actor.userId,
      action: 'update_recommendation_config', entityType: 'recommendation_config',
      mutate: snapshot => adminUpdateConfig(body, actor.userId ?? undefined, snapshot),
      metadata: value => ({ version: value.version, updates: body }) })

    return jsonResponse(updated, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  // 3. Serving Profiles (Phase 5: menu_item_ai_profiles is the truth)
  if (path === '/concierge/knowledge/serving-profiles' && req.method === 'GET') {
    return jsonResponse(await listServingProfiles(pool), requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  const servingMatch = path.match(
    /^\/concierge\/knowledge\/serving-profiles\/([^/]+)$/
  )
  if (servingMatch) {
    const itemId = servingMatch[1]
    if (req.method === 'GET') {
      return jsonResponse(await getServingProfile(pool, itemId), requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseJsonBody<Partial<ServingProfile>>(req)
      const updated = await upsertServingProfile(pool, itemId, body, actor.userId)

      return jsonResponse(updated, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }
  }

  // 4. Allergen Profiles (Phase 5: menu_item_ai_profiles is the truth)
  if (path === '/concierge/knowledge/allergens' && req.method === 'GET') {
    return jsonResponse(await listAllergenProfiles(pool), requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  const allergenMatch = path.match(
    /^\/concierge\/knowledge\/allergens\/([^/]+)$/
  )
  if (allergenMatch) {
    const itemId = allergenMatch[1]
    if (req.method === 'GET') {
      return jsonResponse(await getAllergenProfile(pool, itemId), requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseJsonBody<Partial<ItemAllergenProfile>>(req)
      const updated = await upsertAllergenProfile(pool, itemId, body, actor.userId)

      return jsonResponse(updated, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }
  }

  // 5. Menu profile governance (Phase 5.5: full profile, taste, verify,
  //    coverage, AI drafts). Customer agent has no access to these routes.
  //    Admin reads bypass the in-process snapshot cache so curation always
  //    sees fresh values (Edge isolates do not share memory; the 45s TTL
  //    cache remains for the customer runtime path only).
  if (path === '/concierge/knowledge/profiles/coverage' && req.method === 'GET') {
    const snapshot = await loadMenuSnapshot(pool)
    const liveIds = new Set(snapshot.items.map((item) => item.id))
    const report = coverageReport(snapshot, liveIds)
    const staleSeedIds = findStaleSeedIds(liveIds, [...Object.keys(SERVING_PROFILES), ...Object.keys(ALLERGEN_PROFILES)])
    return jsonResponse({
      ...report,
      staleSeedIds,
      staleSeedCount: staleSeedIds.length,
      items: snapshot.items.map((item) => ({ id: item.id, status: profileStatusOf(item, liveIds) })),
    }, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  const profileMatch = path.match(
    /^\/concierge\/knowledge\/profiles\/([^/]+)$/
  )
  if (profileMatch) {
    const itemId = profileMatch[1]
    if (req.method === 'GET') {
      const snapshot = await loadMenuSnapshot(pool)
      const item = snapshotById(snapshot, itemId)
      if (!item) {
        throw new AppError('NOT_FOUND', `Không tìm thấy món ${itemId} trong thực đơn`, 404)
      }
      const liveIds = new Set(snapshot.items.map((entry) => entry.id))
      return jsonResponse({
        item,
        status: profileStatusOf(item, liveIds),
        warnings: profileWarningsOf(item, liveIds),
      }, requestId, req, 200, { 'Cache-Control': 'no-store' })
    }
  }

  const tasteMatch = path.match(
    /^\/concierge\/knowledge\/profiles\/([^/]+)\/taste$/
  )
  if (tasteMatch) {
    const itemId = tasteMatch[1]
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseJsonBody(req)
      const updated = await upsertTasteProfile(pool, itemId, body as Record<string, unknown>, actor.userId)
      return jsonResponse(updated, requestId, req, 200, { 'Cache-Control': 'no-store' })
    }
  }

  const verifyMatch = path.match(
    /^\/concierge\/knowledge\/allergens\/([^/]+)\/verify$/
  )
  if (verifyMatch) {
    const itemId = verifyMatch[1]
    if (req.method === 'POST') {
      // Explicit kitchen verification op. The safety gate inside
      // upsertAllergenProfile requires auditor + kitchen notes.
      const body = await parseJsonBody<{ kitchen_notes?: string; allergens?: Record<string, string> }>(req)
      const updated = await upsertAllergenProfile(pool, itemId, {
        ...(body.allergens ? { allergens: body.allergens } : {}),
        verified_by_kitchen: true,
        kitchen_notes: body.kitchen_notes ?? '',
      } as Partial<ItemAllergenProfile>, actor.userId)
      return jsonResponse(updated, requestId, req, 200, { 'Cache-Control': 'no-store' })
    }
  }

  const draftGenMatch = path.match(
    /^\/concierge\/knowledge\/profiles\/([^/]+)\/drafts\/generate$/
  )
  if (draftGenMatch) {
    const itemId = draftGenMatch[1]
    if (req.method === 'POST') {
      const draft = await generateProfileDraft(pool, itemId, actor.userId)
      return jsonResponse(draft, requestId, req, 200, { 'Cache-Control': 'no-store' })
    }
  }

  const draftsMatch = path.match(
    /^\/concierge\/knowledge\/profiles\/([^/]+)\/drafts$/
  )
  if (draftsMatch) {
    const itemId = draftsMatch[1]
    if (req.method === 'GET') {
      return jsonResponse(await listProfileDrafts(pool, itemId), requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }
  }

  const draftDecisionMatch = path.match(
    /^\/concierge\/knowledge\/drafts\/([^/]+)\/(accept|reject)$/
  )
  if (draftDecisionMatch) {
    const draftId = draftDecisionMatch[1]
    const decision = draftDecisionMatch[2]
    if (req.method === 'POST') {
      if (decision === 'accept') {
        const body = await parseJsonBody<{ only?: ('serving' | 'taste')[] }>(req)
        const only = Array.isArray(body.only)
          ? body.only.filter((s): s is 'serving' | 'taste' => s === 'serving' || s === 'taste')
          : undefined
        return jsonResponse(await acceptProfileDraft(pool, draftId, actor.userId, only), requestId, req, 200, {
          'Cache-Control': 'no-store',
        })
      }
      await rejectProfileDraft(pool, draftId, actor.userId)
      return jsonResponse({ ok: true }, requestId, req, 200, { 'Cache-Control': 'no-store' })
    }
  }

  // 6. Grounded Knowledge Documents CRUD & Lifecycle
  if (path === '/concierge/knowledge/documents' && req.method === 'GET') {
    const statusFilter = url.searchParams.get('status')
    const topicFilter = url.searchParams.get('topic')

    let docs = (await loadKnowledgeSnapshot(pool)).documents
    if (statusFilter) {
      docs = docs.filter((d) => d.status === statusFilter)
    }
    if (topicFilter) {
      docs = docs.filter((d) => d.topic === topicFilter)
    }

    return jsonResponse(docs, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  if (path === '/concierge/knowledge/documents' && req.method === 'POST') {
    const body = await parseJsonBody<
      Omit<KnowledgeDocument, 'id' | 'version' | 'updated_at'> & { id?: string }
    >(req)
    const newDoc = await persistKnowledgeMutation(pool, { kind: 'document', actorId: actor.userId,
      action: 'create_knowledge_document', entityType: 'knowledge_document',
      mutate: snapshot => adminCreateDocument(body, actor.userId ?? undefined, snapshot),
      metadata: value => ({ title: value.title, topic: value.topic, status: value.status }) })

    return jsonResponse(newDoc, requestId, req, 201, {
      'Cache-Control': 'no-store',
    })
  }

  const docRetireMatch = path.match(
    /^\/concierge\/knowledge\/documents\/([^/]+)\/retire$/
  )
  if (docRetireMatch && req.method === 'POST') {
    const docId = docRetireMatch[1]
    const retired = await persistKnowledgeMutation(pool, { kind: 'document', key: docId, actorId: actor.userId,
      action: 'retire_knowledge_document', entityType: 'knowledge_document',
      mutate: snapshot => adminRetireDocument(docId, actor.userId ?? undefined, snapshot),
      metadata: value => ({ status: 'retired', version: value.version }) })

    return jsonResponse(retired, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  const docMatch = path.match(
    /^\/concierge\/knowledge\/documents\/([^/]+)$/
  )
  if (docMatch) {
    const docId = docMatch[1]
    if (req.method === 'GET') {
      const doc = (await loadKnowledgeSnapshot(pool)).documents.find((d) => d.id === docId)
      if (!doc) {
        throw new AppError('NOT_FOUND', `Không tìm thấy tài liệu tri thức ${docId}`, 404)
      }
      return jsonResponse(doc, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseJsonBody<Partial<KnowledgeDocument>>(req)
      const updated = await persistKnowledgeMutation(pool, { kind: 'document', key: docId, actorId: actor.userId,
        action: 'update_knowledge_document', entityType: 'knowledge_document',
        mutate: snapshot => adminUpdateDocument(docId, body, actor.userId ?? undefined, snapshot),
        metadata: value => ({ updates: body, new_version: value.version }) })

      return jsonResponse(updated, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }
  }

  // 6. RAG Grounded Search (Admin Probe / Diagnostics)
  if (path === '/concierge/knowledge/search' && req.method === 'GET') {
    const query = url.searchParams.get('query') || ''
    const minScore = Number(url.searchParams.get('min_score')) || 0.25
    const searchResult = searchRestaurantKnowledge(query, minScore, new Date(), (await loadKnowledgeSnapshot(pool)).documents)

    return jsonResponse(searchResult, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  return null
}
