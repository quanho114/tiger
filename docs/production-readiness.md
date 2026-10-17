# Production readiness changes - 2026-09-22

## Implemented

- Cron credentials only authorize POST requests to `/retention/run`,
  `/retention/retry-deletions`, and `/account-deletions/retry`. Other admin routes
  reject cron credentials. Normal admin JWT authorization is unchanged.
- PostgreSQL capability and rate-limit tests live in the integration suite.
  Rate-limit cleanup deletes only hashes created by that suite.
- Integration and policy suites verify the database isolation marker before
  collecting tests, including before any teardown hooks can run. CI provisions
  the marker only after starting its fresh disposable Supabase stack.
- Production builds require `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
  API calls and Supabase Auth share the same frontend base URL.
- Server database, Auth, and signing-key defaults are limited to explicit
  local/development/test execution. Production and deployed Edge Functions
  cannot use missing-value fallbacks. Database pools have bounded connection
  counts and connection/query timeouts.
- Delivery and dine-in checkout retain an unresolved request key and claim
  secret in sessionStorage. Quote refresh and page reload reuse these credentials.
  A recovery lookup checks for an existing receipt before generating another quote.
  The recovery endpoint requires both credentials and enforces expiration and
  rate limits; responses are not cacheable. No customer contact fields are stored
  in the recovery record.
- Checkout blocks concurrent submissions and stops before sending an order if
  recovery credentials cannot be persisted. Ambiguous failures retain their key;
  a definitive rejection of the first attempt permits another checkout.
- Stale Concierge test fixtures now match the action ID, request fingerprint,
  and memory contracts. Menu retrieval accepts schema input and applies defaults
  through validation.

## Verification

Verified locally against the working tree, which also contains concurrent
Concierge development:

| Check | Result |
| --- | --- |
| Frontend/shared/test TypeScript | Passed |
| Server TypeScript | Passed |
| Unit/component tests | 134 passed |
| Server tests | 257 passed |
| Targeted PostgreSQL integration tests | 20 passed |
| Delivery/dine-in browser tests, desktop and mobile | 10 passed |
| Production build | Passed |
| Build with missing public configuration | Rejected as expected |
| Lint | Passed with existing warnings |

The PostgreSQL tests cover recovery with incorrect/expired credentials, a changed
client network, unchanged order counts, visit capability revocation, and rate
limits. Recovery test fixtures use transactions that are rolled back.
Browser tests use mocked API responses and assert that a lost order response
followed by reload does not result in a second order request. These are separate
from the PostgreSQL integration checks; they do not constitute a deployed
browser-to-database acceptance test.

## Deployment order

1. In the target Supabase environment, verify `DATABASE_URL` or `SUPABASE_DB_URL`,
   `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Configure separate strong
   `QUOTE_SECRET` and `CAPABILITY_SECRET` values through the secret manager when
   possible; an existing service-role signing fallback remains supported.
   Do not put server secrets in frontend variables, files, logs, or shell history.
2. Preserve existing signing keys during this release so active quotes/table
   capabilities remain valid. Use the existing key-rotation procedure separately
   if rotation is needed. Restrict scheduler callers to the three routes above.
3. Deploy the backend functions before the frontend. The new frontend calls
   `POST /functions/v1/public-api/orders/recover`. These hardening changes do not
   require a new database migration; independently developed Concierge migrations
   must be reviewed and deployed through their own release plan.
4. Configure the frontend's public Supabase variables in the hosting platform,
   then build and release the frontend. CI's placeholder public key is only for
   build verification and must not be used for a live deployment.
5. On staging, verify guest ordering, admin confirmation, payment/settlement,
   table closure, recovery after response loss, and cron scope through real HTTP
   requests. Check error monitoring and restore a backup into an isolated target
   before declaring the application ready for public launch.

For rollback, restore the previous frontend deployment first. Keep the compatible
recovery endpoint available while cached frontend bundles may still call it.
Do not roll back database data to undo this application release. Avoid restoring
the former broad cron authorization; disable the scheduler temporarily if needed.

## Recovery boundaries

- Recovery survives reload in the same browser tab. Closing the tab, clearing
  browser storage, or moving to another device can lose the credentials.
- The server's current receipt/claim retention window is 24 hours. The browser
  refuses to silently generate a fresh key for an older unresolved submission
  and asks the customer to contact the restaurant.
- Recovery is currently attempted when the customer requests a quote again.
  Delivery form fields may need to be entered again because contact details are
  not persisted by recovery.
- An unavailable recovery service blocks a fresh quote for an unresolved attempt.
  A missing or mismatched receipt retains the same idempotency key for retry.
- Live infrastructure settings, deployed CI status, capacity, backup restoration,
  and the complete production acceptance flow were not verified by these local
  checks. No production deployment or paid provider evaluation was performed.
