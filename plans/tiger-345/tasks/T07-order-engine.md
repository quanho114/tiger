# T07 — Quote và transaction order dùng chung, bắt đầu dine-in

Status: DONE
Phụ thuộc: T05, T06
Loại bàn giao: code + tests + `../reports/T07.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

Public catalog và table capabilities đã có. Xây trusted order engine, delivery adapter thêm T10; không chấp nhận delivery sớm với luật thiếu.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 02-architecture.md C–G; 03-database.md D; 04-api-contracts.md A/B.
- Diff hiện tại của files định sửa; report dependency T05, T06.

## Phạm vi sở hữu

migrations quote/order RPC; public-api order-quotes/orders; _shared contracts/order utilities; tests/integration/orders*.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Quote signed TTL 5 phút, actor/context/items/notes/prices; server tính totals, không accept client total.
2. Một RPC atomic idempotency + validate + snapshot + order/items/history + replay response. Dine-in no PII, table/visit derived capability.
3. Recheck table/visit/flags/hours/menu modes/availability và quote prices trong transaction với lock order.
4. Unknown delivery type hiện trả unsupported cho tới T10, không silently dùng dine-in rules.
5. Replay minimal same receipt kể cả quote expired/quán đóng sau commit; payload/actor khác conflict; hash canonical normalized lines.
6. Test simultaneous duplicate, insert failure rollback, giá đổi/stock toggle/closed visit, request injection owner/status/price, snapshot không đổi sau sửa menu.

## Acceptance criteria

- Chỉ một order cho cùng intent, không order rỗng hoặc history lẻ sau rollback.
- Receipt pending sau commit, retry lost response không cần key mới.
- DB audit/status/history/amount snapshots nhất quán; unknown fields sensitive rejected.

Test matrix: V08,V09,V10 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run test:integration -- tests/integration/orders.test.ts
npm run test:server
npm run typecheck:server
npm run test:policies
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Chưa UI checkout, claim secret hỗ trợ sau bằng migration T18, payment transitions T17.

## Rollback

Tắt intake server, giữ đã nhận orders; rollback compatible code, không delete giao dịch.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T07.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
