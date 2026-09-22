# Acceptance and Release Gates

All cases below are requirements, not completed test results. Agent reports must link evidence to IDs.

| ID | Scenario | Required result | Main owner / evidence |
| --- | --- | --- | --- |
| A01 | Guest chats and builds a draft | Zero new PostgreSQL conversation/proposal/raw-event/profile rows; no transcript logs | V03 real DB + log inspection |
| A02 | Close/reopen widget, internal route, reload, new tab | Same-page widget/navigation retains session; reload/new tab starts fresh | V04 browser |
| A03 | Login/logout/account switch during delayed response | Fresh session; no old transcript/draft/cart mutation applied | V04/V13 unit + browser |
| A04 | Idle 45 minutes, absolute 4 hours, expired read/write | Session/draft inaccessible; cannot revive via late write; meaningful UI recovery | V02 real store + injected clock + browser |
| A05 | User opted in: durable preference vs today-only request | Durable fact persists; temporary constraint stays session-only | V06 integration |
| A06 | Memory disabled, guest, other user's ID, deleting account | No unauthorized extraction/read/write; chat still works without personalization | V05/V06/V15 policy tests |
| A07 | User forgets/corrects fact while extractor/aggregator runs | Old epoch job cannot recreate/overwrite it; suppression semantics honored | V05/V15 real DB concurrency |
| A08 | Ask parking, then recommend dinner | Parking triggers no personal-memory read; dinner loads compact relevant constraints/favorites | V07/V10 request spies |
| A09 | Suggest beef, ambiguous approval, explicit acceptance | Only explicit or uniquely bound contextual acceptance adds; suggestions alone do not | V12 server + browser |
| A10 | Accept rice x2, add vegetables, change rice x3, remove vegetables | Canonical draft matches accepted operations and exact quantities; real cart untouched | V11/V12 integration |
| A11 | Say chot | Review card only; no cart/order/reservation/payment writes | V12/V14 browser + service spies |
| A12 | Handoff into nonempty cart; duplicate click/response/retry | Existing lines preserved; exactly one merge; correct notes/quantities | V13 browser + cart persistence tests |
| A13 | Price/availability/mode/allergy data changes before handoff | Fresh validation; changed price requires acceptance; blocked line not silently replaced | V08/V13 integration |
| A14 | Model returns invented price/allergy assurance or false action success | Ungrounded claim is blocked/replaced with safe response; no mutation without authority | V10 adversarial fake-provider tests |
| A15 | Chat 50 turns, earlier allergy/budget/accepted item | Context fits limits, current message once, mandatory constraints retained, summary not durable memory | V09 context snapshots/token checks |
| A16 | Large menu, sparse filters, unverified allergen data | At most bounded candidates; no full menu prompt; unknown safety stays unknown | V08/V10 payload tests |
| A17 | DB/store/model timeout, invalid tool JSON, loop budget exceeded | Safe error/degradation, no fake stub success, no partial unreported draft commit | V10/V16 fault injection |
| A18 | Concurrent turns/draft edits and response-loss retry | One CAS winner; deterministic conflict/idempotency handling; no duplicates | V02/V11 real store concurrency |
| A19 | Existing reservation interrupted by FAQ and continued | Pending fields survive storage; confirmation and transaction protections remain | V03/V10 existing integration regressions |
| A20 | Run cleanup on actual migrations and inspect auth deletion | No nonexistent-column SQL; no orders/reservations removed; memory cleanup fenced | V03/V15 real DB |
| A21 | Inspect storage/logs/traces/provider payloads and fake malicious content | No secrets/capabilities/PII dumps; retrieved instructions cannot override business rules | V09/V16 security tests |
| A22 | Mobile/desktop keyboard and screen-reader interaction | Draft editable, focus sensible, error/loading status announced, checkout remains user-driven | V14/V17 browser + accessibility review |

## Mandatory fixture conversations

Use real seeded menu IDs/prices rather than assuming the examples are production menu data.

1. Two diners, no spicy food, suggest beef -> accept beef -> rice two portions -> suggest vegetables -> contextual OK -> remove vegetable -> chot -> handoff -> manual cart edit.
2. Guest allergy declaration -> verified safe candidates or explicit unknown -> 12 unrelated turns -> recommend again -> allergy still enforced -> reload -> fresh session.
3. Opted-in customer says a durable dislike -> new session -> relevant retrieval -> today asks for a different dish -> durable preference is not overwritten by a temporary request.
4. Customer enables memory -> extraction starts -> disable/forget/account delete -> late job finishes -> no recreated data.
5. Existing cart has items -> draft handoff response delivered twice -> quantities correct -> subsequent edited draft cannot repeat the previous export silently.
6. Pending draft acceptance -> FAQ detour or two competing suggestions -> OK -> clarify if target is no longer uniquely identifiable.

## Live evaluation boundary

Offline tests validate contracts and deterministic behavior. They do not establish natural-language quality with a production model. Prepare live scenarios for Vietnamese accents/no accents, short references, corrections, allergy wording, prompt injection and multi-turn draft edits across supported configured providers. Record provider/model/version, cost ceiling, measured tokens/latency and scenario outcomes.

Do not run jev:eval, jev:eval:keyring or any paid model evaluation without explicit user opt-in. Existing Jev sandbox mutations return 403, so it cannot prove successful draft/cart business writes by itself; use owned browser fixtures/real local services for those cases, respecting isolation rules. No live eval is added to CI/default tests.

## Release evidence

- Code gate: relevant tests, frontend/server typechecks, lint and build pass.
- Infrastructure gate: real isolated PostgreSQL migrations/RLS/retention and real shared store TTL/CAS tests pass.
- Product gate: browser scenarios and acceptance matrix pass on desktop/mobile.
- Review gate: independent reviewer resolves P1, privacy, auth, safety and duplicate-mutation findings.
- Model gate: if live eval is not authorized/run, explicitly mark real-provider quality UNVERIFIED; do not present full production readiness.
- Operations gate: feature flags, content-free metrics, credentials/config readiness, failure behavior and rollback runbook reviewed. Legacy production cleanup/deployment separately authorized.

## Measurement targets

Report actual values, not invented guarantees: request/turn token distributions, p50/p95 latency, tool round count, draft acceptance accuracy, false-mutation count, duplicate handoff count, safety-grounding violations and session retention compliance.

Hard correctness targets: zero unauthorized cross-user access, zero guest permanent transcript writes, zero unchecked allergy-safe claims, zero duplicate handoff additions in the retry matrix, zero auto-checkout from chat. Latency and cost release thresholds are finalized in V01 based on actual deployment/provider constraints and evaluated in V17/V18.
