# Chatbot menu lookup diagnosis — 2026-10-20

## Status and scope

**Runtime chatbot: FAIL** on the currently deployed backend. The reported missing-menu failure was reproduced using the real website and provider. A narrow local source fix is implemented and offline checks pass, but it has NOT been deployed or accepted on the cloud runtime.

The user explicitly approved a few real-provider browser test messages, then selected **handoff only, no cloud deployment**. No orders, payments, reservations, real addresses, durable memory changes, database mutations, or personal browser sessions were used. The fresh guest chatbot test necessarily creates its own test conversation/session.

## Tested environment

- Time: 2026-10-20, approximately 20:55–21:06, UTC+07:00.
- Frontend: http://127.0.0.1:5173/ (local Vite source checkout, HEAD baseline `2fbbc65` plus existing working-tree changes and the fix below).
- Observed backend: https://njguhcnrecvqdlcjxtoo.supabase.co (read from the browser application's exported public backend URL, without reading environment files or printing keys).
- Browser: installed Microsoft Edge, headless Playwright, fresh isolated browser context. No interception, injected orchestrator, synthetic provider, or canned runtime answer.
- Provider: used the backend's actual configured runtime after user approval. Provider identity/model, effective allowlist, credentials, feature flags, backend source revision and database migration version were not accessible/verified. No admin credentials were read and no configuration was changed.
- The frontend is local but Edge Functions are cloud-hosted. A frontend build/restart does NOT deploy this backend fix.

## Observed evidence

1. GET `/functions/v1/public-api/health`: HTTP 200; request ID `99b957fd-63c6-491d-8449-abdb52c1b48d`.
2. GET `/functions/v1/public-api/menu`: HTTP 200, 98 items, 10 categories; request ID `b2081544-758b-4096-a7da-a97f6c09ce50`.
3. Published menu pricing modes: 54 range, 33 fixed, 8 market, 3 unknown.
4. All 98 public menu item identifiers are rejected by the old installed `z.string().uuid()` validator, despite matching the existing Concierge catalog ID contract.
5. Greeting in a fresh guest session: nonempty completed reply; input usable afterward.
6. Synthetic question `Gà nướng muối ớt giá bao nhiêu?`: real chatbot completed with a claim that the dish could not be found. Public menu contains the available dish at 280,000–300,000 VND.
7. Synthetic question `Sườn Thái chua cay giá bao nhiêu?`: same session, real chatbot completed with a claim that it could not find the dish and could not confirm its price. Public menu contains the available fixed-price dish at 250,000 VND.
8. All three chat requests returned HTTP 200 / `text/event-stream`; no request ID was exposed in the captured chat response headers. Transport success did not imply correct menu grounding. Input remained enabled after each completed reply; no unhandled browser exception was observed. Completion text appeared twice in the extracted accessible message text (streaming presentation plus completed text); visual duplicate-bubble behavior was not established or changed in this task.

The menu endpoint is connected and populated. The actual chatbot lookup remains incorrect. The cloud backend's deployed revision is unknown, so the source-level validator defect is proven locally and strongly consistent with the live symptom, not confirmed by cloud tool-execution logs.

## Source diagnosis and narrow fix

- Both catalog and Concierge backend paths use the authoritative PostgreSQL `public.menu_items` catalog; this is not a missing frontend static-menu file.
- Existing Concierge wire IDs allow PostgreSQL-compatible hexadecimal 8-4-4-4-12 identifiers. Seeded IDs do not necessarily have RFC version/variant bits.
- `supabase/functions/_shared/concierge/tool-registry.ts` previously used stricter RFC UUID validation for `get_menu_item.item_id` and menu search `category_id`. Tool selection silently discards calls whose inputs fail validation; exact-name fallback lookup therefore loses its menu evidence for seeded item IDs.
- Fix: reuse `ConciergeV2MenuCandidateSchema.shape.id` and `.shape.category_id`, aligning tool inputs with the existing catalog contract. Invalid/nonhex/malformed identifiers remain rejected. No seed IDs, foreign keys, pricing rules, cart boundaries or grounding guards were changed.
- Added three regression cases in `tests/server/concierge-a01-a02.test.ts`: actual seeded-ID exact-name fallback; model search rewritten to authoritative item lookup; seeded category/item schema acceptance with malformed-ID rejection. Price-range details are preserved and no draft mutation is performed.

### Separate limitation, not changed

`menu-retrieval.ts` excludes non-fixed prices from recommendation candidates. This affects browse/recommend behavior for range/market/unknown items and deserves a separate read-only discovery versus orderable-candidate design. Removing this filter globally would affect price/cart safety and was intentionally not done. Exact item detail already supports range prices and is covered by the fix tests.

## Verification

| Command | Final result |
| --- | --- |
| `npm.cmd run typecheck` | PASS after correcting literal typing of the newly added test fixture |
| `npm.cmd run typecheck:server` | PASS |
| `npm.cmd run lint` | PASS: 36 warnings, 0 errors |
| `npm.cmd run check:architecture` | PASS: 267 source files |
| `npm.cmd run test:architecture` | PASS: 8/8 |
| `npm.cmd run test:unit` | PASS: 196/196 across 32 files |
| `npm.cmd run test:server` | PASS: 662/662 across 47 files |
| Focused A01–A02 server test | PASS: 33/33 |
| `npm.cmd run build` | PASS |

Initial sandbox attempts failed with `spawn EPERM`; permitted retries completed. The first full-check run found a TypeScript literal-widening problem in the new regression fixture; the fixture was corrected, standalone typecheck reran successfully, and the subsequent build passed. Existing unit tests emit React `act(...)` warnings; these were not weakened or hidden.

Database integration/policy tests were NOT run: no verified disposable database was configured. A cloud development/shared database was not used for mutation fixtures. Full runtime acceptance (restaurant fact, recommendation acceptance into guarded draft, quantity adjustment, mobile presentation) was not attempted after the menu lookup failed, and cannot be claimed from offline tests.

The local Vite process encountered Windows `EBUSY` file-watch failures during atomic source edits. It was restarted with process-only `CHOKIDAR_USEPOLLING=true` / `CHOKIDAR_INTERVAL=1000`; no source configuration change. Final frontend check at 21:05:57 UTC+07 returned HTTP 200.

## Handoff / next action

No cloud deployment was performed, per the user's choice. An authorized maintainer must review the local working tree and deploy the relevant Edge Function artifact(s) containing the shared tool-registry fix to the confirmed project, then re-run real-provider acceptance on Tiger. Do not deploy the entire dirty working tree blindly. Reloading the browser alone will not correct the cloud backend.

**Code đã kiểm định; bản sửa chatbot thực tế chưa nghiệm thu. Runtime chatbot hiện tại: FAIL.**

No secrets, capabilities, tokens, raw session payloads, or private conversations are included in this evidence.
