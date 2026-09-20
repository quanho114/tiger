# Database specification

Đọc cùng 02-architecture mục C–H. Đây là yêu cầu migrations, không phải SQL đã chạy.
T02 tạo schema core; T03 bổ sung customer/security; RPC thêm ở task sở hữu tính năng.

## A. Convention và schema

- UUID PK mặc định gen_random_uuid(); timestamptz created_at/updated_at, trigger updated_at.
- Tiền bigint VND >= 0; API number chỉ trong giới hạn Number.MAX_SAFE_INTEGER.
  Giới hạn total nghiệp vụ 1 tỷ VND/order; phép nhân tính bigint, reject vượt limit.
- Enum hoặc CHECK cho type/status; NOT NULL với field bắt buộc. Text trim + length constraints.
- Mutation version NOT NULL DEFAULT 1; increment atomic, expected_version sai trả conflict.
- FK owner auth.users ON DELETE SET NULL cho lịch sử; profile/address/favorite cascade.
- Claim claimed_by_user_id và actor refs lịch sử cũng SET NULL; deletion job không FK cascade
  vào auth.users để job còn hoàn thành/ghi nhận sau khi xóa identity. Không giữ email/phone trong job.
- Catalog/category/table/zone/area archive bằng active/published; không hard-delete đã tham chiếu.
- Snapshot không render lại từ bảng hiện hành; table label và zone name snapshot cần giữ.

| Bảng | Fields bắt buộc ngoài id/timestamps |
|---|---|
| admin_profiles | user_id UNIQUE FK auth.users, display_name, active; không role, không public insert |
| customer_profiles | user_id PK FK auth.users, display_name, phone nullable, avatar_url nullable, marketing_opt_in false, last_seen_at nullable, deletion_requested_at nullable |
| customer_addresses | user_id FK, label, recipient_name, phone, address_line, ward/district/province nullable, delivery_note, is_default, version |
| customer_favorites | PK(user_id, menu_item_id), created_at; không cần id/update timestamp |
| categories | name, slug UNIQUE, sort_order, active, version |
| menu_items | category_id FK, name, slug UNIQUE, description, price_vnd, image_path nullable, published, available, allow_dine_in, allow_delivery, featured_rank nullable, tags text[], serving_size/pairing_note/delivery_eta nullable, spice_level 0..2 nullable, is_signature/is_bestseller/is_new, version |
| seating_areas | code UNIQUE, name, active, sort_order, version |
| dining_tables | code UNIQUE, name, active, sort_order, seating_area_id nullable, version |
| table_qr_tokens | table_id FK, token_hash UNIQUE, active, rotated_at nullable, revoked_at nullable |
| table_visits | table_id FK, status open/closed, capability_epoch int, opened_by_admin_id FK nullable, opened_at, closed_at nullable, version |
| delivery_zones | name, description, fee_vnd, free_threshold_vnd nullable (null = không miễn phí), active, sort_order, version |
| restaurant_settings | id CHECK id=1, name/phone/zalo/facebook/maps/address, timezone, accepting_orders, accepting_dine_in_orders, accepting_delivery_orders, booking_enabled, min_delivery_order_vnd, reservation_min_notice_minutes/max_days_ahead/duration_minutes/cancel_notice_minutes/no_show_grace_minutes, version |
| business_hours | weekday 0..6 (0 Sunday), service_type restaurant/delivery/reservation, open_time, close_time, active |
| business_closures | date, service_type, reason, UNIQUE(date,service_type) |
| orders | code UNIQUE, customer_user_id nullable FK, order_type, status, table_id/table_visit_id nullable, table_name_snapshot nullable, customer_name/phone nullable, delivery_zone_id/address_snapshot/zone_name_snapshot nullable, subtotal_vnd/shipping_fee_vnd/total_vnd, note, internal_note, payment_status unpaid/paid/refunded, payment_method nullable cash/bank_transfer, paid_at nullable, version, confirmed_at/completed_at/cancelled_at nullable |
| order_items | order_id FK, menu_item_id FK nullable, item_name, unit_price_vnd, quantity, line_total_vnd, note, position |
| order_status_history | order_id FK, from_status nullable, to_status, actor_admin_id nullable, reason nullable, created_at |
| order_payment_events | order_id FK, event paid/refunded/corrected, amount_vnd, method, actor_admin_id FK nullable, reason nullable, batch_id nullable, created_at; append-only |
| reservations | code UNIQUE, customer_user_id nullable FK, customer_name/phone, starts_at/ends_at, guest_count, seating_area_id nullable, area_name_snapshot nullable, status, note/internal_note, version, contact_outcome/contacted_at nullable |
| audit_logs | admin_id nullable FK, actor_kind system/admin/customer, action, entity_type/id, metadata allowlisted JSONB, created_at; append-only |
| idempotency_requests | operation, key_hash, actor_scope, request_hash, result_id, response_json minimal, created_at, expires_at; UNIQUE(operation,key_hash) |
| guest_order_claims | order_id UNIQUE FK, secret_hash, expires_at, consumed_at nullable, claimed_by_user_id nullable FK; không truy cập client |
| rate_limit_buckets | bucket_hash, window_start, count, expires_at; PK(bucket_hash,window_start), server-only |
| account_deletion_jobs | user_id UNIQUE, status/step, requested_at, completed_at nullable, last_error_code nullable, retry_count; server-only, không lưu auth tokens |

Khoảng 25 bảng ở spec đầy đủ, bao gồm 3 bảng kỹ thuật; không tối ưu số bảng bằng bỏ invariant.
Không có bảng customers guest, frequent_items, recommendation_profile hoặc role_permissions.
Không persist quote: token ký + so sánh lại DB. Không persist raw QR/claim token.

## B. Constraints

1. orders dine_in: table_id, table_visit_id, table_name_snapshot NOT NULL; customer_name/phone,
   delivery_zone_id/address_snapshot/zone_name_snapshot NULL; shipping=0.
2. orders delivery: table_id/table_visit_id/table_name_snapshot NULL; customer_name/phone/address/zone
   NOT NULL và nonblank; zone_name_snapshot NOT NULL. customer_user_id nullable cho cả hai.
3. orders.total = subtotal + shipping; subtotal/fee/total nonnegative và bounded. Không discount v1.
4. order_items: qty 1..99, unit >=0, line_total = unit*qty; order phải có 1..50 lines qua RPC.
   Check subtotal = SUM(items) trong RPC; không thể dùng row CHECK tham chiếu bảng khác.
5. order_type ràng buộc status: dine_in không delivering; delivery không served.
6. table_visits UNIQUE(id,table_id); orders composite FK(table_visit_id,table_id) bảo đảm cùng bàn.
7. Partial unique table_visits(table_id) WHERE status='open'; closed_at đồng bộ status.
8. Partial unique table_qr_tokens(table_id) WHERE active=true. Rotate trong một transaction.
9. Partial unique customer_addresses(user_id) WHERE is_default=true. API đổi default atomic,
   ownership check trước mọi update; cho phép không có default khi chưa có địa chỉ.
10. Reservation guests 1..30, ends_at>starts_at; trạng thái theo enum; lịch validate qua RPC.
11. Hours open_time<close_time; reject interval overlap cùng weekday/service khi sửa settings.
12. updated version/status/payment chỉ qua RPC, không cho caller truyền initial paid/confirmed.

Index: orders(status,created_at DESC,id), (order_type,status,created_at DESC,id),
(table_visit_id,created_at), (customer_user_id,created_at DESC,id);
order_items(order_id), history(order_id,created_at,id), payment_events(order_id,created_at);
reservations(status,starts_at,id), (customer_user_id,starts_at DESC,id);
menu_items(category_id,published,available), favorites(user_id,created_at),
audit_logs(entity_type,entity_id,created_at DESC), idempotency/claims/rate_limit expires_at.
Thêm index FK nóng chưa covered, tránh index trùng prefix vô ích.

## C. Quyền

Bật RLS trên mọi bảng exposed. anon/authenticated không có write trực tiếp bảng business,
kể cả addresses/favorites (v1 thống nhất mutation qua API). Customer read private qua DTO API.
Chỉ catalog published thuộc category active và public settings projection được đọc public.
Có thể public API phục vụ toàn bộ read, không bắt buộc direct PostgREST.

Admin cũng gọi API, không cấp quyền DB chỉ vì browser nói admin. Server verify JWT + đọc
admin_profiles.active mới nhất trên mỗi request. Không tin role trong user_metadata.
Service role bypass RLS: mỗi customer query bắt buộc owner predicate từ verified user ID.
Test IDOR bằng đổi order/address/reservation ID sang user khác, trả 404 không lộ tồn tại.
Authenticated customer phải có profile tồn tại, không deleting; thiếu profile không được xem là guest.
DTO history không có internal_note, admin identifiers, customer khác, QR/claim secret, audit metadata.

RPC SECURITY DEFINER: SET search_path cố định, schema qualify, revoke EXECUTE FROM PUBLIC,
anon/authenticated nếu chỉ server gọi; cấp đúng service role. Không dùng dynamic SQL từ input.
Auth signup trigger chỉ tạo customer_profile tối thiểu, không admin; trigger idempotent an toàn
đối với OAuth metadata lỗi. Admin bootstrap là CLI trusted riêng có guard cuối cùng, không HTTP public.

## D. Transactions và locks

Create order một RPC: idempotency uniqueness lock -> settings/service validation -> visit/table/QR
locks nếu dine-in -> zone nếu delivery -> menu rows theo ID sorted -> tính quote -> insert order,
items/history/claim hash -> store idempotency response -> commit. Insert failure rollback tất cả.
Duplicate same key+same actor+same semantic payload trả receipt cũ; khác payload/actor 409.
Replay existing thành công phải trước quote expiry/intake checks; retry đơn đã commit không bị
từ chối vì quán vừa đóng. Body limits/auth checks vẫn áp dụng trước replay.
Edge handler không được reject quote hết hạn trước khi RPC tìm idempotency result đã commit.
Kiểm tra expiry và điều kiện kinh doanh là nhánh tạo mới; replay chỉ trả minimal receipt sau
kiểm tra đúng key/hash/actor. RPC mới vẫn nhận quote đã xác minh chữ ký phía trusted server.
Request hash canonical: sorted normalized lines/notes + context + customer snapshots + claim hash;
không gồm quote token/exp để có thể re-quote payload chưa commit. Total signed đổi yêu cầu khách đồng ý.

Menu/zone/settings mutations khóa cùng rows để linearize với create; define lock order thống nhất:
settings -> table/visit -> zone -> menu sorted -> order sorted. Không một endpoint đảo thứ tự.
Admin transition compare version + validate graph + update timestamps + history + audit cùng RPC.
Open/close/settle/create cùng visit lock; paid events và state changes commit cùng nhau.
Payment mutation có idempotency để double-click không ghi hai events. Retry sau timeout trả cùng kết quả.
Claim lock order row + claim row, check expiry/owner/hash và update owner/consume/audit cùng transaction.
Reservation create idempotent; cancel/transition versioned + audit. Contact attempt không sửa history khách.

## E. Migration/seed/retention

Seed deterministic UUID mapping từ feat-1/menu-5...; preserve 13 món/6 categories và mọi field UI.
Ảnh mẫu external chỉ demo. Admin credentials không nằm trong seed/migrations.
Local fixtures separate users A/B/admin/disabled-admin với password chỉ dành test disposable.
Một command local reset tạo schema+seed; không áp dụng seed demo trong migration production.
Migration CI kiểm tra DB clean và upgrade từ baseline fixture, SQL lint/check nếu công cụ có sẵn.

Defaults retention cần quán xác nhận D04: idempotency 24h; claim 24h; rate-limit buckets tối đa 48h;
audit 180 ngày; PII order/reservation 90 ngày sau terminal rồi anonymize; dữ liệu tiền/món giữ
theo chính sách kinh doanh/pháp lý đã chốt, không tự hard-delete. Số liệu này là default kỹ thuật,
không khẳng định yêu cầu pháp luật. Cron server job có dry-run, metrics và retry; không client cleanup.
Account deletion detach owner, xóa địa chỉ/favorites/profile và xử lý PII snapshots theo policy;
không cascade xóa order/payment. Auth failure được retry qua deletion_jobs; tất cả API chặn account deleting.
