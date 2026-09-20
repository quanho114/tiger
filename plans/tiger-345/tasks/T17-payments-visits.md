# T17 — Thanh toán thủ công, hoàn tất và đóng phiên

Status: DONE
Phụ thuộc: T16
Loại bàn giao: code + tests + `../reports/T17.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

Order statuses đã có nhưng completed cần paid; hoàn thiện payment events/visit settle và tránh race gọi thêm.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 02-architecture.md E/F; 03-database.md D; 04-api-contracts.md C.
- Diff hiện tại của files định sửa; report dependency T16.

## Phạm vi sở hữu

payment/visit RPC migrations; admin-api payment/settle/close; admin order/table UI; tests integration/payment and e2e visit lifecycle.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Delivery settle paid đầy đủ theo order; dine-in settle tất cả unsettled order expected IDs/versions trong visit, no partial.
2. Payment events append-only, audit, idempotency; method cash/bank_transfer/manual verification.
3. Paid correction/refund đúng allowed states/reason; cannot cancel paid before refund; completed requires paid, close requires terminal.
4. Lock consistent với create/order transition; concurrent new order không được đánh paid ngoài expected list; return conflict/current totals rõ.
5. UI tổng unpaid/paid theo visit, settlement confirm, no fake transfer auto-paid, close warnings.

## Acceptance criteria

- Hai đợt gọi -> served -> settle -> completed -> close -> new visit không lẫn tiền.
- Settle double click/timeout không nhân event; settle/create/close races an toàn.
- Paid cancel/refund/correction và zero-total order có audit, không sửa/xóa lịch sử payment.

Test matrix: V18 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run test:integration -- tests/integration/payments.test.ts
npm run test:e2e -- tests/e2e/visit-lifecycle.spec.ts
npm run typecheck:server
npm run test:policies
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Không POS hóa đơn thuế/split bill/online gateway/refund completed tự động.

## Rollback

Tắt payment UI và intake nếu không thể hoàn tất; giữ events, forward fixes thay xóa số liệu.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T17.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
