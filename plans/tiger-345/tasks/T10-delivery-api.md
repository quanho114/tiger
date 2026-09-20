# T10 — Delivery quote/create và luật vùng giao

Status: DONE
Phụ thuộc: T09
Loại bàn giao: code + tests + `../reports/T10.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

Order engine chung đã chứng minh dine-in; bổ sung context delivery mà không tạo bảng/engine khác.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 02-architecture.md D/H; 03-database.md B/D; 04-api-contracts.md B.
- Diff hiện tại của files định sửa; report dependency T09.

## Phạm vi sở hữu

public-api quote/order adapter; migrations delivery RPC updates; shared schemas; tests/integration/delivery*.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Validate customer name/phone/address/active fixed-price zone, min order, hours/flags, allow_delivery.
2. Server fee threshold nullable, tính lại quote/fee/version; ngoài vùng không tạo order phí 0.
3. Snapshot name/phone/address/zone label, no table/visit; auth owner server supplied.
4. Shared transaction/idempotency unchanged semantics, không copy logic sang delivery_orders.
5. Delivery transition graph admin hỗ trợ delivering, reject served; test changed zone fee/disable/minimum/time/races.

## Acceptance criteria

- Guest/customer đều order được đúng context, không thiếu field hoặc fake owner.
- Fee/price change yêu cầu consent mới; old orders không đổi khi zone/profile update.
- Dine-in tests vẫn đạt sau thêm delivery.

Test matrix: V10,V14 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run test:integration -- tests/integration/delivery.test.ts tests/integration/orders.test.ts
npm run typecheck:server
npm run test:server
npm run test:policies
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Không maps/geocoding, no variable/manual fee checkout.

## Rollback

Tắt delivery flag, dine-in tiếp tục; giữ delivery orders đã nhận.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T10.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
