# Kiến trúc và quy tắc nghiệp vụ

## A. Scope

Một website, một menu, một orders engine. Guest dùng menu/QR/delivery/reservation.
Customer tùy chọn dùng Google hoặc email magic link/OTP, account/history/favorites/addresses/reorder.
Admin email/password, một quyền; không tự đăng ký admin, không UI role/nhân viên/CRM.
Không account gate cho giao dịch; API có bearer sai phải 401, không âm thầm tạo guest.
Customer personalization làm sau dữ liệu order. QR dine-in là vertical slice đầu.

Các quyết định từng có ở plan cũ (guest-only, owner/manager/staff) đã được thay thế.

Không làm: payment gateway, inventory, POS, split bill, chuyển bàn/ghép bàn tự động,
loyalty/voucher, AI, đa chi nhánh, driver app, SMS OTP, automated table allocation.
Newsletter hiện tại bỏ chức năng giả; marketing_opt_in không có nghĩa đã tích hợp newsletter.

## B. Stack và module

React + TypeScript strict + Vite + React Router hiện có; TanStack Query cho server state,
Context/reducer cho cart; Zod cho runtime contract. Không Redux, không generic repository layer.
Supabase PostgreSQL/Auth/Storage, Edge Functions Deno; SQL RPC làm transaction.
Vercel là hosting mặc định theo repo. Không thiết lập thêm Cloudflare song song.
Vitest/Testing Library, @playwright/test và local Supabase để integration/policy tests.
Pin phiên bản tương thích trong lockfile khi triển khai, không ghi phiên bản phỏng đoán ở plan.

```text
src/app/                         router, layouts, providers
src/features/catalog/            public menu + catalog types/hooks
src/features/cart/               draft persistence/reducer
src/features/ordering/           shared quote/receipt, dine-in, delivery
src/features/table-session/      QR resolve, visit capability
src/features/reservations/       request/history
src/features/auth/               Supabase session/login/callback
src/features/account/            profile/address/favorites/history/reorder
src/features/admin/              queue/orders/tables/reservations/catalog/settings
src/components/ui/               field/dialog/button/table/feedback
src/lib/                         API/date/money/query keys
supabase/functions/_shared/      auth/errors/validation/rate-limit/contracts
supabase/functions/public-api/   router cho public API
supabase/functions/customer-api/ router cho /me API
supabase/functions/admin-api/    router cho admin API
supabase/migrations/             versioned DDL/RPC/RLS
tests/                          unit/integration/policies/e2e
```

Ba Edge Functions là đủ, không một function cho mỗi endpoint. Shared contract đặt ở
`supabase/functions/_shared/contracts/`, chỉ pure TS/Zod tương thích Deno và Vite;
frontend import type/schema qua adapter, không bundle admin/service secrets hoặc server modules.
T01/T04 cấu hình dependency resolution rõ và test cả runtimes. DB-generated types riêng.

## C. Dine-in và phiên bàn

QR tĩnh `/table/:token` dùng random 32 bytes base64url. DB chỉ giữ SHA-256 hash.
Admin mở `table_visits`, mỗi bàn tối đa một visit open. Mỗi lần gọi thêm là order mới
thuộc visit đó; không gộp sửa order đã xác nhận. Khách không chọn table_id tùy ý.

Resolve QR kiểm tra token/table active và visit open; trả table label + capability ký
HMAC có visit_id, table_id, qr_token_id, epoch, expires_at. TTL mặc định 4 giờ, chỉ trong
sessionStorage. Server vẫn kiểm tra DB active/open/epoch lúc tạo order, không tin chữ ký một mình.
Đóng visit, rotate QR hoặc tăng epoch vô hiệu capability. Secret ký chỉ ở server, có kid để rotate.

QR tĩnh có thể bị chia sẻ: default MVP chấp nhận yêu cầu pending khi visit open và admin
xác nhận trước làm món. Không gọi đây là xác minh hiện diện tại quán. Nếu quán không chấp nhận
rủi ro này, thêm mã tham gia theo visit trước production (ngoài default, ghi quyết định D02).
Không dùng GPS/IP như bằng chứng khách có mặt. Rate limit theo trusted IP hash + table/visit.
Order lookup không bao giờ cấp quyền theo table token hoặc visit capability.

## D. Order và quote

Một orders có order_type dine_in/delivery và nullable customer_user_id. Auth identity do server gắn.
Cả hai mode lấy quote server trước submit; snapshot giá server. Quote ký server, TTL 5 phút,
bind items chuẩn hóa/quantities/item notes, mode, visit hoặc zone, giá/phí và actor scope.
Create kiểm tra chữ ký + expiry, tính lại giá/fees/availability trong transaction. Quote không giữ hàng/giá.
Giá/phí đổi → 409 QUOTE_CHANGED, client trình bày giá mới và yêu cầu đồng ý; không auto-submit.
Không chấp nhận total/discount từ client. Không hỗ trợ giảm giá trong v1.
Intake flags/giờ/zone/món/visit phải được kiểm tra tại create, không chỉ tại quote.

Delivery zone chọn từ danh sách; chỉ zone có fixed fee được checkout. Ngoài vùng hướng dẫn liên hệ,
không tạo order với phí giả 0. Phí không đổi sau commit; nếu địa chỉ sai, admin liên hệ và hủy/tạo đơn mới
sau khi khách đồng ý. Lưu phone/address/name/zone label/table label như snapshot lịch sử.

## E. State machine

```text
dine_in: pending -> confirmed -> preparing -> served -> completed
delivery: pending -> confirmed -> preparing -> delivering -> completed
both: pending -> rejected | cancelled; confirmed -> cancelled
reservation: pending -> confirmed | rejected | cancelled
             confirmed -> seated | no_show | cancelled
             seated -> completed
```

Không revert status cuối; sai thao tác tạo audit/chỉnh sửa chuyên biệt nếu sau này có nhu cầu.
Hủy/từ chối cần reason. Version optimistic concurrency bắt buộc mọi admin mutation có tranh chấp.
Customer chỉ hủy reservation của mình ở pending, hoặc confirmed trước starts_at tối thiểu 2 giờ
(default cấu hình). Guest gọi quán để hủy. Customer không tự đổi trạng thái order.
no_show chỉ sau starts_at + grace 15 phút. Admin xác nhận đặt bàn thủ công, không đảm bảo capacity tự động.

## F. Thanh toán tối thiểu

Payment method cash/bank_transfer; không tự xác minh chuyển khoản, không QR ngân hàng động.
Status unpaid/paid/refunded (refunded thêm để tránh không biểu diễn được hủy đơn đã trả).
Lưu payment events: admin, số tiền, method, reason, timestamp; không lưu thông tin tài khoản ngân hàng khách.
Không partial payments/split bill. Delivery đánh dấu trả đủ theo order; dine-in đánh dấu trả đủ
cho tất cả order chưa paid của visit trong một transaction có expected visit version và danh sách order/version.
Settle chỉ gồm orders không cancelled/rejected, chưa paid và đã confirmed trở đi; pending phải
được admin xử lý trước khi settle toàn visit. Refunded order phải cancel hoặc correction theo
luật rõ trước settle; không tự thu tiền lại. UI và RPC trả tập order/tổng thực tế giống nhau.

Served/delivering thể hiện phục vụ; completed chỉ khi paid (đơn giá 0 vẫn cần xác nhận settle 0 có audit).
Cancel/reject order đã paid bị chặn đến khi admin ghi nhận refund thủ công có lý do.
Refund chỉ cho pending/confirmed trước cancel hoặc sửa nhầm payment trước completed;
v1 không refund order completed qua UI, trường hợp đó xử lý ngoài và runbook, không sửa lịch sử lén.
Ghi paid nhầm: audit correction về unpaid trước completed, reason bắt buộc, không xóa events.
Close visit chỉ khi tất cả order terminal và không khoản paid chờ refund; visit rỗng có thể đóng.
Lock visit khi create order/settle/close: request chạy sau settle có thể tạo order mới nếu visit vẫn open;
UI phải báo có đơn mới và yêu cầu thanh toán thêm, không âm thầm đánh paid cho order phát sinh.

## G. Customer, claim và quyền riêng tư

Cart độc lập tài khoản; login không mất cart. Persist version/TTL/items/note/context, không PII,
không dùng giá persist làm nguồn tin. TTL 24 giờ. Dine-in draft bind visit; đổi bàn/mode hỏi trước thay draft.
Logout xóa account query cache, autofill/checkout PII và credentials tạm; giữ draft không PII.
Một customer chỉ xem order mình tạo/claim, không xem toàn bộ bàn. DTO loại internal_note/admin IDs.
Reorder dùng ID/qty từ order mình sở hữu, kiểm tra menu hiện tại + mode mới + quote mới.
Không tự nhập lại địa chỉ order cũ vào saved addresses hoặc copy giá cũ.

Guest claim order trong 24 giờ: browser sinh secret 32 bytes trước create và giữ sessionStorage;
server nhận secret qua HTTPS body, chỉ lưu hash. Secret không xuất hiện trong URL/log/audit.
Client giữ secret qua OAuth redirect cùng tab; nếu mất secret không claim bằng mã/phone đơn thuần.
Claim auth-required, lock row, compare hash, guest owner null -> attach, consume; cùng owner retry
với đúng secret trả thành công, owner khác bị từ chối. Secret hết hạn không có fallback không an toàn.
Idempotency replay response không cần trả secret (client đã giữ), chỉ minimal receipt.
Không tự claim các guest order cũ bằng email/phone trùng. Reservation guest claim ngoài v1.
Guest polling ngoài v1: guest receipt + liên hệ quán; customer có history polling DTO an toàn.

Delete account là workflow: mark deleting để API từ chối ngay, revoke/disable auth,
xóa favorites/addresses/profile, detach owner FK, xử lý snapshots theo retention,
xóa auth identity; retry idempotent vì Auth API và SQL không một transaction chung.
Không lưu birthday trong v1 nếu chưa có nghiệp vụ; marketing_opt_in mặc định false.
Active admin không dùng self-service delete customer; trả lỗi hướng dẫn quy trình trusted
deactivate/recovery riêng để không xóa admin cuối cùng. Profile avatar dùng URL provider đã
kiểm tra hoặc bỏ hiển thị; upload avatar customer ngoài v1, không tái dùng quyền upload ảnh admin.

## H. Giờ hoạt động và giới hạn

Asia/Ho_Chi_Minh cố định v1; DB timestamptz, UI giờ VN. business_hours hỗ trợ nhiều interval/ngày,
chỉ open < close cùng ngày ở v1; quán qua nửa đêm phải cấu hình hai interval hai ngày.
Closure restaurant chặn mọi dịch vụ; closure delivery/reservation chỉ chặn dịch vụ đó.
Dine-in cần restaurant hours; delivery cần restaurant + delivery; reservation toàn khoảng
starts_at..ends_at nằm trong restaurant + reservation hours, không overlap closure.
accepting_orders là master, AND flag mode. booking_enabled độc lập order flags nhưng phụ thuộc lịch.
Defaults kỹ thuật: tối đa 50 dòng, qty 1–99, note 500 ký tự, guest_count 1–30,
reservation notice 60 phút, tối đa 30 ngày, duration 120 phút. Tất cả validate server và UI.
Phone hỗ trợ VN qua normalizer/library được test (+84/0), không xác minh số sở hữu bằng length.
Chính sách phí/menu/giờ thật lấy từ quán ở D01, không seed demo vào production.
