# Bộ SVG trợ lý ẩm thực Tiger

Bản vector dựng lại từ ảnh tham chiếu, không phải bản sao pixel 100% của chất liệu lông 3D. Không nhúng ảnh bitmap vào SVG.

## Nội dung
- 12 SVG biểu cảm, avatar.svg và app-icon.svg nền trong suốt.
- preview.html: mở trực tiếp, chọn trạng thái và mô phỏng một lượt chat; không gọi API.
- BotAvatar.tsx: component React dùng chung các lớp, có ID gradient riêng cho từng instance.
- Các chuyển động tự tắt khi người dùng bật giảm chuyển động.

## Dùng trong React
```tsx
<BotAvatar expression="thinking" size={48} />
```

Nối với vòng đời request thực tế:
- Không có request: idle.
- Request gửi đi, chưa có token: thinking.
- Đang nhận văn bản: speaking.
- Hoàn tất thành công: success; sau đó trở về idle.
- Request thất bại: error.
- Stop/cancel: trở về idle, không hiển thị success.
- Retry: thinking.
- Không tự chọn love/happy dựa trên văn bản LLM.

Các trạng thái trang trí happy, excited, wink, curious, surprised, love, sleeping có thể chọn rõ ràng ở UI. Không dùng sleeping để thể hiện mất kết nối.

## Phạm vi
Chỉ tạo bộ tài nguyên và demo. Chưa gắn vào Concierge đang chạy, chưa thay favicon/PWA icon của Tiger. Demo không phải bằng chứng nghiệm thu chatbot với provider thực tế.
