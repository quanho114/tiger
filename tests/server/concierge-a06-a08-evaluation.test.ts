import { it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { retrieveMenuCandidates } from '../../supabase/functions/_shared/concierge/menu-retrieval.ts'
import fixture from './fixtures/a06-a08-evaluation.json'
import { evaluationCatalog } from './fixtures/a06-a08-fixture.ts'

it('measures the frozen retrieval fixture (offline, no provider)', async () => {
  const reports: Record<string, unknown> = {}
  for (const split of ['development', 'holdout'] as const) {
    let recall = 0, ndcg = 0, ranked = 0, exact = 0, exactCount = 0, empty = 0
    let relativePrice = 0, diversity = 0
    const timings: number[] = [], categories: Record<string, number> = {}, cases = []
    for (const query of fixture[split]) {
      const start = performance.now()
      const result = await retrieveMenuCandidates(evaluationCatalog, { query: query.query, limit: 8,
        is_signature: 'signature' in query ? query.signature : undefined,
        max_budget_vnd: 'budget' in query ? query.budget : undefined }, { allergenProfiles: {}, servingProfiles: {} })
      timings.push(performance.now() - start)
      const grades = query.grades as Record<string, number>
      const relevant = Object.keys(grades).filter(key => grades[key] > 0)
      const ids = result.candidates.map(item => String(Number(item.id.slice(-12))))
      if (!relevant.length) { expect(ids).toEqual([]); empty++; continue }
      ranked++
      const r = relevant.filter(key => ids.includes(key)).length / relevant.length
      const dcg = (values: number[]) => values.reduce((sum, grade, i) => sum + (2 ** grade - 1) / Math.log2(i + 2), 0)
      const n = dcg(ids.slice(0, 4).map(id => grades[id] ?? 0)) / dcg(Object.values(grades).sort((a, b) => b - a).slice(0, 4))
      recall += r; ndcg += n
      if ('exact' in query) { exactCount++; if (ids[0] === String(query.exact)) exact++ }
      relativePrice += result.candidates.reduce((sum, item) => sum + item.price_vnd, 0) / Math.max(1, ids.length)
      diversity += new Set(result.candidates.map(item => item.category_name)).size / Math.max(1, ids.length)
      for (const item of result.candidates) categories[item.category_name ?? 'unknown'] = (categories[item.category_name ?? 'unknown'] ?? 0) + 1
      cases.push({ id: query.id, recall8: r, ndcg4: n, ids })
    }
    timings.sort((a, b) => a - b)
    reports[split] = { count: fixture[split].length, ranked, noResultPassed: empty, recall8: recall / ranked,
      ndcg4: ndcg / ranked, exactTop1: exact / exactCount, meanPriceVnd: relativePrice / ranked,
      categoryDiversity: diversity / ranked, categoryExposure: categories,
      p50Ms: timings[Math.floor(timings.length * .5)], p95Ms: timings[Math.min(timings.length - 1, Math.floor(timings.length * .95))], cases }
  }
  const destination = process.env.A06_EVAL_OUTPUT
  if (process.env.A06_EVAL_COMPARE === '1') {
    const before = JSON.parse(fs.readFileSync('../tiger-a06-a08-baseline/retrieval-before.json', 'utf8'))
    for (const split of ['development', 'holdout']) {
      const after = reports[split] as { recall8: number; ndcg4: number; exactTop1: number }
      expect(after.recall8).toBeGreaterThanOrEqual(before.reports[split].recall8)
      expect(after.ndcg4).toBeGreaterThanOrEqual(before.reports[split].ndcg4)
      expect(after.exactTop1).toBe(1)
    }
  }
  if (destination) {
    const resolved = path.resolve(destination)
    const allowed = path.resolve('../tiger-a06-a08-baseline') + path.sep
    if (!resolved.startsWith(allowed)) throw new Error('Evaluation output must stay in task baseline directory')
    fs.writeFileSync(resolved, JSON.stringify({ version: fixture.version, policy: fixture.policy, reports }, null, 2))
  }
  expect(evaluationCatalog).toHaveLength(12)
})
