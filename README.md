# Tiger 345 · Bếp Ẩm Thực Đương Đại & Giao Tận Nơi

Trang web và trải nghiệm đặt bàn / đặt món trực tuyến cho nhà hàng ẩm thực đương đại Tiger 345.

## Công nghệ sử dụng

- **Framework**: React 19 + Vite 8
- **Ngôn ngữ**: TypeScript 6 (với module resolution bundler, strict types)
- **Styling**: Tailwind CSS v4 + Vanilla CSS Design Tokens
- **Icons**: Lucide React
- **Linter**: Oxlint
- **Typography**: Be Vietnam Pro, Noto Serif, Dancing Script (hỗ trợ 100% tiếng Việt chuẩn Unicode)

---

## Phát triển cục bộ (Local Development)

### Yêu cầu hệ thống
- **Node.js**: `>= 22.12.0` (Active LTS khuyến nghị)
- **Docker**: Docker Engine / Desktop (dành cho Supabase local stack)
- **Package Manager**: `npm`

### Biến môi trường (.env)
Sao chép `.env.example` thành `.env` để cấu hình kết nối frontend và cơ sở dữ liệu:
```bash
cp .env.example .env
```

### Quản lý cơ sở dữ liệu Supabase Local
Hệ thống sử dụng Supabase CLI chạy Docker cục bộ với PostgreSQL 17:

| Dịch vụ | Cổng (Port) | Mô tả |
|---|---|---|
| **API Gateway (Kong)** | `54321` | REST/GraphQL & Auth API |
| **PostgreSQL Database** | `54322` | Cơ sở dữ liệu chính (PostgreSQL 17) |
| **Supabase Studio** | `54323` | Giao diện quản trị database web |
| **Mailpit (Inbucket)** | `54324` | Web kiểm tra email xác nhận local |
| **Shadow DB** | `54320` | Database tạm phục vụ `db diff` |

Các câu lệnh quản lý cơ sở dữ liệu:
```bash
# Khởi động toàn bộ cụm Supabase local (Docker)
npm run db:start

# Kiểm tra trạng thái và thông tin kết nối
npm run db:status

# Dừng toàn bộ cụm Supabase local
npm run db:stop

# Reset và seed lại dữ liệu mẫu (có guard bảo vệ chỉ chạy trên localhost:54322)
npm run db:reset:test
```

### Cài đặt và khởi chạy Frontend

```bash
# Cài đặt dependencies (khuyến nghị dùng frozen install khi đồng bộ)
npm ci

# Khởi chạy dev server
npm run dev

# Xem thử production build
npm run preview
```

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
```bash
# Bước 1: Tạo user trong Supabase Auth (hoặc qua Supabase Studio)
npx supabase auth users create --email admin@tiger345.com --password "MAT_KHAU_MANH_16_KY_TU"
```

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
- Bấm **Lưu thay đổi** (hệ thống lập tức cập nhật `settings.version` và gửi tín hiệu đến toàn bộ client).

#### Cách 2: Qua câu lệnh SQL khẩn cấp:
```sql
UPDATE public.settings
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
