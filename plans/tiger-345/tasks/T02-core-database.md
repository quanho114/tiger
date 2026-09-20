# T02 — Schema core và môi trường Supabase local

Status: DONE
Phụ thuộc: T01
Loại bàn giao: code + tests + `../reports/T02.md`; chưa được triển khai khi viết plan.

## Context đủ để bắt đầu

Chưa có supabase/ trong repo. Tạo schema shared trước API, giữ seed demo hiện tại với ID mapping.

## Đọc trước, không cần quét lại toàn repo

- `../README.md`.
- 03-database.md mục A/B/D/E; 02-architecture.md C–F/H; 06-verification.md V03.
- Diff hiện tại của files định sửa; report dependency T01.

## Phạm vi sở hữu

supabase/config.toml; supabase/migrations/ mới; supabase/seed.sql; scripts/db-*; tests/integration/schema*; package scripts; .env.example; README.md.

Bạn không làm một mình trong codebase: giữ edits của user/agent khác, không revert.
Nếu sửa file chung router/package/contract/migration, làm tuần tự và ghi rõ trong report.
Không chạy task phụ thuộc tiếp theo trong cùng lượt trừ khi user giao thêm.

## Công việc

1. Pin Supabase CLI, setup local Docker/db:start/db:reset:test có guard chỉ local; ghi ports và cách stop.
2. Tạo toàn bộ bảng core trừ nhóm customer/claim/deletion/rate-limit do T03/T04/T18/T19 sở hữu. Core gồm admin, menu, tables/QR/visits, zones/settings/hours/closures, orders/items/history/payment_events, reservations/audit/idempotency.
3. orders/reservations có customer_user_id FK nullable auth.users ngay từ đầu. Constraints đầy đủ context, money, states, composite visit/table FK, unique open visit, version/index.
4. Default RLS deny + revoke table/RPC writes ngay từ migration đầu, không để cửa mở chờ task security.
5. Seed 13 món/6 category và full fields UI bằng UUID deterministic, settings và tables demo; không admin password/production seed.
6. Thêm integration schema tests gồm check NULL, order type/status, FK mismatch, rollback cơ bản; baseline upgrade fixture.

## Acceptance criteria

- Local reset lặp lại deterministic, clean migrations chạy được, invalid records bị constraint reject.
- Không chứa credential; seed không chạy như migration production; scripts không reset URL remote.
- Core tables deny anon/authenticated từ đầu; generated types không chỉnh tay.

Test matrix: V03 trong `../06-verification.md`.

## Kiểm tra bắt buộc

```bash
npm run db:start
npm run db:reset:test
npm run test:integration -- tests/integration/schema.test.ts
npm run lint
npm run typecheck
npm run build
```

Các đường dẫn test là output dự kiến của task: tạo test đúng tên hoặc cập nhật command/report
đến đường dẫn thực. Nếu task đổi naming, cập nhật docs; không chạy lệnh không tồn tại rồi báo đạt.

## Ngoài phạm vi

Không viết toàn order RPC/API; customer bảng ở T03.

## Rollback

Local disposable reset được; production forward migration, không DROP schema.

## Bàn giao

Cập nhật status task và bảng roadmap; tạo `../reports/T02.md` theo TEMPLATE.
Ghi lệnh thực chạy/exit, migrations, API thay đổi, blockers và evidence không chứa secrets.
Nếu thiếu local Docker/provider, ghi BLOCKED phần kiểm thử tương ứng, không dùng mock thay bằng chứng.
