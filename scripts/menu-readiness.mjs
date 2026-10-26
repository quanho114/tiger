// Local snapshot analysis only: no database connection or provider call.
import fs from 'node:fs'
import { menuReadinessReport } from '../supabase/functions/_shared/concierge/menu/readiness.ts'
const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/menu-readiness.mjs <snapshot.json> [fixture|unverified_export]')
const source = process.argv[3] ?? 'unverified_export'
if (!['fixture', 'unverified_export'].includes(source)) throw new Error('Live coverage needs separately verified acquisition evidence')
const snapshot = JSON.parse(fs.readFileSync(input, 'utf8'))
if (!Array.isArray(snapshot.items) || typeof snapshot.version !== 'string' || typeof snapshot.loadedAt !== 'string') throw new Error('Invalid snapshot')
console.log(JSON.stringify(menuReadinessReport(snapshot, source), null, 2))
