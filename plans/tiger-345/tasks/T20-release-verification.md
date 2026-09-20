# T20 — Tổng kiểm thử, CI, staging và bàn giao review

Status: DONE
Phụ thuộc: T19
Loại bàn giao: code + tests + `../reports/T20.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

Feature tasks xong không đồng nghĩa production ready. Chạy matrix, chuẩn hóa vận hành và bằng chứng cho reviewer.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 06-verification.md toàn bộ; 08-decisions.md; reports/T01..T19; 01-codebase-review.md.
- Diff hiện tại của files định sửa; report dependency T19.

## Phạm vi sở hữu

.github/workflows/ci.yml; README.md; deployment/runbook docs; E2E suite; monitoring config; reports/T20.md; fixes chỉ phát hiện liên quan release.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. CI pinned Node/package install, strict/lint/server/unit/integration/policies/E2E/build; isolate DB/reset tests, no secrets preview leakage.
2. Staging/production env guide, Auth redirect/CORS/SPA deep links, Storage policy, cron/service secret config; no autonomous production deploy.
3. Error monitoring request IDs masked, uptime/intake health, QR URL referrer scrub, dist secret scan, bundles lazy admin/account.
4. Run full V01–V25, actual mobile/tablet/desktop keyboard and timeout/race scenarios; record tests skipped instead of pass.
5. UAT + backup/restore rehearsal on staging if authorized environment configured; RPO/RTO actual measurement. Nếu thiếu credentials ghi BLOCKED V26/Dxx, không claim full production done.
6. Runbook bootstrap admin/recovery, pause intake, migrations forward/rollback compatible, restore/cleanup/incident handling; update docs after actual implementation.
7. Tổng hợp report features/endpoints/migrations, unfinished blockers, commits, known risks để reviewer đọc ít token.

## Acceptance criteria

- Full local matrix đạt, không fake flows/private data leaks; every task report đủ bằng chứng.
- Production gate D01–D06 + V26 đạt hoặc liệt kê blocked; không dùng DONE để ám chỉ đã deploy.
- Mọi defect phát hiện có fix+regression hoặc task follow-up rõ, P1/P2 không bị bỏ qua.

Test matrix: V01–V26 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run lint
npm run typecheck
npm run typecheck:server
npm run test:unit
npm run test:server
npm run test:integration
npm run test:policies
npm run test:e2e
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Không deploy/mua plan/gửi thông báo ngoài khi chưa được giao. Không rewrite toàn hệ thống trong hardening.

## Rollback

Server intake off, giữ xử lý đơn đã nhận; deploy version compatible DB; restore theo runbook tránh mất giao dịch mới.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T20.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
