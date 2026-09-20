# T15 — Login optional và auth callback

Status: DONE
Phụ thuộc: T14
Loại bàn giao: code + tests + `../reports/T15.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

Session provider/API có nền; thêm public login Google/email, giữ guest checkout và draft.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 04-api-contracts.md E; 05-ui-flows.md account; 08-decisions.md D03.
- Diff hiện tại của files định sửa; report dependency T14.

## Phạm vi sở hữu

src/features/auth/; src/app/router/providers; Header login links; login/callback pages; checkout optional prompt; tests auth.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Google OAuth PKCE và email magic link/OTP qua Supabase, allowlisted redirect và safe returnTo internal.
2. No popup login forced; guest checkout vẫn đầy đủ; auth loading/error/expired/recovery UI.
3. Login retains cart/table context, quote reissued under new actor; clear private cache/PII on logout or account change.
4. Local email inbox integration; Google credentials missing -> explicit unavailable, không fake success; config guide dashboard.
5. Customer session không cấp admin chỉ qua URL; reject disabled admin ở admin login.

## Acceptance criteria

- Email login local thật -> callback -> intended route, draft còn nguyên.
- External returnTo blocked, token/code không log/query linger; expired token không guest silent fallback.
- Session user A->B không flash data A, guest flows còn chạy.

Test matrix: V13,V19 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run test:e2e -- tests/e2e/auth.spec.ts
npm run test:unit -- src/features/auth
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Không tự đăng ký Google project/mua SMTP; Google live check BLOCKED nếu chưa cấu hình.

## Rollback

Hide optional login links, guest remains; invalidate private query caches.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T15.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
