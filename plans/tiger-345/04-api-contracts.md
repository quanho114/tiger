# API contract triển khai

## A. Transport

Base: `SUPABASE_URL/functions/v1/{public-api|customer-api|admin-api}`.
Các path bảng dưới tương đối function tương ứng, không dựng /admin/login proxy password.
Login qua Supabase Auth SDK; admin email/password, customer Google hoặc email magic link/OTP.
Public function gateway phải cho request guest qua; bên trong tự verify user bearer nếu có.
Không dùng project anon key như user identity; apikey/publishable key không cấp quyền admin.
Customer/admin luôn verify user JWT server-side bằng phương thức SDK phù hợp, không decode-only.

Success `{ data, request_id }`; list `{ data: { items, next_cursor }, request_id }`.
Error `{ error: { code, message, field_errors? }, request_id }`.
400 invalid payload; 401 missing/invalid auth; 403 not admin/disabled; 404 missing/not owned;
409 conflict/changed state; 422 business validation; 429 rate limit (+ Retry-After); 503 unavailable.
Stable codes: VALIDATION_ERROR, AUTH_REQUIRED, FORBIDDEN, NOT_FOUND, VERSION_CONFLICT,
IDEMPOTENCY_CONFLICT, QUOTE_CHANGED, QUOTE_EXPIRED, ITEM_UNAVAILABLE, SERVICE_CLOSED,
TABLE_UNAVAILABLE, VISIT_CLOSED, QR_REVOKED, PAYMENT_REQUIRED, CLAIM_INVALID, RATE_LIMITED.
Không trả stack, SQL, raw tokens, PII trong message/log. Request ID theo request không chứa client secrets.

Header Idempotency-Key random >=128 bits cho create order/reservation, payment, claim/delete workflow
nếu contract yêu cầu; hash key trước lưu. TTL 24h, bound actor scope; key không phải public order code.
Client tự giữ key trước request, reuse sau timeout; chỉ tạo mới cho ý định giao dịch mới hoặc sửa payload
sau lỗi xác định chưa commit. Không reset key chỉ vì HTTP client timeout.
Khi trạng thái create còn unknown, giữ intent/context/actor và không mời login/đổi tài khoản để gửi
lại ý định đó. Nếu session đổi từ tab khác, dừng gửi mới, hướng dẫn giải quyết request cũ;
không tự tạo key mới/đổi guest owner. Đã nhận receipt guest rồi mới mở login + claim.

Lists cursor keyset (created_at,id) DESC, limit default 20/max 100, filter allowlist;
admin search exact code/normalized phone, không arbitrary SQL/column sort.
Private APIs Cache-Control no-store; public menu max-age 30s + revalidation, publish UI invalidate.
Rate limiter persisted atomic DB counter: defaults create 10/5 phút/IP và 20/5 phút/visit,
resolve 60/phút/IP, quote 60/phút/IP, claim 5/15 phút/IP+user; cấu hình staging/load test điều chỉnh.
IP từ trusted gateway headers; hash có salt, không tin forwarded header client tự gửi.
Auth login abuse dùng Supabase Auth limits/CAPTCHA tùy cấu hình. OPTIONS/CORS allowlist origins,
không xem CORS là authorization. Payload limit 64KB, images upload riêng.

## B. Public API

| Method/path | Input | Output và luật |
|---|---|---|
| GET /menu | mode optional, category optional | categories + items published, available flag, fields UI; không unpublish |
| GET /settings | none | contact/hours/closures/active zones/areas/intake limits; không secret/admin data |
| POST /tables/resolve | token từ /table/:token | table id/name, open visit id, signed visit_capability, expires_at; sai/closed safe error |
| POST /order-quotes | QuoteInput | quote_token, expires_at, normalized item lines + current prices, subtotal/fee/total |
| POST /orders | CreateOrderInput + Idempotency-Key | 201 minimal receipt {id,code,order_type,status,payment_status,totals,created_at}; replay 200 |
| POST /reservations | customer_name/phone, starts_at ISO offset, guest_count, seating_area_id?, note? + key | {id,code,status:pending,starts_at,ends_at}; auth optional ownership |

Resolve dùng POST body để không log token ở API path; landing URL vẫn chứa token nên
Referrer-Policy no-referrer, không analytics URL đầy đủ, strip token bằng replaceState sau resolve,
không render external images trước khi strip. QR tĩnh không trả orders/khách đang ngồi.

```ts
type LineInput = { menu_item_id: string; quantity: number; note?: string };
type Context =
  | { order_type: 'dine_in'; visit_capability: string }
  | { order_type: 'delivery'; delivery_zone_id: string };
type QuoteInput = Context & { items: LineInput[] };
// Create là discriminated union: delivery bắt buộc customer, dine_in cấm customer/zone/address.
type DeliveryCustomer = { name: string; phone: string; address: string };
// Common create: items, quote_token, note?, claim_secret? (guest only).
// Không nhận customer_user_id, table_id tự khai, status, price, total, internal_note.
```

T04 hiện thực Zod discriminated union thay comment minh họa, reject unknown sensitive fields.
Lines cùng item+normalized note gộp qty trong limit; khác note giữ riêng, tối đa 50 normalized lines.
Quote bind actor authenticated user hoặc guest, context/items/notes/prices. Login sau quote cần quote mới.
Delivery submit snapshot customer input, không nhận saved address của user khác theo ID.
Payment intent cash/bank_transfer có thể cho khách chọn nhưng payment_status luôn unpaid;
bank_transfer chỉ hướng dẫn đã được quán xác nhận, không đánh paid theo client screenshot.

## C. Admin API

Mọi endpoint kiểm tra active admin hiện tại; audit mọi mutation; IDs do path không thay thế quyền.

| Method/path | Hành vi |
|---|---|
| GET /dashboard | counters + recent pending; phân biệt distinct visits chờ món và số orders |
| GET /orders; GET /orders/:id | filters type/status/date/code/phone, list/detail đầy đủ phục vụ |
| POST /orders/:id/transition | expected_version,target_status,reason?; RPC graph theo order_type |
| PATCH /orders/:id/note | expected_version,internal_note; audit metadata không copy PII |
| POST /orders/:id/payment | expected_version,event,method,reason?, key; delivery hoặc thao tác correction/refund |
| GET /tables | table state, current visit, totals/status summaries admin-only |
| POST /tables; PATCH /tables/:id | create/edit/active/order/version; cấm deactivate khi visit còn open |
| POST /tables/:id/qr | create/rotate, expected_version; trả raw token một lần + URL để tạo QR |
| POST /tables/:id/visits | mở visit, expected_table_version; conflict nếu đã open |
| GET /visits/:id | orders + unpaid summary, version |
| POST /visits/:id/settle | expected_version, expected_orders[{id,version}], method,key; settle atomic |
| POST /visits/:id/close | expected_version; terminal/paid checks; revoke capabilities |
| GET /reservations; GET /reservations/:id | date/status pagination, chi tiết |
| POST /reservations/:id/transition | expected_version,target_status,reason? |
| PATCH /reservations/:id/contact | expected_version,outcome,contacted_at; ghi nhận đã gọi khách |
| PATCH /reservations/:id/note | expected_version,internal_note; audit an toàn, không đưa vào customer DTO |
| GET/POST /categories; PATCH /categories/:id | active/name/order/version |
| GET/POST /menu-items; PATCH /menu-items/:id | giá/nội dung/ảnh/mode/publish/availability/version |
| POST /media/upload | authenticated upload JPEG/PNG/WebP <=5MB, sniff/re-encode, tên server; không SVG |
| GET/PATCH /settings | singleton expected_version, settings allowlist |
| PUT /business-hours; PUT /business-closures | expected_settings_version, replace validated collection atomically |
| GET/POST /delivery-zones; PATCH /delivery-zones/:id | fixed fees/threshold/active/version |
| GET/POST /seating-areas; PATCH /seating-areas/:id | name/order/active/version |
| GET /audit | entity filter + pagination, admin-only, safe metadata |

API QR hash-only không re-download raw token cũ. UI lưu/in PDF ngay sau tạo; cần in lại mà mất
PDF phải rotate, cảnh báo QR cũ ngừng hoạt động. Không âm thầm rotate khi người dùng chỉ xem bàn.
Admin provision/deactivate qua trusted CLI ngoài UI, cấm vô hiệu admin cuối cùng.

## D. Customer API

| Method/path | Luật |
|---|---|
| GET/PATCH /me | own profile allowlist; không role/user_id/marketing timestamp tùy ý |
| GET /me/home | bounded recent 3, frequent 6, favorites 6, upcoming 3; không trả toàn history |
| GET /me/orders; GET /me/orders/:id | own only, DTO + customer-safe timeline, no internal fields |
| GET /me/reservations; GET /me/reservations/:id | own only, safe DTO |
| POST /me/reservations/:id/cancel | expected_version,reason; ownership, cutoff, state machine |
| GET/POST /me/addresses; PATCH/DELETE /me/addresses/:id | own only, version update, atomic default |
| GET /me/favorites | current public menu projection, unavailable retained with label |
| PUT/DELETE /me/favorites/:item_id | idempotent own favorite; new favorite chỉ món public |
| POST /me/reorder | owned source_order_id,target context; trả lines hiện tại + warnings, không tạo order |
| POST /me/orders/:id/claim | claim_secret, atomic claim; không claim bằng code/phone |
| DELETE /me | recent auth <=10 phút, explicit confirmation; return deletion job receipt, immediately block user |

Không tự retry POST create với key mới. Polling order detail 15s khi tab visible và order chưa terminal;
admin poll 15s, có timestamp/lỗi và manual refresh; clear timer khi logout/unmount.
Frequent items chỉ completed orders của caller, rank total quantity, tie order_count/recent/id;
ẩn món unpublished, hiển thị available false đúng; item FK null không reorder được.
Customer cancel reservation đồng thời admin confirm phải một bên 409, không last-write-wins.

## E. Auth callback và cấu hình

Routes /login, /auth/callback, /admin/login. Allowlist redirect origin/path, chặn open redirect.
OAuth PKCE; không log tokens/query callback. Lưu intended internal route và cart context độc lập
auth; callback strip code; query cache keys chứa user ID, clear toàn private cache khi user đổi.
Không tạo backend password store. Recovery admin/email dùng provider, test disabled admin riêng.
Google OAuth/mailer cấu hình thật là external dependency D03, local email inbox dùng Supabase local.
