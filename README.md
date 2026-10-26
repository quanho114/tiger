# Tiger 345 · Bếp Ẩm Thực Đương Đại & Giao Tận Nơi

Trang web và trải nghiệm đặt bàn / đặt món trực tuyến cho nhà hàng ẩm thực đương đại Tiger 345.

## Tổ chức mã nguồn

Frontend chia thành `src/app` (routes và providers), `src/features` (nghiệp vụ)
và `src/shared` (UI và hạ tầng dùng chung). Backend giữ cổng HTTP nhỏ, điều phối
sang các handler theo nghiệp vụ. Xem [hướng dẫn kiến trúc](docs/architecture.md)
để biết vị trí đặt file, chiều phụ thuộc và quy trình thêm tính năng.

Chạy `npm run check:architecture` để kiểm tra ranh giới module và import vòng.
CI kiểm tra các quy tắc này trên mỗi pull request.

## Công nghệ sử dụng

- **Framework**: React 19 + Vite 8
- **Ngôn ngữ**: TypeScript 6 (với module resolution bundler, strict types)
- **Styling**: Tailwind CSS v4 + Vanilla CSS Design Tokens
- **Icons**: Lucide React
- **Linter**: Oxlint
- **Typography**: Be Vietnam Pro, Noto Serif, Dancing Script (hỗ trợ 100% tiếng Việt chuẩn Unicode)

---

## Phát triển cục bộ

Người mới bắt đầu tại [hướng dẫn contributor](docs/contributing.md): cài đặt,
dựng database riêng, chạy backend/frontend, tạo admin local, kiểm thử và gửi PR.

### 1. Chuẩn bị lần đầu

Yêu cầu Node.js >= 22.12.0, npm và Docker đang chạy. Các lệnh bên dưới
chạy tại thư mục gốc repo; lệnh `<(...)` dùng Bash (Ubuntu).

```bash
cd ~/Projects/tiger
npm ci
```

Trên Ubuntu dùng Docker Engine, nếu Docker chưa chạy:

```bash
sudo systemctl start docker
```

Kiểm tra Docker rồi khởi động Supabase local:

```bash
docker ps
npm run db:start
```

Supabase local lần đầu dựng schema từ migrations và nạp `supabase/seed.sql`.
Các lần khởi động sau giữ lại dữ liệu hiện có.

Nếu chưa có `.env.local`, sao chép `.env.example` thành `.env.local`.
Đặt `VITE_SUPABASE_URL=http://127.0.0.1:54321` và public anon/publishable key
của instance local vào `VITE_SUPABASE_ANON_KEY` (Studio → Settings → API).
Không dùng secret/service-role key cho frontend. Vite tự đọc `.env.local`;
khởi động lại Vite nếu thay đổi file này. Không ghi đè file cấu hình đã có.

### 2. Chạy backend — terminal thứ nhất

Nếu đã có `supabase/functions/.env`, giữ nguyên cấu hình và dùng lệnh đã
khôi phục thành công kết nối database trên môi trường local Tiger:

```bash
npx supabase functions serve --env-file <(
  cat supabase/functions/.env
  printf '\nDATABASE_URL=postgresql://postgres:postgres@db.supabase.internal:5432/postgres\n'
)
```

Lệnh đọc cấu hình hiện tại rồi ghi đè địa chỉ database cho phiên chạy,
không sửa file `.env`. Giữ terminal này mở trong khi dùng website.
Không in hoặc chia sẻ nội dung file cấu hình chứa bí mật.

Nếu mới clone và chưa có `supabase/functions/.env`, dùng mẫu local
không chứa bí mật với cùng hostname database:

```bash
npx supabase functions serve --env-file <(
  cat supabase/functions/.env.example
  printf '\nDATABASE_URL=postgresql://postgres:postgres@db.supabase.internal:5432/postgres\n'
)
```

`db.supabase.internal:5432` là địa chỉ database bên trong Docker.
`127.0.0.1:54322` là địa chỉ truy cập từ máy host, không dùng thay thế
trong container Edge Runtime. Các gateway đã có `verify_jwt = false`
trong `supabase/config.toml`; ứng dụng tự kiểm tra JWT và quyền truy cập.

### 3. Chạy frontend — terminal thứ hai

```bash
cd ~/Projects/tiger
npm run dev
```

Giữ cả terminal backend và frontend mở. Mở URL Vite in ra; mặc định là
`http://localhost:5173` (Vite có thể chọn cổng khác nếu cổng này đang bận).

| Thành phần | Địa chỉ mặc định |
| --- | --- |
| Website Tiger | http://localhost:5173 |
| Supabase Studio | http://127.0.0.1:54323 |
| Table Editor | http://127.0.0.1:54323/project/default/editor |
| API thực đơn | http://127.0.0.1:54321/functions/v1/public-api/menu |
| Mailpit — email local | http://127.0.0.1:54324 |

### 4. Kiểm tra dữ liệu và xử lý lỗi

Tại terminal khác, kiểm tra API thực đơn:

```bash
curl -sS --max-time 15 -o /tmp/tiger-menu-check.json \
  -w 'HTTP %{http_code}\n' \
  http://127.0.0.1:54321/functions/v1/public-api/menu
```

Mong đợi HTTP 200. Sau đó mở trang Thực đơn và xác nhận món/giá hiển thị;
HTTP 200 riêng lẻ chưa chứng minh dữ liệu trên giao diện đã đúng.

Nếu website báo không tải được danh mục hoặc API trả 500:

```bash
docker ps
docker logs --since 2m --tail 40 supabase_edge_runtime_tiger
```

Lỗi đã gặp: `getaddrinfo ENOTFOUND supabase_db_tiger`. Docker vẫn có thể
phân giải tên này nhưng Edge Runtime thất bại; dùng lệnh backend ở bước 2
với alias `db.supabase.internal` đã khôi phục tải dữ liệu trên máy local.
Nguyên nhân chi tiết bên trong bộ phân giải runtime chưa được xác minh;
không kết luận dữ liệu bị mất hoặc lỗi frontend chỉ từ thông báo 500.
Che khóa, token và thông tin riêng tư trước khi chia sẻ log.

### 5. Dừng và chạy lại

Nhấn `Ctrl+C` ở từng terminal frontend/backend. Nếu muốn dừng cả Supabase:

```bash
npm run db:stop
```

Lần làm việc tiếp theo: bật Docker, chạy `npm run db:start`, rồi chạy lại
backend và frontend theo bước 2–3. Không cần chạy lại `npm ci` mỗi lần.

`npm run db:reset:test` chỉ dùng cho database test có marker cách ly; không dùng
để khởi tạo hoặc làm mới database phát triển. Không chạy `supabase db reset`
để sửa lỗi kết nối vì lệnh này tạo lại database local. Xem hướng dẫn contributor
trước khi chạy kiểm thử có ghi database.

### Phát triển chatbot trên Tiger

Mở chatbot trên website Tiger; không có trang chat riêng. Để cấu hình provider,
dùng `/admin/settings` → Chatbot. API key thật chỉ đi qua cơ chế cấu hình backend,
không ghi vào `.env`, `VITE_*`, mã nguồn hoặc commit. Gateway tùy chỉnh phải dùng
HTTPS và hostname được phép qua `CONCIERGE_LLM_ALLOWED_HOSTS`.

Clone repo không sao chép cấu hình provider hay khóa AI của người khác. Gọi
provider thật có thể tính phí và cần được người thực hiện chủ động cho phép.
Tests offline không chứng minh chatbot thật hoạt động; nghiệm thu theo AGENTS.md.

---

## Quy trình kiểm tra chất lượng (Verification Commands)

Trước khi commit hoặc mở Pull Request, chạy bộ kiểm thử chuẩn hóa gồm 9 bước:

```bash
# 1. Kiểm tra kiểu dữ liệu TypeScript Frontend & Shared (Strict)
npm run typecheck

# 2. Kiểm tra kiểu dữ liệu TypeScript Server / Edge Functions
npm run typecheck:server

# 3. Kiểm tra quy chuẩn mã nguồn (Linting qua Oxlint)
npm run lint

# 4. Chạy kiểm thử đơn vị & component UI (Unit Tests qua Vitest)
npm run test:unit

# 5. Chạy kiểm thử logic nghiệp vụ Edge Functions (Server Tests)
npm run test:server

# 6. Chạy kiểm thử bảo mật RLS & RPC Policies (Policies Tests - yêu cầu DB local)
npm run test:policies

# 7. Chạy kiểm thử tích hợp database (Integration Tests - yêu cầu DB local)
npm run test:integration

# 8. Chạy kiểm thử luồng người dùng trình duyệt thực (Playwright E2E Tests)
npm run test:e2e

# 9. Đóng gói sản phẩm và kiểm tra chunking (Production Build)
npm run build
```

---

## Sổ tay vận hành hệ thống (Operational Runbooks)

### Runbook 1: Khởi tạo & Phục hồi Quản trị viên (Admin Bootstrap & Recovery)

Hệ thống Tiger 345 áp dụng mô hình phân quyền nghiêm ngặt (**Invariant V04, V05**):
- Người dùng đăng ký thông thường (`auth.users`) **tuyệt đối không bao giờ** tự động có quyền quản trị.
- Quyền quản trị được kích hoạt thông qua bảng `public.admin_profiles`. Mọi yêu cầu quản trị đều kiểm tra trạng thái `active = true` trực tiếp từ cơ sở dữ liệu trên từng request (kể cả khi JWT chưa hết hạn).

#### 1. Khởi tạo tài khoản Admin ban đầu trên Staging / Production:

Tạo user bằng Supabase Dashboard → Authentication → Users trên đúng môi trường.
Sau đó cấp quyền bằng SQL dưới đây; thay email mẫu bằng email vừa tạo.
Không dùng script bootstrap local cho staging/production.

```sql
-- Bước 2: Kích hoạt quyền Admin trong admin_profiles qua SQL Editor (yêu cầu service_role / postgres)
INSERT INTO public.admin_profiles (user_id, display_name, active)
SELECT id, 'Quản Trị Viên Tiger 345', true
FROM auth.users
WHERE email = 'admin@tiger345.com'
ON CONFLICT (user_id) DO UPDATE SET active = true, display_name = 'Quản Trị Viên Tiger 345';
```

#### 2. Thu hồi quyền Admin khẩn cấp (Emergency Admin Revocation):
Khi phát hiện token bị nghi ngờ hoặc nhân viên thôi việc, vô hiệu hóa ngay lập tức mà không cần xóa tài khoản:
```sql
UPDATE public.admin_profiles
SET active = false
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'admin-can-khoa@tiger345.com');
```

---

### Runbook 2: Tạm dừng nhận đơn khẩn cấp (Emergency Intake Pause)

Khi nhà hàng quá tải (giờ cao điểm) hoặc xảy ra sự cố đột xuất về bếp/giao hàng (**Invariant V24, V26**):

#### Cách 1: Qua giao diện Admin Web
Truy cập `/admin/settings` -> Tab **Vận hành (Operations)**:
- Gạt công tắc **Nhận đơn giao hàng** -> Tắt
- Gạt công tắc **Nhận gọi món tại bàn** -> Tắt
- Gạt công tắc **Nhận đặt bàn trực tuyến** -> Tắt
- Bấm **Lưu thay đổi** (hệ thống lập tức cập nhật `restaurant_settings.version` và gửi tín hiệu đến toàn bộ client).

#### Cách 2: Qua câu lệnh SQL khẩn cấp:
```sql
UPDATE public.restaurant_settings
SET accepting_delivery_orders = false,
    accepting_dine_in_orders = false,
    booking_enabled = false;
```
*Ghi chú: Khi tắt nhận đơn, các đơn hàng đã tiếp nhận trước đó vẫn được xử lý bình thường, hệ thống chỉ chặn tạo mới báo giá (quote) và đơn hàng mới.*

---

### Runbook 3: Migration, Sao lưu & Phục hồi Cơ sở dữ liệu (Backup & Disaster Recovery)

#### 1. Nguyên tắc Migration:
- Mọi migration phải tuân thủ tính tương thích ngược (backward & forward compatible).
- Cột mới bắt buộc có giá trị `DEFAULT` hoặc cho phép `NULL`.
- Không drop bảng hoặc xóa cột đang phục vụ phiên bản frontend hiện hành.

#### 2. Mục tiêu RPO / RTO (**Decision D04**):
- **RPO (Recovery Point Objective)**: $\le 24$ giờ (khuyến nghị $\le 1$ giờ với Supabase Point-in-Time Recovery).
- **RTO (Recovery Time Objective)**: $\le 4$ giờ khôi phục toàn diện dịch vụ.

#### 3. Quy trình diễn tập khôi phục (Restore Drill):
```bash
# Xuất bản sao lưu dữ liệu sạch:
pg_dump -h <HOST> -p 5432 -U postgres -d postgres --clean --if-exists -Fc -f tiger345_backup_$(date +%Y%m%d).dump

# Khôi phục vào môi trường Staging cách ly để kiểm tra tính toàn vẹn:
pg_restore -h <STAGING_HOST> -p 5432 -U postgres -d postgres --clean tiger345_backup_*.dump
```

---

### Runbook 4: Bảo mật Môi trường & Zero Secret Leakage (**Invariant V25**)

- **Khóa công khai (Public Anon Key)**: Chỉ chứa quyền truy cập giới hạn theo RLS, an toàn khi gắn vào biến môi trường `VITE_SUPABASE_ANON_KEY` phía frontend.
- **Khóa bí mật tối cao (`SUPABASE_SERVICE_ROLE_KEY`)**: **TUYỆT ĐỐI KHÔNG** đặt tiền tố `VITE_` và **TUYỆT ĐỐI KHÔNG** import vào mã nguồn client React. Khóa này chỉ tồn tại trong Supabase Edge Functions Secret Vault.
- Quy trình CI tự động quét bundle đầu ra (`dist/assets/`) sau mỗi lượt build. Nếu phát hiện chuỗi khóa service_role, CI sẽ lập tức báo lỗi và dừng triển khai.

---

---

## Kiến trúc CI/CD (GitHub Actions + Vercel)

Dự án áp dụng mô hình phân tách trách nhiệm tối ưu:
- **GitHub Actions**: Đảm nhiệm vai trò Quality Gate (Typecheck, Lint, Build).
- **Vercel Git Integration**: Đảm nhiệm việc Build & Deploy trực tiếp theo từng môi trường.

### Mô hình nhánh & triển khai:

```text
Feature Branch
      │
      ▼
Pull Request
      │
      ├── GitHub CI (Typecheck + Lint + Build)
      │
      ▼
Vercel Preview Deployment (Môi trường kiểm thử độc lập)
      │
      ▼
Review & Hợp nhất vào nhánh `main`
      │
      ├── GitHub CI trên main (Bảo vệ nhánh)
      │
      ▼
Vercel Production Deployment (Môi trường live)
```

### Chi tiết luồng hoạt động:

1. **Pull Request (PR Validation)**:
   - Khi mở hoặc cập nhật PR vào nhánh `main`, GitHub Actions workflow (`.github/workflows/ci.yml`) sẽ tự động chạy trên môi trường `ubuntu-latest`.
   - Vercel tự động tạo Preview Deployment với URL riêng biệt cho từng PR.
   - Nếu bất kỳ bước nào (cài đặt, typecheck, lint, build) thất bại, PR sẽ bị chặn merge.

2. **Hợp nhất vào `main` (Production Protection)**:
   - Nhánh `main` được bảo vệ bởi CI.
   - Khi code được merge vào `main`, GitHub Actions kiểm tra lại một lần nữa và Vercel tự động phát hành bản Production.

3. **Concurrency & Tiết kiệm tài nguyên**:
   - Workflow được cấu hình `concurrency` với `cancel-in-progress: true`, tự động hủy các lượt chạy cũ khi có commit mới được push lên cùng branch/PR.
