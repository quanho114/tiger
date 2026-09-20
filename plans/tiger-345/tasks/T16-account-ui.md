# T16 — Account và personalization, saved address checkout

Status: DONE
Phụ thuộc: T15
Loại bàn giao: code + tests + `../reports/T16.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

Customer APIs/auth hoạt động. Hiện favorites chỉ local; thêm UI account nhẹ, không admin-style dashboard.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 05-ui-flows.md account; 04-api-contracts.md D; 02-architecture.md G.
- Diff hiện tại của files định sửa; report dependency T15.

## Phạm vi sở hữu

src/features/account/; account routes; HomePage small personalization; MenuPage favorites adapter; delivery saved-address selection; tests account.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Overview/recent/frequent/favorites/upcoming, paginated orders/detail/reservations/cancel/profile/addresses.
2. Saved address chọn để fill checkout, input vẫn editable; không gửi address ID user khác hoặc update lịch sử.
3. Reorder review unavailable/price/mode changes, build fresh draft + quote; confirm replacement existing cart.
4. Favorites local guest merge opt-in với server set, không replace silently; action phản hồi pending/error.
5. Poll customer order detail visible 15s đến terminal; no private data after logout; empty/loading/error states.
6. Delete CTA stub rõ chưa hỗ trợ cho tới T19, không fake xóa tài khoản; không link dead endpoint.

## Acceptance criteria

- Guest vẫn order, logged user order/history/reorder/favorite/address flows dùng real API.
- User A/B isolation browser, personal block không load mọi lịch sử; mobile routes accessible.
- Reorder hiện warnings và current price, không tự submit hoặc dùng bàn cũ.

Test matrix: V20,V21,V24 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run test:e2e -- tests/e2e/account.spec.ts
npm run test:unit -- src/features/account
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Không CRM/admin customer page/loyalty/AI.

## Rollback

Hide account enhancement, guest intake vẫn giữ; clear private caches.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T16.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
