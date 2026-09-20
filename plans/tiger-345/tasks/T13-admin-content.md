# T13 — Admin menu/settings/QR và Storage

Status: DONE
Phụ thuộc: T12
Loại bàn giao: code + tests + `../reports/T13.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

Admin queue có chức năng tối thiểu, public reads dùng DB. Hoàn thiện quản lý nội dung cho quán không cần deploy.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 04-api-contracts.md C; 05-ui-flows.md admin; 03-database.md constraints/index; 08-decisions.md D01.
- Diff hiện tại của files định sửa; report dependency T12.

## Phạm vi sở hữu

admin catalog/settings/tables UI và handlers; new RPC migrations; storage policies; tests content/upload/QR PDF.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. CRUD/archive categories/menu, price/modes/published/available/featured và fields hiện tại, version conflicts.
2. Settings contact/intake, giờ/nghỉ, seating areas, zones fixed fees/threshold; replace collection atomic và validate overlap.
3. Upload image <=5MB JPEG/PNG/WebP check magic bytes/decode/re-encode hoặc server image sanitizer tin cậy; reject SVG/spoofed MIME, scoped Storage policies.
4. QR management create/rotate với confirm, print/save PDF label bàn và QR scan được; hash-only không giả download lại raw token cũ.
5. Public query invalidation/short cache và client refresh; server create vẫn recheck, không phụ thuộc cache.
6. Giữ content seed demo khác content thật, audit changes không full PII; no staff management.

## Acceptance criteria

- Admin đổi giá/ẩn/hết món/giờ/phí tác động public và checkout; đơn cũ snapshot không đổi.
- Upload invalid và customer upload admin image bị deny; QR PDF resolve đúng, old QR invalid sau rotate.
- Empty/loading/error/conflict states trên mobile/tablet, no unsafe config HTML injection.

Test matrix: V17,V07,V24 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run test:integration -- tests/integration/admin-content.test.ts
npm run test:policies
npm run test:e2e -- tests/e2e/admin-content.spec.ts
npm run typecheck:server
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Không tự thay menu demo thành giá thật; không external image generation hoặc CMS.

## Rollback

Content read-only, forward config correction theo audit; không rollback order snapshots.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T13.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
