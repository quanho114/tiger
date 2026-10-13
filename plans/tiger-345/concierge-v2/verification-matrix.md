# Executed acceptance evidence

2026-09-22. Paths below are repository-relative. PostgreSQL is the guard-verified
local Supabase instance. Redis tests use disposable Redis 7 via authenticated
HTTPS REST with certificate verification; these are not in-memory store mocks.
Browser V2 requests are forwarded into the actual public handler with real DB/store
and a deterministic fake model. Existing real E2E separately exercises Edge HTTP.
No production-model quality or hosted-infrastructure result is claimed.

| Case | Executed evidence | Result / boundary |
| --- | --- | --- |
| A01 | `tests/integration/concierge-v2-persistence.test.ts`: before/after SQL counts for guest and authenticated turns, feedback, provider failures | PASS: conversation/proposal/raw-event counts unchanged; disabled memory unchanged |
| A02 | `tests/integration/concierge-browser.test.ts`: both viewports, close/reopen, internal route, new tab, reload | PASS: same-page retention; new lifecycle starts empty |
| A03 | Same browser file: delayed replies across real login, account switch and logout; `tests/unit/concierge-hook.test.tsx` epoch guards | PASS: old messages/cards/cart changes not applied |
| A04 | `tests/integration/concierge-session-store.test.ts`: real TTL/CAS and injected clock; browser clock + pageshow | PASS: idle/absolute expiry, no late revival, recovery notice |
| A05 | `tests/integration/concierge-memory-extractor.test.ts` and memory retrieval suites | PASS: explicit opt-in facts versus temporary statements |
| A06 | `tests/policies/concierge-memory.test.ts`, memory integration and authenticated controls | PASS: guest/cross-user/deleting account restrictions |
| A07 | `tests/integration/concierge-memory.test.ts`, `concierge-memory-controls.test.ts`, extractor suites | PASS: old epochs rejected, suppression survives refresh, forget disables learning |
| A08 | `tests/server/concierge-memory-retrieval.test.ts`, real persistence FAQ/dinner paths | PASS: FAQ has no personal-memory retrieval; food intent uses bounded facts |
| A09 | `tests/server/concierge-draft-intent.test.ts`, `concierge-draft-workflow.test.ts`, browser select flow | PASS: suggestions/vague approval do not add; uniquely bound acceptance does |
| A10 | `tests/integration/concierge-draft-workflow.test.ts` | PASS: exact add x2, second item, first x3, remove second, FAQ, review |
| A11 | Browser review before handoff and persistence SQL counts | PASS: chot only reviews, no order/reservation or real-cart write |
| A12 | Browser handoff into nonempty cart with old notes; `tests/unit/concierge-handoff.test.tsx`; persistence replay/concurrency | PASS: exact merge and duplicate ID ignored; manual additions in same event preserved |
| A13 | Persistence price/unavailable/allergy/expiry tests, draft domain and grounding price-change-twice test | PASS: blocked lines retained, exact displayed price must be accepted; no unchecked handoff |
| A14 | `tests/server/concierge-grounding.test.ts` fake malicious prose and all three captured adapters | PASS: model price/safety/action claims never rendered as authority |
| A15 | `tests/server/concierge-context-budget.test.ts`, `concierge-session-summary.test.ts` | PASS: 50 turns, bounded context, current message once, canonical constraints retained |
| A16 | `tests/server/concierge-menu-retrieval-contract.test.ts`, real menu retrieval integration | PASS: bounded candidates, strict hard filters, unknown allergy evidence stays unknown |
| A17 | `tests/server/concierge-v2-failures.test.ts`, context budget tests, real persistence failure injection and `concierge-health.test.ts` | PASS: safe failure, no SQL fallback, shared circuit pause, no fake mutation success |
| A18 | Real session store CAS/replay tests, persistence concurrent handoff and SQL turn-lease tests | PASS: one winner; loser conflicts; repeated payload does not duplicate |
| A19 | Persistence pending-state round trip/FAQ; legacy reservation/workflow/transaction suites; reservation E2E | PASS: fields retained; V2 confirmation routed to explicit existing UI |
| A20 | `tests/integration/concierge-retention.test.ts`, memory deletion controls, existing account deletion/policy suites | PASS: real cleanup SQL, epoch fence, financial rows protected |
| A21 | Observability strict-schema tests, captured provider bodies, browser storage/URL scan and privacy failure injection | PASS: no capability in model payload/storage/log test outputs; untrusted prose cannot mutate |
| A22 | Draft component focus/quantity/price tests; desktop/mobile browser focus and keyboard handoff; semantic log/status/alert inspection | PASS for automated keyboard/accessibility-tree checks; human screen-reader speech, physical virtual keyboard and full WCAG audit NOT RUN |

## Limitations retained as release gates

- Human assistive-technology and physical-device validation remains unverified;
  automated accessibility semantics are not a WCAG certification.
- Natural-language coverage is a conservative deterministic Vietnamese parser;
  unmatched phrases clarify instead of guessing mutations. Live evaluation is required.
- Hosted Redis, vendor trace expiry, provider retention and production credentials
  are unverified. Daily CI configuration was added but remote CI was not run here.
- Independent reviewer sign-off is pending in V18. Passing local tests does not waive it.

## Observed failures closed

- Draft quantity overflow previously clamped; now rejects atomically.
- A second price change before acceptance previously risked accepting an unseen
  price; the displayed snapshot is checked again.
- Shared circuit pause could extend on rejected calls; paused updates now do nothing.
- Delayed identity-change replies, dropped storage writes and manual/cart handoff
  batching have explicit regression coverage.
- Legacy delivery fixtures closed at 21:30 wall time; transaction fixtures now
  declare all-day delivery and the HTTP smoke fixture restores its prior hours.
- One initial desktop admin-login run failed; focused and full real HTTP reruns
  passed. Its URL assertion now requires the dashboard, not `/admin/login`.
