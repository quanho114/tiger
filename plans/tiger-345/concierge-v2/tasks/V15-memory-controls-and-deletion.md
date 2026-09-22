# V15 - Customer memory controls and deletion integration

Status: TODO
Dependencies: V06, V07
Deliverable: implementation + applicable tests + ../reports/V15.md

## Cold-start context

Remembering customers must be inspectable and reversible. Account deletion and delayed extraction must not recreate memory.

Read repository AGENTS.md, ../README.md, ../REQUIREMENTS.md, ../ACCEPTANCE.md and dependency reports first. This task is not authorized for execution merely because the plan exists.

## Read next

customer-api handlers; account routes/layout; V05 settings and epoch repository; existing deletion jobs and auth gates.

## Ownership

Customer memory endpoints/UI, account deletion worker integration and privacy tests. Coordinate unrelated existing account edits.

You are not alone in the codebase. Preserve edits by the user and other agents, never revert them, and coordinate shared files through the integration owner. Do not start successor tasks.

## Subtasks

- [ ] 1. Expose authenticated whitelisted settings/fact APIs and customer UI to enable, inspect, correct, delete individual facts and forget all.
- [ ] 2. Explain that new chats are fresh and memory contains food preferences only. Distinguish explicit versus behavioral facts in inspect UI.
- [ ] 3. Disable memory with explicit clear behavior; preserve normal chat ordering. Opt-in/opt-out state must match server truth.
- [ ] 4. Wire account deletion/deleting tombstone checks into reads, extraction jobs, behavioral refresh and epoch fencing.
- [ ] 5. Implement per-fact suppression so manually deleted behavioral facts are not automatically rebuilt until explicitly restored. Forget-all pauses regeneration until the customer explicitly enables learning again; honor this across both extraction and aggregation.
- [ ] 6. Test direct API cross-user attacks, concurrent correction/extraction, deleting accounts and worker retries without deleting financial records.

## Exit criteria

Users can control actual server facts. A stale extraction/aggregation job cannot recreate deleted data. Business order history retains existing deletion guarantees.

## Verification

New memory settings unit tests; real memory RLS/privacy/deletion integration tests; both typechecks; lint; build.

Use existing npm scripts with the correct config and path. New test files named above are expected deliverables; do not claim they exist until created. Missing local infrastructure is a reported blocker for that check, not a mock success. No paid live model calls.

## Rollback

Disable personalization globally if controls fail; retain deletion protections and manual ordering.

## Report

Use ../reports/TEMPLATE.md. Include actual file changes, contracts, commands/exit codes, acceptance IDs, unrun checks and downstream notes. Update task status and roadmap status record.
