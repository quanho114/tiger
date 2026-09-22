# Tiger 345 Concierge V2 - Agent Execution Plan

Date: 2026-09-22. Status: PLANNED. No application implementation is authorized by this planning document alone.

Objective: a restaurant assistant with a fresh conversation on each new page lifecycle, ephemeral session state, compact authenticated-user memory, grounded recommendations, an editable AI draft, and explicit handoff to the existing cart.

## Start here

1. Read repository AGENTS.md, this file, REQUIREMENTS.md and the assigned task only.
2. Read current diffs for owned files and dependency reports. Existing unrelated edits are not yours to revert.
3. Execute one assigned task, with the relevant ECC skill. Do not automatically start successor tasks or spawn agents.
4. Shared runtime, contracts, migrations and routing edits are serialized by an integration owner.
5. Report actual checks and limitations using reports/TEMPLATE.md. A mock passing is not proof that PostgreSQL, Redis or a real model works.

This is a targeted extension to the existing implementation, not a replacement of orders, payments, authentication or reservations. Where older concierge plans conflict with this document on session persistence, memory, draft cart or checkout scope, this newer plan wins. Other existing business invariants remain applicable.

## Documents

| Document | Purpose |
| --- | --- |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Product decisions, storage boundaries, contracts and context budgets |
| [PLAN.md](PLAN.md) | Task graph, execution waves, file ownership and rollout |
| [ACCEPTANCE.md](ACCEPTANCE.md) | End-to-end scenarios and release gates |
| [V01 decisions](V01-decisions.md) | Frozen V2 contract and architecture decisions |
| [Task files](tasks/) | Cold-start briefs, subtasks, checks and exit criteria |
| [Report template](reports/TEMPLATE.md) | Evidence required after implementation |
| [V01 report](reports/V01.md) | Contract-freeze evidence and downstream handoff |

## Current evidence, not assumptions

- React useConcierge keeps chat in component state; no old chat hydration was found.
- Server persistence stores guest and authenticated conversation content and events in PostgreSQL.
- Guest cleanup refers to actor_scope on concierge_conversations, a column absent from the checked migrations.
- Real model adapters ignore structured context and slice recent history; the current user message is duplicated.
- Model prose can bypass tool grounding; returned prose may precede the tool result it describes.
- Proposal generation exists; an accumulating, individually editable draft does not.
- Customer favorites and order history exist; durable explicit preference extraction does not.
- Existing server checks from the review: 83 tests across five selected files passed. No live model or DB integration was verified in that review.

## Prompt to assign a task

```text
Implement task VXX from plans/tiger-345/concierge-v2/tasks/<filename>.md.
Read AGENTS.md, concierge-v2/README.md, REQUIREMENTS.md, and dependency reports.
Follow the task ownership boundary. You are not alone in this codebase:
preserve other changes, do not revert them, and coordinate shared-file edits.
Do not redesign contracts without documenting the impact on dependent tasks.
Run the required applicable checks and write reports/VXX.md using TEMPLATE.md.
State any missing infrastructure and unexecuted checks precisely.
Do not run paid live evaluations, deploy, or clean production data unless separately authorized.
Stop after this task and its report; do not implement its successors.
```

Task status: TODO / IN_PROGRESS / BLOCKED / DONE. DONE requires implementation, integration into the actual request path and passing applicable checks. Independent review and release readiness are separate gates. Every task below starts TODO.
