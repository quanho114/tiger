# Jev integration — verification evidence

## Delivered scope

- Explicit opt-in Jev runner for a synthetic read-only menu scenario, owned Vite/Chrome/harness, configuration preflight, bounded execution and sanitized reports.
- Concierge uses its existing typed action gateway, not browser control in customer sessions. Confirmation promises/outcomes, historical-card retirement, reset/auth concurrency and cart price-change recovery are covered.
- No database reset, real order/reservation, payment, deployment or commit performed.

## TDD evidence

| Guarantee | RED evidence | GREEN evidence |
|---|---|---|
| Confirmation remains pending, failure is visible, no render-time confirmation, exact payloads | `npx vitest run tests/unit/concierge-actions.test.tsx`: 4 failed, 1 passed before implementation | Action + existing UI suites: 15 passed |
| Reset blocks concurrent submissions; old identity/reset cannot corrupt a new conversation; cart price errors reach acceptance UI | `npx vitest run tests/unit/concierge-hook.test.tsx`: 3 regression cases failed before implementation | Hook + action + existing UI suites: 20 passed |
| Runner rejects unsupported args, scrubs child env, does not trust DONE, denies fixture mutations | Initial node test failed because safety module was absent | Offline runner tests and actual Chrome fixture smoke passed; see current command below |

Commands verified during implementation:

- `npm run test:unit`: **107 passed, 15 files** after race fixes.
- `npm run build`: passed after race fixes.
- `npm run typecheck`: passed.
- Scoped Oxlint on changed Concierge code/tests: passed.
- `git diff --check`: passed.
- `JEV_OFFLINE_CHROME=/usr/bin/google-chrome npm run test:jev`: **10 passed, 0 skipped**, including real Chrome fixture smoke, CDP-context HTTP/WebSocket/service-worker isolation and bounded cleanup with a TERM-resistant child.
- `npm run jev:check`: **BLOCKED / SETUP_REQUIRED**, missing process-environment `TYPESAFE_API_KEY` and `TEXT_MODEL_API_KEY`; `executed:false`. No credential files inspected.

## Independent review

Read-only reviewers identified reset/auth races and swallowed price-change errors; fixes and regression tests were added. Follow-up Concierge review found no new concrete defect. Runner review identified unbounded CDP cleanup and HTTP-only network interception; both were addressed with bounded cleanup and a dedicated guarded browser context. The final 10-test runner suite verifies these fixes.

## Existing backend failures, not changed here

`npm run test:server`: 152 passed, 2 failed at baseline:

1. `tests/server/concierge-eval.test.ts`: expired delivery-quote fixture expects QUOTE_EXPIRED but recipient validation produces VALIDATION_ERROR first.
2. `tests/server/concierge-reservation-ui.test.ts`: replay fixture omits matching action/hold identity and reaches missing database-service guard.

These failures remain open. No claim that the entire repository is green.

## Limits

No paid Jev live evaluation was performed. Chrome smoke uses deterministic test actions and is not evidence of model success. Concierge recommendations/chat are not implemented as Jev sandbox scenarios. Production model quality, real DB transactions and aggregate code coverage were not measured. Existing card tests emit non-failing React act warnings. The integration does not guarantee unattended operation without valid provider credentials.

## Self-evaluation

| Axis | Score | Evidence / next improvement |
|---|---:|---|
| Accuracy | 4/5 | Tested outputs and BLOCKED status reported separately; paid orchestration remains unverified. |
| Completeness | 3/5 | Menu automation and Concierge safety shipped; full synthetic-customer chat/eval scenario still missing. Add fixture/state contracts and verified answer extraction next. |
| Clarity | 4/5 | Commands and boundaries documented; setup still requires provider configuration. |
| Actionability | 3/5 | One-command runner exists but cannot execute live until process credentials are provisioned securely. |
| Conciseness | 4/5 | Short command surface; supporting implementation/review evidence retained here rather than repeated in final message. |

Overall: 3.6/5. Highest-impact follow-ups: secure one-time provider provisioning, an authorized live menu run, then isolated Concierge multi-turn evaluation. This is a useful first integration, not complete autonomous operation of every Tiger workflow.
