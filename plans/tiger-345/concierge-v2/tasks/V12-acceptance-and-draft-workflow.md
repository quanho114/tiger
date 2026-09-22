# V12 - Acceptance intent and draft tool workflow

Status: TODO
Dependencies: V10, V11
Deliverable: implementation + applicable tests + ../reports/V12.md

## Cold-start context

The assistant must track what was actually accepted. Global handling of OK currently loses contextual acceptance and cannot edit individual draft lines.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

V01 acceptance contract; V10 registry; V11 operations; runtime ambiguous-OK branch.

## Ownership

draft-intent.ts, runtime.ts/orchestrator tool wiring, phase transitions and state-machine tests.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Distinguish suggestion, explicit acceptance, ambiguous approval, rejection, quantity change, removal and review intent.
- [ ] 2. Bind pronouns/OK/2 portions to exactly one current pending suggestion with stable item ID, proposed quantity and version. Otherwise clarify.
- [ ] 3. Model output is an interpretation proposal only; backend checks supporting user instruction, pending context and allowed operation. No accepted=true trust shortcut.
- [ ] 4. Register draft tools and commit validated operation batches atomically. Changing topic, rejection or stale version invalidates inappropriate pending acceptance.
- [ ] 5. Support discovery -> preferences -> recommendation -> building -> reviewing; FAQ detours preserve accepted draft; chot only renders review.
- [ ] 6. Acknowledge committed items naturally. Never claim additions on failed CAS or tool error. Exclude automatic order/checkout paths from V2.

## Exit criteria

Full example conversation works: beef accepted, rice x2, vegetable suggested then OK, removal/quantity edit, chot review. Ambiguous and negated utterances never mutate.

## Verification

New tests/server/concierge-draft-intent.test.ts and tests/integration/concierge-draft-workflow.test.ts; existing reservation regression; typecheck:server; lint.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Disable language-driven mutations; retain explicit draft controls and safe read-only answers if available.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
