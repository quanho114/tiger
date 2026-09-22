# V06 - Durable explicit fact extraction

Status: TODO
Dependencies: V05
Deliverable: implementation + applicable tests + ../reports/V06.md

## Cold-start context

Only authenticated, opted-in user statements can create explicit long-term facts. Session constraints continue to work without persistence.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

V01 extraction execution decision; V05 epoch API; redact.ts; existing provider config helpers.

## Ownership

memory-extractor.ts, bounded extraction execution adapter and tests. Consume V05 repository without concurrent edits.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Implement strict structured extraction for food preferences, dislikes and dietary constraints, with schema validation and fact/token caps.
- [ ] 2. Reject temporary statements such as today/eating with a friend, hypothetical/quoted text, negations and assistant claims. Resolve corrections without accumulating contradictions.
- [ ] 3. Require opt-in/auth before extraction persistence. Explicit allergy text creates a food constraint only, not medical inference.
- [ ] 4. Use cheap configured model only when deterministic extraction is insufficient; bound timeout/cost and expose failure status. Main chat remains useful when extraction fails.
- [ ] 5. Use selected reliable bounded execution mechanism. If queued, encrypt/protect short-lived payloads, enforce TTL and no logs; if synchronous, bound latency. No unawaited Edge fire-and-forget.
- [ ] 6. Check account/consent/epoch again at commit. Suppress duplicates and replayed requests. Never extract durable facts from rolling summaries.

## Exit criteria

A durable statement is remembered only with enabled memory. Temporary/ambiguous text is excluded. Forget/disable while extraction runs defeats the later write.

## Verification

New tests/server/concierge-memory-extractor.test.ts and epoch-race integration cases; typecheck:server; lint. Providers mocked for offline tests.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Disable extraction; preserve existing facts and session constraints. Do not rerun old payloads after epoch changes.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
