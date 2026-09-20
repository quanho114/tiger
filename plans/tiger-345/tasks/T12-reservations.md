# T12 — Đặt bàn public và admin xuyên suốt

Status: DONE
Phụ thuộc: T11
Loại bàn giao: code + tests + `../reports/T12.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

ReservationPage đang fake; admin/auth/shared validation đã có. Triển khai một slice pending->manual confirm.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 02-architecture.md E/H; 03-database.md reservations; 04-api-contracts.md B/C; 05-ui-flows.md đặt bàn.
- Diff hiện tại của files định sửa; report dependency T11.

## Phạm vi sở hữu

migrations reservation RPC; public/admin handlers; src/features/reservations/; ReservationPage.tsx; admin reservations routes; tests reservations.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Form số khách chính xác, date/time VN, notice/max days/duration/closures/area; server authoritative.
2. Create idempotent guest/auth owner, code unique server; receipt pending; no capacity auto-confirm.
3. Admin list/date/status/detail, transition version, note và contact outcome; kiểm no_show grace.
4. Lịch chưa có interval phù hợp -> không cho chọn slot, backend vẫn kiểm; ended future interval within hours.
5. Reservation audit không lộ PII; prepare own DTO/cancel domain function để T14 expose customer.

## Acceptance criteria

- Guest form lưu DB, admin confirm/reject/contact chạy; không nói đã giữ bàn trước confirm.
- Past/boundary VN/closures/quantity nhóm/idempotency và competing transitions có test.
- Admin lịch chỉ phản ánh yêu cầu; chưa tuyên bố chống overbooking tự động.

Test matrix: V15,V16,V24 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run test:integration -- tests/integration/reservations.test.ts
npm run test:e2e -- tests/e2e/reservations.spec.ts
npm run typecheck:server
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Không auto allocation/calendar drag drop/SMS/email notifications.

## Rollback

booking_enabled false, liên hệ quán; giữ reservations để tiếp tục xử lý.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T12.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
