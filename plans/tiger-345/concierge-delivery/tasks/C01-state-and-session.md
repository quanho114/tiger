# C01 — Persistent state và quyền sở hữu phiên

Status: READY_FOR_REVIEW  
Dependency: C00  
Requirement: R02  
Thiết kế gốc: mục 6, 18, 20  
Report bàn giao: `../reports/C01.md`

## Đọc trước

- [Hợp đồng thực thi](../EXECUTION-CONTRACT.md), [plan](../PLAN.md), [acceptance](../ACCEPTANCE.md).
- [Thiết kế gốc](../../09-concierge-agent-design.md), các mục được liệt kê ở trên.
- `supabase/functions/_shared/concierge/persistence.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/functions/_shared/concierge/state-machine.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/functions/_shared/concierge/runtime.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).

## Bối cảnh cần xác minh

RAM fallback hoặc CAS không atomic có thể che mất dữ liệu và lỗi ownership. Tái hiện từ snapshot hiện tại; nếu đã sửa, giữ code và cung cấp bằng chứng, không viết lại chỉ để có diff.

## Phạm vi sở hữu

Các module và test trực tiếp thuộc chức năng task trong danh sách đọc, cùng tích hợp tối thiểu ở caller. Không sở hữu toàn bộ `src` hoặc migrations chỉ vì có trong danh sách. Ghi file cụ thể trước sửa; giữ edits của người khác. Migration mới chỉ chạy trong DB test đã qua G0; không sửa migration đã áp dụng.

## Checklist thực hiện

- [ ] Persist conversation/events/pending state; bỏ fallback RAM khỏi production khi DB lỗi.
- [ ] Kiểm tra JWT phía server, guest capability CSPRNG và ownership mọi read/write; IP không là credential.
- [ ] CAS atomic; reset tăng version, xoay token và vô hiệu pending/proposal cũ một cách nhất quán.
- [ ] Guest upgrade yêu cầu bằng chứng sở hữu; logout/account switch không mang context sang user khác.

## Kiểm chứng bắt buộc

Acceptance: AT02, AT03 trong [ACCEPTANCE](../ACCEPTANCE.md).

Hai instance cùng version chỉ một write thành công; đọc qua instance mới thấy state; DB down không success; token cũ sau reset và cross-user đều bị từ chối.

Các lệnh dự kiến (xác minh script/config trước chạy; nếu filter phải ghi rõ):

- `npm run test:integration`
- `npm run test:policies`

Chạy typecheck/lint phù hợp với file đã sửa; build khi thay frontend/runtime integration. Test mới mô tả ở đây là việc cần làm, chưa phải test đã tồn tại hoặc đã chạy. Khi dependency/test environment thiếu, ghi BLOCKED đúng phạm vi và tiếp tục phần độc lập.

## Điều kiện bàn giao

- [ ] Checklist và acceptance kỹ thuật có evidence từ đúng entrypoint.
- [ ] Negative tests kiểm tra cả side effects; không chỉ card hoặc thông báo.
- [ ] Tự review auth, concurrency, failure paths và diff; không còn finding nghiêm trọng chưa xử lý trong scope.
- [ ] Report theo [TEMPLATE](../reports/TEMPLATE.md), có command/exit/artifact và external gates riêng.
- [ ] Chỉ chuyển READY_FOR_REVIEW; không tự ACCEPTED hoặc công bố production-ready.

## Rollback và handoff

Tắt feature tương ứng nếu không bảo đảm invariant; giữ receipt/status/reconcile của giao dịch đã commit. Không xóa business records hoặc revert edits của người khác. Ghi contract/schema/config version và ảnh hưởng tới task downstream; sửa dependency thì chạy lại checks bị ảnh hưởng. Nếu task quá lớn, tách suffix a/b với nguyên requirement và acceptance, không giảm scope.
