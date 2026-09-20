# Quyết định và thông tin còn cần từ quán

Các default dưới đây giúp agent làm local ngay, không phải hỏi lại các lựa chọn kỹ thuật mỗi task.
Những giá trị ảnh hưởng vận hành thật phải xác nhận trước production, không chặn code/test local.

## Đã chốt theo user

- Một nhà hàng; React/Vite; Supabase DB/Auth/Storage/Edge Functions.
- Guest dùng tất cả luồng giao dịch; login optional, một quyền Admin.
- Một orders engine cho dine-in/delivery, snapshot server, manual reservation confirmation.
- Account/favorites/addresses/history/reorder/frequent dishes trong scope đầy đủ.
- Không role hierarchy, POS, inventory, gateway, AI hoặc microservice.
- Lượt này chỉ viết Markdown; coding do agent khác, reviewer trở lại sau.

## Default thiết kế để triển khai

- Vercel theo config repo; admin poll 15s; guest không status polling; customer poll 15s.
- Một visit mở/bàn; mỗi lần gọi thêm tạo order mới; không chuyển/ghép bàn hoặc split bill v1.
- Public menu dine-in vẫn xem được khi không QR; gửi món bắt buộc capability visit hợp lệ.
- QR tĩnh + admin xác nhận; không tuyên bố chống gọi món từ xa tuyệt đối.
- Admin thanh toán thủ công, có paid/refunded/correction audit; completed cần paid.
- Claim guest order 24h bằng secret client sinh trước create; guest reservation không claim v1.
- Auth email magic link/OTP và Google; admin email/password; phone OTP ngoài scope.
- Cart TTL 24h, quote 5 phút, capability visit 4h, idempotency 24h.
- Không loyalty/discount; không birthday; newsletter không hoạt động cho tới dự án khác.
- Default giờ/cutoff/guest limit/retention ở architecture/database, tất cả gắn nhãn demo khi seed.

## Trước production cần xác nhận

| ID | Nội dung | Local default / hành vi nếu chưa có |
|---|---|---|
| D01 | Menu thật/giá/ảnh, số bàn/khu vực, giờ/nghỉ, vùng giao/phí/minimum, reservation limits | Seed demo, không publish nhận khách thật |
| D02 | Chấp nhận QR chia sẻ vẫn gửi pending khi visit open? | Có ở demo; nếu không, thêm visit PIN/join approval task và test trước live |
| D03 | Domain/origins, Supabase/Vercel project, Google OAuth, SMTP, recovery admin | Local Supabase mail inbox; Google disabled có lý do, không fake login |
| D04 | Retention PII/transaction, backup RPO/RTO và người chịu trách nhiệm | Đề xuất RPO <=24h, RTO <=4h; kiểm tra gói dịch vụ đáp ứng, diễn tập restore |
| D05 | Ai trực admin/gọi khách, thời gian phản hồi, phương thức/chi tiết chuyển khoản | Demo phản hồi 10 phút; không đưa số tài khoản ngân hàng giả |
| D06 | Admin bootstrap/recovery, chấp nhận điều kiện release và lịch triển khai | CLI local; không tự tạo admin production hoặc deploy |

Trạng thái D01–D06: CHƯA XÁC NHẬN. Coding agent không tự đánh dấu đã chốt từ seed.
Không hỏi secret trong chat/report. Hướng dẫn chủ dự án cấu hình secret trong dashboard/env bảo mật.

## Khi đổi quyết định

Ghi ngày, user instruction, lý do, docs/tasks bị ảnh hưởng, migration/backward compatibility.
Không thay enum/state/DTO chỉ trong một task mà không cập nhật contracts/tests.
Nếu estimate quá lớn, tách task thành suffix a/b với exit gate; không bỏ case bảo mật để giảm quota.
