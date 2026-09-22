# V09 - Context builder and rolling session summary

Status: TODO
Dependencies: V03, V06, V07, V08
Deliverable: implementation + applicable tests + ../reports/V09.md

## Cold-start context

Real adapters currently discard structured context and duplicate the current user message. One bounded context builder must serve all providers.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

llm.ts adapters; V02 session contract; V06/V07 facts; V08 candidate result contract.

## Ownership

context.ts, session-summary.ts, token accounting and test fixtures. Provider wire-format integration belongs to V10.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Assemble business policy, applicable memory, session summary, recent messages, draft, relevant tool schemas and candidates with explicit provenance.
- [ ] 2. Include current user message exactly once. Preserve verified auth identity outside model payload.
- [ ] 3. Implement per-request and per-turn input budgets including tool schemas/results. Use tokenizer/provider-aware estimates and conservative fallback.
- [ ] 4. Trigger bounded summary around 10 turns or 2500 recent tokens; retain 4-8 messages. Summary preserves constraints, pending questions and references, not fabricated acceptance.
- [ ] 5. Use deterministic structured summary where possible; bounded cheap model optionally. Summary failure keeps safety-critical state and trims optional data.
- [ ] 6. Prevent summary and retrieved text from becoming instructions or durable facts. Resolve conflict with canonical constraints/draft, and record truncation metrics without text.

## Exit criteria

A 50-turn fixture fits configured caps and retains active allergies/budget/draft. Identical context semantics across providers. No duplicate current message.

## Verification

New tests/server/concierge-context-budget.test.ts and concierge-session-summary.test.ts; typecheck:server; lint. No paid calls.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Disable optional model summaries; deterministic constraints and strict history caps remain. Never restore unbounded prompts.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
