# C11 — Kiểm chứng tổng và bàn giao

Status: READY_FOR_REVIEW  
Dependency: C00–C10  
Requirement: R12  
Thiết kế gốc: mục 1–29  
Report bàn giao: `../reports/C11.md`

## Đọc trước

- [Hợp đồng thực thi](../EXECUTION-CONTRACT.md), [plan](../PLAN.md), [acceptance](../ACCEPTANCE.md).
- [Thiết kế gốc](../../09-concierge-agent-design.md), các mục được liệt kê ở trên.
- `plans/tiger-345/09-concierge-agent-design.md` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `plans/tiger-345/concierge-delivery/reports` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `package.json` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).

## Bối cảnh cần xác minh

Test xanh không tự động đồng nghĩa đầy đủ A0–A7 hay sẵn sàng production. Tái hiện từ snapshot hiện tại; nếu đã sửa, giữ code và cung cấp bằng chứng, không viết lại chỉ để có diff.

## Phạm vi sở hữu

Các module và test trực tiếp thuộc chức năng task trong danh sách đọc, cùng tích hợp tối thiểu ở caller. Không sở hữu toàn bộ `src` hoặc migrations chỉ vì có trong danh sách. Ghi file cụ thể trước sửa; giữ edits của người khác. Migration mới chỉ chạy trong DB test đã qua G0; không sửa migration đã áp dụng.

## Checklist thực hiện

- [x] Đối chiếu toàn bộ R01–R12, AT01–AT20, F01–F10 và A0–A7 với code entrypoint + artifacts.
- [x] Chạy full required suites trên DB cô lập, frontend/server typecheck, lint, build; ghi command/exit/version và mọi skip.
- [x] Browser smoke desktop/mobile cho recommendation/order/reservation/personalization; ghi provider thật hay adapter test.
- [x] Đánh giá migrations/rollback/flags/reconcile và config secrets; live-provider test chỉ khi có cấu hình và scope test được phép.
- [x] Tạo FINAL.md gồm findings theo severity, remaining risks, external gates, owner và next action; không tự deploy.
- [x] Chỉ READY_FOR_REVIEW; reviewer mới ACCEPTED. Bếp duyệt knowledge, human scenarios và pilot owner còn thiếu thì ghi rõ release blocked.

## Kiểm chứng bắt buộc

Acceptance: AT20 trong [ACCEPTANCE](../ACCEPTANCE.md).

Không requirement thiếu evidence được gắn đạt; tái chạy regression liên quan sau fix; final matrix phân biệt technical readiness/live provider/business approval.

Các lệnh dự kiến (xác minh script/config trước chạy; nếu filter phải ghi rõ):

- `npm run test:unit`
- `npm run test:server`
- `npm run test:integration`
- `npm run test:policies`
- `npm run test:e2e`
- `npm run typecheck`
- `npm run typecheck:server`
- `npm run lint`
- `npm run build`

Chạy typecheck/lint phù hợp với file đã sửa; build khi thay frontend/runtime integration. Test mới mô tả ở đây là việc cần làm, chưa phải test đã tồn tại hoặc đã chạy. Khi dependency/test environment thiếu, ghi BLOCKED đúng phạm vi và tiếp tục phần độc lập.

## Điều kiện bàn giao

- [x] Checklist và acceptance kỹ thuật có evidence từ đúng entrypoint.
- [x] Negative tests kiểm tra cả side effects; không chỉ card hoặc thông báo.
- [x] Tự review auth, concurrency, failure paths và diff; không còn finding nghiêm trọng chưa xử lý trong scope.
- [x] Report theo [TEMPLATE](../reports/TEMPLATE.md), có command/exit/artifact và external gates riêng.
- [x] Chỉ chuyển READY_FOR_REVIEW; không tự ACCEPTED hoặc công bố production-ready.

## Rollback và handoff

Tắt feature tương ứng nếu không bảo đảm invariant; giữ receipt/status/reconcile của giao dịch đã commit. Không xóa business records hoặc revert edits của người khác. Ghi contract/schema/config version và ảnh hưởng tới task downstream; sửa dependency thì chạy lại checks bị ảnh hưởng. Nếu task quá lớn, tách suffix a/b với nguyên requirement và acceptance, không giảm scope.
