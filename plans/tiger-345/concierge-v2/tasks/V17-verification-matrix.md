# V17 - Full regression and browser verification

Status: TODO
Dependencies: V14, V15, V16
Deliverable: implementation + applicable tests + ../reports/V17.md

## Cold-start context

Unit mocks previously passed despite a nonexistent retention column. Release evidence must cover real local infrastructure and browser behavior.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

ACCEPTANCE.md; existing server/integration/policy/e2e configs and test DB guard; reports V01-V16.

## Ownership

Acceptance fixtures, tests and reports. Production code fixes only when explicitly documented and coordinated with owner.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Implement all acceptance scenarios with deterministic fake provider responses, real isolated PostgreSQL and shared TTL store.
- [ ] 2. Run lifecycle and draft browser flows on desktop/mobile, including concurrent requests, stale tabs, network retries and account switch.
- [ ] 3. Inspect outbound provider payloads to prove budgets, no duplicate message, no full menu, proper tool outputs and no unrelated personal memory.
- [ ] 4. Verify zero guest transcript writes and no sensitive log/storage contents, real cleanup SQL, epoch races and order/reservation regressions.
- [ ] 5. Run complete applicable offline suites, typechecks, lint and build. Record every failure and close regressions before declaring readiness.
- [ ] 6. Prepare live-provider evaluation scenarios and cost ceiling, but do not run without explicit opt-in. Report real-provider quality as unverified until run.

## Exit criteria

All A01-A22 have evidence or explicit blocking status. No mock-only substitution for storage/concurrency/browser gates. Live quality status is separate.

## Verification

npm run test:unit; npm run test:server; npm run test:integration; npm run test:policies; npm run test:e2e:mock; targeted new real-service browser tests; npm run typecheck; npm run typecheck:server; npm run lint; npm run build. Run existing real-browser DB suites when infrastructure is available.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Keep release disabled on unmet mandatory gates; do not waive failures or reset non-test databases.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
