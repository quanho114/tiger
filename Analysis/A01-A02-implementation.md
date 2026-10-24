# Bàn giao A01–A02 — 18/10/2026

**Code đã kiểm định cục bộ; chatbot thực tế chưa nghiệm thu.**

**Runtime chatbot: CHƯA KIỂM ĐỊNH.** Không deploy, không chạy provider có phí, không truy cập/chỉnh sửa dữ liệu thật, không tạo commit hoặc push. Backend đang phục vụ website chưa được xác minh là có các thay đổi này.

Repository: `tiger`; HEAD trước triển khai: `2fbbc65da9dd2425af5822abfd6d00623c72473f`.
Working tree ban đầu không có tracked modifications; `.mcp.json` và `Analysis/` đã là untracked. Không sửa `.mcp.json` hoặc các tài liệu phân tích khác. Trong `Analysis/` chỉ cập nhật `plan.md` và thêm báo cáo này.

## Bằng chứng trước khi sửa

- Đã đọc `AGENTS.md`, `Analysis/plan.md`, `docs/architecture.md`, prerequisites trong `docs/contributing.md` và source/suite liên quan.
- Baseline tập trung: `npm run test:server -- tests/server/concierge-orchestration-phase4.test.ts tests/server/concierge-understanding.test.ts tests/server/concierge-grounding.test.ts`: **89 tests / 3 files PASS**, exit 0. Suite cũ chưa chứng minh các hành vi mới; assertion cũ còn coi successful empty là unknown.
- Source xác nhận `selectToolCalls()` trả nguyên fallback mà không validate active set/schema/read registry; runner vẫn có gateway kiểm quyền. Sửa lớp chọn/thực thi công cụ, không thay gateway bằng classifier.
- Source xác nhận fallback suy `recommend_meal` từ party/budget đã lưu; runner không truyền `is_signature`; restaurant fast path có thể bỏ phần menu trong câu hỗn hợp; evidence gộp empty/unknown/unavailable và zero exchanges thành known.
- Các nhận định cốt lõi A01–A02 còn đúng tại baseline. Yêu cầu prompt được ưu tiên hơn thứ tự A00 của kế hoạch: chỉ tạo regression nhỏ, không triển khai benchmark 120 scenarios.
- Lần chạy Vitest trong sandbox gặp `spawn EPERM`; chạy lại các checks cục bộ với quyền tạo tiến trình đã được hệ thống phê duyệt. Không dùng việc này để truy cập dịch vụ thật.

## Hành vi trước và sau

| Tình huống | Trước | Sau, theo fixture/offline tests |
|---|---|---|
| Đặc sản có/không dấu, có/không dấu hỏi | Dễ rơi conversation/restaurant lookup; signature không đến retrieval | Typed menu read need, active menu tools, gateway execution, `is_signature: true` đến retrieval; cards chỉ có món signature phù hợp |
| Xem menu sau khi đã biết số người/ngân sách | Fallback có thể lập mâm | Browse vẫn search; model đề xuất meal tool sai mục tiêu được điều chỉnh về browse |
| Đang xem mâm, đổi món hoặc cập nhật độ cay | Dựa vào diễn giải rời rạc | Interpretation dùng trạng thái pending meal plan để giữ mục tiêu điều chỉnh mâm; không áp dụng suy luận này cho câu xem menu |
| Giá/chi tiết món, kể cả kèm restaurant fact | Named dish có thể không resolve hoặc bị bỏ do route | Resolve một món cụ thể từ interpretation; exact ID đi tới item tool; fact và món được truy xuất cùng lượt |
| Món có thật nhưng thiếu mô tả/thành phần được hỏi | Item tồn tại có thể khiến toàn bộ evidence thành known | Item/card giữ dữ liệu đã xác minh; `unknown` và `missing_fields` cho phần thông tin còn thiếu |
| Bán chạy/món mới | Chưa có contract riêng rõ ràng | Nhãn riêng với signature; catalog contract chưa có nguồn authoritative tương ứng nên trả unknown và `unresolved_needs`, không bịa nhãn hoặc trả món bất kỳ như đã xác minh |
| Câu đa nhu cầu | Có thể chỉ xử lý một domain | Bổ sung fallback cho nhu cầu menu/restaurant/recommendation chưa được model gọi. Giữ acceptance references của cards, tổng pending tối đa 8 |
| Vượt phần xử lý hiện có | Có thể bỏ sót | Additional named dish details/operational fields được ghi trong `deferredReadNeeds`, đưa vào context và nói rõ phần chưa xử lý. Account route giữ scope cũ; mixed booking/menu nói rõ phần kiểm tra bàn chưa xử lý |
| Invalid/inactive model call hoặc fallback | Fallback chưa được lọc cùng quy tắc | Validate cả hai bằng active set + read registry + input schema; kiểm active set lần nữa trước execution; vẫn qua gateway |
| Không có món phù hợp / thiếu dữ liệu / lỗi nguồn | Có thể cùng bị coi unknown | `empty` / `unknown` / `unavailable` riêng; không có exchange là `not_attempted` |
| Một nguồn thành công, nguồn khác lỗi | Aggregate có thể mất ý nghĩa từng nguồn | Evidence từng exchange giữ trạng thái riêng; model được cấp cả phần known và unavailable; nguồn lỗi không sinh menu cards hoặc suggested actions giả |
| Hết bàn phù hợp và lỗi kiểm tra bàn | Dễ lẫn nghĩa unavailable | Business availability giữ `status` riêng; retrieval truth dùng `evidence_status`. Lỗi gateway không sinh reservation option giả |

## Quyết định contract và giới hạn

- `TurnUnderstanding` giữ riêng `intent`, `readNeeds`, `deferredReadNeeds`, entities, constraints delta và clarification metadata. `ReadNeed` có menu mode browse/detail/recommendation, merchandising targets, hoặc restaurant query.
- Interpretation là cấu trúc mục tiêu dùng chung, không phải danh sách đóng câu trả lời. Không thêm model call phân loại, đổi model/provider hoặc ép prose thành template. Account identity/ownership vẫn từ principal và gateway, không từ read needs.
- Bộ máy hiện tại xử lý một named dish detail chính và một operational field chính. Các mục khác được nhận diện theo các mệnh đề hỗ trợ sẽ được ghi deferred và thông báo chưa xử lý, thay vì giả vờ hoàn tất toàn bộ. Không mở rộng thành bộ giải mọi loại câu ghép trong đợt này.
- `EvidenceStatus` là contract nội bộ: `known`, `empty`, `unknown`, `unavailable`, `not_attempted`. Tool schemas nội bộ bổ sung missing/unresolved metadata; **không đổi enum API công khai, schema database hoặc frontend contracts**.
- Model composition nhận status/evidence_status từng tool cùng signature/missing/unresolved metadata. Guard vẫn kiểm số liệu, URL, mutation claims và allergy claims; thêm kiểm lỗi nguồn không thành no-match, và zero exchanges không được tuyên bố đã tra. Mixed no-match chỉ được phép nếu có menu evidence empty tương ứng.
- Timeout/execution/output-schema failures tạo unavailable observation; authorization/input failures vẫn fail đóng, không thành evidence thành công. Provider failure vẫn là lỗi, không trả câu chào/no-result để che lỗi.
- Giữ nguyên tối đa 3 model calls, 6 tool calls, 6.000 byte-estimate/call, 12.000/turn và 25 giây. Grounded repair tối đa một lần; không qua guard thì fail đóng. Không nới allergy, hard budget/mode/availability filters hoặc confirmation policy.
- Thay đổi tối thiểu chạm các bề mặt được nhắc trong A03/A09 chỉ để không hỏi lại browse, chuyển trạng thái evidence và đồng bộ cards/pending. Không triển khai gói clarification, memory, planner, style hoặc streaming mới.

## File thay đổi

Đường dẫn source trong bảng tương đối với `supabase/functions/_shared/concierge/`.

| File | Nội dung |
|---|---|
| `understanding/types.ts` | Typed read/deferred needs |
| `understanding/read-needs.ts` (mới) | Diễn giải mục tiêu retrieval và deferred operational fields |
| `understanding/engine.ts` | Canonical interpretation, named clauses, contextual meal continuation |
| `understanding/intent-classifier.ts` | Named dish price/detail/ingredient patterns, loại merchandising khỏi tên món |
| `orchestration/capability-router.ts` | Giữ mixed menu reads trong main, giữ account scope |
| `orchestration/main-context.ts` | Context/catalog loading theo read needs; phân biệt lỗi catalog |
| `orchestration/handlers/food-handler.ts` | Active tools/fallback theo read needs; cards/pending consistency |
| `orchestration/handlers/restaurant-handler.ts` | Chung selector/runner/gateway cho lookup và fallback |
| `orchestration/handlers/reservation-handler.ts` | Chung selector/runner; phân biệt lỗi nguồn với availability |
| `orchestration/tool-runner.ts` | Signature filter, active enforcement, gateway outcomes, per-tool evidence |
| `orchestration/turn-context.ts` | Internal evidence status và catalog failure metadata |
| `orchestrator.ts` | Điều phối nhu cầu, projection evidence, thông báo phần chưa xử lý trước guard/safe-text emission |
| `context.ts` | Read/deferred goals và semantics evidence cho model; giữ natural wording |
| `tool-registry.ts` | Signature input và internal missing/unresolved result metadata |
| `response-guard.ts` | Phân biệt claims theo evidence, fail đóng khi nguồn lỗi/chưa tra |

File ngoài nhóm source trên:

- `tests/server/concierge-a01-a02.test.ts` (mới): regression nhỏ A01–A02, **30 cases**.
- `tests/server/concierge-orchestration-phase4.test.ts`: cập nhật expected empty theo contract mới; giữ kiểm gateway/selection hiện có.
- `Analysis/plan.md`: checkbox triển khai/kiểm thử cục bộ A01–A02; runtime vẫn unchecked, các gói khác chưa hoàn thành.
- `Analysis/A01-A02-implementation.md`: báo cáo này.

## Kết quả kiểm định cục bộ

Tất cả lệnh chạy từ thư mục `tiger`, ngày 18/10/2026, exit **0**:

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | PASS |
| `npm run typecheck:server` | PASS |
| `npm run lint` | PASS; còn warnings ở các file ngoài phạm vi, không sửa để làm đẹp báo cáo |
| `npm run check:architecture` | PASS, 260 source files |
| `npm run test:architecture` | PASS, 8 tests |
| `npm run test:unit` | PASS, 193 tests / 32 files |
| `npm run test:server` | PASS, 522 tests / 38 files; bao gồm 30 regression A01–A02 |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Regression dùng pool fixture/injected model adapter và gateway thực. Kiểm tool thực sự được gọi, tham số `is_signature`, query/ID, dữ liệu trong bounded context model nhận, output cards/pending/suggested actions, không mutation; có failure injection cho invalid schema, unknown/inactive tools, timeout, provider failure và mixed outcomes. Các suite cũ tiếp tục kiểm repair/fail-closed, capabilities, allergy, constraints, menu và draft invariants.

Không chạy PostgreSQL/browser integration có phụ thuộc database vì chưa xác minh được disposable test database/prerequisites cho đợt này. Không thay đổi frontend hoặc transport streaming. Không dùng injected tests để tuyên bố website thực hoạt động.

## Rủi ro và phần còn thiếu

- Chưa có môi trường bàn giao được xác minh (frontend URL, backend source/version, schema/flags/effective provider config), approval provider có phí hoặc real-browser smoke. Không đo latency/provider cost thực tế và không suy ra khả năng hiểu mọi paraphrase từ regression nhỏ.
- Các pattern deterministic vẫn có giới hạn ngôn ngữ. Agent giữ công cụ menu linh hoạt trong domain và model tự diễn đạt; không bảo đảm câu ghép ngoài các kiểu đã nhận diện đều được phân rã chính xác.
- Bestseller/new-arrival chưa có dữ liệu authoritative trong catalog contract đang dùng; cần công việc dữ liệu riêng nếu muốn trả lời các nhãn này như facts. Không lấy featured rank/tên món làm bằng chứng thay thế.
- Thêm mục tiêu/evidence vào context có thể làm lượt nhiều dữ liệu chạm cap sớm hơn. Giữ fail-closed và caps hiện tại; chưa có phép đo runtime để tăng cap.
- Trạng thái lỗi được bảo vệ bằng gateway/guard; mức tự nhiên và đầy đủ của prose từ provider thật còn cần nghiệm thu. Không đánh dấu A00 hoặc A03–A10 hoàn thành.

## Quay lại phiên bản trước

Chưa có commit/migration/deploy trong đợt này. Khi review, đảo ngược **chỉ các hunk A01–A02 trong danh sách file trên**, đối chiếu HEAD baseline; không reset/clean/restore toàn repository. Nếu đã có chỉnh sửa tiếp theo, giữ chúng và đảo từng hunk thay vì khôi phục cả file.

Hai file code/test mới chỉ được gỡ khi không có thay đổi cần giữ thêm. `Analysis/plan.md` vốn untracked: hoàn tác riêng checkbox/note của đợt này hoặc dùng bản đã lưu trước triển khai, không giả định có bản gốc trong Git. Giữ nguyên `.mcp.json`, các tài liệu Analysis khác và mọi thay đổi ngoài phạm vi. Không có database/session migration cần rollback và không tác động dữ liệu khách.

**Runtime chatbot: CHƯA KIỂM ĐỊNH.**
