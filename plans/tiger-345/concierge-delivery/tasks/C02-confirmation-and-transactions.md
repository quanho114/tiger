# C02 — Confirmation và giao dịch bền vững

Status: READY_FOR_REVIEW  
Dependency: C01  
Requirement: R03  
Thiết kế gốc: mục 6, 15, 16, 17, 21  
Report bàn giao: `../reports/C02.md`

## Đọc trước

- [Hợp đồng thực thi](../EXECUTION-CONTRACT.md), [plan](../PLAN.md), [acceptance](../ACCEPTANCE.md).
- [Thiết kế gốc](../../09-concierge-agent-design.md), các mục được liệt kê ở trên.
- `supabase/functions/_shared/concierge/runtime.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/functions/_shared/concierge/persistence.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/functions/_shared/quote.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/migrations` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).

## Bối cảnh cần xác minh

Pre-mutation step check riêng lẻ không bảo đảm chống race hoặc khôi phục sau commit. Tái hiện từ snapshot hiện tại; nếu đã sửa, giữ code và cung cấp bằng chứng, không viết lại chỉ để có diff.

## Phạm vi sở hữu

Các module và test trực tiếp thuộc chức năng task trong danh sách đọc, cùng tích hợp tối thiểu ở caller. Không sở hữu toàn bộ `src` hoặc migrations chỉ vì có trong danh sách. Ghi file cụ thể trước sửa; giữ edits của người khác. Migration mới chỉ chạy trong DB test đã qua G0; không sửa migration đã áp dụng.

## Checklist thực hiện

- [x] Định nghĩa durable action: owner, kind, payload canonical/fingerprint, version, expiry, status, stable business idempotency key, receipt.
- [x] Bind confirmation vào đúng nội dung đã hiển thị; sửa payload phải phát summary/quote mới và confirm lại.
- [x] Claim/consume action atomic; cùng action với hai request keys khác nhau vẫn chỉ tạo một giao dịch.
- [x] Dùng transaction cùng DB hoặc protocol reconcile có durable business key/unique constraint để đóng khoảng trống RPC commit → state CAS; không giữ lock trong lúc gọi model.
- [x] Replay cùng nội dung trả đúng receipt; payload/quote khác không trả receipt cũ. Receipt đã commit vẫn tra được khi quote hết hạn, sau kiểm tra ownership và fingerprint.
- [x] Không mặc định secret; kiểm tra chữ ký/TTL/actor scope/dine-in capability; ràng buộc guest bằng session capability, không IP.
- [x] Khôi phục sau mất response, crash, CAS conflict và reset cạnh tranh; không báo thất bại chắc chắn khi kết quả commit còn chưa biết.

## Kiểm chứng bắt buộc

Acceptance: AT04, AT05, AT06 trong [ACCEPTANCE](../ACCEPTANCE.md).

Race hai instance/hai request keys; crash ngay sau business commit trước cập nhật conversation; retry sau TTL; quote khác; reset đồng thời confirm. Assert số business rows, action status và receipt, không chỉ HTTP.

Các lệnh dự kiến (xác minh script/config trước chạy; nếu filter phải ghi rõ):

- `npm run test:integration`
- `npm run test:server`

Chạy typecheck/lint phù hợp với file đã sửa; build khi thay frontend/runtime integration. Test mới mô tả ở đây là việc cần làm, chưa phải test đã tồn tại hoặc đã chạy. Khi dependency/test environment thiếu, ghi BLOCKED đúng phạm vi và tiếp tục phần độc lập.

## Điều kiện bàn giao

- [x] Checklist và acceptance kỹ thuật có evidence từ đúng entrypoint.
- [x] Negative tests kiểm tra cả side effects; không chỉ card hoặc thông báo.
- [x] Tự review auth, concurrency, failure paths và diff; không còn finding nghiêm trọng chưa xử lý trong scope.
- [x] Report theo [TEMPLATE](../reports/TEMPLATE.md), có command/exit/artifact và external gates riêng.
- [x] Chỉ chuyển READY_FOR_REVIEW; không tự ACCEPTED hoặc công bố production-ready.

## Rollback và handoff

Tắt feature tương ứng nếu không bảo đảm invariant; giữ receipt/status/reconcile của giao dịch đã commit. Không xóa business records hoặc revert edits của người khác. Ghi contract/schema/config version và ảnh hưởng tới task downstream; sửa dependency thì chạy lại checks bị ảnh hưởng. Nếu task quá lớn, tách suffix a/b với nguyên requirement và acceptance, không giảm scope.
