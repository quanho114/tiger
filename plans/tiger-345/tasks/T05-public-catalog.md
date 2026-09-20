# T05 — Menu/settings API và nối website public

Status: DONE
Phụ thuộc: T04
Loại bàn giao: code + tests + `../reports/T05.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

MenuPage/HomePage đọc restaurantData và nhiều contact literal. Chuyển read path sang DB trước checkout.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 01-codebase-review.md R12/R14; 04-api-contracts.md B; 05-ui-flows.md public.
- Diff hiện tại của files định sửa; report dependency T04.

## Phạm vi sở hữu

public-api menu/settings handlers; src/features/catalog/; src/pages/{HomePage,MenuPage,LocationPage}.tsx; src/components/{Footer,ContactHub}.tsx; src/data/site.ts adapter; tests catalog.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Public menu/settings DTO includes categories/flags/fields UI; safe cache 30s, loading/error/empty states.
2. Home featured và menu dùng cùng query; unavailable vẫn hiện disable, unpublish/category inactive không hiện.
3. Contact/footer/location/FAQ dùng public settings; không hứa live agent/AI hoặc sai price range.
4. Không API fallback giá hoặc accepting_orders=true; fallback contact static chỉ để gọi quán khi offline.
5. Giữ các edits user trong ContactHub/LocationPage; adapters cho imports đang dùng.

## Acceptance criteria

- Sửa DB public data nhìn thấy ở website sau refresh/revalidation, public response không field nội bộ.
- API lỗi không hiển thị menu mock như dữ liệu mới; tất cả routes render trạng thái lỗi rõ.
- Tạm hết/unpublish hoạt động khác nhau, Home/Menu không lệch dữ liệu.

Test matrix: V06,V17 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run test:integration -- tests/integration/catalog.test.ts
npm run test:unit -- src/features/catalog
npm run test:e2e -- tests/e2e/catalog.spec.ts
npm run typecheck:server
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Chưa cart persistence/customer personalization/CRUD UI.

## Rollback

Read-only contact fallback, tắt đặt online; không phục hồi fake checkout.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T05.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
