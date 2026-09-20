# T03 — Schema customer, ownership và chính sách DB

Status: DONE
Phụ thuộc: T02
Loại bàn giao: code + tests + `../reports/T03.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

Core đã có RLS deny. Thêm customer entities và kiểm chứng không có đường tự nâng admin hoặc đọc PII qua PostgREST.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 03-database.md A/C/E; 04-api-contracts.md C/D/E; 06-verification.md V04.
- Diff hiện tại của files định sửa; report dependency T02.

## Phạm vi sở hữu

supabase/migrations/ mới; scripts/admin-bootstrap*; tests/policies/; tests/fixtures/; generated DB types.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Tạo customer_profiles/addresses/favorites, default address partial unique, profile signup trigger an toàn/idempotent.
2. Định nghĩa grants/RLS rõ: API-only private reads/writes, public projections nếu cần. Không SELECT * orders cho authenticated.
3. Audit/events append-only từ client; RPC privileges deny mặc định. Public catalog không unpublish/category inactive.
4. CLI bootstrap/deactivate admin trusted, bảo vệ admin cuối, không HTTP public và không suy role từ auth metadata.
5. Fixtures guest/customer A/B/admin/disabled admin; tests raw PostgREST/table/RPC ACL và default-address ownership.

## Acceptance criteria

- Customer signup không thành admin, metadata admin=true vô hiệu.
- Anon/authenticated không truy cập private/business writes; service-only RPC không gọi bằng anon.
- Deleting auth user không cascade mất orders; addresses/favorites cleanup theo FK.

Test matrix: V04,V19 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run db:reset:test
npm run test:policies -- tests/policies
npm run test:integration -- tests/integration/schema.test.ts
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Không UI account/admin management.

## Rollback

Forward migration bảo toàn history; rollback UI/API không nới RLS.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T03.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
