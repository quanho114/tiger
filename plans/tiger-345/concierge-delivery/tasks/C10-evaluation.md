# C10 — Eval hành vi và regression

Status: READY_FOR_REVIEW  
Dependency: C05, C06, C07, C08, C09  
Requirement: R11  
Thiết kế gốc: mục 24, 25, 27  
Report bàn giao: `../reports/C10.md`

## Đọc trước

- [Hợp đồng thực thi](../EXECUTION-CONTRACT.md), [plan](../PLAN.md), [acceptance](../ACCEPTANCE.md).
- [Thiết kế gốc](../../09-concierge-agent-design.md), các mục được liệt kê ở trên.
- `tests/server/concierge-eval.test.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `tests/fixtures/concierge-eval-scenarios.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `tests/integration/concierge-workflow.test.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `package.json` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).

## Bối cảnh cần xác minh

Test names hoặc metadata không chứng minh circuit breaker, reload hoặc business side effects. Tái hiện từ snapshot hiện tại; nếu đã sửa, giữ code và cung cấp bằng chứng, không viết lại chỉ để có diff.

## Phạm vi sở hữu

Các module và test trực tiếp thuộc chức năng task trong danh sách đọc, cùng tích hợp tối thiểu ở caller. Không sở hữu toàn bộ `src` hoặc migrations chỉ vì có trong danh sách. Ghi file cụ thể trước sửa; giữ edits của người khác. Migration mới chỉ chạy trong DB test đã qua G0; không sửa migration đã áp dụng.

## Checklist thực hiện

- [x] Inventory tất cả scenario và mapping requirement/assertion/test level; không cắt slice hoặc silent skip.
- [x] Runner từ chối expectation không hỗ trợ; kiểm tra intent/card/state và business side effects theo scenario.
- [x] Reload dùng instance mới + DB; circuit inject provider errors; confirmation assert business rows; RAG assert nguồn thật.
- [x] Bổ sung adversarial/multiturn/failure tests cho AT01–AT18; eval model variability tách deterministic regression.
- [x] 105 automated và 15 human nếu manifest vẫn như vậy: báo số thực tế executed/pass/fail/skip/human pending, không ép số cũ.
- [x] CI gate fail khi critical safety test fail hoặc scenario không thực thi; artifact redacted; test fixtures không sao chép logic implementation làm oracle.

## Kiểm chứng bắt buộc

Acceptance: AT19 trong [ACCEPTANCE](../ACCEPTANCE.md).

Chèn scenario expectation không hỗ trợ phải fail; controlled broken guard phải bị test bắt; reconcile scenario count với runner output; human chưa duyệt không tính passed.

Các lệnh dự kiến (xác minh script/config trước chạy; nếu filter phải ghi rõ):

- `npm run test:server`
- `npm run test:integration`
- `npm run test:e2e`

Chạy typecheck/lint phù hợp với file đã sửa; build khi thay frontend/runtime integration. Test mới mô tả ở đây là việc cần làm, chưa phải test đã tồn tại hoặc đã chạy. Khi dependency/test environment thiếu, ghi BLOCKED đúng phạm vi và tiếp tục phần độc lập.

## Điều kiện bàn giao

- [x] Checklist và acceptance kỹ thuật có evidence từ đúng entrypoint.
- [x] Negative tests kiểm tra cả side effects; không chỉ card hoặc thông báo.
- [x] Tự review auth, concurrency, failure paths và diff; không còn finding nghiêm trọng chưa xử lý trong scope.
- [x] Report theo [TEMPLATE](../reports/TEMPLATE.md), có command/exit/artifact và external gates riêng.
- [x] Chỉ chuyển READY_FOR_REVIEW; không tự ACCEPTED hoặc công bố production-ready.

## Rollback và handoff

Tắt feature tương ứng nếu không bảo đảm invariant; giữ receipt/status/reconcile của giao dịch đã commit. Không xóa business records hoặc revert edits của người khác. Ghi contract/schema/config version và ảnh hưởng tới task downstream; sửa dependency thì chạy lại checks bị ảnh hưởng. Nếu task quá lớn, tách suffix a/b với nguyên requirement và acceptance, không giảm scope.
