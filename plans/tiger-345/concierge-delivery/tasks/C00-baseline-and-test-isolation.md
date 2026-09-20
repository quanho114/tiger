# C00 — Baseline và môi trường kiểm thử

Status: TODO  
Dependency: Không  
Requirement: R01  
Thiết kế gốc: mục 1, 3, 26, 27  
Report bàn giao: `../reports/C00.md`

## Đọc trước

- [Hợp đồng thực thi](../EXECUTION-CONTRACT.md), [plan](../PLAN.md), [acceptance](../ACCEPTANCE.md).
- [Thiết kế gốc](../../09-concierge-agent-design.md), các mục được liệt kê ở trên.
- `AGENTS.md` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `package.json` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `tests/integration` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `tests/fixtures` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `báo cáo cũ` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).

## Bối cảnh cần xác minh

Baseline phải tái hiện từ workspace hiện tại; finding lịch sử có thể đã thay đổi. Tái hiện từ snapshot hiện tại; nếu đã sửa, giữ code và cung cấp bằng chứng, không viết lại chỉ để có diff.

## Phạm vi sở hữu

Các module và test trực tiếp thuộc chức năng task trong danh sách đọc, cùng tích hợp tối thiểu ở caller. Không sở hữu toàn bộ `src` hoặc migrations chỉ vì có trong danh sách. Ghi file cụ thể trước sửa; giữ edits của người khác. Migration mới chỉ chạy trong DB test đã qua G0; không sửa migration đã áp dụng.

## Checklist thực hiện

- [ ] Lập inventory entrypoint → service → SQL → UI và đối chiếu F01–F10.
- [ ] Ghi snapshot/hash file liên quan, hiện trạng test và edits ngoài scope.
- [ ] Tạo guard và DB test cô lập có marker định danh; từ chối target chưa xác minh trước mutation.
- [ ] Ghi command, fixture lifecycle, teardown và evidence convention; không reset DB dùng chung.

## Kiểm chứng bắt buộc

Acceptance: AT01 trong [ACCEPTANCE](../ACCEPTANCE.md).

Test guard với target không có marker phải từ chối trước write; DB test hợp lệ cho phép fixture có phạm vi và cleanup.

Các lệnh dự kiến (xác minh script/config trước chạy; nếu filter phải ghi rõ):

- `npm run test:integration`

Chạy typecheck/lint phù hợp với file đã sửa; build khi thay frontend/runtime integration. Test mới mô tả ở đây là việc cần làm, chưa phải test đã tồn tại hoặc đã chạy. Khi dependency/test environment thiếu, ghi BLOCKED đúng phạm vi và tiếp tục phần độc lập.

## Điều kiện bàn giao

- [ ] Checklist và acceptance kỹ thuật có evidence từ đúng entrypoint.
- [ ] Negative tests kiểm tra cả side effects; không chỉ card hoặc thông báo.
- [ ] Tự review auth, concurrency, failure paths và diff; không còn finding nghiêm trọng chưa xử lý trong scope.
- [ ] Report theo [TEMPLATE](../reports/TEMPLATE.md), có command/exit/artifact và external gates riêng.
- [ ] Chỉ chuyển READY_FOR_REVIEW; không tự ACCEPTED hoặc công bố production-ready.

## Rollback và handoff

Tắt feature tương ứng nếu không bảo đảm invariant; giữ receipt/status/reconcile của giao dịch đã commit. Không xóa business records hoặc revert edits của người khác. Ghi contract/schema/config version và ảnh hưởng tới task downstream; sửa dependency thì chạy lại checks bị ảnh hưởng. Nếu task quá lớn, tách suffix a/b với nguyên requirement và acceptance, không giảm scope.
