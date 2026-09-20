# Review codebase hiện tại

Ngày: 2026-09-19. Phương pháp: đọc route/import graph, handlers, store, dữ liệu,
form/modal, config TypeScript/build/CI; chạy lint và build. Không browser test hoặc audit hạ tầng live.

## Phát hiện theo ưu tiên

| ID | Mức | Bằng chứng | Tác động / task sửa |
|---|---|---|---|
| R01 | P1 khi live | src/components/CartDrawer.tsx:67 chỉ setIsOrderPlaced; :139 nói bếp đang nấu | Đơn không đến quán. T01 bỏ fake; T07/T09/T10/T11 nối thật |
| R02 | P1 khi live | src/pages/ReservationPage.tsx:36,53 sinh Math.random rồi success | Không lưu/giữ bàn. T01, T12 |
| R03 | P1 trước live | src/App.tsx:45 chỉ 4 route; package.json không backend/auth | Không có vận hành. T02–T08 |
| R04 | P2 | src/pages/ReservationPage.tsx:22 dùng UTC date; :44 chỉ length điện thoại; :314 không min | Ngày mặc định sai trước 07:00 VN, ngày quá khứ/điện thoại chữ lọt. T01/T12 |
| R05 | P2 | src/pages/ReservationPage.tsx:335 lựa chọn nhóm 10–12/trên 15 lưu 10/15 | Sai số khách thực. T12 chuyển số nguyên chính xác |
| R06 | P2 | src/components/CartDrawer.tsx:62 phí ship tại client, freeship 5km nhưng không kiểm vùng | Giá chưa đủ làm giá chốt. T07/T10/T11 |
| R07 | P2 | src/store/CartProvider.tsx:7 state memory, giữ cả MenuItem trong cart | Reload mất giỏ, không có mode/table context, giá dễ cũ. T09 |
| R08 | P2 | src/components/CartDrawer.tsx:83 giữ DOM đóng bằng opacity/pointer-events và aria-hidden | Nút/input vẫn có thể nhận Tab khi đóng; chưa focus trap/restore. T01/T09 |
| R09 | P2 | src/pages/MenuPage.tsx modal gần :465, form ReservationPage :278 | Dialog chưa đủ semantic/focus; label không nối input. T01/T12/T16 |
| R10 | P2 | src/components/Footer.tsx:18 chỉ setIsSubscribed | Đăng ký email giả. T01 bỏ form hoặc ghi rõ chưa hỗ trợ; newsletter ngoài scope |
| R11 | P2 | tsconfig.app.json compilerOptions không có strict; tsconfig root không kế thừa strict | README mô tả strict nhưng compiler chưa bật. T01 bật strict, sửa lỗi thật |
| R12 | P2 | src/components/ContactHub.tsx:74,322 FAQ giá/món hardcode khác menu | Tư vấn sai; không phải AI/live support. T05/T13 thống nhất dữ liệu |
| R13 | P2 | package.json: scripts; .github/workflows/ci.yml | Không unit/API/E2E; playwright-core chưa phải test runner cấu hình. T01/T02/T20 |
| R14 | P3 | src/data/site.ts gọi là source of truth nhưng Footer/LocationPage/ContactHub còn literal | Sửa config không cập nhật mọi chỗ. T05/T13 |
| R15 | P3 | MenuSection, ReservationSection, LocationSection, FeaturedDishesSection không được import bởi source hiện tại | Dễ sửa nhầm code cũ. T01 xác minh và dọn |
| R16 | P3 | src/App.tsx:50 catch-all về home; public shell bọc mọi route | Admin/account cần layout riêng, 404 riêng, không cart/chat public. T04/T08/T15 |
| R17 | P3 | MenuPage.tsx:38 favorites state local; :29 mode query không có table auth | Không phải account favorites hay dine-in ordering thực. T09/T16 |

P1 mô tả điều kiện dùng thật; demo có nhãn rõ không được coi là đã nhận đơn.
Chưa có database nên không khẳng định hệ thống đang có lỗi RLS/SQL injection thực tế.

## Map code dùng cho triển khai

| Hiện tại | Hướng xử lý |
|---|---|
| src/App.tsx, src/main.tsx | Extract app/router/layout/providers; giữ route public |
| src/pages/MenuPage.tsx (553 dòng) | Catalog container + cards/filter/dialog; fetch menu, table context |
| src/pages/HomePage.tsx (491 dòng) | Giữ landing; thay FEATURED_DISHES bằng public catalog; personalization nhỏ |
| src/components/CartDrawer.tsx (333 dòng) | Shared cart shell + checkout dine-in/delivery; không chứa business engine |
| src/store/cart.ts, CartProvider.tsx | Một type; draft ID/qty/note + context; adapter giữ imports khi chuyển |
| src/pages/ReservationPage.tsx (421 dòng) | Form/receipt thật, shared validation, lưu pending |
| src/components/Header.tsx | Link login/account; table badge; hiện cart theo context thay chỉ delivery query |
| src/components/StickyCartBar.tsx | Giữ thiết kế; hỗ trợ hai mode, không xuất hiện trong admin |
| src/components/ContactHub.tsx, Footer.tsx, LocationPage.tsx | Public settings + FAQ chính xác; giữ edits của user |
| src/data/restaurantData.ts | 13 món/6 danh mục làm seed DEMO, chuyển fields UI hiện có đầy đủ |
| src/data/site.ts | Fallback thông tin liên hệ khi offline, không fallback giá/khả năng nhận đơn |
| src/index.css, BotanicalDecorations, HeroSection | Giữ brand; shared UI mới dùng tokens hiện có |
| src/App.css | Không thấy import; kiểm tra lại rồi dọn nếu thực sự không dùng |
| .github/workflows/ci.yml | Mở rộng tests local Supabase và browser; workflow không tự bật branch protection |
| vercel.json | SPA rewrite phù hợp Edge Functions khác origin; kiểm tra deep links và auth callback |

MobileHomeSections không thấy được import; agent xác minh cả export/re-export trước khi xóa.
Không tự sửa nội dung thương hiệu thành “Tây Bắc” theo ví dụ schema; menu thật chưa được cung cấp.

## Verification baseline

- `npm run lint`: exit 0.
- `npm run build`: exit 0; script chạy `tsc -b && vite build`.
- Build hiện tại: JS khoảng 405.87 kB, gzip 116.35 kB; không kết luận cần rewrite từ con số này.
- Chưa có test suite nghiệp vụ để chạy, chưa chạy browser, chưa đo accessibility/performance thực tế.
- Không truy cập production, không kiểm tra remote branch protection. Không đọc secrets.
- Worktree có edits sẵn ContactHub/LocationPage và tiger.svg untracked; giữ nguyên.

Đây là baseline trước coding, không phải chứng nhận hệ thống sẵn sàng production.
