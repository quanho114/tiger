# T08 — Admin login, inbox, bàn và chuyển trạng thái

Status: TODO
Phụ thuộc: T07
Loại bàn giao: code + tests + `../reports/T08.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

Order engine nhận pending thật. Cần admin tối thiểu để vertical slice dùng được ngay, trước account UI.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 04-api-contracts.md C/E; 05-ui-flows.md admin; 02-architecture.md E/F.
- Diff hiện tại của files định sửa; report dependency T07.

## Phạm vi sở hữu

admin-api dashboard/orders/transitions/note + migrations RPC; src/features/admin/{layout,auth,dashboard,orders,tables}/; src/app/router; tests admin.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Admin email/password qua SDK, active check server, route/layout riêng, 401/403 handling và logout.
2. Inbox all/dine-in/delivery, pagination/filter/detail, timeline/note, actions đúng state graph + version + audit.
3. Basic tables screen mở visit, hiển thị raw QR link một lần cho demo, list orders visit; close disabled nếu chưa đủ luật.
4. Toggles tạm dừng nhận đơn và món available tối thiểu để vận hành slice; APIs versioned audit, T13 mở rộng editor.
5. Poll 15s khi visible, timestamp và stale/error/manual refresh; counters distinct visits.
6. Chưa có payment UI T17 thì completed trả PAYMENT_REQUIRED; không fake paid để demo.

## Acceptance criteria

- Admin thật thấy pending từ API và confirm/preparing/served; customer không vào được API dù gọi trực tiếp.
- Hai tabs transition cùng version một 409; state graph sai type bị reject.
- Public cart/chat/footer không render trong admin, deep link/reload hoạt động.

Test matrix: V11,V24 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run test:integration -- tests/integration/admin-orders.test.ts
npm run test:e2e -- tests/e2e/admin-queue.spec.ts
npm run typecheck:server
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Không role/customer management; chưa full content settings/payment UI.

## Rollback

Tắt intake nếu admin không tiếp nhận được; rollback UI nhưng giữ DB/order.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T08.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
