import fs from 'node:fs'
import path from 'node:path'
import * as module from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { load } from './concierge-ts-loader.mjs'

if (typeof module.registerHooks === 'function') module.registerHooks({ load })
else module.register('./concierge-ts-loader.mjs', import.meta.url)

export function responseEvidence(key = 'menu') {
  const empty = { name: 'search_menu_items', status: 'empty', result: { candidates: [] } }
  const unavailable = { name: 'lookup_restaurant_info', status: 'unavailable', result: { status: 'unavailable' } }
  const status = ['empty', 'unknown', 'unavailable', 'not_attempted'].includes(key) ? key : key === 'mixed' ? 'unavailable' : 'known'
  const observations = key === 'mixed' ? [empty, unavailable] : key === 'not_attempted' ? [] : key === 'empty' ? [empty]
    : [{ name: key === 'menu' ? 'search_menu_items' : 'lookup_restaurant_info', status,
      result: key === 'menu' ? { candidates: [{ name: 'Món mẫu', price_vnd: 100000, safety_state: 'allergen_unknown' }] } : { status } }]
  return { evidence: JSON.stringify(observations), status }
}

export async function evaluateResponses(sourceRoot, splitNames = ['development', 'holdout']) {
  const fixturePath = fileURLToPath(new URL('../tests/server/fixtures/a09-response-v1.json', import.meta.url))
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  const guardPath = path.join(sourceRoot, 'supabase/functions/_shared/concierge/response-guard.ts')
  const guard = await import(pathToFileURL(guardPath).href)
  const splits = {}
  for (const split of splitNames) {
    const results = fixture[split].map(entry => {
      const { evidence, status } = responseEvidence(entry.evidence)
      const accepted = Boolean(entry.mode === 'conversation' ? guard.safeConversationReply(entry.text) : guard.safeGroundedReply(entry.text, evidence, status))
      return { id: entry.id, expected_allowed: entry.allow, accepted, passed: accepted === entry.allow, critical: Boolean(entry.critical) }
    })
    splits[split] = { count: results.length, passed: results.filter(r => r.passed).length,
      valid: results.filter(r => r.expected_allowed).length, unsafe: results.filter(r => !r.expected_allowed).length,
      false_positives: results.filter(r => r.expected_allowed && !r.accepted).length,
      false_negatives: results.filter(r => !r.expected_allowed && r.accepted).length,
      critical_false_negatives: results.filter(r => r.critical && !r.expected_allowed && r.accepted).length, results }
  }
  return { fixture_version: fixture.version, source: fixture.source, rubric: fixture.rubric,
    guard_source_sha256: createHash('sha256').update(fs.readFileSync(guardPath)).digest('hex'),
    environment: 'deterministic local guard evaluation; no model/provider/database; no human score', splits }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1] }
  const report = await evaluateResponses(path.resolve(option('--source') ?? '.'), process.argv.includes('--development-only') ? ['development'] : undefined)
  const output = option('--output')
  if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ fixture_version: report.fixture_version, splits: Object.fromEntries(Object.entries(report.splits).map(([key, { results: _results, ...summary }]) => [key, summary])) }, null, 2))
  if (process.argv.includes('--require-pass') && Object.values(report.splits).some(split => split.passed !== split.count)) process.exitCode = 1
}
