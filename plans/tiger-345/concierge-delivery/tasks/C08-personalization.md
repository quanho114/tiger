# C08 — Cá nhân hóa và reorder

Status: READY_FOR_REVIEW  
Dependency: C01, C05, C06  
Requirement: R09  
Thiết kế gốc: mục 5, 20  
Report bàn giao: `../reports/C08.md`

## Đọc trước

- [Hợp đồng thực thi](../EXECUTION-CONTRACT.md), [plan](../PLAN.md), [acceptance](../ACCEPTANCE.md).
- [Thiết kế gốc](../../09-concierge-agent-design.md), các mục được liệt kê ở trên.
- `supabase/functions/_shared/concierge/tools.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `src/features/concierge/useConcierge.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/migrations` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).

## Bối cảnh cần xác minh

JWT isolation không đủ chứng minh favorites/history/reorder thực sự hoạt động. Tái hiện từ snapshot hiện tại; nếu đã sửa, giữ code và cung cấp bằng chứng, không viết lại chỉ để có diff.

## Phạm vi sở hữu

Các module và test trực tiếp thuộc chức năng task trong danh sách đọc, cùng tích hợp tối thiểu ở caller. Không sở hữu toàn bộ `src` hoặc migrations chỉ vì có trong danh sách. Ghi file cụ thể trước sửa; giữ edits của người khác. Migration mới chỉ chạy trong DB test đã qua G0; không sửa migration đã áp dụng.

## Checklist thực hiện

- [x] Query favorites/history/frequent items đúng schema hiện tại; lấy user ID từ verified auth context.
- [x] Context tối thiểu, không tự tiết lộ địa chỉ/phone; ưu tiên yêu cầu hiện tại hơn lịch sử.
- [x] Reorder fetch giá/availability hiện tại, hiển thị đổi món/giá và confirm mới; không replay order cũ như giao dịch mới.
- [x] Login upgrade chứng minh guest owner; logout đổi tài khoản xóa cache/context và chặn response đang bay quay lại UI.

## Kiểm chứng bắt buộc

Acceptance: AT16 trong [ACCEPTANCE](../ACCEPTANCE.md).

DB fixture hai user favorites/history khác nhau; actual tool query, no cross-user data; logout lúc request pending; reorder món hết bán và giá mới.

Các lệnh dự kiến (xác minh script/config trước chạy; nếu filter phải ghi rõ):

- `npm run test:integration`
- `npm run test:unit`

Chạy typecheck/lint phù hợp với file đã sửa; build khi thay frontend/runtime integration. Test mới mô tả ở đây là việc cần làm, chưa phải test đã tồn tại hoặc đã chạy. Khi dependency/test environment thiếu, ghi BLOCKED đúng phạm vi và tiếp tục phần độc lập.

## Điều kiện bàn giao

- [x] Checklist và acceptance kỹ thuật có evidence từ đúng entrypoint.
- [x] Negative tests kiểm tra cả side effects; không chỉ card hoặc thông báo.
- [x] Tự review auth, concurrency, failure paths và diff; không còn finding nghiêm trọng chưa xử lý trong scope.
- [x] Report theo [TEMPLATE](../reports/TEMPLATE.md), có command/exit/artifact và external gates riêng.
- [x] Chỉ chuyển READY_FOR_REVIEW; không tự ACCEPTED hoặc công bố production-ready.

## Rollback và handoff

Tắt feature tương ứng nếu không bảo đảm invariant; giữ receipt/status/reconcile của giao dịch đã commit. Không xóa business records hoặc revert edits của người khác. Ghi contract/schema/config version và ảnh hưởng tới task downstream; sửa dependency thì chạy lại checks bị ảnh hưởng. Nếu task quá lớn, tách suffix a/b với nguyên requirement và acceptance, không giảm scope.
