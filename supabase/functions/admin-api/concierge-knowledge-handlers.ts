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
  ALLERGEN_PROFILES,
  RECOMMENDATION_CONFIG,
  RESTAURANT_KNOWLEDGE_DOCS,
  SERVING_PROFILES,
  adminAuditKnowledge,
  adminCreateDocument,
  adminRetireDocument,
  adminUpdateAllergenProfile,
  adminUpdateConfig,
  adminUpdateDocument,
  adminUpdateServingProfile,
  type KnowledgeDocument,
  type RecommendationConfig,
  type ServingProfile,
  type ItemAllergenProfile,
} from '../_shared/concierge/knowledge.ts'
import { searchRestaurantKnowledge } from '../_shared/concierge/rag.ts'

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
    const report = adminAuditKnowledge()
    return jsonResponse(report, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  // 2. Recommendation Config (GET & PATCH)
  if (path === '/concierge/knowledge/config' && req.method === 'GET') {
    return jsonResponse(RECOMMENDATION_CONFIG, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  if (
    path === '/concierge/knowledge/config' &&
    (req.method === 'PATCH' || req.method === 'PUT')
  ) {
    const body = await parseJsonBody<Partial<RecommendationConfig>>(req)
    const updated = adminUpdateConfig(body, actor.userId ?? undefined)

    await pool.query(
      `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
       VALUES ($1, 'admin', 'update_recommendation_config', 'recommendation_config', 'global', $2)`,
      [actor.userId, JSON.stringify({ version: updated.version, updates: body })]
    )

    return jsonResponse(updated, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  // 3. Serving Profiles
  if (path === '/concierge/knowledge/serving-profiles' && req.method === 'GET') {
    return jsonResponse(SERVING_PROFILES, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  const servingMatch = path.match(
    /^\/concierge\/knowledge\/serving-profiles\/([^/]+)$/
  )
  if (servingMatch) {
    const itemId = servingMatch[1]
    if (req.method === 'GET') {
      const profile = SERVING_PROFILES[itemId]
      if (!profile) {
        throw new AppError('NOT_FOUND', `Không tìm thấy thông tin khẩu phần cho món ${itemId}`, 404)
      }
      return jsonResponse(profile, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseJsonBody<Partial<ServingProfile>>(req)
      const updated = adminUpdateServingProfile(itemId, body, actor.userId ?? undefined)

      await pool.query(
        `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
         VALUES ($1, 'admin', 'update_serving_profile', 'serving_profile', $2, $3)`,
        [actor.userId, itemId, JSON.stringify(body)]
      )

      return jsonResponse(updated, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }
  }

  // 4. Allergen Profiles
  if (path === '/concierge/knowledge/allergens' && req.method === 'GET') {
    return jsonResponse(ALLERGEN_PROFILES, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  const allergenMatch = path.match(
    /^\/concierge\/knowledge\/allergens\/([^/]+)$/
  )
  if (allergenMatch) {
    const itemId = allergenMatch[1]
    if (req.method === 'GET') {
      const profile = ALLERGEN_PROFILES[itemId]
      if (!profile) {
        throw new AppError('NOT_FOUND', `Không tìm thấy thông tin dị ứng cho món ${itemId}`, 404)
      }
      return jsonResponse(profile, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseJsonBody<Partial<ItemAllergenProfile>>(req)
      const updated = adminUpdateAllergenProfile(itemId, body, actor.userId ?? undefined)

      await pool.query(
        `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
         VALUES ($1, 'admin', 'update_allergen_profile', 'allergen_profile', $2, $3)`,
        [actor.userId, itemId, JSON.stringify(body)]
      )

      return jsonResponse(updated, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }
  }

  // 5. Grounded Knowledge Documents CRUD & Lifecycle
  if (path === '/concierge/knowledge/documents' && req.method === 'GET') {
    const statusFilter = url.searchParams.get('status')
    const topicFilter = url.searchParams.get('topic')

    let docs = [...RESTAURANT_KNOWLEDGE_DOCS]
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
    const newDoc = adminCreateDocument(body, actor.userId ?? undefined)

    await pool.query(
      `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
       VALUES ($1, 'admin', 'create_knowledge_document', 'knowledge_document', $2, $3)`,
      [
        actor.userId,
        newDoc.id,
        JSON.stringify({ title: newDoc.title, topic: newDoc.topic, status: newDoc.status }),
      ]
    )

    return jsonResponse(newDoc, requestId, req, 201, {
      'Cache-Control': 'no-store',
    })
  }

  const docRetireMatch = path.match(
    /^\/concierge\/knowledge\/documents\/([^/]+)\/retire$/
  )
  if (docRetireMatch && req.method === 'POST') {
    const docId = docRetireMatch[1]
    const retired = adminRetireDocument(docId, actor.userId ?? undefined)

    await pool.query(
      `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
       VALUES ($1, 'admin', 'retire_knowledge_document', 'knowledge_document', $2, $3)`,
      [actor.userId, docId, JSON.stringify({ status: 'retired', version: retired.version })]
    )

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
      const doc = RESTAURANT_KNOWLEDGE_DOCS.find((d) => d.id === docId)
      if (!doc) {
        throw new AppError('NOT_FOUND', `Không tìm thấy tài liệu tri thức ${docId}`, 404)
      }
      return jsonResponse(doc, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseJsonBody<Partial<KnowledgeDocument>>(req)
      const updated = adminUpdateDocument(docId, body, actor.userId ?? undefined)

      await pool.query(
        `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
         VALUES ($1, 'admin', 'update_knowledge_document', 'knowledge_document', $2, $3)`,
        [
          actor.userId,
          docId,
          JSON.stringify({ updates: body, new_version: updated.version }),
        ]
      )

      return jsonResponse(updated, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }
  }

  // 6. RAG Grounded Search (Admin Probe / Diagnostics)
  if (path === '/concierge/knowledge/search' && req.method === 'GET') {
    const query = url.searchParams.get('query') || ''
    const minScore = Number(url.searchParams.get('min_score')) || 0.25
    const searchResult = searchRestaurantKnowledge(query, minScore)

    return jsonResponse(searchResult, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  return null
}
