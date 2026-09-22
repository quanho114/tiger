# V16 - Content-free observability and safe rollout

Status: TODO
Dependencies: V03, V10, V13, V15
Deliverable: implementation + applicable tests + ../reports/V16.md

## Cold-start context

Operation should reveal cost, errors and conversion without building a second guest transcript store in logs or tracing.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

Existing flags.ts/llm-config.ts/rate limits; V01 budgets; V03 cleanup; V10 degradation; deployment config.

## Ownership

Concierge metrics/flags/config, health probes, retention scheduling/runbook and integration error handling. No UI redesign.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Record per-turn latency, tokens including follow-ups, tool counts, summary use, safety blocks, CAS conflicts, draft/handoff success and reason codes.
- [ ] 2. No raw user messages, extracted values, addresses, prompts, tool payloads, API keys or session bearer tokens in logs/errors/provider failure bodies.
- [ ] 3. Add bounded rate/cost limits per actor/session/IP and caps on concurrent work. Scope circuit breakers appropriately for serverless execution.
- [ ] 4. Test Redis/DB/provider failures, missing keys, summary failures and budget exhaustion; manual menu/cart remains available with clear error state.
- [ ] 5. Implement versioned feature flags, TTL expiry/retention scheduled verification, content-free trace expiry and kill switch. No paid live eval in CI.
- [ ] 6. Document rollout prerequisites, credentials placement, migration order, legacy cleanup dry run and safe disable paths.

## Exit criteria

Injected failures never claim successful mutations or leak sensitive data. Metrics reflect actual calls, and V2 can be disabled without breaking ordering.

## Verification

New tests/server/concierge-observability.test.ts and failure-injection integration cases; typecheck:server; lint; inspect config defaults.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Use kill switch; disable memory extraction and AI tools, keep manual ordering and required cleanup protections.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
