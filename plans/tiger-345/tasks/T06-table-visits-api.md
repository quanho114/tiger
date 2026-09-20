# T06 — QR bàn, capability và phiên phục vụ API

Status: DONE
Phụ thuộc: T04
Loại bàn giao: code + tests + `../reports/T06.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

dining_tables/QR/visits đã có schema; thêm lifecycle để order không chỉ gắn table_id.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 02-architecture.md C/F; 03-database.md B/D; 04-api-contracts.md B/C.
- Diff hiện tại của files định sửa; report dependency T04.

## Phạm vi sở hữu

migrations table/visit RPC; public-api tables resolve; admin-api tables/visits handlers; tests/integration/tables*.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Admin table create/update, QR create/rotate random token hash-only trả một lần; no hard delete history.
2. Open one visit/table, close validate terminal/payment state, version/epoch; deactivate table có open visit bị reject.
3. Resolve POST token -> signed capability visit/table/QR/epoch/exp; validate DB active và lifecycle, rate limit.
4. Rotate QR revoke old capabilities atomically; QR download semantics one-time, no plaintext DB.
5. Lock order và race tests open twice, resolve/rotate/close, closed visit cannot accept future mutations.

## Acceptance criteria

- Hai request mở cùng bàn chỉ một visit; token đoán/sai/old đều bị deny.
- Capability không cấp quyền đọc orders hoặc PII; expired/closed/revoked bị từ chối.
- Không quảng cáo QR tĩnh chứng minh hiện diện, limitation ghi docs.

Test matrix: V07 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run test:integration -- tests/integration/tables.test.ts
npm run test:policies
npm run typecheck:server
npm run test:server
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Chưa QR frontend hoặc PDF; basic tables UI T08, hoàn thiện T13.

## Rollback

Tắt dine-in intake; revoke capability epoch; không xóa visit/order history.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T06.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
