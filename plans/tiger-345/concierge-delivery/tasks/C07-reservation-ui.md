<!--
Fact-Forcing Metadata:
- Importers / Callers: plans/tiger-345/concierge-delivery/README.md, delivery tracking
- Affected APIs: None (markdown task tracking document)
- Data Schemas: None
- Verbatim Instruction: "Hoàn thành toàn bộ C00–C11 bằng implementation thực tế, kiểm chứng đúng đường chạy và evidence có thể review. Không dừng ở khảo sát, đề xuất hoặc sửa báo cáo."
-->

# C07 — Đặt bàn đa lượt và trạng thái

Status: READY_FOR_REVIEW  
Dependency: C02, C05  
Requirement: R08  
Thiết kế gốc: mục 5, 17, 18, 19  
Report bàn giao: `../reports/C07.md`

## Đọc trước

- [Hợp đồng thực thi](../EXECUTION-CONTRACT.md), [plan](../PLAN.md), [acceptance](../ACCEPTANCE.md).
- [Thiết kế gốc](../../09-concierge-agent-design.md), các mục được liệt kê ở trên.
- `supabase/functions/_shared/concierge/runtime.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `src/features/concierge/components/ConciergeChatView.tsx` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `src/features/concierge/api.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).

## Bối cảnh cần xác minh

Cần tái hiện parser tự điền +2h/Quý khách, không mặc định báo cáo cũ đã sửa đúng. Tái hiện từ snapshot hiện tại; nếu đã sửa, giữ code và cung cấp bằng chứng, không viết lại chỉ để có diff.

## Phạm vi sở hữu

Các module và test trực tiếp thuộc chức năng task trong danh sách đọc, cùng tích hợp tối thiểu ở caller. Không sở hữu toàn bộ `src` hoặc migrations chỉ vì có trong danh sách. Ghi file cụ thể trước sửa; giữ edits của người khác. Migration mới chỉ chạy trong DB test đã qua G0; không sửa migration đã áp dụng.

## Checklist thực hiện

- [x] Thu thập tên/phone/guests/ngày giờ thật; area/note theo policy, không fake fallback.
- [x] Resolve ngày tương đối bằng Asia/Ho_Chi_Minh và clock server; ngày giờ mơ hồ hỏi lại; xác nhận ngày tuyệt đối.
- [x] Áp dụng giờ mở cửa/cutoff/số khách/horizon từ policy nguồn thật; không hardcode giới hạn chưa được duyệt.
- [x] Summary server bind pending action; client không sửa payload sau confirm; sửa bất cứ dữ liệu giao dịch phát summary mới.
- [x] Submit qua C02, trạng thái pending; status lookup auth; không cam kết giữ bàn khi chưa được quán xác nhận.

## Kiểm chứng bắt buộc

Acceptance: AT15 trong [ACCEPTANCE](../ACCEPTANCE.md).

Browser nhiều lượt có chen FAQ, đổi giờ/người, reload rồi confirm; kiểm tra starts_at/name/phone trong DB khớp summary; quá khứ/qua nửa đêm/mơ hồ không tự đoán.

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
