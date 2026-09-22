# V03 - Move runtime sessions and repair legacy retention

Status: TODO
Dependencies: V02
Deliverable: implementation + applicable tests + ../reports/V03.md

## Cold-start context

All current conversation/proposal/event persistence paths must be audited together; redirecting conversation creation alone still leaks guest data.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

V02 store; concierge migration; feedback.ts; get/save proposal callers; tests/integration/concierge-state-session.test.ts.

## Ownership

persistence.ts, state-machine.ts, runtime.ts persistence wiring, public-api/index.ts wiring, retention.ts and legacy-cleanup runbook. Shared router edits serialize.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Route V2 session reads/transitions/resets through SessionStore. Round-trip every state field including pending_reservation, active_quote and action_waiting; do not lose fields between turns.
- [ ] 2. Keep recommendation proposals and draft versions in ephemeral storage. Update revalidation/feedback lookup paths to avoid an implicit permanent proposal archive.
- [ ] 3. Remove raw chat/event persistence from the V2 path for both identities. Guest feedback may produce anonymous aggregates only; never preserve guest transcript or identifying session linkage.
- [ ] 4. Fix retention SQL to the actual schema; inventory legacy authenticated and guest records plus FK effects. Add dry-run counts and guarded batching; document auth deletion implications.
- [ ] 5. Use read-time expiry and distinct expired/conflict/unavailable errors. Preserve existing auth checks and reservation transaction safety.
- [ ] 6. Search all API, telemetry and error paths for bypass persistence. Include legacy chat/action/feedback clients: reject or adapt them at V2 activation so old contract versions cannot keep storing guest transcripts. Verify guest and logged-in chat create zero transcript SQL rows.

## Exit criteria

Real DB tests show zero new guest conversation/proposal/raw-event rows. Legacy cleanup runs against actual migrations without missing-column errors. Existing reservations retain state across requests.

## Verification

Existing concierge state/session and transaction integration suites; new tests/integration/concierge-v2-persistence.test.ts; typecheck:server; lint. No production deletion.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Disable V2 chat endpoint/flag; keep TTL data expiring. Legacy cleanup remains dry-run until separately authorized.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
