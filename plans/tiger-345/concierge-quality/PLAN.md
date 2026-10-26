# Concierge quality improvement plan

Date: 2026-09-25. Status: PROPOSED; no implementation, paid evaluation, provider change, or production rollout is authorized by this document.

## Objective and boundaries

Improve factual accuracy and Vietnamese multi-turn task completion without rebuilding the existing V2 session, tool, draft, memory, or safety contracts. Work against the current PostgreSQL-backed session runtime. Defer Redis, new vector databases, new caches, and model comparisons until measurements justify them. Do not enable fallback answers when a real provider fails.

The existing [V2 verification matrix](../concierge-v2/verification-matrix.md) establishes deterministic safety regressions, not production-model quality. The existing [paid provider evaluation](../concierge-v2/live-evaluation.md) is specified but not run; keep it separately authorized and out of default CI. No task below may reset an unverified database or send model requests without explicit opt-in.

## Authority map (freeze before implementation)

| Fact or action | Authoritative source | On missing or conflicting evidence |
| --- | --- | --- |
| Menu identity, current price, availability, mode | Published `menu_items`; revalidate before draft handoff | No claimed price/availability; ask or show current catalog only |
| Ingredients and allergen safety | Item descriptions for *stated ingredients*; kitchen-audited allergen evidence for safety | Do not claim safe; direct to staff; preserve hard allergy exclusion |
| Delivery fee and total | Existing address/zone quote and order flows | Ask for delivery context; never infer a fee from policy documents |
| Opening hours and closures | Admin-maintained operational hours and closures, subject to an explicit source-of-truth review | Do not rely on an older static FAQ if operational data disagree |
| Reservation availability | Live availability check for date, time and party size | No availability guarantee and no claim of a completed booking |
| Order status and saved address | Authenticated, owner-scoped database reads | Require authentication; never reuse another actor's state |
| General policies and restaurant information | Published, effective knowledge documents | State that the policy cannot be verified; never use RAG as a transactional quote |

The model may classify ambiguous phrasing and write conversational text. It may not be the source of prices, inventory, safety, fees, status, or state mutations. A correct tool *route* is not sufficient if its result is empty or stale.

## Work packages and dependencies

### Q0 — Reproducible offline quality baseline (first)

- Add versioned, synthetic case fixtures under `tests/fixtures/concierge-quality/` and a deterministic runner under `tests/server/`; use `tests/integration/` only when a real, guard-verified isolated database is required. Reuse existing fake provider and real handler/session-store fixtures. Do not add paid model calls to CI.
- Start with 80–120 hand-reviewed turns grouped by menu/price/availability, unaccented Vietnamese, policy/hours, diet/allergy, budget/planning, reservation, auth/order, ambiguity and multi-turn corrections; include at least 15–20 multi-turn conversations. Expand toward 200–500 **after** baseline failure analysis rather than generating hundreds of weak labels.
- Each case records `id`, slice, synthetic actor, frozen clock, fixture/snapshot version, turns, expected route/tool and source, expected state delta/cards, prohibited claims, severity and optional acceptable clarification. Compare structured outcomes; do not require identical prose. Keep a separate holdout set for later changes.
- Report by slice: route/tool accuracy, entity and slot extraction, factual claims with/without evidence, state/draft accuracy, safety violations, clarification rate, and p50/p95 offline latency. Capture no real customer transcript, capabilities, API keys or raw production data.
- Seed mandatory RED cases: empty menu result followed by model saying pizza is available; bare numeric invented price (`189000`); `may gio dong cua`; `4 người 800k`; `budget còn 700k`; `bỏ tôm đi` after a named dish; changed hours in operations versus published FAQ.
- Exit: deterministic baseline report and reproducible failure IDs exist; critical failures are marked RED, not silently scored as successes. Fix the grading rubric and fixture versions before changing orchestration.

### Q1 — Factual response gate (depends on Q0)

- Replace the assumption that a nonempty serialized tool result is evidence. Represent supported claims using typed facts plus provenance (`source`, `entity_id`, current version/time, value); never treat `{ candidates: [] }` as proof that an item exists.
- For price/availability/safety/fee/status, prefer server-built cards or server-owned statements. A model's unsupported factual prose cannot override a deterministic no-result, unavailable, or authentication-required response. Preserve safe conversational text and clear clarification paths.
- Add regression cases around `orchestrator.ts` final-response override and `response-guard.ts`, including no currency suffix, paraphrased availability, stale values and empty/failed tools. Keep existing price-change, allergy, no-unauthorized-mutation and handoff tests green.
- Exit: zero unsupported critical claims in the pinned set, including adversarial fake-provider output; missing evidence produces clarification or safe inability, never fabricated facts. No new DB migrations or broad provider changes.

### Q2 — Source-of-truth routes (depends on Q1)

- Audit each FAQ/tool route against the authority map. Separate general policy from dynamic opening hours/closures and delivery *quotes*. Keep published knowledge documents for stable policy; resolve dynamic facts from operational data with an explicit timestamp/context.
- Require current catalog reads for menu facts, live availability for reservation checks, and auth-scoped order reads. Revalidate anything that can change between recommendation and handoff. Never equate a reservation check with booking or a draft with an order.
- Test conflicting sources, unavailable DB, missing address/date/time, guest actor, and changed catalog/closure. Preserve existing service links and safe failures when a source cannot be reached.
- Exit: all critical dynamic claims have exactly one documented authority and a failing-source test; no FAQ document can silently supersede a newer operational fact.

### Q3 — Vietnamese router and typed slots (depends on Q0 and Q1; may follow Q2)

- Extend `turn-intent.ts` and `turn-constraints.ts` for accent/no-accent variants, shorthand budgets (`4 người 800k`), budget revisions (`còn 700k`), combined requests and FAQ/food collisions. Keep intent and slot extraction separate, and normalize without discarding negation, dates or currency units.
- Maintain current deterministic draft acceptance and explicit user confirmation. Use a schema-validated model parser **only for residual ambiguity** if measured heuristic coverage is insufficient; canonical server state wins over model-supplied prices and mutations. Treat newly mentioned allergies conservatively with explicit source spans; never let a model silently remove an existing allergy. Unknown/low-confidence references request clarification.
- Add multi-turn cases for group size, budget revision, protein replacement, `bỏ món đó`, FAQ detour and return. Check final canonical constraints as well as selected tools and cards, not just prose.
- Exit: predefined router/slot failure cases pass without regression in guest/auth and no-spice/allergy paths; ambiguous commands never mutate a draft.

### Q4 — Context and planner refinement (depends on Q3; conditional on Q0 results)

- Retain existing constraints/draft/pending items and bounded recent-turn history; test identity of referenced items and corrections across summary/expiry/FAQ detours. Change `session-summary.ts` only for reproducible state-loss failures; never persist guest transcripts or weaken CAS/idempotency.
- Measure `meal-planner.ts` against budget, portion confidence, preferences, diversity and no-verified-serving-profile slices. If greedy selection causes reproducible misses, improve bounded deterministic search over *eligible verified* candidates; preserve existing safety and hard-budget filters.
- Exit: all curated multi-turn state transitions and critical planner constraints pass; suggestions remain distinct from accepted draft lines; no successful order/booking claims or hidden cart mutations.

### Q5 — Knowledge retrieval tuning (depends on Q0 and Q2; conditional)

- Fix measured normalization/recall gaps (including unaccented Vietnamese) before adding a vector database. Evaluate published/effective/version metadata and authority conflicts; add `locale` only if multilingual content actually requires it.
- For each FAQ case assert the retrieved document/reference and whether its content supports the final answer. No retrieval result means no policy assertion. Keep transactional data out of knowledge content used as authority.
- Exit: measured FAQ recall and unsupported-policy claims improve on the fixed holdout without regressions in prompt-injection and lifecycle tests.

### Q6 — Provider and staged acceptance (after Q1–Q5, explicit opt-in)

- Reuse `../concierge-v2/live-evaluation.md`: synthetic staging catalog, capped budget approved separately, configured provider/model/version, per-case usage and latency, no production raw-chat telemetry. Live evaluation must test positive cart/order transitions with owned real-service fixtures where appropriate.
- Compare baseline and candidate by slice, including fact errors, clarification burden, task success, model latency and cost; get human review for a small Vietnamese sample and all disputed critical cases. Use server-controlled rollout/kill switches and preserve manual menu/cart paths.
- Exit: zero critical safety/privacy/unauthorized-write failures in staged acceptance, reviewed task-quality targets, documented operational owner and rollback. No automatic production enablement from passing offline tests alone.

## Delivery order and gates

1. **Wave A (must do):** Q0 → Q1 → Q2. Treat factual guard and dynamic authority conflicts as release blockers.
2. **Wave B (measured improvements):** Q3 → Q4; Q5 can follow Q2 alongside Q3 if writes to `orchestrator.ts` are serialized.
3. **Wave C (approval gate):** Q6 only after Wave A/B acceptance and explicit cost/deployment approval. Redis/vector DB are out of scope unless evidence changes the decision.

Rough sizing for one engineer, subject to Q0 baseline: Q0 1–2 days; Q1 1–2; Q2 1–2; Q3 2–3; Q4 1–2 if needed; Q5 1–2 if needed; Q6 1 day plus approval and review time. This is a review estimate, not a release date or a claim that provider connectivity already works.

Every code package should fit one reviewable change and carry before/after fixture IDs, test commands/results, new risks and rollback notes. Run focused `npm run test:server -- <file>` first; then `npm run typecheck:server`, `npm run lint`, and relevant `npm run test:integration` only with the isolation guard. Cross-boundary work also runs `npm run typecheck`, `npm run check:architecture`, affected unit/browser tests and `npm run build`. Run `npm run test:architecture` only if architecture rules change. Do not run paid provider evaluations, production cleanup or a DB reset as part of routine quality validation.

## Open decisions before Q1/Q2

- Confirm which operations table/API owns public opening hours and exceptional closures, and what to say when it conflicts with published FAQ text.
- Approve the critical-error rubric and holdout ownership after Q0's baseline; proposed zero-tolerance categories are invented price/availability, unsafe allergy claim, cross-user read and unauthorized mutation.
- Choose whether adding a model-based ambiguity parser is worth latency/cost **after** Q3 heuristic results; it is not a prerequisite.
- Approve provider budget and staging catalog separately before any paid or external run.
