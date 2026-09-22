# Product and Architecture Contract

## 1. Required behavior

- Guest: no permanent conversation, profile, extracted facts or raw transcript telemetry. Session and draft expire after 45 minutes of inactivity, with a 4-hour absolute maximum. These are implementation defaults, configurable with bounded values.
- Both identities: a fresh page load/new tab starts a new conversation. Closing and reopening the widget in the same page retains the current session. Internal navigation retains the session while the app shell stays mounted. Reload, explicit reset, login, logout and account switch start fresh.
- No chat, session bearer token or AI draft in localStorage, sessionStorage, IndexedDB, URLs or persisted query caches. The normal shopping cart retains its existing storage semantics.
- A closed tab loses its only client session reference. Server deletion is guaranteed by TTL, not unreliable unload callbacks. Do not claim instantaneous server deletion on tab close. Pages restored from back-forward cache must check expiry and reset on a new page lifecycle.
- Login does not promote the guest transcript/draft into persistent customer memory. Any future transfer feature requires a separate explicit contract.
- Authenticated users may retain compact facts only under the memory preference setting. New chat does not reload old transcripts. Current-turn constraints override remembered defaults; temporary constraints do not overwrite durable facts.
- Suggestions do not equal acceptance. Clear acceptance changes only the AI draft. "OK" can accept one unambiguous immediately pending suggestion; otherwise ask. "Nghe ngon", "de xem" and general approval do not mutate it.
- "Chot" renders review, with no real-cart mutation or order creation. CTA validates and transfers a draft snapshot to the existing cart; the user completes the existing ordering flow.
- The LLM has no checkout, payment, order submission or reservation confirmation tool. Existing explicit reservation UI may remain, with regression coverage. Legacy concierge order-submission paths are gated off for V2 and cannot be reached through old cards in V2 sessions.
- No claim that an item is allergy-safe when ingredient, allergen or cross-contact information is missing or unverified. Explicit allergies are hard constraints; inferred favorites never override them.

## 2. Storage boundaries

| Data | Store | Lifetime / restrictions |
| --- | --- | --- |
| Conversation messages, constraints, summary, pending suggestion, draft | Shared TTL session store | 45-minute idle / 4-hour absolute; both guest and logged-in |
| Client transcript/session capability | React memory at app-shell scope | Current page lifecycle |
| Durable authenticated facts | Supabase PostgreSQL | Until corrected, forgotten, memory disabled with deletion, or account deleted |
| Behavioral aggregates | PostgreSQL derived records or bounded query cache | Recomputed from eligible orders in last 90 days |
| Orders, reservations, real cart | Existing services | Existing business rules, independent of chat expiry |
| Observability | Aggregate metrics and content-free traces | 14-day trace default; no messages, facts, addresses, bearer tokens or tool argument dumps |

Choose a shared Redis-compatible store for production because Edge isolates cannot share RAM. V01 must record the concrete adapter/deployment choice and verify atomic compare-and-swap, TTL and TLS support. Provide a deterministic clock and in-memory adapter for tests only; production configuration must fail closed when the shared store is unavailable. No silent PostgreSQL transcript fallback.

Persist session+draft+pending suggestion atomically under one version. Every mutation checks authenticated actor/session capability, version, request ID and expiry. Apply bounded idempotency records within the TTL. Existing capability entropy and ownership checks remain. Two requests for the same version cannot both modify state.

Session ID, authenticated user ID and real-cart identity are distinct. Resolve user identity from verified auth, never from model tool arguments. Redact session capabilities in all errors and traces. A conversation-expired response resets UI; transient infrastructure errors do not pretend expiry or success.

## 3. Proposed persistent schema

V05 owns additive migrations; do not edit applied migrations.

- user_ai_memory_settings: user_id PK/FK, enabled, consent_version, memory_epoch, updated_at. Default disabled until the customer enables remembering preferences. Ordinary session use remains available without this.
- user_ai_memories: id, user_id, memory_type, key, bounded JSON value, source (explicit/order_history), confidence, observed_at, updated_at, optional expires_at, schema_version. Unique identity must allow explicit and behavioral facts without overwriting each other. No transcript, raw utterance, hidden reasoning or address fields.
- Behavioral records may use the same table with source=order_history and a window/version field. Compute only from completed, non-cancelled eligible orders; V01 defines refund treatment using existing statuses. Count orders separately from quantities. Do not infer party size without a reliable recorded field.
- Deleting an individual behavioral fact suppresses that fact from automatic rebuilding until the user explicitly restores it. Forget-all invalidates pending jobs and clears facts; regeneration remains paused until the user explicitly enables learning again. Suppression metadata stores only the minimum fact key/epoch, not the deleted value.
- RLS: owners can read/manage their own settings and memories through the intended API boundary; guests and other users cannot access them. Workers operate under trusted server identity. Bound value lengths, list lengths and confidence in DB and application validation.
- Disable/forget/account deletion increments memory_epoch. Background extraction uses compare-and-write against the epoch and account eligibility so an old job cannot recreate deleted facts.
- Allergy facts are sensitive opt-in data: store only the food constraint needed, never a diagnosis. Explain the memory setting, provide inspect/edit/delete/disable controls, and keep allergy handling active within a session even when memory is disabled.
- No new raw conversation analytics tables. Existing guest conversations/proposals/events need a separate migration and cleanup runbook, with inventory, dry run, backups policy and review of foreign keys. Do not erase orders or reservations.

## 4. New module boundaries (proposed files)

Backend under supabase/functions/_shared/concierge/:

- session-store.ts and session-store-redis.ts: ephemeral state/CAS/TTL.
- context.ts and session-summary.ts: bounded context assembly and structured rolling summaries.
- memory-repository.ts, memory-extractor.ts, behavioral-memory.ts, memory-retrieval.ts: durable facts and selective use.
- menu-retrieval.ts and food-safety.ts: relevant catalog search and verified food facts.
- draft-cart.ts and draft-intent.ts: deterministic draft operations and acceptance validation.
- tool-registry.ts and orchestrator.ts: schemas, execution policy, bounded tool rounds, grounding.
- cart-handoff.ts: fresh catalog validation and idempotent handoff payload.

Keep existing recommendation, validator, quote, auth and reservation services where usable. runtime.ts becomes integration glue incrementally, not a wholesale rewrite.

Frontend: extend useConcierge/api/types and ConciergeChatView; add DraftCartPreview, DraftCartReview and customer memory settings UI. Contract changes must derive from one shared schema rather than independently drifting frontend/backend interfaces.

## 5. Tool and response contracts

Read tools: search_menu, get_menu_item, check_item_availability, recommend_menu, get_restaurant_info, get_user_preferences, get_draft_cart, calculate_draft_total.

Draft-only tools: add_draft_item, remove_draft_item, update_draft_quantity. Draft operations require a server-validated accepted selection or explicit item instruction tied to this turn; LLM-supplied accepted=true is not sufficient. Unknown item, ambiguous variant or quantity causes clarification, not a guess.

Every tool has a strict input schema, output schema, authorization rule, timeout, execution budget and read/mutation classification. Reject unknown tools and additional unsupported fields. Ground item IDs, prices, availability and totals in authoritative output. Tool text, menu descriptions, memory and retrieved content are untrusted data, never system instructions.

Response: versioned envelope with session ID/capability, state_version, response/request ID, message, cards, phase, draft snapshot, warnings, optional clarification and optional validated handoff. Capabilities never enter model context. V01 finalizes error codes and SSE compatibility with the current endpoint.

Default orchestration budget: at most 3 model calls (routing/tool follow-up/final response) and 6 tool executions per turn, with explicit timeout. Never execute dependent tool calls in parallel; mutations serialize. On budget exhaustion return partial read results and safe clarification, without claiming an uncommitted draft update. Batch a turn's draft changes into one atomic commit; do not retry mutations without idempotency.

Grounding policy: menu/pricing/allergen/availability/restaurant fact answers need retrieved authoritative data or an explicit cannot-verify answer. Model prose cannot introduce unverified operational values. Structured cards and deterministic rendering carry numeric claims; uncertain free text falls back to bounded grounded templates. V10 must specify exactly which fields can be model prose and test bypass attempts. Prompt instructions alone do not satisfy this contract.

Phases: DISCOVERY, PREFERENCE_COLLECTION, RECOMMENDATION, BUILDING_DRAFT, REVIEWING, HANDOFF_TO_CART. Preserve existing reservation workflow as a separate subflow. FAQ interruptions retain the current draft and relevant pending state; stale pending acceptance is invalidated when the context changes.

## 6. Context and summary budgets

- Typical target: 2,000-4,000 input tokens including tool schemas/results, not a guarantee for all cases.
- Initial hard limit: 6,000 input tokens including all messages and tool definitions; 12,000 total input tokens across a whole turn. V01 may adjust after measuring the supported provider tokenizers and menu fixtures, documenting the reason.
- Durable retrieved facts: 200-400 tokens maximum, up to 12 facts. Include allergies/dietary constraints for food flows. Parking/hours questions do not fetch personal memory.
- Rolling summary: 200-400 tokens; summarize when recent transcript exceeds ~2,500 tokens or after 10 user turns, keeping 4-8 recent messages as budget permits. Current message appears once.
- Retrieve 5-8 menu candidates, never the whole menu prompt. Filter before ranking by availability, hard dietary constraints, price and mode. If too few matches, explain or ask permission to relax soft constraints only.
- Summaries retain stable item IDs, accepted selections, explicit constraints and unresolved questions; draft is authoritative, not the summary. Never derive long-term memory from model-generated summaries or assistant prose.
- Under budget pressure: trim optional results/history first, then summarize; never silently drop active allergies, business rules or the current instruction. If essentials cannot fit, fail safely with a clarification/reset path.
- Use cheap structured extraction/summarization where useful; deterministic handling first. Async durable extraction must use a reliable bounded queue or durable execution path with epoch checks, not a fire-and-forget Edge promise. The selected mechanism must avoid permanent raw-message persistence; V06 specifies payload TTL and no-log rules.

## 7. Draft handoff behavior

- Add accepted items only; combine identical item+note lines, bound quantities and draft size. Recommendation candidates stay separate from accepted items.
- Recalculate totals server-side. Revalidate price, availability, ordering mode and allergy knowledge when reviewing and handing off.
- Price changes require explicit acceptance of the refreshed snapshot. Unavailable/unsafe items stay visible as blocked entries; do not silently replace or drop them.
- Handoff adds to the existing cart with clearly disclosed merge semantics and a unique handoff ID. Duplicate clicks, retries and repeated delivery of the same response add zero extra items.
- This is an idempotent client application protocol, not a distributed transaction between Redis and browser storage. Server retries return the same validated handoff ID/snapshot while valid; the cart applies lines plus an applied-ID marker atomically. A lost acknowledgement must not prevent retry. Persist only the opaque marker with the ordinary cart, never a chat token or AI draft. If the normal cart persists across reload, its deduplication marker must persist for the same lifetime.
- Existing cart lines and notes remain; no automatic checkout or payment. The cart/checkout remains authoritative on final price and ordering eligibility.
- State after successful handoff records the exported version. Editing afterward creates a new draft version; do not re-export already transferred quantities by default. V01 defines delta versus new-set UX and tests it.
- A handoff token/payload has a short expiry and actor/session binding. Browser cannot invent prices or authoritative lines. Existing checkout still revalidates everything.

## 8. Implementation boundaries

No production cleanup, deployment, purchases or live paid eval are part of executing a coding task by default. Implement local adapters, migrations, runbooks and tests first. External credentials may block integration evidence but do not authorize mock success. No change to current restaurant branding or unrelated account/admin edits.
