# T11 — Checkout giao hàng thật

Status: TODO
Phụ thuộc: T10
Loại bàn giao: code + tests + `../reports/T11.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

Delivery API có giá/phí trusted. Nối form hiện tại, không fake receipt và không trộn context tại bàn.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 05-ui-flows.md public; 04-api-contracts.md A/B; 02-architecture.md D/G.
- Diff hiện tại của files định sửa; report dependency T10.

## Phạm vi sở hữu

src/features/ordering/delivery/; CartDrawer adapter; MenuPage mode switch; tests/e2e/delivery.spec.ts; tests/unit/delivery*.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Form name/phone/address/zone/note, no forced login; normalized runtime validation field errors.
2. Quote panel subtotal/fee/total, explicit confirm, expired/changed giá bắt review lại.
3. Submit idempotent, unknown timeout giữ key, clear draft chỉ after commit; receipt pending không hứa đang nấu.
4. Không lưu PII localStorage; saved-address slot adapter empty trước T16, guest không thấy input bắt account.
5. Switch delivery/dine-in requires draft context decision và validate menu modes.

## Acceptance criteria

- Browser -> real DB -> admin delivery inbox/transition chạy được.
- Address rỗng/zone disabled/mất mạng/giá đổi/nhấn kép có UI đúng và không duplicate.
- Keyboard/mobile form đọc được label/error và receipt.

Test matrix: V10,V13,V14,V24 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run test:e2e -- tests/e2e/delivery.spec.ts
npm run test:unit -- src/features/ordering/delivery
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Không bank gateway, no address autocomplete hoặc saved-address backend ở task này.

## Rollback

Tắt delivery CTA, contact fallback, giữ các đơn đã commit.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T11.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
