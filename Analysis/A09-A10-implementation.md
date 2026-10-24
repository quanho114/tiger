# Bàn giao A09–A10 — 19/10/2026

**Code đã kiểm định; chatbot thực tế chưa nghiệm thu.** Người dùng xác nhận chỉ kiểm định cục bộ trong đợt này. Không commit, push, deploy, gọi provider có phí hoặc kết nối/chỉnh sửa database khách.

**Runtime chatbot: CHƯA KIỂM ĐỊNH.** A09 có triển khai và kiểm định cục bộ; A10 có bộ bằng chứng/runbook/phiếu chấm nhưng chưa hoàn thành gates phát hành. Không xác nhận backend đang phục vụ website đã có source này.

## Baseline và phạm vi

HEAD trước sửa: `2fbbc65da9dd2425af5822abfd6d00623c72473f`. Workspace chứa A01–A08 chưa commit và nhiều file untracked. Đã lưu 458 source/test/document files cùng SHA-256, HEAD/status trước khi sửa tại `C:\Users\USER\Downloads\New Agent\tiger-a09-a10-baseline`. Không sao chép `.mcp.json`, `.env*`, node_modules hoặc credentials.

Baseline: 613 server tests/45 files, 195 unit tests/32 files, 8 architecture tests và các code checks qua. Sandbox ban đầu chặn subprocess bằng `spawn EPERM`; chạy lại kiểm tra cục bộ với quyền tạo tiến trình được phê duyệt. Benchmark offline cũ đã lỗi hai tests trước sửa.

Đã đọc AGENTS, kế hoạch, Conversation, ba báo cáo A01–A08, artifacts đánh giá A06–A08, architecture/contributing/streaming và source/tests liên quan. Không đánh dấu nghiệm thu lại A01–A08 từ tài liệu cũ. Giữ nguyên planner greedy, giới hạn tài nguyên, consent/ownership/epoch/CAS/idempotency và cart/order/payment boundaries.

## Thay đổi hành vi

| Bề mặt | Trước | Sau, theo kiểm định cục bộ |
|---|---|---|
| Văn phong | Có chỉ dẫn ngắn gọn nhưng chưa nêu style A09 đầy đủ | Tiếng Việt mặc định, minh/bạn trung tính, thường 1–3 câu, tối đa một follow-up cần thiết, 700 ký tự gồm notices; không đếm câu cứng |
| Tính chủ động | Model được chọn public read tools trong scope | Giữ nguyên, policy yêu cầu chủ động suy luận/chọn tool; phân biệt tư vấn/giả định và không hỏi lại trường đã biết |
| Abstention | Một số mẫu đúng về hotline/giờ mở cửa hoặc phủ định transaction bị chặn | Chấp nhận thêm cách diễn đạt thiếu/chưa xác minh/lỗi nguồn; kiểm theo mệnh đề để lời từ chối không cấp quyền cho claim khác |
| Transaction/allergy | Chặn một số cụm cố định; bỏ sót nhiều paraphrase | Chặn thêm cập nhật giỏ/xác nhận đơn/giữ chỗ/thanh toán hoàn tất, cam kết dị ứng và thành phần vắng mặt chưa có căn cứ; server transaction messages vẫn xác định |
| Empty/unknown/unavailable | Abstention phụ thuộc nhóm từ hẹp | Giữ phân biệt successful empty, thiếu dữ liệu, lỗi nguồn và chưa tra; empty không được tự nói nguồn đang lỗi; mixed giữ outcome từng tool |
| Guard/evidence | Guard nhận full result, model nhận result compact | Guard kiểm đúng projected evidence mà model nhận; hidden prices/IDs không vô tình hợp thức hóa prose bịa |
| Phần ăn/pairing | Composition bỏ serving text/role và không chỉ rõ giới hạn planner | Giữ catalog serving text/meal_role và planner warnings; nói rõ projection không có pairing có nguồn hoặc bảo đảm đủ phần cho cả nhóm |
| Context repair | Candidates lặp cả ở pool và plan lines | Khi có plan hiển thị, không lặp pool candidates; regression repair vẫn chạy trong cap cũ |
| Guard metrics | Chưa có counters/latency repair | Metadata-only guard checks/rejections, repair attempts/successes/latency; giữ counters khi fail đóng, không đưa raw reply vào metrics |
| Presentation/state | Verified presentation sau CAS | Giữ nguyên; mới kiểm không commit/không safe-text khi guard thất bại và replay không gọi model lại |
| Suggested actions/input | Actions là ordinary user text | Kiểm action tạo từ mâm đi qua tool lượt sau, giữ số khách/budget; hook/API nhận được input lượt ba với canonical version mới nhất |

Tên/giá/quantity/availability vẫn theo policy cards, không mở thêm quyền prose. Serving text không tự chứng minh đủ no; `meal_role`, category hoặc quantity không phải bằng chứng pairing. Khi full tool result không có source-bearing planner reason, không tự tạo lý do mới từ tên món.

Không thay frontend/transport, provider config, session/public API schema, database migrations, retrieval/planner/budget source hoặc các policy mutation/privacy.

## Bằng chứng và đánh giá trước/sau

Fixture `tests/server/fixtures/a09-response-v1.json` được tạo trước thay source, SHA-256 `87f2eb70aa07208f27bb1f82407d8b99d44f14c6c2b4693520aa0845f20321c9`. Giữ nguyên bytes, 32 development và 20 holdout. Development dùng để sửa guard; holdout đánh giá sau pass development. Ba regression bổ sung về phạm vi phủ định/điều kiện đến từ review code, không do lỗi holdout. Nhãn cùng người triển khai viết, **không phải holdout độc lập của nhà hàng**.

Runner cùng fixture/rubric/môi trường: before import source trước A09 từ baseline; after import source hiện tại. Kết quả chỉ là phép đo guard deterministic.

| Nhóm | Trước → sau: đúng kỳ vọng | False positive | False negative | Critical false negative |
|---|---:|---:|---:|---:|
| Development, 32 cases | 12 → 32 | 8 → 0 | 12 → 0 | 12 → 0 |
| Holdout, 20 cases | 6 → 20 | 6 → 0 | 8 → 0 | 8 → 0 |

Positive là câu hợp lệ bị chặn; negative là câu không hợp lệ được chấp nhận. Không suy các số 0 trên fixture thành bảo đảm không có lỗi ngoài tập kiểm.

45 regression A09 mới kiểm guard, ký tự, URL/số đã xác minh, projected payload, hidden-price repair, warnings/plan, actual tool execution của suggested action, state/cards, fail-closed runtime, committed presentation/replay và global kill switch trong ba request paths. Một server evaluation test khác đo sáu mẫu runtime/CAS/SSE synthetic. Một unit test mới kiểm suggested follow-up và input lượt ba tại hook/API boundary.

Timing: n=6, gồm 3 lượt không repair và 3 lượt repair; actual runtime/SQL adapter/CAS/SSE functions với SQL fixture và injected model trả ngay, không HTTP/browser/provider/PostgreSQL thật. Báo từng mẫu trong `evaluation-v1.json`, không p95 hay so sánh tốc độ runtime trước/sau. `repair_latency_ms` có thể là 0 với model tức thời và clock độ phân giải millisecond; không có nghĩa provider thật miễn phí hoặc không tốn thời gian.

## Ma trận A01–A09 và khoảng trống 120 scenarios

`A09-A10/requirements-matrix-v1.json` ánh xạ yêu cầu → suites/scenarios → kết quả → evidence → phần thiếu cho từng A01–A09. Các suites A01–A08 được tái chạy, không được nhận là thay đổi mới của A09.

`scenario-inventory-v1.json` đối chiếu sáu nhóm 25/15/20/20/25/15 trong mục 6 kế hoạch. Kế hoạch chưa có manifest canonical đủ 120 IDs. Fixture quality cũ có 76 development/helper IDs và 16 holdout/helper IDs, chủ yếu classifier/constraints/knowledge; không có đủ expected actual execution/state/runtime cho bộ 120 toàn hệ thống. Không cộng 92 IDs cũ với 52 guard cases mới, không suy ra coverage phần trăm hoặc “120 đã nghiệm thu”.

A06 vẫn thiếu coverage menu thật; A07 thiếu restaurant labels/latency; A08 giữ greedy, usefulness chưa có người chấm. A04/A05 PostgreSQL persistence/barrier thật vẫn chờ. Phiếu human evaluation đã chuẩn bị nhưng số người chấm là 0, không báo ≥4/5.

## Checks cuối

Lệnh chạy từ `tiger`; command, exit code, elapsed/environment và log path chi tiết tại `A09-A10/checks-v1.json`.

| Lệnh | Exit | Kết quả |
|---|---:|---|
| `npm run typecheck` | 0 | PASS |
| `npm run typecheck:server` | 0 | PASS |
| `npm run lint` | 0 | PASS; warnings baseline ngoài phạm vi |
| `npm run check:architecture` | 0 | PASS, 267 source files |
| `npm run test:architecture` | 0 | PASS, 8 tests |
| `npm run test:unit` | 0 | PASS, 196 tests/32 files |
| `npm run test:server` | 0 | PASS, 659 tests/47 files |
| `npm run build` | 0 | PASS; chỉ artifact build cục bộ |
| `npm run test:benchmark:offline` | 1 | Hai lỗi giống baseline: dry-run expected 8/8 got 4/8; loopback mock expected exit 0 got 1 |
| `npm run benchmark:concierge -- --dry-run` | 0 | Liệt kê 8 scenario IDs, 0 network requests; không phải chạy đạt 8 scenarios |
| Guard before/after runner | 0 | 52 cases; số liệu ở bảng trên |
| Synthetic runtime timing | 0 | 1 test, 6 samples; không runtime acceptance |
| `git diff --check` | 0 | PASS |

Các regression failures trung gian đã được sửa: metadata/context mới làm repair vượt turn allowance, xử lý bằng bỏ pool lặp và rút gọn policy; một điều kiện hợp lệ ở đầu câu che claim thứ hai, xử lý bằng kiểm mọi claim và phạm vi phủ định. Không tăng caps hoặc nới assertion cũ.

Benchmark legacy lỗi trước khi sửa A09, không nhận là regression mới. Diagnostic cùng adapter giả “Chào bạn” cho thấy missing-item/delivery-fee không qua safe composition; operational-hours/guest-order không đạt expectation văn bản. Giữ nguyên script/test legacy; ghi backlog cập nhật fixture/adapter để phản ánh pipeline hiện tại, không hạ assertions để xanh. Đây là gate còn thiếu, không báo toàn bộ benchmark PASS.

Không chạy PostgreSQL/integration/policies: chưa có `TEST_ENVIRONMENT`, `TEST_INSTANCE_IDENTITY`, `DATABASE_URL` hoặc disposable DB được xác minh; Docker CLI không có. Không chạy browser/E2E: không có Chromium cache và backend test được xác minh. Không cài hoặc dùng browser/profile cá nhân để giả nghiệm thu. Danh sách integration streaming/browser/persistence cần chạy được ghi đầy đủ trong checks/runbook.

Theo lựa chọn local-only, không gọi provider thật, xác minh effective website/backend/config/schema qua môi trường thật hoặc deploy. `.env.local` tồn tại nhưng không đọc/xuất credentials và không coi file đó là proof của runtime.

## Trạng thái từng gói

| Gói | Triển khai | Kiểm định cục bộ | Human / integration / runtime | Phát hành |
|---|---|---|---|---|
| A09 | Có | PASS trong phạm vi đã nêu | Còn chờ | Chưa đủ điều kiện |
| A10 | Có matrix/artifacts/runbook/phiếu chấm | Tám code checks PASS; benchmark legacy còn lỗi baseline | Còn chờ; 120 canonical scenarios chưa hoàn tất | Chưa hoàn thành |

## Artifacts và hoàn tác

- `Analysis/A09-A10/evaluation-v1.json`: guard before/after, sáu timing samples, benchmark diagnostic, pending human/runtime.
- `Analysis/A09-A10/fixture-manifest-v1.json`: nguồn/version/hash/split và giới hạn độc lập.
- `Analysis/A09-A10/requirements-matrix-v1.json`: yêu cầu, tests, evidence và gap từng gói.
- `Analysis/A09-A10/scenario-inventory-v1.json`: IDs cũ, phân bổ 120 và coverage chưa đủ.
- `Analysis/A09-A10/checks-v1.json`: commands/exit codes/logs và kiểm chưa chạy.
- `Analysis/A09-A10/environment-v1.json`: presence/prerequisites, không có secrets.
- `Analysis/A09-A10/human-evaluation.md`: rubric và phiếu chờ người thật.
- `Analysis/A09-A10/rollout-rollback.md`: gates, actual kill-switch path và rollback riêng.

Baseline ngoài repo có `manifest.json`, `before/`, `after/`, `delta-manifest.json`, `a09-a10.patch`, logs và harness. Manifest delta chỉ ghi thay đổi từ workspace trước A09, bảo toàn A01–A08. Phải kiểm after hash trước khi restore file/hunk; hash khác thì merge, không reset/clean hoặc reverse patch mù. Không có deploy/migration/data mutation để rollback trong đợt này.

## Backlog và giới hạn

1. Sửa benchmark legacy bằng synthetic fixture/adapter phù hợp evidence/current pipeline, giữ expectation thực chất và đo lại trước khi dùng làm gate.
2. Hoàn thiện manifest canonical 120 scenarios với expected end-to-end outcomes và split 80/40 theo kế hoạch; không tái gắn nhãn helper tests như đã nghiệm thu toàn hệ thống.
3. Có môi trường disposable PostgreSQL/backend/browser và quyền test riêng; chạy persistence/memory/draft/stream suites thật.
4. Nhà hàng bổ sung data coverage, relevance/portion/pairing sources, human usefulness/style và policy dữ liệu còn thiếu.
5. Guard vẫn là defense dựa pattern và evidence projection, không chứng minh mọi phát biểu tự nhiên hoặc mọi paraphrase. Factual relation checking, numeric association và các ngôn ngữ/cấu trúc chưa kiểm vẫn có giới hạn. Không dùng LLM judge hoặc tăng quyền để che chúng.
6. Sau này nếu được duyệt runtime, đo cùng môi trường và đủ mẫu trước khi kết luận p95/chi phí; deployment/source identity phải được xác minh riêng.

**Runtime chatbot: CHƯA KIỂM ĐỊNH.**
