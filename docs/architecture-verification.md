# Architecture refactor verification

This is a historical verification snapshot. The Redis session adapter and its
tests were later removed; current Concierge V2 sessions use PostgreSQL only.
The Jev integration was also removed; its results below are historical evidence,
not current test requirements or available commands.

## Scope

- Frontend ownership moved to `app`, `features`, and `shared`; imports and test
  mocks follow the new locations.
- Cart state, provider, persistence, and types have one feature owner.
- Checkout coordination, browser focus behavior, forms, quotes, and receipts
  are separate modules.
- Admin order list transport and request lifecycle are separate from rendering.
- Public and admin HTTP gateways dispatch to domain-specific route handlers.
- CI checks dependency boundaries and runtime import cycles.

The working tree already contained admin and concierge changes. Those changes
were preserved during the moves. Concierge action types and test setup were
aligned with the in-progress V2 session provider and abortable API calls.

## Follow-up Fixes

### Concierge action contract

The V2 contract now accepts explicit proposal selection and bounded guest/appetite
clarification. The frontend validates requests with the same shared schema as the
HTTP handler and preserves validated cart lines in completion responses.

Proposal selection reuses catalog, expiry, allergy and budget validation inside
the request-local runtime. Session ownership and version checks run first. Only
successful session CAS publishes a handoff; proposal IDs are consumed in session
state to reject a second addition. The browser deduplicates handoffs and retains
the request ID when retrying after a lost response. Feedback shares the same
in-flight guard as other session mutations. Price-change confirmation uses the
structured API error code rather than matching an error message.

Order creation, booking confirmation and reorder stay in their existing checkout,
reservation and account screens. V2 converts requests for these tools into
explicit navigation controls and never exposes unsupported confirmation cards.
No order or reservation write was enabled inside the session CAS boundary.

This is a bounded compatibility path for the existing proposal UI. The planned
language-driven draft editing/review workflow remains separate, unfinished work;
these changes do not mark V12 or later roadmap tasks complete.

Verification crosses both boundaries: frontend tests use the real API adapter
with only HTTP transport mocked; integration tests use the public HTTP handler,
PostgreSQL and isolated Redis. Cases cover exact quantities, retry/replay,
concurrent selection, ownership, missing/expired proposals, unavailable items,
price changes, allergies, clarification, and transaction-screen navigation.

### Mock admin browser fixtures

Fixtures now follow current order/table response envelopes and provide all
required dashboard, invoice and settings endpoints. Settings routes match the
root endpoint exactly so they cannot swallow hours/closure requests. Selectors
follow the current headings and accessible controls; the order modal close button
has an accessible name. Payment guards, refund behavior, table settlement and
reservation transitions remain asserted. Dashboard tests exercise current order
filters; operational controls remain covered on the settings page.

A shared admin fixture blocks unmocked admin API requests and fails the test,
preventing fake credentials from silently reaching a real backend. This also
caught the dashboard request made by the shared admin layout, now explicitly
mocked for every guarded scenario.

## Architecture Fixes Made During Review

- The cart barrel no longer re-exports persistence functions and the reducer;
  it exposes the provider, hook, and consumer-facing types only.
- The architecture checker reads actual frontend/server TypeScript resolution
  options, including inherited aliases. A new alias cannot silently bypass the
  frontend/server boundary.
- Dynamic imports with options and TypeScript import-equals declarations are
  now checked. Two new regression tests cover these resolution gaps.

## Results

| Check | Result |
| --- | --- |
| Frontend/test TypeScript | Passed |
| Server TypeScript | Passed |
| Production build | Passed |
| Oxlint | Passed with existing warnings |
| Architecture boundaries and runtime cycles | Passed, 199 source files |
| Architecture checker regression tests | 8 passed |
| Unit/component suite, including order list transport/race tests | 146 passed |
| Server suite, including gateway guard/dispatch tests | 274 passed |
| Database integration suite | 318 passed, 12 Redis cases initially skipped |
| Redis/PostgreSQL cases including action regressions, isolated Redis runner | 21 passed |
| Database access policies | 20 passed |
| Real HTTP/database browser suite, desktop and mobile | 10 passed |
| Real admin browser suite, desktop and mobile | 8 passed |
| Offline Jev with Chrome and isolated scratch directory | 16 passed |
| Mock browser E2E, desktop and mobile | 78 passed |

The database isolation guard verified the local disposable test instance before
database suites ran. Redis checks used a new disposable, network-isolated Redis
container and local TLS bridge; the runner removed them afterward. The offline
Jev run used `JEV_OFFLINE_CHROME` plus `PI_SCRATCH_DIR`; setting Chrome alone first
revealed the missing scratch prerequisite. With both set, all 16 tests passed.

An AST comparison checked 39 extracted admin statements and 10 public statements
against the saved working-tree gateways from immediately before extraction.
They match after accounting for formatting, parentheses, whitespace, and quoted
object keys. This checks the extraction, not the correctness of every existing
business rule.

## Verification Limits

The integration/policy suites and real browser suites passed during the
architecture review. The offline Jev baseline above is historical evidence; that
integration has since been removed. After the follow-up fixes, unit, server,
Redis/PostgreSQL action integration, mock browser E2E, TypeScript, build, lint,
and architecture checks were rerun. Counts above distinguish the full database
baseline from the targeted Redis rerun; skipped Redis cases were executed with
the isolated runner rather than treated as passing skips.

Oxlint still reports existing warnings. Live model evaluations were not run;
offline tests do not establish live model answer quality.
