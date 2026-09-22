# V02 - Shared TTL session store

Status: BLOCKED
Dependencies: V01
Deliverable: implementation + applicable tests + ../reports/V02.md

## Cold-start context

Production Edge isolates cannot share in-process Maps. Session state must be temporary for every identity and atomically include draft state.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

V01 contracts; persistence.ts; state-machine.ts; capability.ts; rate-limit.ts.

## Ownership

New session-store.ts, session-store-redis.ts, isolated tests and adapter configuration. Do not yet redirect runtime.ts.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Implement create/read/CAS/delete with server-generated capability, hashed capability storage where practical, actor binding, version and injected clock.
- [ ] 2. Enforce 45-minute inactivity and 4-hour maximum expiry on reads and writes. Refresh idle TTL only for accepted activity; expired writes cannot revive sessions.
- [ ] 3. Store transcript, summary, constraints, draft and pending suggestion together. Add limits for messages, bytes, draft size and operation replay records.
- [ ] 4. Implement atomic version/expiry/idempotency checks with the selected store primitive. Reject cross-user access and conflicting simultaneous writes.
- [ ] 5. Implement deterministic in-memory test adapter with equivalent behavior. Production missing/unavailable store returns explicit service error, not DB or RAM fallback.
- [ ] 6. Add isolated real-store tests for TTL, simultaneous requests, response-loss retry, deletion and separate Edge-client instances.

## Exit criteria

Two clients share consistent state; exactly one conflicting mutation commits. Expired sessions remain expired. No persistent SQL transcript writes occur in this module.

## Verification

New tests/server/concierge-session-store.test.ts and tests/integration/concierge-session-store.test.ts; npm run typecheck:server; npm run lint.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Disable V2 session feature; leave ordinary ordering operational. Do not enable old transcript fallback.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
