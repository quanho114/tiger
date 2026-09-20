<!--
Fact-Forcing Metadata:
- Importers/Callers: Project reviewers, delivery tracking, plans/tiger-345/concierge-delivery/README.md, plans/tiger-345/concierge-delivery/PLAN.md
- Affected API: Task C06 status and checklist tracker
- Data Schemas: Markdown task spec and deliverables tracking
- Verbatim Instruction: "Hoàn thành toàn bộ C00–C11 bằng implementation thực tế, kiểm chứng đúng đường chạy và evidence có thể review. Không dừng ở khảo sát, đề xuất hoặc sửa báo cáo."
-->

# C06 — Chat, giỏ hàng và đặt đơn

Status: READY_FOR_REVIEW  
Dependency: C02, C04, C05  
Requirement: R07  
Thiết kế gốc: mục 5, 16, 18, 19  
Report bàn giao: `../reports/C06.md`

## Đọc trước

- [Hợp đồng thực thi](../EXECUTION-CONTRACT.md), [plan](../PLAN.md), [acceptance](../ACCEPTANCE.md).
- [Thiết kế gốc](../../09-concierge-agent-design.md), các mục được liệt kê ở trên.
- `src/features/concierge/useConcierge.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `src/features/concierge/components` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/functions/_shared/concierge/runtime.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/functions/_shared/quote.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).

## Bối cảnh cần xác minh

Có API confirm không chứng minh khách đi được từ chat đến quote rồi submit. Tái hiện từ snapshot hiện tại; nếu đã sửa, giữ code và cung cấp bằng chứng, không viết lại chỉ để có diff.

## Phạm vi sở hữu

Các module và test trực tiếp thuộc chức năng task trong danh sách đọc, cùng tích hợp tối thiểu ở caller. Không sở hữu toàn bộ `src` hoặc migrations chỉ vì có trong danh sách. Ghi file cụ thể trước sửa; giữ edits của người khác. Migration mới chỉ chạy trong DB test đã qua G0; không sửa migration đã áp dụng.

## Checklist thực hiện

- [x] Render cards/chips theo contract và server eligibility, loading/error/retry dễ hiểu, keyboard/mobile hoạt động.
- [x] Add proposal đọc lại owner/version/expiry và live price/availability/allergy/budget; thay đổi đáng kể hiển thị và yêu cầu chấp thuận lại.
- [x] Giỏ dùng tên/ID/quantity thật; double click/retry không nhân đôi ngoài ý muốn.
- [x] Thu thập contact/address/fulfillment thật; quote tổng có phí/giảm giá/thuế theo business service; không placeholder.
- [x] Hiển thị quote trước explicit confirm; ok mơ hồ không submit; đổi cart/fulfillment vô hiệu quote cũ.
- [x] Đọc status thật có ownership; newly created pending không nói đang nấu; refresh/retry lấy receipt C02.

## Kiểm chứng bắt buộc

Acceptance: AT13, AT14 trong [ACCEPTANCE](../ACCEPTANCE.md).

Browser với DB test: chat → proposal → cart → checkout fields → quote → confirm → row thật; double click, expired quote, out-of-stock, fee change và cross-user status.

Các lệnh dự kiến (xác minh script/config trước chạy; nếu filter phải ghi rõ):

- `npm run test:unit`
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
