# T18 — Guest order claim an toàn sau login

Status: DONE
Phụ thuộc: T17
Loại bàn giao: code + tests + `../reports/T18.md`; đã hoàn thành và kiểm thử thực tế.

## Context đủ để bắt đầu

Guest checkout và customer history đã chạy. Thêm claim không dùng mã đơn hay phone làm chứng thực.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 02-architecture.md G; 03-database.md guest_order_claims/D; 04-api-contracts.md B/D.
- Diff hiện tại của files định sửa; report dependency T17.

## Phạm vi sở hữu

guest_order_claims migration; create-order RPC additive change; customer-api claim; receipt/auth callback integration; tests claims.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Client sinh 32-byte secret trước guest create, sessionStorage gắn idempotency; gửi HTTPS body, server hash-only, TTL24h.
2. Create transaction lưu claim hash cùng order; idempotency semantic hash gồm claim hash, replay minimal receipt không cần trả secret.
3. Authenticated claim atomic lock/hash/expiry/unclaimed; same owner same secret retry success, other owner deny.
4. Receipt optional login CTA và callback claim cùng tab, lost secret không fallback code/phone; no guest reservation claim.
5. No raw secrets URL/log/audit, token không phải public order lookup credential.

## Acceptance criteria

- Lost create response -> retry -> login -> claim vẫn được bằng secret client giữ.
- Hai user claim concurrent chỉ một owner; wrong/expired token và code-only bị reject.
- Sau claim history xuất hiện đúng user, private fields không leak, auth cart không mất.

Test matrix: V22 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run test:integration -- tests/integration/claims.test.ts
npm run test:e2e -- tests/e2e/claim.spec.ts
npm run test:policies
npm run typecheck:server
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Không claim by phone/email match, không guest tracking polling.

## Rollback

Disable claim CTA/API, guest orders vẫn nguyên và không public readable.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T18.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
