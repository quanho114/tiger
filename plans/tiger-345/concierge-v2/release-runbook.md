# Concierge release runbook

Prepared 2026-09-22. This document authorizes no deployment, production deletion or paid model calls.

## Gates

Implementation and local test evidence are in [V17](reports/V17.md) and the
[acceptance matrix](verification-matrix.md). Independent review is tracked in
[V18](reports/V18.md). Do not enable production until the independent review,
provider evaluation and infrastructure/configuration checks are complete.

## Configuration and migration order

1. Apply normal repository migrations, then Concierge migrations in timestamp order:
   `20260922000001_concierge_v2_memory.sql`,
   `20260922000002_concierge_feedback_aggregates.sql`,
   `20260922000003_concierge_feature_flags.sql`,
   `20260922000004_concierge_memory_deletion_fence.sql`,
   `20260922000005_concierge_v2_health.sql`,
   `20260923000001_concierge_v2_postgres_sessions.sql`,
   `20260923000002_concierge_single_runtime.sql`.
   Use the migration ledger; never replay an already applied migration manually.
2. Confirm the existing server-only `DATABASE_URL` connects to the migrated
   Supabase PostgreSQL database. Concierge uses a private session table and
   requires no Redis or Upstash configuration. Confirm the scheduled retention
   endpoint runs frequently enough to purge expired session rows. Review
   PostgreSQL backup retention because backups can retain expired chat text.
3. Configure an enabled supported provider in the existing protected LLM settings
   or supported server environment. The runtime rejects missing keys/stub configuration.
   Verify outbound provider data handling/retention settings separately.
4. Inspect the server-only `concierge_disabled` kill switch. The browser and
   gateway use one runtime; no version selection flag is required. A DB override
   takes precedence over `CONCIERGE_DISABLED`.
5. Configure log storage retention to at most 14 days, disable request/response
   body capture, and exclude authorization headers. The app emits schema-checked
   numeric metrics; it cannot enforce a hosting vendor's log retention setting.
   Verify hosting configuration before production activation.

## Staged activation

- Staging: execute the real PostgreSQL integration tests and desktop/mobile
  browser fixtures. Complete the separately authorized [provider evaluation](live-evaluation.md).
- After release approval, deploy the single runtime. Current clients use the
  versioned wire contract; retired clients receive 409 `REFRESH_REQUIRED` and
  cannot write legacy transcripts. Manual ordering remains available.
- Observe at least 100 turns and 30 minutes. Check error rate,
  p50/p95 latency, actual input/output usage, safety blocks, CAS conflicts,
  handoff outcome and manual checkout health. These are proposed operational
  thresholds, not measured production results.
- Stop the assistant for dependency errors above 5% over 5 minutes or p95 turn latency
  above 25 seconds. Immediately stop for any unauthorized access, transcript
  persistence, unsupported allergy claim, automatic checkout or duplicate handoff.
- Provider input limits are 6,000 per call and 12,000 per turn (conservative byte
  upper bounds); model calls <=3 and tool executions <=6. Shared SQL circuit
  pauses chat for one minute after five dependency failures in a minute.

## Exact emergency stop

Set `CONCIERGE_DISABLED=true` in the server deployment environment and restart/
redeploy the affected functions through the authorized deployment procedure, or
set server-only `concierge_disabled=true` in `system_settings`.
Verify chat/action return 503, retired clients return 409, manual menu/cart/order
endpoints still work, and guest transcript row counts do not increase.

For a narrower stop, set `CONCIERGE_MEMORY_DISABLED=true`. The memory switch prevents extraction and
personalized retrieval while preserving account inspection/deletion controls.
Do not drop new tables, erase orders, undo customer cart edits, or roll back to
an application version without the V2 protocol/privacy guard.

## Retention and cleanup

The session store rejects a session after 45 idle minutes or four hours total.
`POST /admin-api/retention/run` physically deletes expired rows; closing a tab
does not guarantee immediate server deletion. Schedule that existing endpoint
with `confirm_production_cleanup: true` in production and verify its
`concierge_sessions_purged` count. Hosting owners must also confirm
backup and log retention separately before production activation.

Follow [legacy-cleanup.md](legacy-cleanup.md) for inventory, dry-run FK review,
backup handling and bounded cleanup. Production cleanup requires separate approval
of the concrete inventory. Never include orders, reservations or table visits.

## Evidence to retain

Store commit/build identity, migration ledger, test outcomes, provider/model version,
aggregate latency/token distributions and rollout decisions. Never retain chat,
prompts, memory values, capability tokens, IP addresses or provider error bodies.
