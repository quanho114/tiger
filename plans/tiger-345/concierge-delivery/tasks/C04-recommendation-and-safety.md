# C04 — Khẩu phần, ngân sách và an toàn

Status: READY_FOR_REVIEW
Dependency: C03
Requirement: R05
Thiết kế gốc: mục 7, 10, 11, 12, 13
Report bàn giao: `../reports/C04.md`

## Đọc trước

- [Hợp đồng thực thi](../EXECUTION-CONTRACT.md), [plan](../PLAN.md), [acceptance](../ACCEPTANCE.md).
- [Thiết kế gốc](../../09-concierge-agent-design.md), các mục được liệt kê ở trên.
- `supabase/functions/_shared/concierge/recommendation.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/functions/_shared/concierge/validator.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/functions/_shared/concierge/types.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).

## Bối cảnh cần xác minh

Fit score tốt không thay thế hard constraint; nhãn balanced không chứng minh cân bằng khẩu phần. Tái hiện từ snapshot hiện tại; nếu đã sửa, giữ code và cung cấp bằng chứng, không viết lại chỉ để có diff.

## Phạm vi sở hữu

Các module và test trực tiếp thuộc chức năng task trong danh sách đọc, cùng tích hợp tối thiểu ở caller. Không sở hữu toàn bộ `src` hoặc migrations chỉ vì có trong danh sách. Ghi file cụ thể trước sửa; giữ edits của người khác. Migration mới chỉ chạy trong DB test đã qua G0; không sửa migration đã áp dụng.

## Checklist thực hiện

- [x] Extract/merge constraints; phân biệt 7 người gồm 2 trẻ với 7 người lớn + 2 trẻ; hỏi tối đa 1–2 câu có ảnh hưởng lớn.
- [x] Tính equivalent adults theo config; coverage theo role, không cộng mọi món thành số người no; respect approximate ranges và confidence.
- [x] Sinh 2–4 candidates khi khả thi, rank sau validate; không bịa thêm option nếu thiếu món phù hợp.
- [x] Tính giá integer VND từ live catalog; hard budget không vượt, tolerance chỉ dùng khi policy/khách cho phép và hiển thị rõ; phân biệt tiền món với tổng phí.
- [x] Tách hard allergy/availability gates khỏi cảnh báo dư khẩu phần; unknown/may_contain/unverified phù hợp dị ứng khai báo chặn action tự động.
- [x] Persist proposal/version trước render; server tạo action eligibility; chỉnh món phải thay items thật và validate lại; no feasible plan trả trung thực.

## Kiểm chứng bắt buộc

Acceptance: AT09, AT10 trong [ACCEPTANCE](../ACCEPTANCE.md).

Boundary khẩu phần/trẻ/appetite; 100 lẩu/2 người; budget không thể đáp ứng; menu rỗng; item hết bán; allergy variants; món phụ không bị đếm gấp đôi thành serving.

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
