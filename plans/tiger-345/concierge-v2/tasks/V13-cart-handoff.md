# V13 - Idempotent handoff to existing real cart

Status: TODO
Dependencies: V12
Deliverable: implementation + applicable tests + ../reports/V13.md

## Cold-start context

Draft and real cart remain separate until a user CTA. Existing cart.add loops are insufficient for replay-safe batch transfer.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

src/store/{cart,CartProvider}.tsx or actual .ts paths; useConcierge applyEnvelope; V01 handoff contract; quote validators.

## Ownership

cart-handoff.ts, action endpoint integration, focused CartProvider/cart helper changes and tests; coordinate hook consumer API with V14.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Create review/handoff action with session/actor/version/request binding, short expiry and authoritative line snapshot.
- [ ] 2. Recheck price, availability, mode and allergy verification. Changed prices demand explicit refreshed acceptance; blocked items remain visible.
- [ ] 3. Implement atomic client cart merge with handoff-ID deduplication tied to the cart lifecycle; repeated response/click/network retry adds zero duplicates.
- [ ] 4. Preserve existing lines/notes and disclose merge behavior. Commit cart update and applied handoff marker together in existing cart persistence where applicable.
- [ ] 5. On lost client acknowledgement, server retry returns the same handoff ID; keep the applied-ID marker atomic with cart lines and durable for the ordinary cart lifetime. Record exported draft version and follow V01 new-set rules after export. Auth/reset/late-response guards apply before any cart mutation.
- [ ] 6. Remove/gate V2 access to concierge confirm_quote submission; CTA opens existing cart/order flow without creating orders. Existing checkout performs final validation.

## Exit criteria

Existing cart + draft merge is correct, retries are idempotent, reset/logout late responses add nothing, and zero order/payment creation occurs before normal checkout.

## Verification

New tests/unit/concierge-handoff.test.tsx and server handoff tests; existing cart/unit and cart-order suites; both typechecks; lint; build.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Disable handoff CTA and preserve current real cart. Never undo real user cart edits to roll back an AI draft.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
