# T19 — Xóa account và retention có retry

Status: DONE
Phụ thuộc: T18
Loại bàn giao: code + tests + `../reports/T19.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

Full customer data/history/claim có thật; deletion phải an toàn qua Auth API + DB không chung transaction.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 02-architecture.md G; 03-database.md E; 04-api-contracts.md D; 08-decisions.md D04.
- Diff hiện tại của files định sửa; report dependency T18.

## Phạm vi sở hữu

deletion_jobs migration; customer-api delete; server cleanup job/cron guarded; account profile delete UI; tests privacy; docs runbook.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Recent auth + explicit delete confirm; mark deleting trước để API deny ngay, job idempotent retryable.
   Active admin bị chặn self-service delete; không xóa admin cuối cùng qua endpoint customer.
2. Revoke/ban auth session access server-side, cleanup addresses/favorites/profile, detach order/reservation ownership, delete auth khi hoàn tất.
3. PII snapshots anonymize theo approved retention; no cascade order/payment loss; audit metadata không copy PII.
4. Retention scheduler dry-run/execution, cleanup idempotency/claim/rate counters TTL; no unauthenticated cron endpoint.
5. Test auth provider failure/retry/partial workflow và active old token blocked; UI pending/delete fail actionable.
6. D04 chưa chốt -> local dry-run/default fixture only, production cleanup disabled rõ.

## Acceptance criteria

- Delete không chỉ logout; user không truy cập được API trong khi cleanup retry.
- Business history giữ financial snapshots, PII xử lý theo policy có evidence.
- Cron endpoint/service creds không public, job chạy lại không phá dữ liệu.

Test matrix: V23 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run test:integration -- tests/integration/privacy.test.ts
npm run test:e2e -- tests/e2e/account-delete.spec.ts
npm run test:policies
npm run typecheck:server
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Không tự xác định thời hạn pháp lý; không chạy destructive cleanup production.

## Rollback

Pause cleanup worker, giữ deleting accounts blocked; phục hồi bằng runbook, không tự restore toàn DB.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T19.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
