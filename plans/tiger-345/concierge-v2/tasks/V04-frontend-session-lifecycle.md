# V04 - Frontend fresh-session lifecycle

Status: TODO
Dependencies: V03
Deliverable: implementation + applicable tests + ../reports/V04.md

## Cold-start context

Current chat state is local to useConcierge. Widget mount/unmount, auth changes, late responses and expired sessions need a deliberate app-level lifecycle.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

Current hook epoch handling; widget mounting site; V01 response/error contract; existing concierge hook tests.

## Ownership

useConcierge.ts, api.ts, chat provider/app-shell wiring and lifecycle unit tests. Do not build draft UI yet.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Place session state at the agreed app-shell scope so widget close/open and internal routing do not accidentally reset it.
- [ ] 2. Start new on reload/new tab/reset/auth identity change; clear transcript, draft and capability together. Never hydrate old conversation storage.
- [ ] 3. Discard stale async responses after reset/logout/switch, including mutations/handoff payloads. Abort requests when appropriate.
- [ ] 4. Handle session expiry with a fresh greeting and actionable notice; preserve text for retry without silently resubmitting a mutation. Conflict triggers safe state refresh, not replay.
- [ ] 5. Handle back-forward cache and tab visibility with TTL/lifecycle checks. Do not rely on unload to guarantee server cleanup.
- [ ] 6. Check browser storage and URLs contain no session or draft data. Preserve existing real-cart behavior.

## Exit criteria

Lifecycle acceptance A01-A04 passes including delayed responses. Closing the widget preserves current chat; reload and identity change clear it.

## Verification

npm run test:unit -- tests/unit/concierge-hook.test.tsx; new lifecycle cases; typecheck; lint; build.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Disable V2 widget flag; keep manual cart usable. Do not restore old history from browser storage.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
