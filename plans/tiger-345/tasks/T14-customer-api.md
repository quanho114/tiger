# T14 — Profile/history/address/favorite/reorder APIs

Status: DONE
Phụ thuộc: T13
Loại bàn giao: code + tests + `../reports/T14.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

Customer schema có từ T03, auth verify có T04, giao dịch thật đã có. Thêm private DTOs và account reads/writes.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 04-api-contracts.md D; 02-architecture.md G; 03-database.md C.
- Diff hiện tại của files định sửa; report dependency T13.

## Phạm vi sở hữu

customer-api handlers; account RPC migrations; shared customer DTO/contracts; tests/integration/customer*; tests/policies ownership.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Own profile allowlist, addresses version/default atomic, favorite PUT/DELETE idempotent.
2. Own orders/reservations list/detail DTO whitelist, safe timeline; customer cancellation đúng state/cutoff/version.
3. me/home bounded aggregates, frequent only completed, deterministic tie, exclude unpublished và deleted item IDs.
4. Reorder own source ID/current context, current menu/price/availability warnings, không copy table cũ hay giá cũ.
5. Explicit user filter ngay cả service-role queries; all path IDs test user B, never SELECT * response.

## Acceptance criteria

- A không đọc/sửa B, auth admin không tự bypass customer ownership endpoint.
- Không internal_note/admin IDs/claim hash/PII khác trong JSON, public cache không lưu private.
- Default address race unique đúng; history snapshot và reorder current values khác đúng khi giá đổi.

Test matrix: V04,V16,V20,V21 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run test:integration -- tests/integration/customer.test.ts
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

Chưa claim/delete API và customer UI; không recommendations AI.

## Rollback

Disable private account endpoints, guest order engine tiếp tục; không làm lộ DB direct reads.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T14.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
