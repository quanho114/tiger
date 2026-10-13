# Concierge Phase 1 knowledge boundaries

The source of truth for phone, Zalo, Facebook, address and reservation settings is
`restaurant_settings`; operational hours and closures come from `business_hours`
and `business_closures`; delivery eligibility comes from active `delivery_zones`
and the delivery-enabled setting. The menu and its prices remain in `menu_items`.
The public settings endpoint and Concierge read these same tables. A missing value
is unknown, not permission to reuse a seed document or a frontend constant.

## Seed inventory (not deleted)

| Existing seed | Classification | Concierge handling |
| --- | --- | --- |
| `doc-001` hours/location/contact | Structured facts; conflicting phone and hours | Never used for answers; read current settings/hours instead. |
| `doc-002` delivery | Mixed policy with seeded area, ETA and packaging claims | Kept for review; current delivery answers read settings/zones, not this seed. |
| `doc-003` reservation | Mixed policy with seeded notice windows and contact | Kept for review; current reservation answers read settings/availability, not this seed. |
| `doc-004` culinary style | Published unstructured restaurant description | Remains eligible for keyword retrieval; review provenance before using for ingredients/allergies. |
| `doc-005` allergy policy | Unstructured safety guidance | Remains eligible for keyword retrieval; never overrides item-specific kitchen verification. |

Admin-managed, effective-dated policy documents remain available to the keyword
retriever. Curate and replace mixed seeds before removing their stored records.
No embeddings or vector store are introduced in this phase.

## Provider destinations

The default OpenAI endpoint is permitted. A custom OpenAI-compatible HTTPS host
must be explicitly listed, as an exact comma-separated hostname, in server-only
`CONCIERGE_LLM_ALLOWED_HOSTS`. URL credentials, IP literals, HTTP, unapproved
hosts, private DNS answers and HTTP redirects are rejected. Anthropic and Gemini
continue using their fixed HTTPS endpoints. Do not place credentials or this
server-only configuration in `VITE_` variables. An allowed hostname is an
operator trust decision; review its ownership and DNS before approving it.

For a local-only OpenAI-compatible development gateway, set both
`ENVIRONMENT=local` (or `NODE_ENV=development`) and
`CONCIERGE_LLM_DEV_BASE_URL=http://host.docker.internal:<port>/v1` **in the
server's local environment**, using the exact port of the gateway. The setting
must be an HTTP URL with path `/v1` and host `host.docker.internal`, `127.0.0.1`,
or `[::1]`; credentials, query strings and arbitrary private hosts are rejected.
The URL entered in Admin must match this server-pinned value exactly. This
exception is unavailable in production and when `DENO_DEPLOYMENT_ID` is set.
Do not put this setting or an API key in `VITE_` variables or commit a local
`.env` file. Set the gateway binding so that only your development host can
reach it. Provider requests continue to reject redirects. HTTP is intentionally
permitted only for this explicit local development gateway, not public use.

The Admin banner confirms configuration validity, **not** a successful model
call. Use “Kiểm tra kết nối” to make an approved real request, then perform a
fresh browser smoke test on the website before declaring the chatbot working.
