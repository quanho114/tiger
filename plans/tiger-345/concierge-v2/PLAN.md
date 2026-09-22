# Execution Roadmap

All tasks start TODO. Each task should fit one reviewable PR; split oversized tasks with explicit dependency updates before coding. Task IDs are stable. Task files are the handoff briefs.

| ID | Task | Depends on | Owner responsibility | Status |
| --- | --- | --- | --- | --- |
| [V01](tasks/V01-contracts-and-baseline.md) | Contract freeze and baseline | None | Architecture/integration | DONE |
| [V02](tasks/V02-ephemeral-session-store.md) | Shared TTL session store | [V01](tasks/V01-contracts-and-baseline.md) | Session backend | TODO |
| [V03](tasks/V03-session-runtime-and-retention.md) | Runtime session migration and retention repair | [V02](tasks/V02-ephemeral-session-store.md) | Integration/persistence | TODO |
| [V04](tasks/V04-frontend-session-lifecycle.md) | Frontend session lifecycle | [V03](tasks/V03-session-runtime-and-retention.md) | Chat frontend | TODO |
| [V05](tasks/V05-memory-schema-and-repository.md) | Memory schema, settings and repository | [V01](tasks/V01-contracts-and-baseline.md) | Memory data | TODO |
| [V06](tasks/V06-explicit-memory-extractor.md) | Explicit fact extraction | [V05](tasks/V05-memory-schema-and-repository.md) | Memory admission | TODO |
| [V07](tasks/V07-behavioral-memory-retrieval.md) | Behavioral aggregation and retrieval | [V05](tasks/V05-memory-schema-and-repository.md) | Memory retrieval | TODO |
| [V08](tasks/V08-menu-and-food-safety.md) | Verified menu and food-safety retrieval | [V01](tasks/V01-contracts-and-baseline.md) | Catalog backend | TODO |
| [V09](tasks/V09-context-and-summary.md) | Context builder and rolling summary | V03, V06, V07, V08 | Context backend | TODO |
| [V10](tasks/V10-grounded-orchestration.md) | Grounded tool orchestration and adapters | [V09](tasks/V09-context-and-summary.md) | Orchestration/integration | TODO |
| [V11](tasks/V11-draft-domain.md) | Draft domain and atomic operations | V02, V08 | Draft backend | TODO |
| [V12](tasks/V12-acceptance-and-draft-workflow.md) | Acceptance intent and draft workflow | V10, V11 | Orchestration/integration | TODO |
| [V13](tasks/V13-cart-handoff.md) | Idempotent handoff to existing cart | [V12](tasks/V12-acceptance-and-draft-workflow.md) | Cart integration | TODO |
| [V14](tasks/V14-draft-ui.md) | Draft preview and review UI | V04, V13 | Chat/cart frontend | TODO |
| [V15](tasks/V15-memory-controls-and-deletion.md) | Customer memory controls and deletion | V06, V07 | Account/privacy | TODO |
| [V16](tasks/V16-observability-and-rollout.md) | Metrics, degradation and rollout controls | V03, V10, V13, V15 | Operations/integration | TODO |
| [V17](tasks/V17-verification-matrix.md) | Regression, integration and browser acceptance | V14, V15, V16 | Verification | TODO |
| [V18](tasks/V18-review-and-release.md) | Independent review and release runbook | [V17](tasks/V17-verification-matrix.md) | Reviewer/release | TODO |

## Recommended waves

1. V01 alone. Freeze contracts before splitting work.
2. V02, V05 and V08 may run in parallel, with distinct ownership and unique migrations.
3. After their dependencies: V03, V06, V07 and V11 may run in parallel. V06/V07 must not edit memory-repository.ts concurrently; repository interface is owned by V05 and subsequent shared changes serialize.
4. V04 and V09 may run in parallel. V15 may proceed after V06/V07, but account routes are edited by one owner.
5. V10 then V12 then V13 are serial integration tasks. Never have two agents edit runtime.ts/llm.ts concurrently.
6. V14 and V16 may run in parallel only if API/contract changes are frozen; V16 does not edit UI files.
7. V17 then V18 are release gates. No automatic production enablement.

Parallel work is optional, not an instruction to spawn agents. Default is one assigned task per agent turn. Use separate branches/worktrees when multiple agents implement concurrently; the integration owner merges dependencies and reruns affected checks. Do not cherry-pick or overwrite another agent's uncommitted work.

## Shared file ownership

- runtime.ts/public-api/index.ts: integration owner in V03 -> V10 -> V12 -> V13 -> V16 order.
- Shared DTO schemas/frontend types: V01 defines; every later change updates contract and consumers in the same task, serialized.
- useConcierge.ts/ConciergeChatView.tsx: V04 then V14; V13 supplies a handoff helper/contract, with minimal coordinated hook wiring.
- Memory repository/schema: V05; V06/V07 consume interfaces. V15 owns settings UI/customer endpoints and deletion integration.
- Catalog/knowledge schema: V08 only; keep its migration distinct from V05.
- Account deletion worker: V15; V16 does not alter deletion semantics.
- package.json/lockfile: explicit single owner per change. No broad dependency upgrades.
- Existing plans: link this extension rather than rewriting historical completion reports.

## Common verification contract

Every code task runs relevant existing and new suites plus applicable type checks and lint. Backend tasks: npm run typecheck:server. Frontend tasks: npm run typecheck and npm run build. Cross-boundary tasks run both. At V17 run the full offline matrix once, then repeat only affected checks after fixes.

Database tests use the repository test DB guard and isolated test data. Never reset an arbitrary database. Redis integration tests use an isolated key prefix and disposable instance; do not clear shared stores. New test filenames in task documents are deliverables, not claims they already exist.

Each task report lists commands/exit results, changed files, migration IDs, assumptions, API changes, tests not run and risk. External verification remains BLOCKED if credentials/infrastructure are unavailable. Unit mocks cannot waive infrastructure gates.

## Rollout and compatibility

1. Add V2 behind a server-controlled flag, default off while incomplete. UI and API negotiate one contract version.
2. Safety fixes that reject ungrounded facts can ship independently after review, without enabling memory or draft features.
3. Validate local real PostgreSQL + real TTL store + browser fixtures. Paid model evaluation is a separate opt-in gate.
4. Deploy schema additions before code that reads them. Keep sessions separated by contract version; do not upgrade guest sessions into permanent memory. At V2 activation, reject legacy guest chat/action/feedback writes or route them through the privacy-safe adapter. Old clients must receive a refresh-required response rather than keep writing transcripts. Audit alternate routes so version negotiation cannot bypass this boundary.
5. Enable V2 only after authenticated and guest paths pass. No shadow persistence of guest transcripts for comparison.
6. Execute any production legacy-data cleanup only as a separately authorized, concrete dry-run-reviewed operation. Revalidate actual deployed schema and FK dependencies first.
7. On failure, disable concierge V2 and retain manual menu/cart/checkout. Do not roll back to guest transcript persistence or a less safe allergy path. Roll back application code without dropping new tables or erasing orders.

## Plan changes

Record a dated decision for changed defaults/contracts. List affected tasks, acceptance cases and migration implications; update dependency edges before implementation continues. Do not mark a task DONE merely because its happy path works. Do not invent production evidence or mark unrun tests passed.

## Planning review status

2026-09-22: author checked dependencies, file ownership, task completeness and local Markdown links. An independent reviewer was requested through the Blueprint workflow but could not execute because the agent provider had no active credentials (HTTP 404). Independent review of this plan remains outstanding; it is not recorded as passed. Application checks were not rerun for this documentation-only change. V18 is the later implementation review gate, not evidence of a completed plan review.
