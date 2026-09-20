# UI và hành trình

Giữ màu/font/layout public hiện có. Admin dùng cùng tokens nhưng bảng rõ, mật độ cao hơn,
không mang hero/chat/cart public vào admin. Không vẽ lại toàn landing trong task backend.

## Routes

Public: `/`, `/menu?mode=dine-in|delivery`, `/table/:token`, `/reservation`, `/location`.
Auth: `/login`, `/auth/callback`, `/admin/login`.
Account: `/account`, `/account/orders`, `/account/orders/:id`, `/account/reservations`,
`/account/favorites`, `/account/addresses`, `/account/profile`.
Admin: `/admin`, `/admin/orders`, `/admin/orders/:id`, `/admin/tables`,
`/admin/reservations`, `/admin/menu`, `/admin/settings`.
Unknown route -> 404 có link về menu; admin forbidden khác not logged in.

## Public menu và cart

- Không QR vẫn xem menu tại quán, nhưng gọi món cần QR hợp lệ; CTA “Quét QR tại bàn để gọi món”.
- Có context: badge “Bàn 05”, trạng thái nhận yêu cầu, nút “Gửi gọi món”.
- Delivery: tên/phone/address/zone, saved address nếu logged in; luôn có guest checkout.
- Thêm món unavailable bị disable có label; unpublished không xuất hiện.
- Cart một draft active, đổi mode/bàn cần xác nhận giữ draft cũ hay thay; không silently remap items.
  Default đơn giản: hủy chuyển hoặc xóa draft rồi chuyển; không cần lưu nhiều giỏ v1.
- Món/hình/giá tải từ catalog, giá cart tạm tính; giá chốt do quote. Món biến mất thông báo và loại
  khỏi giao dịch sau đồng ý, không gửi ID null hoặc qty 0.
- Có pending submit, error/retry, quote expired/changed, timeout unknown. Không success trước commit.
- Receipt lưu snapshot server trong component, không tính lại bằng cart đang sửa; clear cart chỉ sau receipt.
- Dine-in không hiện phone/address; delivery không nhận table_id từ browser.
- Guest receipt không tự poll bằng mã ngắn. Logged customer link history. Guest có CTA login để claim
  nếu secret còn; đóng tab mất secret thì chỉ liên hệ quán, không hứa khôi phục lịch sử.
- Nhãn rõ “Đã nhận yêu cầu, chờ xác nhận”; không hứa đang nấu/giao 25 phút trước admin confirm.

## Admin wireframe

```text
Tiger 345 Admin | cập nhật 14:32:15 | [Làm mới] | Tài khoản
Sidebar        | 7 đơn mới / 3 lượt bàn chờ món / 2 đơn đang giao
Tổng quan      | [Tất cả][Tại bàn][Giao hàng] [Ngày] [Trạng thái] [Tìm]
Đơn hàng       | Mã   Bàn/Khách    Món  Tổng    Trạng thái   Thời gian
Bàn ăn         | ... chọn dòng -> panel hoặc detail route
Đặt bàn        | Detail: món/note/quote snapshot/timeline/payment
Thực đơn       | Actions: xác nhận, từ chối, bước tiếp theo theo state
Cấu hình       | Conflict -> tải dữ liệu mới, không ghi đè
```

Bàn ăn: list table, open/close visit, unpaid sum, order batches theo thời gian,
settle cả visit, QR create/rotate/in PDF (tạo được PDF thật bằng print/save PDF hoặc library nhẹ).
Dashboard chờ món đếm distinct open visits có pending/confirmed/preparing, không đếm order thành bàn.
Detail dine-in hiển thị table snapshot + visit; delivery hiển thị contact/zone/address + gọi khách.
Payment controls không dùng chung nút chuyển status. Hủy/refund/correction có reason + confirm.
Không thao tác bulk status v1; tránh bỏ sót từng yêu cầu.

Đặt bàn: list theo ngày là mặc định; filter, panel guest count/area/timeline/status/contact outcome;
“Xác nhận” nhắc kiểm tra chỗ và gọi khách. Không cần calendar kéo thả.
Menu: danh mục, search, ảnh/tên/giá, published/available, modes; editor validation, preview publish.
Settings: contact, intake toggles, giờ/nghỉ, zones/fees, seating areas. Mọi save có version/conflict.
Không page staff/roles/CRM. Audit đọc theo entity trong detail/settings đủ v1.

## Account

Login luôn optional; prompt ở checkout không cản button guest. Google và email link/OTP,
giữ route/cart qua redirect; session loading không flash logout/login liên tục.
Account overview gọn: recent/frequent/favorites/upcoming; empty -> link menu, không fake orders.
Order detail safe timeline + current reorder; reorder khác mode kiểm lại availability và table context.
Addresses default, form inline errors; dữ liệu do user chọn mới autofill checkout.
Favorites guest có thể giữ local IDs; sau login hỏi nhập favorites guest hoặc bỏ, không tự replace server list.
Profile cho sửa name/phone/avatar nếu có upload phù hợp, marketing consent; birthday ngoài v1.
Delete account có reauthentication, hậu quả rõ, pending/error/retry; không chỉ xóa state frontend.

## UI states và accessibility bắt buộc

Mọi API view: loading/empty/error/retry/unauthorized/stale. Hành động disable khi pending,
idempotency vẫn ở server. Form có id/htmlFor, field errors aria-describedby, summary aria-live.
Dialog focus trap, initial focus, Escape, return focus, background inert; dialog đóng không nằm trong tab order.
Button icon có accessible name, màu không là tín hiệu duy nhất, keyboard chọn món/filter/status.
Mobile 360px, tablet 768px, desktop 1280px; public sticky cart không che submit/contact.
Admin mobile bảng chuyển cards hoặc scroll có label; controls hành động vẫn truy cập được.
Reduced motion theo OS; không thêm animation nặng vào admin queue.
