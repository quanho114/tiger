# V08 - Verified menu and food-safety retrieval

Status: TODO
Dependencies: V01
Deliverable: implementation + applicable tests + ../reports/V08.md

## Cold-start context

Current recommendation safety exists, but model-facing search must use bounded live candidates and explicit unknown food knowledge.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

tools.ts, knowledge.ts, recommendation.ts, validator.ts; admin concierge knowledge handlers; menu and knowledge schema.

## Ownership

menu-retrieval.ts, food-safety.ts, focused tools/knowledge/validator changes and separate additive catalog migration if needed.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Inventory actual category, ingredient, spice, allergen, cross-contact, kitchen verification and ordering-mode fields. Do not invent safe values for missing fields.
- [ ] 2. Reuse or extend the existing admin knowledge source with verified_at/source metadata and invalidate caches when updated.
- [ ] 3. Filter available/mode/budget/hard constraints first, rank next, return 5-8 compact candidates with stable IDs, current prices and provenance.
- [ ] 4. Return explicit unknown/unverified/conflict safety states. Allergy-related recommendation blocks unsafe or unverified claims and suggests staff confirmation.
- [ ] 5. Keep price/availability authoritative and shared with existing quote/cart validation. Do not add a parallel pricing engine.
- [ ] 6. Test empty catalog, unknown allergy data, changed prices, unavailable items and malicious menu descriptions.

## Exit criteria

No menu dump into model payload. Unknown ingredients cannot yield an allergy-safe label. Candidate IDs/prices match current catalog.

## Verification

Existing recommendation-safety server suite; new menu retrieval tests and real DB query integration tests; typecheck:server; lint.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Disable enhanced retrieval and fail safely on uncertain food facts. Keep manual menu browsing.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
