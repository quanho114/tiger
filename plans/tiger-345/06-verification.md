# Kiểm thử và nghiệm thu

## Commands cần tạo

Hiện tại chỉ lint/typecheck/build có sẵn. Agent T01/T02 phải tạo scripts dưới đây;
không báo đã chạy trước khi thực sự tồn tại. Giữ output/exit code trong report.

| Command | Sở hữu | Mục tiêu |
|---|---|---|
| npm run lint | sẵn có | Frontend/shared lint, bổ sung server lint phù hợp |
| npm run typecheck | T01/T04 | TS strict frontend/shared; không bỏ Deno check |
| npm run build | sẵn có | Production frontend |
| npm run test:unit -- <path> | T01 | Vitest unit/component |
| npm run test:e2e -- <spec> | T01 | Playwright browser; fixtures local backend khi cần |
| npm run db:start | T02 | Supabase local, yêu cầu Docker, pinned CLI |
| npm run db:reset:test | T02 | Guard localhost/disposable project, migrations + seed; không nhận prod URL |
| npm run test:integration -- <path> | T02 | SQL/RPC/HTTP với local DB, deterministic fixture cleanup |
| npm run test:policies -- <path> | T03 | anon/customer A/B/admin/disabled admin + RPC ACL |
| npm run typecheck:server | T04 | deno check Edge Functions bằng config deps pinned |
| npm run test:server | T04 | Deno handler/auth/validation tests |

T02 ghi cách serve Edge Functions và env test trong README; không dùng service key giả/mock
để tuyên bố policies/E2E DB thật đã đạt. CI integration và policies dùng DB riêng/reset nối tiếp,
không reset shared DB giữa hai jobs đang cùng truy cập.

## Test matrix cần map vào reports

| ID | Case / expected result | Task |
|---|---|---|
| V01 | Fake order/reservation/newsletter không còn báo đã nhận khi offline | T01 |
| V02 | TS strict, cold install, app route smoke, form/dialog keyboard | T01 |
| V03 | Migrations clean + seed 13 món; CHECK context/null/qty/totals/FK bị reject | T02 |
| V04 | Public không đọc PII/write business/RPC; customer A không đọc/sửa B | T03/T14 |
| V05 | Invalid JWT 401, no JWT guest allowed; disabled admin 403 dù token còn hạn | T04 |
| V06 | Published/category active; món tạm hết vẫn thấy; unpublish không lộ | T05 |
| V07 | QR sai/rotate/table disable/visit closed; mỗi bàn tối đa một open visit | T06 |
| V08 | Create cùng idempotency key đồng thời chỉ 1 order; khác payload/actor conflict | T07 |
| V09 | Lỗi insert items rollback order/history/idempotency; tampered price/status/owner reject | T07 |
| V10 | Menu price/fee đổi và quote expiry; không tự chấp nhận giá mới | T07/T10/T11 |
| V11 | Admin hai tab transition cùng version: một thành công một 409; graph theo type | T08 |
| V12 | QR -> quote -> submit -> DB -> admin confirm trên mobile; gọi thêm cùng visit | T09 |
| V13 | Cart reload/TTL/corrupt storage/login/đổi bàn/mode/logout không lẫn PII/context | T09/T15 |
| V14 | Delivery zone inactive/outside/min order/phone/address; snapshot giá và địa chỉ | T10/T11 |
| V15 | Ngày trước 07:00 VN/past/cutoff/closures/hour intervals/guests/duplicate reservation | T12 |
| V16 | Customer cancel vs admin confirm race; contact outcome ghi lại | T12/T14/T16 |
| V17 | Publish/giá/availability/settings update tác động checkout; upload MIME giả/size/RLS | T13 |
| V18 | Payment settle vs new order/close race; paid/refund/correction idempotent, audit immutable | T17 |
| V19 | Auth redirect allowlist/PKCE/login keeps draft; customer signup không tạo admin | T15 |
| V20 | Customer DTO không internal_note/admin IDs; history chỉ owner; aggregate bounded | T14/T16 |
| V21 | Reorder lấy giá mới/skip unavailable/null item; không dùng table cũ hoặc address B | T14/T16 |
| V22 | Claim expiry/wrong secret/two users race/retry/lost create response | T18 |
| V23 | Delete account Auth failure retry; customer bị chặn ngay; order không bị cascade xóa | T19 |
| V24 | Deep links/404/auth callback, empty/error/offline states, tablet/mobile keyboard | T20 |
| V25 | Rate limit concurrent multi-instance, logs không secret/PII, service key không trong dist | T04/T20 |
| V26 | Backup restore staging, isolated preview/prod, tắt intake, monitoring and UAT | T20 |

Không viết test chỉ kiểm tra mock gọi mock đúng một lần để thay integration.
Race tests dùng ít nhất hai requests/connections concurrent thật, không chỉ Promise với mock.
Giờ tests dùng injected clock và timezone fixtures, không phụ thuộc ngày máy chạy.

## Gates

Task gate: checks bị ảnh hưởng + lint/typecheck/build; backend thêm server typecheck và integration/policies.
QR milestone: V03–V13 đạt với local DB và admin thật, không fixture response phía frontend.
Feature complete: toàn V01–V25, production build, no P1/P2 chưa xử lý hoặc chưa có quyết định rõ.
Production gate thêm V26 và D01–D06 trong decisions; build xanh không thay thế UAT.

UAT quán: mở bàn -> gọi hai lần -> xác nhận -> served -> settle -> completed -> close -> mở lượt mới;
delivery guest -> quote -> confirmed -> preparing -> delivering -> paid -> completed;
reservation guest -> pending -> admin gọi khách -> confirmed; customer login/reorder/delete.
Ghi người chạy, env, thời gian, kết quả. Không dùng dữ liệu khách thật trong fixture/screenshot công khai.

## Review cuối

Reviewer đọc README + reports trước, diff/schema/RPC/auth sau. Kiểm tra đặc biệt service-role
owner filters, RPC grants, secrets bundle, transaction boundaries, cancellation/payment graph,
claim replay, visit lifecycle và shared cart context. Phát hiện P1/P2 -> task sửa riêng + test regression.
Không claim agent độc lập hoặc browser test đã chạy nếu thiếu report thực tế.
