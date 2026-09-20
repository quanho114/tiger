# Tiger 345 — bộ tài liệu giao việc

Ngày lập: 2026-09-19. Chỉ có review và kế hoạch; chưa triển khai hệ thống.
Áp dụng cấu trúc lập kế hoạch từ skill ECC blueprint; theo yêu cầu tiết kiệm quota của user,
không gọi sub-agent. Bộ tài liệu đã tự kiểm tra, chưa có review độc lập sau coding.
Tài liệu này thay thế quyết định kiến trúc trong `../system-review-and-roadmap.md`.
Scope cuối: guest + customer tùy chọn, một quyền Admin, gọi món QR tại bàn,
giao hàng, đặt bàn, account và personalization từ lịch sử thật.

## Cách dùng để tiết kiệm quota

1. Cho agent đọc file này, task được giao và đúng các mục tài liệu task dẫn tới.
2. Mỗi lượt chỉ làm một task. Không yêu cầu đọc lại toàn repo hoặc tự thiết kế lại hệ thống.
3. Làm tuần tự theo [roadmap](07-roadmap.md). Không tự spawn agent.
4. Agent cập nhật trạng thái task và viết báo cáo theo [mẫu](reports/TEMPLATE.md).
5. Khi xong, gửi reviewer task IDs, commit/diff và báo cáo. Không chỉ gửi “đã xong”.

Prompt giao việc:

```text
Đọc plans/tiger-345/README.md và plans/tiger-345/tasks/TXX-<name>.md.
Thực hiện đúng task TXX, đọc các tài liệu tham chiếu của task.
Không tự mở rộng scope hoặc spawn agent. Không revert thay đổi của người khác.
Hoàn thành code và checks của task, cập nhật trạng thái, ghi reports/TXX.md
theo reports/TEMPLATE.md. Nêu rõ checks chưa chạy và dependency bị thiếu.
Không deploy production, mua dịch vụ hay tạo tài khoản ngoài nếu chưa được giao.
```

## Tài liệu chuẩn

| File | Dùng để làm gì |
|---|---|
| [01-codebase-review.md](01-codebase-review.md) | Bằng chứng từ code hiện tại; file nào cần giữ/sửa |
| [02-architecture.md](02-architecture.md) | Scope, ranh giới module, quy tắc nghiệp vụ |
| [03-database.md](03-database.md) | Bảng, constraints, RLS, transaction/concurrency |
| [04-api-contracts.md](04-api-contracts.md) | Input/output, auth, lỗi, quyền endpoint |
| [05-ui-flows.md](05-ui-flows.md) | Routes, admin wireframe, trạng thái và UX |
| [06-verification.md](06-verification.md) | Test matrix, commands, release gates |
| [07-roadmap.md](07-roadmap.md) | Thứ tự và dependency task |
| [08-decisions.md](08-decisions.md) | Default triển khai, thông tin vận hành cần xác nhận |

Thứ tự ưu tiên: chỉ dẫn mới của user > quyết định cập nhật trong bộ này > task > plan cũ.
Nếu tài liệu mâu thuẫn, ghi rõ và cập nhật contract trước khi thay đổi implementation.
Không âm thầm thay scope “customer optional” thành bắt login hoặc mở thêm role.

## Quy tắc chung cho agent coding

- Kiểm tra git status khi bắt đầu. Đã có thay đổi của user ở ContactHub.tsx,
  LocationPage.tsx và tiger.svg; đọc diff trước khi chạm, không xóa/revert chúng.
- Giữ React/TypeScript/Vite, kiểu dáng public và các trang hiện có. Refactor theo tính năng.
- Backend dùng Supabase Edge Functions + PostgreSQL RPC cho transaction; auth dùng Supabase Auth.
- Một quyền Admin dựa trên admin_profiles.active. Tự đăng ký customer không bao giờ tạo admin.
- Không dùng dữ liệu mock làm fallback thành công khi API lỗi hoặc thiếu env.
- Không ghi trực tiếp bảng nghiệp vụ từ browser. Customer reads dùng DTO whitelist.
- Không đổi migration đã áp dụng; thêm migration tiếp theo. Không reset database ngoài local test.
- Không thêm AI, POS, loyalty, gateway thanh toán, CRM, nhiều chi nhánh hoặc hệ thống role.
- Một task sở hữu migration mới của nó; schema/API thay đổi phải cập nhật docs và dependent tests.
- Nếu thiếu credentials, hoàn tất phần local và ghi BLOCKED cho kiểm tra ngoài; không giả báo đạt.
- Chỉ chạy suite bị ảnh hưởng + lint/typecheck/build; full matrix ở T20. Không chạy lặp vô ích.
- Không gọi npm audit fix/update toàn bộ dependency ngoài scope. Lockfile do package manager tạo.

## Định nghĩa hoàn thành task

Code được tích hợp vào route/API thật, tests cần thiết đạt, lỗi/permission cases có kiểm tra,
không còn TODO bắt buộc, báo cáo có bằng chứng. Mock-only UI không hoàn thành task nối backend.
Status dùng TODO / IN_PROGRESS / BLOCKED / DONE. Tất cả task đang TODO khi lập kế hoạch.
DONE là kết quả coding tự kiểm tra; reviewer sau này vẫn cần xác nhận chất lượng.
