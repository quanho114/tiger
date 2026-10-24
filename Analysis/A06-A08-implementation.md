# Bàn giao A06–A08 — 18/10/2026

**Code đã kiểm định cục bộ; chatbot thực tế chưa nghiệm thu.** Không commit, push, deploy, gọi provider có phí hoặc kết nối database/dữ liệu khách thật. Không xác minh backend đang phục vụ website đã có các thay đổi này.

## Trạng thái theo gói

| Gói | Code | Kiểm định cục bộ | Phần còn thiếu | Runtime |
|---|---|---|---|---|
| A06 | Có công cụ coverage, snapshot/freshness và ingredient-only filtering | Cache, revocation, ingredient assertions, aliases và reporting fixtures | Coverage menu thật, curation và chính sách hạn hiệu lực xác minh nguồn | Chưa nghiệm thu |
| A07 | Có chuẩn hóa, synonyms, exact matching, preferences và wiring qua gateway | Retrieval metrics cùng tests understanding → tools → cards, không hỏi lại dư thừa | Nhãn/query nhà hàng, độ tổng quát và p95 toàn luồng | Chưa nghiệm thu |
| A08 | Budget thống nhất; bounded combinations dùng cho đánh giá | Money boundaries, atomic draft operations, giá đổi, CAS/replay regressions và bounded limits | Nhà hàng chấm usefulness, latency và runtime acceptance | Chưa nghiệm thu; **greedy vẫn mặc định** |

Không coi các trạng thái này là hoàn tất toàn bộ tiêu chí A06–A08 hoặc A00/A09/A10.

## Baseline và bảo toàn công việc trước

- HEAD trước sửa: `2fbbc65da9dd2425af5822abfd6d00623c72473f`; A01–A05 đã có nhiều tracked/untracked changes.
- Lưu 495 file source/tài liệu, SHA-256, HEAD, Git status và tracked diff trước sửa tại `C:\Users\USER\Downloads\New Agent\tiger-a06-a08-baseline`. Không sao chép `.mcp.json`, `.env*`, node_modules hoặc dữ liệu khách.
- Baseline tập trung trước sửa: **108 tests / 8 files PASS**, gồm A01–A05, menu domain/retrieval, planner và turn constraints.
- Vitest/tiến trình con ban đầu bị sandbox `spawn EPERM`; kiểm tra cục bộ được chạy lại bằng quyền tạo tiến trình đã được hệ thống phê duyệt. Không dùng quyền đó để gọi dịch vụ thật.
- Fixture retrieval được viết và đo trước khi thay source: `tests/server/fixtures/a06-a08-evaluation.json`, version `a06-a08-synthetic-v1`. Các nhãn trong JSON không thay đổi trong quá trình tune.
- Manifest/diff bàn giao chỉ xác định thay đổi của A06–A08 so với trạng thái ban đầu, không so toàn bộ file với HEAD rồi nhận cả A01–A05 là công việc mới.

## Hành vi trước/sau và contracts

### A06

Trước đây retrieval chỉ loại `contains_allergen`/`conflict`; món unknown/unverified vẫn có thể thành candidate/card. Planner/draft chặn thêm ở bước sau nên các bề mặt không nhất quán. Cache có thể phục vụ snapshot cũ sau refresh lỗi mà không hạ quyền sử dụng dữ liệu dị ứng.

Sau sửa:

- Khi có dị ứng, retrieval chỉ trả candidates có ingredient evidence `verified_safe` cho đúng món và yêu cầu hiện tại. Thiếu profile, thiếu allergen assertion, `may_contain`, chưa xác minh, ngày xác minh thiếu/sai/tương lai hoặc snapshot hết hạn đều không cho vượt bộ lọc.
- Seafood/peanuts dựa trên allergen assertions được bếp duyệt; assertions phải tính cả nhân, nước dùng, sốt và thành phần phụ. Không dùng tên món để kết luận không chứa dị nguyên. Tên/mô tả mâu thuẫn với profile chỉ có thể làm chặn thêm, không cấp xác minh.
- Ánh xạ rõ các tên gọi như nước mắm, mắm tôm, dầu hào, nghêu/ngao, dầu đậu phộng, bơ đậu phộng, peanut oil/butter; compound allergy không được rút xuống chỉ một dị nguyên.
- Runtime retrieval/detail/draft resolver dùng ingredient-only evaluation: không đòi dữ liệu nhiễm chéo để cho phép món có thành phần phù hợp đã xác minh. `may_contain` là không đủ bằng chứng vắng mặt và vẫn bị loại. Legacy evaluation ngoài đường này giữ nguyên protections/tests.
- Không thay nhãn public `verified_safe`, nhưng notes giới hạn bằng chứng vào thành phần, không cam kết an toàn tuyệt đối hoặc chứng nhận dinh dưỡng/khẩu phần.
- Snapshot giữ TTL **45 giây**, loadedAt và expiresAt riêng với verifiedAt. Version thêm content hash để phát hiện thay đổi/xóa món dù maximum source timestamp không đổi.
- Refresh lỗi chỉ giữ snapshot cũ cho các dữ liệu có thể dùng dưới trạng thái stale. Allergen maps hạ verification, và các maps đã được cấp trước đó cũng mất hiệu lực khi chạm expiry.
- Failed forced refresh không cho lần đọc tiếp theo quay lại dùng snapshot cũ như fresh. Không có snapshot ban đầu thì lỗi.
- Invalidation cùng isolate không cho một read đang chạy tái công bố snapshot trước invalidation. Các isolate khác vẫn hội tụ qua TTL; không hứa thu hồi tức thì trên toàn hệ thống.
- Acceptance/review/handoff yêu cầu refresh profile; catalog giá/availability vẫn đọc authoritative theo lượt. Khi knowledge runtime lỗi, draft resolver không quay về module seeds.
- Sửa allergen assertions không kèm audit mới sẽ thu hồi xác minh. Một audit mới có attribution/notes dùng thời điểm server; reload cache không thay verifiedAt.

Schema hiện chỉ có **allergen assertions**, không có danh mục công thức/nguyên liệu đầy đủ. Báo cáo coverage nêu rõ giới hạn này; không coi một món có flag verified là đã chứng minh toàn bộ công thức ngoài dữ liệu được duyệt. Chưa tự đặt hạn hiệu lực xác minh theo số ngày khi nhà hàng chưa chốt; cache TTL không thay thế chính sách đó.

Công cụ:

```sh
node scripts/menu-readiness.mjs <snapshot.json> fixture
node scripts/menu-readiness.mjs <snapshot.json> unverified_export
```

Công cụ chỉ đọc JSON cục bộ, không tự kết nối database. Báo cáo có nguồn/version/loadedAt/expiry, mẫu số all-published/available, counts/percentages/missing IDs, serving confidence/role, taste/pairing, signature/bestseller từ menu_items và curation list. Phân biệt món thiếu profile với món hết bán; cảnh báo snapshot có thể bị giới hạn nếu đạt 2.000 items.

Đã chạy công cụ trên fixture 3 món: 2 available, 1 unavailable, 1 thiếu profile. Đây là kiểm định công cụ, **không phải coverage nhà hàng**. Artifacts: `readiness-fixture-snapshot.json`, `menu-readiness-fixture.json` trong baseline folder.

### A07

- Chuẩn hóa query/name/tags/category bằng cùng cách bỏ dấu, chữ thường và synonyms có kiểm soát. Giữ model hiểu yêu cầu và chọn read tools; không thêm classifier/model call/framework/embeddings.
- Exact-name matching được ưu tiên trước bonus preferences và vẫn đứng đầu khi diversify categories.
- Đã sửa cả named-item preselection trong runner, tránh loại synonym trước khi tới retrieval.
- Giữ signature đúng nghĩa filter. Bestseller/new-arrival vẫn unknown khi catalog tool contract chưa có evidence tương ứng; không gắn nhãn thay bằng signature.
- Preferences dùng nguồn A05 đã được consent/epoch/expiry xử lý: current **8**, explicit **6**, inferred **3**; cộng tối đa **18**, cùng preference không cộng lặp. Không sửa semantics dislikes A05 và không cho bonus vượt hard filters.
- Tie-break không tự ưu tiên món rẻ; giá vẫn là authoritative hard filter khi có cap.
- Giữ recommendation candidates tối đa **8**, search/cards theo cap cũ. Không tăng model/tool/context/time budgets hoặc payload schema.

Model vẫn có thể chủ động chọn query/read tools cho câu ngoài mẫu. Các tests kiểm tool thực chạy, tham số và cards/state, thay vì chỉ chấm helper hay bắt prose trùng exact-string.

### A08

- `budget.ts` dùng integer VND và kiểm subtotal món. Hard budget là trần; soft budget giữ conservative cap, không dùng tolerance **5%** từ config legacy.
- Retrieval dùng remaining budget sau draft. Planner cộng existing draft một lần. Suggested actions dùng tổng draft + proposed plan cho câu hỏi ngân sách toàn mâm.
- Draft batch được kiểm trên kết quả cuối: thêm tăng dòng cùng item+note; set quantity là lượng cuối; replacement tính sau cả remove/add. Không lưu trạng thái trung gian, không tính lại draft cũ thêm lần nữa.
- Revalidate draft cuối bằng catalog; giá đổi hoặc dị ứng/availability không hợp lệ bị chặn. Thêm vào dòng cũ không âm thầm chấp nhận giá mới cho toàn dòng.
- Price acceptance, review và handoff đều giữ cap; giá mới vượt cap không làm mất giá/draft cũ khi thao tác bị từ chối. Session review-only cũng kiểm cap trước CAS. Idempotency/version/explicit acceptance vẫn giữ.
- Plan identity dùng item IDs + tổng quantities, không phụ thuộc thứ tự. Greedy được giữ làm mặc định cùng các sửa correctness; fallback thiếu serving vẫn WARNING, quantity 1 không có nghĩa đủ cho nhóm.
- Bounded candidate chỉ xuất ra API nội bộ để đánh giá offline; không có model argument hoặc feature flag tự bật.
- Pool tối đa **8**, tổ hợp **2–3** dòng; quantity tối đa hai lựa chọn `ceil(diners/people_max)` và `ceil(diners/people_min)`, hợp nhất giá trị trùng, nằm trong 1–99.
- Trần tổ hợp: `C(8,2) × 2² + C(8,3) × 2³ = 560`. Dừng cấp thêm phương án khi đã chạm 560 hoặc clock đạt **50ms**. Đây là kiểm thời gian hợp tác giữa phương án, không phải bảo đảm realtime của scheduler; chỉ trả các phương án đã qua hard validation.
- Score có breakdown role/serving/budget/taste/pairing, dùng metadata có nguồn và chọn hai phương án khác tập món. Không gọi score là dinh dưỡng chính xác hoặc nghiệm thu độ ngon/đủ no.
- Bounded chưa có restaurant usefulness/independent holdout/p95 runtime để vượt greedy, nên **không thay mặc định**.

## Kết quả đánh giá và giới hạn

JSON đầy đủ: [A06-A08-evaluation.json](A06-A08-evaluation.json). Raw before/after reports nằm ngoài repository trong baseline folder.

Fixture synthetic gồm **12 món, 6 development queries, 7 holdout queries**; holdout có 6 ranking queries và 1 no-result query. Nhãn 0–3 do người triển khai viết theo nghĩa truy vấn, không phải nhà hàng gán. Các truy vấn có relevant set không quá 8; no-result không đưa vào mẫu số Recall/NDCG.

| Chỉ số | Development trước → sau | Holdout trước → sau |
|---|---|---|
| Recall@8 | 0,833 → 1,000 | 0,667 → 1,000 |
| NDCG@4 | 0,605 → 1,000 | 0,272 → 1,000 |
| Exact item top1 | 0,667 → 1,000 (3 queries) | 0,000 → 1,000 (3 queries) |
| Giá trung bình candidates | 108.750 → 110.104 VND | 104.479 → 108.542 VND |
| Category diversity trung bình | 0,813 → 0,792 | 0,792 → 0,833 |

Category diversity là số categories khác nhau / số candidates, tính trung bình theo query. Giá/category exposure là mô tả đầu ra, không phải chứng minh không có bias trên menu thật. Development diversity giảm nhẹ dù relevance tăng; không che bằng một điểm tổng hợp.

Timing retrieval được thu ở cùng phép đo nhỏ: development p95 **14,235 → 41,355ms**, holdout p95 **0,294 → 1,980ms**. Số mẫu quá ít, có cold-start và tải kiểm thử đồng thời; **không đạt bằng chứng cho mục tiêu p95 không tăng quá 10%**, không dùng để kết luận runtime nhanh hơn. Chưa có end-to-end/provider latency measurement. Giữ caps hiện có; hiệu năng trên catalog thật còn phải kiểm.

Đây là holdout tách khỏi tập tune, không phải bằng chứng đánh giá độc lập của nhà hàng. Không dùng kết quả để tuyên bố đạt mọi paraphrase hoặc plan usefulness ≥4/5. Chưa triển khai bộ 120 scenarios của A00.

Planner comparison có fixture pool 8 với hai quantities mỗi món; injected clock kiểm đủ 560 phương án, hai outputs hợp lệ. Đồng thời lưu measured wall time/capped status từ clock thật trong JSON. Synthetic feasibility không chứng minh bounded tốt hơn greedy; thời gian có thể biến động theo tải máy. Không có provider calls trong phép đo.

## File thay đổi trong đợt này

Các source paths sau tương đối với `supabase/functions/_shared/concierge/`:

| Nhóm | Files |
|---|---|
| Freshness/coverage | `types.ts`, `knowledge.ts`, `menu/types.ts`, `menu/repository.ts`, `menu/domain.ts`, `menu/profile-repository.ts`, `menu/readiness.ts` mới |
| Safety/retrieval | `food-safety.ts`, `menu-search.ts` mới, `menu-retrieval.ts`, `orchestration/catalog-resolver.ts`, `orchestration/main-context.ts`, `orchestration/tool-runner.ts` |
| Budget/planner/draft | `budget.ts` mới, `meal-planner.ts`, `draft-cart.ts`, `cart-handoff.ts`, `suggested-actions.ts`, `orchestration/handlers/draft-handler.ts` |

Ngoài source: `scripts/menu-readiness.mjs`; suites A06/A07/A08/evaluation và fixtures; `tests/server/concierge-menu-retrieval-contract.test.ts`; `Analysis/plan.md`, báo cáo này và evaluation JSON.

Test retrieval cũ từng cho demo unverified xuất hiện khi khách dị ứng đã được đổi sang assertion chặt hơn: không xuất hiện, đồng thời thêm positive case chỉ món có ingredient audit mới được trả. Không bỏ test hoặc nới assertions để che failure; legacy cross-contact tests vẫn giữ.

Không sửa frontend/transport, database schema/migrations, `.mcp.json`, consent, memory/account isolation, provider config hoặc code A09–A10.

## Checks và phần chưa chạy

Các kiểm tra cục bộ chạy ngày 18/10/2026; kết quả cuối được lưu trong baseline folder:

| Kiểm tra | Kết quả |
|---|---|
| Baseline tập trung | PASS, 108 tests / 8 files |
| `npm run typecheck` | PASS; đã sửa hai lỗi kiểu của fixtures mới |
| `npm run typecheck:server` | PASS |
| `npm run lint` | PASS với warnings ở các file ngoài diff A06–A08 |
| `npm run check:architecture` | PASS, 267 source files |
| `npm run test:architecture` | PASS, 8 tests |
| `npm run test:unit` | PASS, 195 tests / 32 files |
| Full server suite | PASS, 613 tests / 45 files trên source bàn giao cuối; gồm regression A01–A05 |
| `npm run build` | PASS; production artifact cục bộ, không deploy |
| Retrieval before/after comparison | PASS trên fixture v1; không suy ra latency/runtime acceptance |
| Readiness CLI | PASS trên snapshot fixture; không có coverage thật |
| `git diff --check` | PASS |

Focused suite cuối cũng PASS 126 tests / 5 files. Không cộng số tests từ các lần chạy lặp để báo tổng giả.

Không chạy PostgreSQL integration/policies: thiếu `TEST_ENVIRONMENT`, `TEST_INSTANCE_IDENTITY`, `DATABASE_URL` và không có Docker CLI để dựng disposable stack. Không kết nối database mặc định để thử vượt isolation guard.

Không chạy browser integration/E2E: không có Chromium cache được phát hiện và chưa có backend/test environment được xác minh. Không tự dùng browser/profile cá nhân hoặc cài môi trường để giả nghiệm thu.

Không chạy real-provider smoke: chưa có môi trường frontend/backend/source/version/schema/flags/provider được xác minh và chưa có chấp thuận gọi provider có phí. Theo **AGENTS.md §4**, “Real-provider smoke tests can incur costs and need explicit user approval”; quy tắc nghiệm thu không tự cấp approval đó. Offline/injected tests không thay thế gate này.

## Dữ liệu/xác nhận cần nhà hàng bổ sung

1. Với từng món ưu tiên: thành phần liên quan dị ứng, gồm nhân/nước dùng/sốt/phụ liệu; seafood/peanuts có nguồn và bằng chứng vắng mặt hoặc hiện diện, người/thời điểm duyệt. Không suy từ tên hoặc tag trống.
2. Serving unit/range/meal role và confidence có căn cứ; phần thiếu không được đánh dấu đủ cho nhóm.
3. Taste/pairing được duyệt và references hợp lệ; signature/bestseller đúng nguồn kinh doanh, không tự quy đổi giữa nhãn.
4. Chính sách thời hạn hiệu lực xác minh nguồn và cách thông báo khi công thức thay đổi; hiện chưa tự đặt số ngày.
5. Snapshot menu thật được phép đọc, danh sách món ưu tiên/mẫu số để đo coverage mục tiêu 90%.
6. Query/relevance labels và chấm plan usefulness độc lập, cùng môi trường runtime test được duyệt và chấp thuận provider smoke khi cần nghiệm thu.

Không yêu cầu thu thập dữ liệu nhiễm chéo cho A06.

## Hoàn tác riêng A06–A08

Baseline folder: `C:\Users\USER\Downloads\New Agent\tiger-a06-a08-baseline`.

- `manifest.json` + `files/`: trạng thái nội dung trước A06–A08, đã bao gồm A01–A05 chưa commit.
- `a06-a08-changes.json`: file modified/added/deleted và before/after SHA-256.
- `after/`: bản nội dung bàn giao của từng file đổi.
- `a06-a08-modified-files.patch`: diff riêng file modified giữa baseline và bản bàn giao; đường dẫn gắn baseline/current để đối chiếu từng hunk, không chạy apply mù.
- `baseline.patch`, `head.txt`, `status.txt`: bối cảnh trước sửa; **baseline.patch không phải patch hoàn tác riêng A06–A08**.
- `fixture.sha256`: hash fixture đánh giá v1.

Trước khi khôi phục, kiểm SHA-256 hiện tại có còn bằng after hash trong manifest không. Nếu khớp, file modified có thể lấy lại nội dung từ `files/`; file added chỉ gỡ sau khi xác nhận chưa có công việc mới phụ thuộc. Nếu hash khác, merge từng hunk để giữ thay đổi phát sinh. Không restore cả file theo HEAD và không reset/clean repository.

Các file cũ ngoài manifest thay đổi được so hash với baseline; không coi file untracked A01–A05 là file mới của đợt này. Không có database migration/session schema change hoặc deploy cần đảo trong đợt này.

Manifest cuối có **30 files** của A06–A08 (18 modified, 12 added); **477 file baseline khác giữ nguyên hash**.

**Runtime chatbot: CHƯA KIỂM ĐỊNH.** Cần môi trường test/runtime được xác minh và chấp thuận gọi provider thực tế để hoàn tất nghiệm thu theo AGENTS.md.
