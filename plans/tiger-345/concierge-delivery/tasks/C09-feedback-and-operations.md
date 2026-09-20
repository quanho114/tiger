# C09 — Feedback, quan sát và vận hành

Status: READY_FOR_REVIEW  
Dependency: C01, C02, C03, C04  
Requirement: R10  
Thiết kế gốc: mục 21, 22, 23, 25, 28, 29  
Report bàn giao: `../reports/C09.md`

## Đọc trước

- [Hợp đồng thực thi](../EXECUTION-CONTRACT.md), [plan](../PLAN.md), [acceptance](../ACCEPTANCE.md).
- [Thiết kế gốc](../../09-concierge-agent-design.md), các mục được liệt kê ở trên.
- `supabase/functions/_shared/concierge/feedback.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/functions/admin-api/index.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `src` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/migrations` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).

## Bối cảnh cần xác minh

Feedback và logging phải chứng minh quyền, retention và tác dụng vận hành, không chỉ tồn tại endpoint. Tái hiện từ snapshot hiện tại; nếu đã sửa, giữ code và cung cấp bằng chứng, không viết lại chỉ để có diff.

## Phạm vi sở hữu

Các module và test trực tiếp thuộc chức năng task trong danh sách đọc, cùng tích hợp tối thiểu ở caller. Không sở hữu toàn bộ `src` hoặc migrations chỉ vì có trong danh sách. Ghi file cụ thể trước sửa; giữ edits của người khác. Migration mới chỉ chạy trong DB test đã qua G0; không sửa migration đã áp dụng.

## Checklist thực hiện

- [x] Feedback bind proposal/version/owner thật; admin review cùng persisted dataset có status/note/audit.
- [x] Không tự biến feedback thành serving rule đã duyệt; dữ liệu học cần owner review.
- [x] Log request/intent/tool latency/tokens/errors/validation với redaction phone/address/token; không hidden reasoning.
- [x] Rate limits, tool budgets, feature flags/kill switches và fallback liên hệ quán cấu hình thật; status/reconcile giao dịch đã commit còn truy cập được.
- [x] Retention/deletion/minimization cho chat/customer data và feedback; tách transaction records có nghĩa vụ lưu; policy chưa duyệt ghi external blocker.
- [x] Định nghĩa metrics numerator/denominator/time window: price invention, availability, confirmation, unsafe claim, serving/budget, latency/cost; pilot có owner và ngưỡng từ design hoặc đề xuất chưa duyệt.

## Kiểm chứng bắt buộc

Acceptance: AT17, AT18 trong [ACCEPTANCE](../ACCEPTANCE.md).

Guest/user không review admin; feedback giả owner/version bị chặn; log redaction; rate limit/circuit/kill switch thật; retention job chỉ đụng dữ liệu đúng policy.

Các lệnh dự kiến (xác minh script/config trước chạy; nếu filter phải ghi rõ):

- `npm run test:integration`
- `npm run test:policies`
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
