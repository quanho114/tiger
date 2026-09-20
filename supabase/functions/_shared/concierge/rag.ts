/**
 * Tiger 345 - Grounded Knowledge Retrieval (RAG)
 * Based on plans/tiger-345/09-concierge-agent-design.md (§14, AT07, AT08)
 *
 * Importers / Callers:
 * - supabase/functions/_shared/concierge/tools.ts (toolLookupRestaurantInfo)
 * - supabase/functions/admin-api/concierge-knowledge-handlers.ts
 * - tests/integration/concierge-knowledge.test.ts
 *
 * Affected APIs:
 * - POST /concierge/chat
 * - GET /admin-api/concierge/knowledge/search
 *
 * Data Schemas:
 * - KnowledgeDocument, KnowledgeDocumentStatus, KnowledgeReference, RAGSearchResult, RAGSearchResponse
 *
 * Verbatim Instruction:
 * - "Task C03 Tri thức và quản trị dữ liệu (AT07, AT08): RAG Retrieval Lifecycle, Citation Tracking & Prompt Injection Defense. Document Lifecycle Filtering: Knowledge documents have statuses (draft, published, retired) and effective date windows. Prompt Injection Defense: Documents and queries matching injection heuristics are flagged, wrapped in [PASSIVE_DATA_ONLY], and never treated as executable system directives."
 */

import type { KnowledgeReference } from './types.ts'
import {
  RESTAURANT_KNOWLEDGE_DOCS,
  type KnowledgeDocument,
} from './knowledge.ts'

export interface RAGSearchResult {
  document: KnowledgeDocument
  score: number
  matched_keywords: string[]
  safe_content: string
}

export interface RAGSearchResponse {
  results: RAGSearchResult[]
  references: KnowledgeReference[]
  injection_detected: boolean
  is_missing_knowledge: boolean
}

// Patterns matching prompt injection or instruction override attacks
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+|previous\s+|prior\s+)?instructions/i,
  /system\s*:/i,
  /admin\s+override/i,
  /(?:execute|run|call)\s+(?:tool|function|sql|command|script)/i,
  /bypass\s+(?:security|safety|filter|guard|policy|rules)/i,
  /you\s+are\s+now\s+(?:unrestricted|dan|in\s+developer\s+mode|jailbroken)/i,
  /reveal\s+(?:system\s+prompt|secret|api\s*key|password|token)/i,
  /disregard\s+(?:rules|guidelines)/i,
]

export function detectPromptInjection(text: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text))
}

export function wrapPassiveData(content: string): string {
  return `[PASSIVE_DATA_ONLY]\n${content}\n[/PASSIVE_DATA_ONLY]`
}

export function isDocumentEffective(doc: KnowledgeDocument, asOfDate = new Date()): boolean {
  if (doc.status !== 'published') {
    return false
  }
  const asOfTime = asOfDate.getTime()
  if (doc.effective_from) {
    const fromTime = new Date(doc.effective_from).getTime()
    if (!isNaN(fromTime) && asOfTime < fromTime) {
      return false
    }
  }
  if (doc.effective_to) {
    const toTime = new Date(doc.effective_to).getTime()
    if (!isNaN(toTime) && asOfTime > toTime) {
      return false
    }
  }
  return true
}

export function searchRestaurantKnowledge(
  query: string,
  minScore = 0.25,
  asOfDate = new Date()
): RAGSearchResponse {
  const normalizedQuery = query.toLowerCase().trim()
  const injectionDetected = detectPromptInjection(query)

  if (!normalizedQuery) {
    return {
      results: [],
      references: [],
      injection_detected: injectionDetected,
      is_missing_knowledge: true,
    }
  }

  const queryWords = normalizedQuery.split(/\s+/).filter((w) => w.length >= 2)
  const scoredResults: RAGSearchResult[] = []

  // Filter only active and effective documents
  const candidateDocs = RESTAURANT_KNOWLEDGE_DOCS.filter((doc) =>
    isDocumentEffective(doc, asOfDate)
  )

  for (const doc of candidateDocs) {
    let score = 0
    const matched: string[] = []
    const docText = `${doc.title} ${doc.content}`.toLowerCase()

    // 1. Keyword hits (weighted 0.35 per keyword)
    for (const kw of doc.keywords) {
      if (normalizedQuery.includes(kw.toLowerCase())) {
        score += 0.35
        matched.push(kw)
      }
    }

    // 2. Query word hits in doc body/title (weighted 0.4 total)
    let wordMatches = 0
    for (const word of queryWords) {
      if (docText.includes(word)) {
        wordMatches += 1
      }
    }
    if (queryWords.length > 0) {
      score += (wordMatches / queryWords.length) * 0.4
    }

    if (score >= minScore) {
      scoredResults.push({
        document: doc,
        score: Number(score.toFixed(2)),
        matched_keywords: matched,
        safe_content: wrapPassiveData(doc.content),
      })
    }
  }

  // Sort descending by score
  scoredResults.sort((a, b) => b.score - a.score)

  const topResults = scoredResults.slice(0, 3)
  const references: KnowledgeReference[] = topResults.map((r) => ({
    document_id: r.document.id,
    version: r.document.version,
    source: r.document.source,
    topic: r.document.topic,
    title: r.document.title,
  }))

  return {
    results: topResults,
    references,
    injection_detected: injectionDetected,
    is_missing_knowledge: topResults.length === 0,
  }
}
