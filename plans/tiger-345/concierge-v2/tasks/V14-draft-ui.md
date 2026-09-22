# V14 - Sticky draft preview, review and editing UI

Status: TODO
Dependencies: V04, V13
Deliverable: implementation + applicable tests + ../reports/V14.md

## Cold-start context

Chat should stay primary while customers can inspect/edit accepted items and explicitly hand off. Preserve current public visual language.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

Existing chat/cards; V13 response/merge helpers; current accessibility and UI patterns.

## Ownership

DraftCartPreview.tsx, DraftCartReview.tsx, ConciergeChatView.tsx, useConcierge.ts and focused component tests.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Render sticky compact item count/total from canonical draft; expand to item quantities, notes, removal and blocked status.
- [ ] 2. Show distinct suggested versus accepted items. Chot presents a review card with Xem & chinh sua don CTA.
- [ ] 3. Implement loading/error/conflict/expired/price-change/empty states and explicit acceptance of updated prices.
- [ ] 4. Avoid optimistic success before committed response. UI disabled states and response IDs prevent repeated handoff.
- [ ] 5. Support keyboard/focus, screen-reader status, mobile viewport/virtual keyboard and long Vietnamese names. Keep scroll and chat usable.
- [ ] 6. After handoff open existing cart/order UI; allow normal edits without AI auto-checkout. Retain existing reservation cards.

## Exit criteria

Desktop/mobile flows A09-A13 work. Mini draft shows only accepted items, and keyboard users can review/edit/handoff.

## Verification

New draft component unit tests; existing concierge-ui/actions/cart-drawer tests; typecheck; lint; build. Browser coverage completed in V17.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Hide draft UI/CTA behind V2 flag; keep existing manual ordering.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
