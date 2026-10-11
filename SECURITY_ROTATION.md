# Security credential rotation checklist — Tiger

No secret values are stored in this file. Ever.

## Scope

A live Upstash/Redis REST token was found in the local, git-ignored file
`supabase/functions/.env` (`CONCIERGE_REDIS_REST_TOKEN`). Git history confirms
the file was never tracked, but the credential must still be treated as
compromised because its exposure cannot be fully audited.

Provider API keys may additionally live in the `concierge_llm_config` table
(`api_key` column) and in host environment variables.

## Rotation steps (human-owned — code cannot do this)

1. **Upstash/Redis**
   - [ ] Open the Upstash console for the Tiger database.
   - [ ] Roll/rotate the REST token.
   - [ ] Invalidate the previous token.
   - [ ] Update the local `supabase/functions/.env` (git-ignored) with the new
         token, or remove Redis usage if Postgres session store is canonical.
   - [ ] Update any deployed Edge Function secrets / host env with the new token.
   - [ ] Confirm old token returns 401.

2. **LLM provider keys** (`concierge_llm_config.api_key`, host env)
   - [ ] Inventory which provider keys exist (OpenAI / Anthropic / Gemini).
   - [ ] Rotate each key at the provider dashboard.
   - [ ] Update `concierge_llm_config` row id=1 and/or host env.
   - [ ] Confirm old keys are revoked.

3. **Signing secrets** (`QUOTE_SECRET`, `CAPABILITY_SECRET`, `HASH_SALT`)
   - [ ] If any of these were ever committed or shared, generate fresh values.
   - [ ] Note: rotating `QUOTE_SECRET` invalidates outstanding order quotes
         (TTL 300s — safe to rotate); rotating `CAPABILITY_SECRET` invalidates
         visit capabilities (coordinate with operations).

4. **Repo hygiene**
   - [x] `supabase/functions/.env` is git-ignored (`.gitignore: .env`) and was
         never tracked (`git log -- supabase/functions/.env` is empty).
   - [x] Local token value redacted to `revoked-replace-me`.
   - [x] `supabase/functions/.env.example` contains placeholders only.
   - [ ] Scan shell history / screenshots / shared docs for pasted values.

5. **CI guardrails**
   - [x] CI `secrets` job scans tracked files for high-confidence secret
         patterns (see `.github/workflows/ci.yml`).
   - [x] CI `dist` scan rejects `SUPABASE_SERVICE_ROLE_KEY` in client bundle.
   - [ ] Long-term: move provider keys to Vault/KMS; store only
         `secret_reference` in `concierge_llm_config`.

## Fail-closed behavior (verified in code)

- `configuredValue()` throws in production when a required secret is missing.
- `allowsLocalDefaults()` is false when `NODE_ENV`/`ENVIRONMENT=production`
  or `DENO_DEPLOYMENT_ID` is set — dev defaults (e.g. `*-2026` signing
  fallbacks) never apply in production.
- The customer agent has no tool that reads secrets or environment.
