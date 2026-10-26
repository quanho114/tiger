# Hướng dẫn contributor Tiger345

## 1. Clone và yêu cầu hệ thống

Cần Git, Node.js >= 22.12.0, npm và Docker Engine/Desktop đang chạy.
Windows nên dùng WSL2 với Docker integration. Supabase CLI nằm trong dependencies;
không cần cài global. Clone URL GitHub của dự án rồi mở terminal trong repo:

```bash
npm ci
npm run db:start
```

Lần khởi động đầu dựng migrations và seed; các lần sau giữ dữ liệu local.
Docker cần tải images lần đầu. Không chạy reset chỉ để khởi động ứng dụng.

## 2. Cấu hình frontend

```bash
cp .env.example .env.local
```

Mở Studio `http://127.0.0.1:54323`, lấy **public anon key** của instance local
ở phần API settings và thay placeholder `VITE_SUPABASE_ANON_KEY`.
Có thể xem thông tin instance bằng `npm run db:status` trên máy cá nhân, nhưng
output có thể chứa khóa đặc quyền: không chia sẻ output hoặc đưa vào báo cáo.
Không dùng service-role key làm public anon key. Khởi động lại Vite sau khi sửa.

`.env.local` chỉ chứa cấu hình public. Không ghi API key AI hoặc bí mật server
vào file môi trường. Các công cụ Node/database không tự nạp `.env.local`.

## 3. Chạy backend và frontend

Hai terminal cùng thư mục repo:

```bash
# Backend
npx supabase functions serve --env-file supabase/functions/.env.example --no-verify-jwt
```

```bash
# Frontend
npm run dev
```

Mẫu backend dùng `ENVIRONMENT=local` và PostgreSQL container `supabase_db_tiger`.
CLI cung cấp cấu hình Auth/service-role local cho Edge Functions. Nếu đổi
`project_id` hoặc password trong Supabase config, cập nhật hostname/password
local tương ứng; không dùng URL loopback của máy host trong container.

`--no-verify-jwt` dành cho chạy local: public API cho phép guest, còn gateway
ứng dụng vẫn kiểm tra JWT và quyền customer/admin. Không bỏ qua xác thực của app.

| Dịch vụ | URL/cổng |
| --- | --- |
| Website | http://localhost:5173 |
| API/Auth | http://127.0.0.1:54321 |
| PostgreSQL từ máy host | 127.0.0.1:54322 |
| Studio | http://127.0.0.1:54323 |
| Mailpit | http://127.0.0.1:54324 |

Kiểm tra backend bằng trình duyệt hoặc terminal:

```bash
curl --fail http://127.0.0.1:54321/functions/v1/public-api/health
```

Health trả `status: ok` chỉ xác nhận endpoint đó. Tiếp tục mở menu và kiểm tra
request lấy menu thành công. Nó không chứng minh toàn bộ checkout/chatbot hoạt động.
Dừng terminal frontend/functions bằng Ctrl+C; `npm run db:stop` dừng stack local.

## 4. Database và dữ liệu khi cộng tác

Git chứa migrations, seed và ảnh tĩnh đã commit, không chứa database đang chạy.
Menu thêm qua admin, đơn hàng, tài khoản Auth, file Storage và cấu hình AI trên
máy một người không tự đồng bộ sang máy người khác.

- Migrations dựng cấu trúc, RLS và hàm nghiệp vụ. Không sửa migration đã áp dụng
  trên môi trường dùng chung; thêm migration mới.
- `supabase/seed.sql` cung cấp menu ban đầu. Dữ liệu mẫu chia sẻ phải được làm
  sạch; không thêm đơn thật, thông tin khách, mật khẩu hay khóa provider.
- `public/images` là ảnh tĩnh. File upload vào Supabase Storage cần quy trình
  chuyển riêng; seed database không sao chép các file đó.
- Đổi schema: dùng `npx supabase migration new <ten_thay_doi>`, viết SQL rồi
  áp dụng migration chưa chạy bằng `npx supabase migration up --local`.
  Lệnh này không tự nạp lại seed và SQL migration vẫn cần được review.
- Người nhận PR pull code, cài dependencies nếu lockfile đổi, áp dụng migration
  local và khởi động lại backend/frontend.

Nếu cần dữ liệu giống nhau, duy trì seed chung hoặc xuất dữ liệu đã làm sạch
để nhập vào database riêng. Dùng chung staging chỉ khi nhóm đã thống nhất.
Không tự kết nối database production để phát triển hoặc chạy tests.

## 5. Admin local

Trong Studio → Authentication → Users, tạo user test với email/password riêng
và xác nhận email. Chạy trong SQL Editor **của instance local**:

```sql
INSERT INTO public.admin_profiles (user_id, display_name, active)
SELECT id, 'Contributor local', true
FROM auth.users
WHERE email = 'contributor@example.test'
ON CONFLICT (user_id) DO UPDATE
SET active = true, display_name = EXCLUDED.display_name;
```

Thay email bằng user vừa tạo. Đăng nhập `/admin/login`. User đăng ký thông thường
không tự có quyền admin. Không đưa mật khẩu vào lệnh terminal hay Git.

## 6. Chatbot và provider

Concierge dùng PostgreSQL cho session; không cần Redis. Clone repo không sao
chép provider đang lưu trên máy người khác. Cấu hình tại `/admin/settings` →
Chatbot. Key thật chỉ qua cơ chế backend/Vault, không qua file cấu hình public.
Hostname provider tùy chỉnh phải được backend cho phép qua
`CONCIERGE_LLM_ALLOWED_HOSTS`; HTTPS và kiểm tra địa chỉ đích vẫn bắt buộc.

Không bật shim hoặc đổi provider để giả lập nghiệm thu. Gọi provider thật
có thể tính phí; chỉ chạy khi người dùng chủ động cho phép. Kiểm định runtime
chatbot thực hiện trên website Tiger theo AGENTS.md, với session test mới.

## 7. Kiểm thử

Các kiểm tra không cần database hoặc provider thật:

```bash
npm run typecheck
npm run typecheck:server
npm run lint
npm run check:architecture
npm run test:architecture
npm run test:unit
npm run test:server
npm run build
```

Build yêu cầu URL và public anon key hợp lệ của môi trường bạn chọn trong
`.env.local`. Browser mock tests cần Chromium:

```bash
npx playwright install chromium
npm run test:e2e:mock
```

### Database test có thể xóa/ghi dữ liệu

**Không chạy trên database phát triển đang giữ dữ liệu.** Integration/policy
suites yêu cầu marker cách ly; `db:reset:test` cố ý từ chối database thiếu marker.
Không tự đóng dấu database cũ chỉ để vượt guard.

Đường chạy tự động đầy đủ đã được khai báo trong `.github/workflows/ci.yml`:
job database tạo stack mới trên runner riêng, provision marker, reset/seed,
chạy functions, integration/policies và real E2E. Contributor có thể gửi PR để
chạy job này; không cần cấp quyền vào database nhà hàng.

Nếu muốn chạy local, dùng một checkout **chỉ dành cho test** và stack mới:
đặt `project_id = "tiger-test"`; đổi cổng tránh stack dev (API 54331, DB 54332,
Studio 54333, Mailpit 54334, shadow 54330; kiểm tra cả cổng bổ sung trong config).
Không commit thay đổi cấu hình riêng này. Chạy `npm run db:start` trong checkout
đó, xác nhận Docker container/database đúng stack mới trước khi provision.
Trong terminal của stack test, đặt target cho các công cụ Node:

```bash
export PGHOST=127.0.0.1
export PGPORT=54332
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54332/postgres
export SUPABASE_URL=http://127.0.0.1:54331
export TEST_ENVIRONMENT=local_isolated_test
export TEST_INSTANCE_IDENTITY=local_disposable_test_instance
```

Chỉ trên instance vừa tạo, không chứa dữ liệu cần giữ:

```bash
DISPOSABLE_TEST_PROVISION_ALLOWED=true node scripts/provision-test-db.mjs
npm run db:reset:test
npm run test:policies
npm run test:integration
```

Một số integration/browser tests còn cần HTTP backend và Chromium. Với stack
`tiger-test`, backend phải trỏ `supabase_db_tiger-test:5432`, frontend phải dùng
API 54331 và anon key của stack test. Các fixture có thể mặc định API 54321;
đối chiếu từng suite trước khi chạy. Quy trình CI là tham chiếu cho toàn bộ
browser-to-database flow; setup local riêng này không mặc định bảo đảm mọi suite.
Không gọi provider thật như một phần kiểm tra mặc định.

## 8. Gửi PR

Theo `docs/architecture.md`: app phối hợp features, shared không import features,
frontend chỉ dùng contracts portable từ backend. Ghi rõ thay đổi schema/seed,
kiểm tra đã chạy và giới hạn nghiệm thu. Backend/migrations triển khai trước
frontend phụ thuộc vào chúng, qua người quản lý môi trường.

Trước commit, xem `git status --short` và diff: đưa đủ mã nguồn, migrations, seed,
ảnh cần dùng và lockfile vào PR; không đưa `.env*` thật, logs, database dumps,
khóa, dữ liệu khách hàng hoặc browser artifacts. Chỉ file `.env.example` chứa
placeholder được phép chia sẻ. Repo hiện có nhiều thay đổi đang làm; không dùng
`git add .` mà không review.

## 9. Xử lý lỗi setup

| Triệu chứng | Kiểm tra |
| --- | --- |
| Docker không kết nối | Docker daemon/Desktop và quyền socket/WSL integration |
| Cổng đã dùng | Stack/ứng dụng khác; không reset hoặc xóa container không rõ chủ |
| Menu lỗi hoặc API 404 | Functions terminal, frontend URL và đường dẫn public-api |
| JWT/key không hợp lệ | Public anon key có thuộc đúng instance local không |
| Backend không nối DB | Hostname container, project_id và network Supabase |
| Database reset bị từ chối | Đây có phải stack test mới, có marker hợp lệ không |
| Admin bị từ chối | User đã xác nhận email, admin_profiles active và đúng instance |
| Chatbot unavailable | Provider được bật, credential, allowlist và lỗi backend đã làm sạch |
| Ảnh mất sau clone | Ảnh tĩnh đã commit hay chỉ tồn tại trong Storage máy người khác |

Khi báo lỗi chỉ gửi mã lỗi, request ID và bước tái hiện đã làm sạch; không gửi
raw output `db:status`, token, key hoặc hội thoại riêng.

## 10. Trạng thái kiểm tra hướng dẫn (13/10/2026)

Đối chiếu hướng dẫn với source/config hiện tại; không thay đổi runtime hoặc deploy
backend trong lượt cập nhật này. Frontend/server typecheck, architecture checker
và test của checker, 193 unit/component tests, 492 server tests, production build
đều qua. Lint hoàn tất với warnings hiện có, gồm cả checkout dưới `.claude/worktrees`.
Liên kết tài liệu và whitespace của các file cập nhật đã kiểm tra.

Chưa dựng từ clone sạch: sandbox không truy cập được Docker socket và Supabase
CLI gặp giới hạn ghi telemetry ngoài workspace. Không reset database đang có,
không chạy PostgreSQL integration/browser acceptance hoặc provider trả phí.
Các kết quả code checks không phải bằng chứng setup đầy đủ trên máy mới.

**Runtime chatbot: CHƯA KIỂM ĐỊNH.** Chưa xác nhận frontend/backend target, schema
và provider thực tế; chưa chạy browser smoke trên Tiger. Cần môi trường test được
phê duyệt và cho phép gọi provider thật để nghiệm thu theo AGENTS.md.
