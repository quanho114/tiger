# V10 - Grounded tool loop and provider adapters

Status: TODO
Dependencies: V09
Deliverable: implementation + applicable tests + ../reports/V10.md

## Cold-start context

Today model text may bypass tools or describe a result before execution. All production adapters must use the same policy and actual tool results.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

Existing orchestration tests; V01 schemas; V09 context builder; V08 safety results; reservation tool handlers.

## Ownership

orchestrator.ts, tool-registry.ts, llm.ts, runtime.ts tool dispatch and flags/config. One integration owner.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Implement strict typed tool registry, authorization/read-mutation policy, schema validation, timeout and total-turn budgets.
- [ ] 2. Wire OpenAI/Anthropic/Gemini to shared context. Feed actual tool results back before generating descriptive prose; preserve correct provider call/result IDs.
- [ ] 3. Enforce grounding for factual intents even when model returns zero tools. A safe cannot-verify response is valid; unchecked factual prose is not.
- [ ] 4. Separate grounded structured numeric/safety fields from optional natural phrasing. Reject contradictory or unsupported operational claims via explicit contract/templates.
- [ ] 5. Merge validated preferences/dislikes as well as adults/budget/allergies; distinguish unset from default 2 adults and ask limited clarifications.
- [ ] 6. Bound loop to 3 calls/6 tools, serialize dependencies, disable silent success-like stub fallback in production and provide transparent safe degradation.
- [ ] 7. Maintain reservation state/confirmation barriers, including FAQ interruptions. Do not expose create-order/checkout/confirmation tools.

## Exit criteria

A fake model claiming wrong price, allergy safety or successful order without tools cannot surface that claim as verified. Provider request tests show structured context and real results.

## Verification

Existing orchestration/regression/reservation suites; new tests/server/concierge-grounding.test.ts with fetch-captured provider fixtures; typecheck:server; lint.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Disable AI generation and serve safe deterministic cards/manual navigation. Do not fall back to ungrounded prose.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
