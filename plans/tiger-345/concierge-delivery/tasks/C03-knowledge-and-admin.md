<!--
Importers / Callers:
- Delivery orchestrator, plans/tiger-345/concierge-delivery/PLAN.md, plans/tiger-345/concierge-delivery/README.md

Affected APIs:
- GET /admin-api/concierge/knowledge/*

Data Schemas:
- public.audit_logs, ServingProfile, ItemAllergenProfile, RecommendationConfig, KnowledgeDocument

Verbatim Instruction:
- "Mỗi lần chỉ xử lý một task; hoàn thành implementation + checks + report Cxx.md rồi mới chuyển tiếp. Không spawn sub-agent... BÁO CÁO VÀ TRẠNG THÁI: Mỗi report phải có snapshot, IDs, commands, artifacts... Coding agent chỉ được đặt READY_FOR_REVIEW... ĐẦU RA CUỐI: Tạo/cập nhật reports/C00.md đến reports/C11.md, README.md, FINAL.md"
-->

# C03 — Tri thức và quản trị dữ liệu

Status: READY_FOR_REVIEW  
Dependency: C00  
Requirement: R04  
Thiết kế gốc: mục 8, 9, 13, 14, 22, 28  
Report bàn giao: `../reports/C03.md`

## Đọc trước

- [Hợp đồng thực thi](../EXECUTION-CONTRACT.md), [plan](../PLAN.md), [acceptance](../ACCEPTANCE.md).
- [Thiết kế gốc](../../09-concierge-agent-design.md), các mục được liệt kê ở trên.
- `supabase/functions/_shared/concierge/knowledge.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/functions/_shared/concierge/rag.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/functions/admin-api/index.ts` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `src` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).
- `supabase/migrations` (đường dẫn từ repository root; tìm entrypoint hiện tại nếu đã đổi tên).

## Bối cảnh cần xác minh

Seed demo và helper đọc tri thức chưa chứng minh dữ liệu quán được duyệt hay admin quản lý được. Tái hiện từ snapshot hiện tại; nếu đã sửa, giữ code và cung cấp bằng chứng, không viết lại chỉ để có diff.

## Phạm vi sở hữu

Các module và test trực tiếp thuộc chức năng task trong danh sách đọc, cùng tích hợp tối thiểu ở caller. Không sở hữu toàn bộ `src` hoặc migrations chỉ vì có trong danh sách. Ghi file cụ thể trước sửa; giữ edits của người khác. Migration mới chỉ chạy trong DB test đã qua G0; không sửa migration đã áp dụng.

## Checklist thực hiện

- [x] Tách catalog/serving/allergen structured, documents có source/version và customer data.
- [x] Serving có unit, range, role, confidence, source, updated_by/at; không suy servings từ số khúc đơn thuần.
- [x] Admin chỉnh serving/allergens/config/docs có auth, validation và audit; giữ demo_estimate/unverified đến khi owner duyệt thật.
- [x] RAG dùng nguồn đã publish, citation truy vết; stale/conflicting/missing facts không thành khẳng định.
- [x] Config hệ số khẩu phần và chính sách ngân sách có version; cache invalidation theo version; không cần vector DB mới nếu full-text đủ.

## Kiểm chứng bắt buộc

Acceptance: AT07, AT08 trong [ACCEPTANCE](../ACCEPTANCE.md).

Admin/non-admin write; audit và đọc lại sau sửa; nguồn bị thu hồi không còn được cite; unknown allergy không thành safe; seed không tự verified.

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
