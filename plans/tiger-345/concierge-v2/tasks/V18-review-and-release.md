# V18 - Independent review and release readiness

Status: DONE (local independent model review; external gates listed in report)
Dependencies: V17
Deliverable: implementation + applicable tests + ../reports/V18.md

## Cold-start context

Final gate assesses the assembled behavior, actual evidence and safe rollout, not only individual task completion.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

All task reports; V17 evidence; contracts; migrations; actual diff; existing business safety invariants.

## Ownership

Independent review report, requirement traceability, rollout/rollback runbook and final readiness status. No automatic deployment.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [x] 1. Review auth/ownership, safety grounding, session privacy, memory correction/deletion, tool limits, acceptance and idempotent handoff adversarially.
- [x] 2. Trace every acceptance case to code and executed tests; inspect real DB/store/browser evidence rather than test counts alone.
- [x] 3. Check shared-file integration, migration ordering, feature flags and legacy client compatibility. Close P1/security/privacy/data-loss findings.
- [x] 4. Verify legacy guest-data cleanup dry-run plan is concrete and separated from deployment approval; do not execute deletion.
- [x] 5. Produce offline readiness, live-model readiness and production rollout readiness as separate statuses. Clearly list external blockers.
- [x] 6. Provide a staged release checklist, monitoring thresholds and exact kill-switch steps. Paid eval/deployment needs its own authorization.

## Exit criteria

Reviewer has no unresolved release-blocking findings; acceptance traceability and rollback are complete. Missing live evidence is visible, never labeled passed.

## Verification

Review changed code and V17 evidence; rerun only checks affected by fixes. Verify documentation links and plan/task status consistency.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. User explicitly authorized model connectivity/source-review calls; full product-quality evaluation remains separate.

## Rollback

Keep feature off or disable it; retain manual ordering. No destructive schema rollback.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
