# T01 — Nền frontend, strict types và test harness

Status: DONE
Phụ thuộc: Không
Loại bàn giao: code + tests + `../reports/T01.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

Demo hiện có fake success ở CartDrawer, ReservationPage, Footer; chưa có test runner hay strict TS. Đây là task nền, chưa tạo database.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 01-codebase-review.md; 02-architecture.md mục A/B; 05-ui-flows.md mục accessibility; 06-verification.md V01/V02.
- Diff hiện tại của files định sửa; report dependency Không.

## Phạm vi sở hữu

package.json/package-lock.json; tsconfig*.json; vite.config.ts; src/components/ui/; src/components/CartDrawer.tsx; src/pages/ReservationPage.tsx; src/components/Footer.tsx; tests/unit/; tests/e2e/smoke.spec.ts; test configs; .github/workflows/ci.yml.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Bật strict ở app/node config, sửa type errors thực; không any/cast để lách.
2. Thêm Vitest/Testing Library và Playwright runner, scripts test:unit/test:e2e, browser smoke 4 routes. Thiết lập shared contracts pure TS/Zod và alias tương thích frontend; server check sẽ thêm T04.
3. Bỏ fake confirmation: khi backend chưa có, hiển thị demo/chưa nhận online và liên hệ quán. Bỏ form newsletter giả, không tạo marketing backend.
4. Tạo shared accessible Dialog/Field đủ dùng, sửa cart đóng còn tabbable, menu dialog focus và form labels. Không tạo design system quá lớn.
5. Helper date VN/phone validation, normalize theo rule; test trước 07:00 VN, phone không hợp lệ. Không giả browser date là server validation.
6. Xác minh import graph và dọn components/assets/CSS không dùng; giữ user changes và brand. Không tự xóa root tiger.svg của user.

## Acceptance criteria

- Strict typecheck/build đạt; không API vẫn không hứa đã nhận món/bàn/email.
- Dialog keyboard focus/escape/restore/hidden tab order đạt; smoke desktop và mobile.
- Các scripts test chạy được từ cold npm ci; CI thêm unit/smoke phù hợp, không browser download ẩn ngoài setup.

Test matrix: V01,V02 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run lint
npm run typecheck
npm run build
npm run test:unit
npm run test:e2e -- tests/e2e/smoke.spec.ts
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Chưa auth/DB/cart persistence/backend; không redesign landing.

## Rollback

Revert code/config của task, không có migration.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T01.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
