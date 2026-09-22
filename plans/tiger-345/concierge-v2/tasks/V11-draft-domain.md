# V11 - Draft cart domain and atomic operations

Status: TODO
Dependencies: V02, V08
Deliverable: implementation + applicable tests + ../reports/V11.md

## Cold-start context

Meal proposals are candidate sets, not accepted draft items. Build a deterministic draft domain independent of language interpretation.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

V01 draft operation contract; V02 CAS; V08 catalog/safety; current cart line identity rules.

## Ownership

draft-cart.ts, draft types and domain/store tests. No runtime.ts or UI edits.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Implement add/remove/set quantity/read/total operations with bounded quantities, line count and stable item+note identity.
- [ ] 2. Accept only validated command objects from trusted runtime; preserve candidate recommendations separately.
- [ ] 3. Price and availability come from catalog; quantities and notes validated. Store currency as integer VND and never accept model prices.
- [ ] 4. Apply a turn batch atomically with session version/request ID. Duplicate or stale calls cannot add twice or overwrite concurrent updates.
- [ ] 5. Track pending suggestion, reviewed/exported versions and blocked items. Draft expiry follows the session.
- [ ] 6. Provide explicit state transitions for review and handoff eligibility without performing real-cart writes.

## Exit criteria

Adding twice with the same request ID applies once; conflicting updates fail; unsafe/unavailable items cannot be handed off; suggestions alone create no lines.

## Verification

New tests/server/concierge-draft-cart.test.ts plus store integration concurrency tests; typecheck:server; lint.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Disable draft mutations; preserve read-only recommendations until session expiry.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
