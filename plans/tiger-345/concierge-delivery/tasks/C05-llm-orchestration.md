# C05 — LLM thực sự nối vào runtime

Status: READY_FOR_REVIEW  
Dependency: C01, C03, C04  
Requirement: R06  
Thiết kế gốc: mục 2, 3, 4, 5, 7, 14, 15, 18  
Report bàn giao: `../reports/C05.md`

## Đọc trước

- [Hợp đồng thực thi](../EXECUTION-CONTRACT.md), [plan](../PLAN.md), [acceptance](../ACCEPTANCE.md).
- [Thiết kế gốc](../../09-concierge-agent-design.md), các mục được liệt kê ở trên.
- `supabase/functions/_shared/concierge/llm.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/functions/_shared/concierge/runtime.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/functions/_shared/concierge/tools.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/functions/public-api/index.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).

## Bối cảnh cần xác minh

Adapter không được entrypoint gọi không được tính là orchestration hoàn thành. Tái hiện từ snapshot hiện tại; nếu đã sửa, giữ code và cung cấp bằng chứng, không viết lại chỉ để có diff.

## Phạm vi sở hữu

Các module và test trực tiếp thuộc chức năng task trong danh sách đọc, cùng tích hợp tối thiểu ở caller. Không sở hữu toàn bộ `src` hoặc migrations chỉ vì có trong danh sách. Ghi file cụ thể trước sửa; giữ edits của người khác. Migration mới chỉ chạy trong DB test đã qua G0; không sửa migration đã áp dụng.

## Checklist thực hiện

- [x] Nối main model từ endpoint thật; structured intent/constraints/tool calls schema validated; single-agent runtime.
- [x] Tool allowlist, typed inputs/outputs, auth/policy ngoài model; không raw SQL hoặc user-controlled identity.
- [x] Bound token/tool calls/timeout/retry; circuit breaker thật; missing provider không âm thầm stub hoặc giả hiểu yêu cầu.
- [x] Context tối thiểu gồm explicit state; FAQ chen ngang giữ proposal; correction mới nhất cập nhật constraints.
- [x] Không cho tài liệu/tool text override system/tool permissions; output money/status/action card từ validated facts.
- [x] SSE có event contract, cancel/disconnect/error handling; không stream khẳng định giao dịch/giá chưa validate; không persist hidden reasoning.

## Kiểm chứng bắt buộc

Acceptance: AT11, AT12 trong [ACCEPTANCE](../ACCEPTANCE.md).

Entry API gọi adapter spy thật; malformed output/tool args bị chặn; injection không mutation; timeout lặp mở circuit và hồi phục; SSE disconnect không tự retry mutation.

Các lệnh dự kiến (xác minh script/config trước chạy; nếu filter phải ghi rõ):

- `npm run test:server`
- `npm run test:integration`

Chạy typecheck/lint phù hợp với file đã sửa; build khi thay frontend/runtime integration. Test mới mô tả ở đây là việc cần làm, chưa phải test đã tồn tại hoặc đã chạy. Khi dependency/test environment thiếu, ghi BLOCKED đúng phạm vi và tiếp tục phần độc lập.

## Điều kiện bàn giao

- [x] Checklist và acceptance kỹ thuật có evidence từ đúng entrypoint.
- [x] Negative tests kiểm tra cả side effects; không chỉ card hoặc thông báo.
- [x] Tự review auth, concurrency, failure paths và diff; không còn finding nghiêm trọng chưa xử lý trong scope.
- [x] Report theo [TEMPLATE](../reports/TEMPLATE.md), có command/exit/artifact và external gates riêng.
- [x] Chỉ chuyển READY_FOR_REVIEW; không tự ACCEPTED hoặc công bố production-ready.

## Rollback và handoff

Tắt feature tương ứng nếu không bảo đảm invariant; giữ receipt/status/reconcile của giao dịch đã commit. Không xóa business records hoặc revert edits của người khác. Ghi contract/schema/config version và ảnh hưởng tới task downstream; sửa dependency thì chạy lại checks bị ảnh hưởng. Nếu task quá lớn, tách suffix a/b với nguyên requirement và acceptance, không giảm scope.
