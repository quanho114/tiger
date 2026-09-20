# T09 — QR → cart → order → admin, cart persistence

Status: DONE
Phụ thuộc: T08
Loại bàn giao: code + tests + `../reports/T09.md`; hoàn thành 2026-09-20.

## Context đủ để bắt đầu

Backend dine-in/admin đã chạy. Cart hiện delivery-only và chứa full MenuItem; thay draft/context nhưng giữ UI public.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 02-architecture.md C/D/G; 05-ui-flows.md public; 04-api-contracts.md B.
- Diff hiện tại của files định sửa; report dependency T08.

## Phạm vi sở hữu

src/features/{table-session,cart,ordering/dine-in}/; src/store adapters; src/components/{CartDrawer,Header,StickyCartBar}.tsx; src/pages/MenuPage.tsx; src/app/router; tests dine-in/cart.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Route table token resolve, strip URL/no-referrer trước external assets; sessionStorage capability, không persist raw QR localStorage.
2. Cart reducer schema version/TTL 24h ID/qty/note/context, corrupt storage safe; no PII/authoritative prices.
3. Scan another table/change mode confirm clear/change, closed visit invalidate, no silent table reassignment.
4. Dine-in quote -> customer confirm -> create with retained idempotency; timeout retry same key; receipt server snapshot.
5. No-QR menu browse allowed nhưng không gọi tại bàn; table badge/header/cart contextual, no phone/address fields.
6. Login session change giữ draft, quote mới khi actor đổi; cart clear sau commit và không mất receipt.

## Acceptance criteria

- E2E QR -> hai đợt gọi -> cùng visit -> admin confirm dùng DB thật, mobile 360px.
- Reload/corrupt/TTL/closed/rotated QR/price change/timeout không tạo order trùng hoặc gửi nhầm bàn.
- Giỏ đóng không tabbable, sticky bar không che controls.

Test matrix: V12,V13,V24 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run test:unit -- src/features/cart
npm run test:e2e -- tests/e2e/dine-in.spec.ts
npm run test:integration -- tests/integration/orders.test.ts
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Không delivery form mới/customer account screens/guest status polling.

## Rollback

Disable dine-in intake/CTA, giữ menu read và contact; không fake success.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T09.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
