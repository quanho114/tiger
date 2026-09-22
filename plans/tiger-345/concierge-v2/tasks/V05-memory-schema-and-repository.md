# V05 - Memory schema, settings and repository

Status: TODO
Dependencies: V01
Deliverable: implementation + applicable tests + ../reports/V05.md

## Cold-start context

Existing customer favorites/orders are not explicit preference memory. Build a minimal owner-scoped fact store with deletion fencing.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

V01 schema; customer auth/data-boundary helpers; customer-api/customer-handlers.ts; account deletion worker and policy tests.

## Ownership

Additive memory migration; memory-repository.ts and contract tests. No catalog migration or runtime.ts edits.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Create settings/fact schema with bounded values, source/confidence, timestamps, schema version and unique upsert identity.
- [ ] 2. Default memory disabled; implement authenticated enable/read/edit/delete/disable repository operations and per-user limits.
- [ ] 3. Apply RLS and server identity binding. Model/client cannot choose a different owner. Return whitelisted DTOs only.
- [ ] 4. Implement explicit-versus-inferred precedence, source-aware updates and stable correction identity.
- [ ] 5. Increment memory_epoch atomically on forget/disable/account deletion; writes require matching epoch and active account.
- [ ] 6. Document index/query plans and migrations rollback strategy. No raw utterance field in table or job payload archive.

## Exit criteria

Guest/cross-user access is denied; malformed/oversized facts rejected. A delayed old-epoch write cannot recreate a forgotten memory.

## Verification

New tests/policies/concierge-memory.test.ts and tests/integration/concierge-memory.test.ts on real PostgreSQL; typecheck:server; lint.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Disable memory reads/writes; retain additive tables until an explicit cleanup. Never roll back by dropping customer data.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
