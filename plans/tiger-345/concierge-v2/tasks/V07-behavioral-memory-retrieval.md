# V07 - Behavioral aggregates and selective retrieval

Status: TODO
Dependencies: V05
Deliverable: implementation + applicable tests + ../reports/V07.md

## Cold-start context

Current customer context fetches favorites and five recent orders, but does not provide compact food-flow defaults with source precedence.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

V01 order status/refund decision; toolGetCustomerContext; orders/order_items schema; V05 repository.

## Ownership

behavioral-memory.ts, memory-retrieval.ts and related queries/tests. No llm.ts/runtime.ts integration yet.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Aggregate eligible completed orders from the last 90 days by item/category; distinguish frequency per order from quantity.
- [ ] 2. Exclude cancelled and ineligible refunded/test data using V01 rules. Do not infer party size, allergies or dietary restrictions from weak behavior.
- [ ] 3. Bound queries and results, add appropriate indexes if evidence requires them, and use a refresh schedule/invalidations suitable for one restaurant.
- [ ] 4. Retrieve facts only for relevant food/draft intents; no personal lookup for parking/hours. Dietary constraints outrank inferred favorites; current explicit constraints outrank defaults.
- [ ] 5. Produce source-tagged compact facts within 200-400 tokens and 12 facts. Never include address/phone/order transcript in model memory.
- [ ] 6. Honor consent/epoch/deletion and expiry; allow serving without personalization during repository failures.

## Exit criteria

FAQ flow performs zero personal-memory fetches. Food flow includes applicable safety constraints and bounded favorites. Explicit dislike defeats behavioral favorite.

## Verification

New tests/server/concierge-memory-retrieval.test.ts and tests/integration/concierge-behavioral-memory.test.ts; typecheck:server; lint.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Disable personalization reads/refresh; generic recommendations remain available.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
