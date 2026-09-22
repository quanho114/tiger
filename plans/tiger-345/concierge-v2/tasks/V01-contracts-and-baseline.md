# V01 - Contract freeze and regression baseline

Status: DONE
Dependencies: None
Deliverable: implementation + applicable tests + ../reports/V01.md

## Cold-start context

The existing concierge combines PostgreSQL conversations, proposal cards, orders and reservations. Freeze V2 boundaries before introducing independent implementations.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

src/features/concierge/{api,types,useConcierge}.ts; supabase/functions/_shared/concierge/{types,runtime,llm,persistence,state-machine}.ts; public-api/index.ts; existing concierge-delivery contracts.

## Ownership

Architecture docs and shared contract definitions only; coordinate any schema stubs. No production migration or broad runtime rewrite.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Map current endpoints, SSE behavior, cart merging, auth changes, reservation subflow and all conversation/proposal/event writers.
- [ ] 2. Publish versioned request/response, SessionStore, memory repository, tool result, draft operation, handoff and error contracts. Specify request IDs, ownership and CAS conflicts.
- [ ] 3. Select Redis-compatible production/local adapter and reliable bounded extraction execution. Document credentials/config names without values, resource limits and failure behavior.
- [ ] 4. Resolve draft export semantics: default one export per reviewed version; post-export edits require an explicit new-set operation, never silently repeat old quantities. Define normal-cart coexistence.
- [ ] 5. Define completed/refunded order eligibility and whether party-size data exists. Define memory consent, correction/deletion epochs, trace retention and provider token accounting.
- [ ] 6. Capture baseline targeted tests and add a regression checklist for all review findings. Register feature flags and compatibility/sunset rules.

## Exit criteria

Contracts contain examples for success, expiry, conflict, ambiguous acceptance, allergy unknown, price changed and repeated handoff. No unresolved decision needed by V02/V05/V08 remains.

## Verification

Existing concierge server suites; typecheck:server and typecheck if schemas change. Documentation-only changes require link/contract consistency review, not a full build.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Revert planning/schema scaffolding before consumers adopt it; no business data changes.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
