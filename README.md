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
- **Package Manager**: `npm`

### Cài đặt và khởi chạy

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

Trước khi commit hoặc mở Pull Request, chạy các lệnh kiểm tra sau tương đương với quy trình GitHub CI:

```bash
# 1. Kiểm tra kiểu dữ liệu TypeScript
npm run typecheck

# 2. Kiểm tra quy chuẩn mã nguồn (Linting)
npm run lint

# 3. Đóng gói sản phẩm (Production Build)
npm run build
```

> **Lưu ý về kiểm thử (Testing)**: Dự án hiện tại chưa tích hợp bộ test tự động (Automated Test Suite). Bước test được thiết lập tùy chọn và sẽ được bổ sung khi có các module nghiệp vụ phức tạp.

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
