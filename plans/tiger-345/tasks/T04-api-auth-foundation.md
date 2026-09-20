# T04 — HTTP contracts, auth và hạ tầng API

Status: DONE
Phụ thuộc: T03
Loại bàn giao: code + tests + `../reports/T04.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

Ba Edge Functions public/customer/admin dùng shared runtime. Chưa có endpoints nghiệp vụ; mọi endpoint sau dùng cùng auth/errors/limits.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 02-architecture.md B/G; 04-api-contracts.md A/E; 03-database.md C/D.
- Diff hiện tại của files định sửa; report dependency T03.

## Phạm vi sở hữu

supabase/functions/{public-api,customer-api,admin-api}/; supabase/functions/_shared/; src/lib/api/; src/features/auth/ session provider; src/app/providers; scripts server/test; migrations rate_limit_buckets; tests/server và integration/auth.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Cài Supabase SDK/server-state client và Zod contracts theo docs, pin Deno dependencies; typecheck:server/test:server.
2. Transport errors/request IDs/CORS/body limit/rate-limit persisted atomic, auth optional không token=guest, bearer invalid=401.
3. Admin verify user JWT + active profile mỗi request; customer requests reject deleting profile khi field có giá trị.
4. Frontend API wrapper distinguish timeout/4xx/retry; không auto retry mutation key mới; query cache ownership/user isolation.
5. Session provider và route boundaries nền, lazy layouts, 404; chưa cần public login UI. Admin login UI do T08.
6. Create contract schemas/envelopes, safe DTO conventions, semantic hash utility, signed token utility có kid/expiry; no secrets client bundle.
7. Test real disabled admin/auth expiration/anon và concurrent rate limit; documentation env local mail/auth setup.

## Acceptance criteria

- Guest được gọi endpoint public mẫu, invalid bearer không biến guest; disabled admin bị deny ngay.
- Server typecheck thực, client build không service key/server modules.
- Rate limit hoạt động qua nhiều requests, logs không body/tokens/PII.

Test matrix: V05,V25 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run typecheck:server
npm run test:server
npm run test:integration -- tests/integration/auth.test.ts
npm run test:policies
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Không login proxy password, không public admin provisioning.

## Rollback

Disable functions mới, giữ deny policies; rollback providers không chuyển fake success.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T04.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
