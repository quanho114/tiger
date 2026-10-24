# Kế hoạch cải thiện agent Tiger345

Ngày lập: **18/10/2026**. Cập nhật **19/10/2026**: **A01–A09 có triển khai và kiểm thử cục bộ; A06 còn thiếu coverage/dữ liệu thật, A07 còn thiếu đánh giá nhà hàng/latency runtime, A08 giữ greedy mặc định. A09 còn chờ human/browser/provider evaluation. A10 đã có matrix/artifacts/runbook nhưng benchmark legacy còn lỗi baseline và các gates phát hành chưa đủ. PostgreSQL/browser/provider runtime chưa nghiệm thu. A00 chưa hoàn tất bộ 120 scenarios.**

Tài liệu tổng hợp bốn phân tích [Toolcalling](Toolcalling.md), [Memory](Memory.md), [Recommendations](Recommendations.md), [Conversation](Conversation.md), có đối chiếu mã nguồn hiện tại. Mục tiêu là biến các nhận xét thành công việc có thứ tự, đầu ra và điều kiện nghiệm thu. Đây là kế hoạch nâng cấp agent của sản phẩm Tiger345.

Đợt lập kế hoạch ban đầu chỉ đọc tài liệu/source và tạo tài liệu. Các cập nhật triển khai sau đó được ghi tại [A01–A02](A01-A02-implementation.md), [A03–A05](A03-A05-implementation.md) và [A06–A08](A06-A08-implementation.md); checkbox triển khai cục bộ không thay thế nghiệm thu runtime.

## 1. Kết luận và hướng đầu tư

**Ưu tiên sửa luồng hiểu yêu cầu và lấy dữ liệu trước, sau đó cải thiện ngữ cảnh, chất lượng gợi ý và cách trả lời.** Không bắt đầu bằng đổi model, tăng context window hay viết lại toàn bộ agent.

Agent đã có nền tảng đáng giữ: gateway kiểm quyền, read tools, catalog authoritative, draft có xác nhận, kiểm version/CAS/idempotency và streaming chỉ hiển thị kết quả đã kiểm định. Vấn đề chính là sự phối hợp giữa các lớp này và mức dữ liệu thực sự được sử dụng.

| Tài liệu | Nhận định ảnh hưởng lớn nhất | Hệ quả với khách | Việc ưu tiên |
|---|---|---|---|
| Toolcalling | Understanding, router, main-context và active tools còn diễn giải nhu cầu ở nhiều nơi | Hỏi menu nhưng agent không có tool menu; prompt không cứu được | A01–A02: một interpretation chung, tools/fallback/evidence nhất quán |
| Memory | Summary hiện là tóm trạng thái; nguồn memory bị trộn vào constraints | Mất mục tiêu sau hội thoại dài; khó áp dụng correction/forget đúng nguồn | A04–A05: structured context, provenance và lifecycle |
| Recommendations | Retrieval có pool nhỏ, planner greedy, profile quyết định nhiều khả năng tư vấn | Gợi ý đúng giá nhưng chưa chắc hợp bữa; dữ liệu có thể chưa đủ để tính khẩu phần | A06–A08: dữ liệu, recall, budget và tổ hợp có giới hạn |
| Conversation | Hỏi lại do nhiều handler quyết định; prose/cards/guard có hợp đồng riêng | Hỏi thừa, diễn đạt chung chung hoặc nhầm thiếu dữ liệu với lỗi truy cập | A03, A09: policy hỏi lại và phản hồi theo trạng thái |

### Phân biệt bằng chứng và giả thuyết

- **Đối chiếu được từ source:** conversation trả về trước `loadMainContext`; `activeToolsFor()` chỉ cấp restaurant lookup khi `faq || factualQuestion`; runner chưa truyền `is_signature`; summary giữ bốn messages cuối khi rút gọn; planner thử danh sách xuôi/đảo và kiểm trần budget dù soft/hard.
- **Cần đo hoặc tái hiện:** tỉ lệ route sai ngoài các câu đã nêu, mức mất ngữ cảnh, chất lượng món gợi ý với catalog đang phục vụ, độ trễ thực, hành vi xóa memory trong phiên đang chạy.
- Các con số **98 món/8 signature** trong Toolcalling là snapshot của lần khảo sát trước. Không dùng làm dữ liệu hiện tại hay làm chuẩn nghiệm thu mặc định.
- Các test/benchmark đã có là tài sản để mở rộng; tên suite hoặc báo cáo cũ không chứng minh phiên bản hiện tại đã vượt nghiệm thu.

## 2. Kết quả mong muốn

Sau nâng cấp, agent cần làm được một chuỗi hoàn chỉnh:

```text
Hiểu cùng một ý dù cách nói khác
  -> chọn đúng khả năng và read tools
  -> lấy evidence đúng nguồn, biết khi thiếu/lỗi
  -> giữ constraints và mục tiêu qua nhiều lượt
  -> tạo gợi ý có lý do và giá/khẩu phần có căn cứ
  -> hỏi đúng một điểm còn thiếu khi cần
  -> khách chấp nhận rõ ràng mới cập nhật draft
  -> kiểm lại dữ liệu trước handoff
```

Các nguyên tắc giữ xuyên suốt:

1. Hiểu intent không cấp thêm quyền. Actor/ownership/capability vẫn do runtime và gateway xác minh.
2. Tên/giá/availability lấy từ nguồn authoritative; lịch sử chat và summary không phải nguồn giá hiện hành.
3. Không dùng allergy chưa xác minh để cam kết an toàn; không nới safety khi ít kết quả.
4. Gợi ý, chấp nhận, draft, handoff và đơn/thanh toán/booking là các trạng thái riêng.
5. Summary và model prose không được phép tạo quyền mutation, thay thế IDs hoặc bỏ qua state version.
6. Tối ưu trong budget hiện tại trước: tối đa 3 model calls, 6 tools, estimate 6.000/call và 12.000/turn, turn budget 25 giây. Estimate là UTF-8 bytes cộng allowance, không phải billed tokens.

## 3. Lộ trình và phụ thuộc

Ước lượng dưới đây là **ngày công kỹ thuật cho một người đã quen dự án**, gồm triển khai và kiểm thử liên quan. Chưa gồm thời gian chờ nhà hàng xác minh dữ liệu, môi trường và nghiệm thu provider. Tổng sơ bộ **21–32 ngày công**; cập nhật sau A00.

| ID | Gói việc | Ưu tiên | Phụ thuộc | Ngày công | Đầu ra |
|---|---|---|---|---:|---|
| A00 | Bộ đánh giá và trace chẩn đoán | P0 | Không | 1–2 | Baseline tái chạy được, taxonomy lỗi |
| A01 | Understanding → route → tools dùng chung interpretation | P0 | A00 | 2–3 | Sửa coverage menu/signature và thống nhất read needs |
| A02 | Fallback và evidence đúng trạng thái | P0 | A01 | 1–2 | Không gọi vượt active set; phân biệt empty/unknown/unavailable |
| A03 | Clarification tối thiểu theo domain | P1 | A01–A02 | 2 | Hỏi đúng trường, không hỏi lặp hoặc mutation mơ hồ |
| A04 | Ngữ cảnh nhiều lượt và referent | P1 | A03 | 2–3 | Giữ mục tiêu/đổi ý qua compaction |
| A05 | Memory có nguồn, phạm vi và cơ chế quên | P1 | A01, A04 | 3–5 | Consent/correction/expiry/forget có hiệu lực trong phiên |
| A06 | Readiness và freshness của dữ liệu menu | P1 | A00 | 1–2 | Báo cáo coverage, danh sách curation, policy snapshot |
| A07 | Retrieval có ngữ nghĩa sản phẩm rõ ràng | P1 | A01–A02, A05–A06 | 2–3 | Recall/ranking/diversity được đo riêng |
| A08 | Budget nhất quán và planner tốt hơn | P1 | A06–A07 | 3–4 | Bounded combinations nếu vượt baseline greedy |
| A09 | Văn phong, cards, guard và độ trễ | P2 | A02–A05, A08 | 2–3 | Phản hồi tự nhiên, đúng state và đồng bộ UI |
| A10 | Kiểm định toàn hệ thống và phát hành | P0 trước release | A01–A09 | 2–3 | Bằng chứng offline/integration/runtime, rollback |

Thứ tự thực hiện đề nghị: **A00 → A01 → A02 → A03 → A04 → A05 → A06 → A07 → A08 → A09 → A10**. A06 có thể được nhà hàng chuẩn bị dữ liệu ngay từ đầu; triển khai kỹ thuật vẫn cần phối hợp cùng một snapshot contract.

Mốc bàn giao sớm sau A02: yêu cầu menu/đặc sản tới đúng nguồn và phản hồi lỗi đúng nghĩa. Chưa coi mốc này là hoàn tất chất lượng gợi ý hoặc runtime acceptance của toàn kế hoạch.

## 4. Công việc chi tiết

### A00 — Đo đúng trước khi thay đổi

**Mục tiêu:** biết agent thất bại ở lớp nào, có bộ so sánh trước/sau.



- [ ] Tạo bộ hội thoại tiếng Việt tổng hợp, gồm có/không dấu, dấu câu, đổi ý, câu ngắn, câu đa nhu cầu và tham chiếu lượt trước. Không lấy hội thoại riêng của khách làm fixture mặc định.
- [ ] Khởi tạo khoảng **120 scenario IDs** theo ma trận mục 6; tách 80 development và 40 holdout theo nhóm cách diễn đạt, tránh hai biến thể gần giống lọt hai phía.
- [ ] Đóng băng holdout trước khi tune. Nếu một lỗi holdout được đưa vào regression để sửa, bổ sung trường hợp độc lập vào holdout mới và ghi version; không báo điểm trên tập đã dùng để tối ưu như kết quả chưa từng thấy.
- [ ] Gán expected read needs, route, tool set, evidence outcome, constraints, clarification và mutation expectation; món hợp lệ dùng ID từ fixture có version.
- [ ] Mở rộng metric/trace bằng metadata enum và counts: intent/read need, route, active/executed tools, fallback reason, evidence status, candidate count, context trimming và guard repair. Đồng bộ schema strict và nơi emit.
- [ ] Đo latency theo bước và tổng lượt; ghi actual provider usage khi có, tách khỏi byte estimate.
- [ ] Tái dùng benchmark hiện có cho phần phù hợp. Nó dùng fake catalog/FAQ và chỉ đo model scenario; không coi nó là bộ nghiệm thu website.

**Điểm sửa:** `observability.ts`, `orchestrator.ts`, `runtime.ts`, tests quality/observability và runner benchmark khi cần. Các đường server trong mục 4 tương đối với `supabase/functions/_shared/concierge/`.

**Đầu ra/đạt khi:** có fixture/version, manifest development/holdout, baseline theo nhóm và lỗi theo từng lớp. Trace không có raw prompt/transcript, allergy text, address, key, token/capability hoặc payload riêng tư. Chưa chạy live cũng phải có baseline deterministic; ghi rõ chưa có provider/runtime baseline.

### A01 — Một interpretation cho toàn chuỗi tra cứu

**Mục tiêu:** sửa nguyên nhân gốc của các biến thể “đặc sản của quán”.



- [x] Mở rộng `TurnUnderstanding` bằng read needs có kiểu, ví dụ menu browse/detail/recommendation, restaurant fact và mục tiêu merchandising `signature`. Contract nội bộ đã triển khai; không thay đổi enum API công khai.
- [x] Giữ riêng intent, retrieval target và nhu cầu clarification; confidence thấp tự nó không cấp tool hay gây mutation.
- [x] Cho router, main-context, food-handler và tool-runner sử dụng interpretation chung; loại bỏ các quyết định FAQ/menu trùng lặp có thể mâu thuẫn.
- [x] Ánh xạ rõ “đặc sản” sang filter `is_signature` hiện có. Không gộp “bán chạy” hay “món mới” vào cùng nhãn.
- [x] Giữ câu browse khác yêu cầu lập mâm: đã biết số người/budget không có nghĩa mọi câu tiếp theo đều là `recommend_meal`.
- [x] Câu đa nhu cầu phải có kết quả hoặc trạng thái thiếu dữ liệu cho từng nhu cầu; nếu xử lý nối tiếp thì nói rõ phần còn chờ. Không âm thầm bỏ phần còn lại.

**Điểm sửa:** `understanding/types.ts`, `engine.ts`, `intent-classifier.ts`, `orchestration/capability-router.ts`, `main-context.ts`, `handlers/food-handler.ts`, `tool-runner.ts`.

**Đạt khi:** các biến thể “đặc sản của quán”, “món đặc sản của quán”, “đặc sản của quán?”, “dac san cua quan” đi hết chuỗi **understanding → route → catalog → active tools → tool execution → evidence/cards** đúng theo fixture. Có món signature phù hợp thì chỉ gắn nhãn đúng món đó; không có thì trả rỗng có giải thích. Smalltalk/off-topic không tự tải catalog; account reads vẫn kiểm auth/ownership. Không thêm model call phân loại trong bước này.



- [ ] Nghiệm thu website/provider thật cho A01 — **Runtime chatbot: CHƯA KIỂM ĐỊNH**. Các checkbox trên chỉ xác nhận triển khai và kiểm thử cục bộ; xem [bằng chứng A01–A02](A01-A02-implementation.md).

### A02 — Fallback và bằng chứng không được nói sai quá trình

**Mục tiêu:** phân biệt “đã tra nhưng không có kết quả” với “không kiểm tra được”.

Đối chiếu baseline trước triển khai: `computeEvidenceStatus()` từng gộp output `unknown`, `unavailable` và các mảng rỗng thành `unknown`; mảng exchanges rỗng đi qua hàm sẽ trả `known`. Đây là hành vi của hàm trong source, chưa chứng minh có lượt runtime thực tế không tool nhưng được trả facts.



- [x] Chuẩn hóa outcome nội bộ: chưa thực hiện, có evidence, kết quả rỗng, chưa xác minh, nguồn không khả dụng. Mapping sang contract công khai phải được định nghĩa và test, không tự thêm enum phá client.
- [x] Giữ trạng thái theo từng tool/nhu cầu; một tool trả facts không làm facts của tool khác thành known. Với mixed results, composition biết phần nào được phép trả lời.
- [x] Lọc/validate fallback bằng active set và read registry như model calls, sau đó vẫn qua gateway. Baseline `selectToolCalls()` từng trả thẳng fallback khi không có model call dùng được; đường này đã được validate và khóa bằng regression.
- [x] Model không call/call sai schema → fallback đúng domain; dependency lỗi → unavailable; empty → không có kết quả trong tiêu chí đã tra. Không bịa “đã tra” khi tool chưa chạy.
- [x] Giữ repair grounded tối đa một lần và fail đóng khi vẫn không qua guard.

**Điểm sửa:** `orchestration/tool-runner.ts`, `handlers/food-handler.ts`, `orchestrator.ts`, `response-guard.ts`; chỉ đổi tool contracts nếu test chỉ ra cần.

**Đạt khi:** failure injection phân biệt invalid args, unknown tool, inactive fallback, timeout, empty, unavailable, zero exchanges và mixed outcomes. Không tăng quyền, không tự trả facts từ model khi nguồn không có.



- [ ] Nghiệm thu website/provider thật cho A02 — **Runtime chatbot: CHƯA KIỂM ĐỊNH**. Các checkbox trên chỉ xác nhận triển khai và kiểm thử cục bộ; xem [bằng chứng A01–A02](A01-A02-implementation.md).

### A03 — Hỏi ít nhưng đúng điểm cần hỏi

- [x] Định nghĩa clarification result có reason, missing field hoặc unresolved referent; handler kiểm chứng mục tiêu, model hiểu ý/chọn read tools và diễn đạt.
- [x] Browse menu/đặc sản: có thể tra ngay, không ép khách cung cấp số người/khẩu vị.
- [x] Lập mâm: tái dùng số người, budget và constraints đã có; chỉ hỏi trường có ảnh hưởng lớn nhất còn thiếu. Policy model yêu cầu nói rõ giả định/no confirmed budget cap.
- [x] Đặt bàn thiếu giờ/ngày/số khách: hỏi đúng trường, lưu câu hỏi đang chờ để “19h” ở lượt sau được ghép đúng ý.
- [x] Nhiều pending items và “món đó/ok”: hỏi món/phương án nào; không chọn bừa. Page ID và displayed/pending references được kiểm lại theo scope/version.
- [x] Không coi mọi input low-confidence là phải hỏi lại; model có thể chọn public read tools cho câu ngoài mẫu trong budget hiện có.

**Bằng chứng:** regression hội thoại/state/cards/tool execution trong `tests/server/concierge-a03.test.ts`; chưa nghiệm thu cách hiểu/diễn đạt của provider thật. Xem [báo cáo A03–A05](A03-A05-implementation.md).

**Điểm sửa:** understanding, handlers conversation/food/reservation/draft và session contracts nếu cần giữ pending clarification.

**Đạt khi:** mỗi lượt chỉ một câu hỏi trọng tâm; không hỏi lại trường vẫn hợp lệ; không biến “nghe ngon”, “để xem” hoặc câu mơ hồ thành chấp nhận draft. Kiểm qua hội thoại nhiều lượt, không chỉ exact-string một câu trả lời.

### A04 — Nhớ mục tiêu trong phiên và resolve tham chiếu có giới hạn

- [x] Thiết kế structured conversation context tối thiểu: mục tiêu đang xử lý, câu hỏi còn thiếu, tiêu chí vừa đổi, lý do từ chối và danh sách tham chiếu đang hiển thị có giới hạn.
- [x] Ưu tiên cập nhật xác định từ kết quả handler/state; không thêm LLM summarizer vào mọi lượt.
- [x] Thêm nguồn và phạm vi cho các trường mới; summary được dựng từ structured state, không nâng suy đoán thành facts.
- [x] Resolve “món thứ hai” theo danh sách đã hiển thị của đúng lượt/phiên/version. Khi page hoặc pending list đổi, tham chiếu cũ được kiểm lại hoặc hỏi rõ.
- [x] Test trước/tại/sau ngưỡng 10 user messages, 2.500 UTF-8 bytes, trim history và essentials vượt budget. Giữ bốn messages, không phải bốn cặp lượt.
- [ ] Nếu mở rộng persisted state, cập nhật Zod/contracts, giới hạn kích thước, cách đọc record cũ và test PostgreSQL; migration chỉ khi thay đổi schema lưu trữ thật sự yêu cầu.

**Bằng chứng:** contracts/size limits/legacy reader và session-store/SQL-boundary tests đã có; suite PostgreSQL thật đã viết nhưng chưa chạy vì thiếu disposable test database được xác minh. Không cần migration bảng vì state vẫn là JSON text. Checkbox persistence giữ mở cho đến khi có bằng chứng PostgreSQL thật.

**Điểm sửa:** `session-summary.ts`, `context.ts`, understanding/draft resolution, `orchestrator.ts`, `contracts/concierge-v2.ts` và tests session/context/persistence.

**Đạt khi:** số người, hard budget, nonspicy/allergy và mục tiêu chưa giải quyết vẫn đúng sau compaction; đổi ý chỉ sửa đúng trường. Summary cũ không vượt constraints mới và không được dùng để bỏ qua IDs/version. Không tăng context budget mặc định để che mất thông tin.

### A05 — Tách memory theo nguồn và phạm vi, kiểm cơ chế quên

**Mục tiêu:** cá nhân hóa có thể giải thích và có thể loại bỏ đúng dữ liệu.



- [x] Tách current meal/group constraints, explicit personal facts và behavioral preferences; effective constraints được tính lại với provenance.
- [x] Giữ nguồn, scope, thời điểm, expiry và epoch; model chỉ nhận phần metadata cần thiết.
- [x] Precedence theo từng fact; current meal thắng preference lịch sử, dislike/allergy thắng inferred favorite; natural-language allergy correction giữ protection và yêu cầu review.
- [x] Gate dùng canonical read needs và explicit extraction; preference/correction không bị food classifier chặn, temporary/third-party không thành durable personal fact.
- [x] Kiểm consent/epoch và persistence sau CAS, bỏ replay writes; guard chặn unsupported durable-memory claims.
- [x] Delete/forget/disable/expiry loại imported memory khỏi effective constraints/state/model input; giữ current meal độc lập, kể cả khi cùng giá trị với fact bị quên.
- [x] Account transaction barrier và epoch revalidation; controlled offline runtime/CAS races, không hứa thu hồi nội dung đã hiển thị.
- [x] Behavioral refresh một lần mỗi session/epoch ở lượt food đầu tiên, kể cả sau lời chào.
- [x] Tái dùng reset CAS/delete/create và claim hiện có; có tests logout/account-switch riêng.

**Bằng chứng cục bộ:** `tests/server/concierge-a05.test.ts` và hai ca UI mới. PostgreSQL/privacy barrier thực, browser/backend/provider acceptance chưa kiểm định; không coi checkbox triển khai là PASS runtime.

**Điểm sửa:** `orchestration/main-context.ts`, `runtime.ts`, `memory-retrieval.ts`, `memory-extractor.ts`, `memory-repository.ts`, `behavioral-memory.ts`, session contracts và UI memory controls khi hợp đồng thay đổi.

**Đạt khi:** guest/opt-out không đọc hoặc ghi durable facts; test consent on/off, delete một fact, forget all, suppression/restore, expiry, replay và stale epoch. Kiểm cả repository, active session và payload của injected adapter; không chỉ assert bảng memory rỗng. Không bật memory cho khách thật để chạy thử.

### A06 — Cải thiện dữ liệu menu trước khi tối ưu thuật toán

- [x] Công cụ báo cáo snapshot có nguồn/version/loadedAt/expiry, mẫu số all-published/available, serving range/confidence/role, taste/pairing, signature/bestseller, allergen assertions/verification và danh sách curation; đã kiểm bằng fixtures, **chưa đo coverage thật**.
- [ ] Chạy báo cáo trên snapshot của môi trường đọc đã được xác minh và cho phép. Schema hiện có allergen assertions, chưa phải kho công thức/nguyên liệu đầy đủ.
- [ ] Ưu tiên curation cho món công khai/available thường xuất hiện trong các truy vấn đánh giá. Nhà hàng xác nhận khẩu phần/role; bếp xác minh allergy riêng.
- [ ] Đặt mức khởi đầu: ít nhất 90% tập món ưu tiên có serving/role được nhà hàng xác nhận; ghi rõ mẫu số và phần còn thiếu. Đây là mục tiêu đề xuất, không phải coverage đã đo.
- [x] Snapshot version kết hợp source timestamp và content hash; giữ TTL 45 giây, loadedAt khác verifiedAt. Invalidation trong isolate không cho read đang chạy tái công bố dữ liệu cũ. Isolate khác hội tụ qua TTL, không bảo đảm tức thì.
- [x] Snapshot hết hạn/refresh lỗi không giữ quyền vượt bộ lọc dị ứng; acceptance/review/handoff yêu cầu refresh. Giá/availability vẫn đọc catalog authoritative. Sửa allergen assertions không kèm audit mới sẽ thu hồi xác minh.
- [x] Quyết định người dùng: **A06 chỉ kiểm thành phần, bỏ thu thập/xác minh/kiểm thử nhiễm chéo**. Runtime dùng ingredient-only evaluation; không đòi cross-contact evidence để cho phép món đã có xác minh thành phần phù hợp. `may_contain` vẫn thiếu bằng chứng vắng mặt nên bị loại. Bộ kiểm tra legacy ngoài đường này được giữ.

**Điểm sửa:** Menu Domain, repository/mapper/profile-quality và Admin Menu Intelligence nếu cần hiển thị coverage/freshness. **Phụ thuộc ngoài code:** nhà hàng/bếp duyệt dữ liệu; AI draft chưa duyệt không được làm runtime truth.

**Trạng thái:** code/các cache tests đã kiểm định cục bộ; coverage thật, curation và nghiệm thu runtime còn mở. Không gắn nhãn “đủ cho nhóm/an toàn dị ứng” chỉ vì đạt recommendation readiness.

### A07 — Đo và cải thiện retrieval

- [x] Fixture synthetic v1: 12 món, 6 development + 7 holdout queries; relevance 0–3 tách khỏi hard eligibility, no-result chấm riêng; đã lưu baseline trước sửa. Không thay bộ A00/nhãn nhà hàng độc lập.
- [x] Chuẩn hóa tiếng Việt/synonyms cho query và tên/tags/category, cả preselection trong runner; giữ exact-name/ID và pin exact match qua diversification.
- [x] Giữ signature là filter; bestseller/new-arrival không tự ánh xạ sang signature.
- [x] Trọng số preferences current/explicit/inferred là 8/6/3, tổng bonus tối đa 18; không vượt hard filters và không sửa semantics dislike A05.
- [x] Đo Recall@8/NDCG@4/exact-top1, mean price, category exposure/diversity trước/sau. Bỏ ưu tiên giá rẻ ở tie-break; giữ recommendation pool 8/search 4.
- [ ] Giữ tập ứng viên nội bộ tách khỏi dữ liệu gửi provider; tăng pool trong tương lai cần đồng bộ schema, thời gian và byte budget.
- [ ] Đánh giá trên menu/nhãn nhà hàng và latency runtime cùng môi trường; chưa chứng minh mục tiêu p95 không tăng quá 10%.

**Điểm sửa:** `menu-retrieval.ts`, `orchestration/tool-runner.ts`, Menu Domain adapter và retrieval contract tests.

**Trạng thái:** kiểm định cục bộ; synthetic holdout Recall@8 66,7% → 100%, NDCG@4 0,272 → 1,000, exact top1 0% → 100% (3 exact queries). Chưa nghiệm thu tổng quát hoặc runtime; xem giới hạn và timing trong báo cáo.

### A08 — Chốt budget và cải thiện lập mâm có giới hạn

**Quyết định người dùng:** hard budget là trần subtotal món của draft dự kiến sau thao tác. Thêm/thay thế/set quantity không tính trùng draft cũ. Soft budget giữ conservative cap; **không áp dụng mức vượt 5%** dù config legacy có field tolerance. Phí giao/checkout tách riêng.



- [x] Đồng bộ cap trong retrieval/planner/draft mutation/price acceptance/review/handoff/suggested actions; không tăng budget/calls/context.
- [x] Tests đúng trần/vượt 1 đồng/draft chạm hoặc vượt trần, thêm/thay thế/set quantity, price change, atomic rejection và review trước CAS. Idempotency/version regressions giữ nguyên.
- [x] Bounded combinations để đánh giá offline: pool 8, tổ hợp 2–3 dòng, tối đa 2 quantities/dòng từ people_min/people_max; tối đa 560 phương án và 50ms theo clock check giữa các phương án.
- [x] Score có breakdown role/serving/budget/taste/pairing; dữ liệu AI chưa đủ nguồn không được làm xác minh. Không coi heuristic là tư vấn dinh dưỡng hoặc chất lượng được nhà hàng duyệt.
- [x] Chuẩn hóa identity bằng item IDs + tổng quantities, không phụ thuộc thứ tự; hai lựa chọn bounded phải khác tập món.
- [x] Giữ fallback thiếu serving ở WARNING; dưới hai món không tạo mâm. Giới hạn 2–3 dòng chỉ thuộc tính năng lập mâm, không thành flow hội thoại.
- [x] **Giữ greedy mặc định.** Bounded không được model/flag tự bật; chỉ bàn giao implementation và so sánh feasibility offline.
- [ ] Nhà hàng chấm usefulness trên holdout độc lập, đo p95 toàn luồng và nghiệm thu runtime trước khi cân nhắc thay greedy.

**Điểm sửa:** `meal-planner.ts`, `knowledge.ts` nếu dùng config đã định nghĩa, retrieval/draft validation/suggested actions và plan cards khi cần.

**Trạng thái:** budget/correctness đã kiểm định cục bộ; bounded chỉ được đánh giá feasibility, chưa đủ bằng chứng thay mặc định. Runtime chưa nghiệm thu.

### A09 — Phản hồi tự nhiên nhưng đúng evidence, cards và state

- [x] Chuẩn hóa mục tiêu diễn đạt cho known/empty/unknown/unavailable/clarification/draft result; kiểm định cục bộ wording/evidence theo A02, chưa chấm provider thật.
- [x] Style policy tiếng Việt, xưng hô trung tính, thường 1–3 câu và tối đa một follow-up cần thiết; guard 700 ký tự giữ nguyên. Không đếm câu cứng hoặc tăng budgets.
- [x] Giữ thông báo transaction xác định; bổ sung guard/regression chặn model claim success. Không suy thành bảo đảm mọi paraphrase ngoài fixtures.
- [x] Giữ tên/giá/quantity/availability authoritative trên cards; guard dùng projected evidence giống model, không mở quyền prose từ hidden prices.
- [x] Kiểm `compactToolExchanges()` và payload model thật trong injected tests: giữ serving text/role/warnings, không bịa pairing hoặc bảo đảm khẩu phần; bỏ candidate pool lặp khi đã hiển thị plan.
- [x] Thêm adversarial paraphrases/câu đúng dễ bị chặn và guard/repair metrics. Fixture version/hash, 32 development + 20 holdout kỹ thuật; không dùng LLM judge hoặc tự nhận human evaluation.
- [ ] Đo first status, first verified text, completion và repair latency. Giữ verified presentation sau commit; không phát raw tokens chưa kiểm định để giảm cảm giác chờ.
- [ ] Kiểm suggested actions ở lượt tiếp theo, input sau lượt 2, Stop/retry/disconnect và desktop/mobile. Dừng kết nối không đồng nghĩa mutation đã rollback.

**Điểm sửa:** `context.ts`, `orchestrator.ts`, `response-guard.ts`, `suggested-actions.ts`, các handlers; frontend `src/features/concierge/` chỉ khi cần sửa hiển thị/transport.

**Cập nhật cục bộ 19/10/2026:** 45 regressions A09 + một test đo sáu mẫu runtime/CAS/SSE synthetic; thêm unit test input lượt ba/suggested action ở API boundary. Các suites Stop/retry/disconnect/commit được tái chạy; không đổi frontend/transport. Hai checkbox latency/UI ở trên giữ mở vì chưa có runtime/browser/desktop/mobile acceptance. [Báo cáo A09–A10](A09-A10-implementation.md).

**Đạt khi:** chấm người thật đạt rubric mục 5; không mâu thuẫn cards, không hỏi thừa; error state còn trung thực. Timeout/provider error không bị che bằng lời chào hoặc câu trả lời giả thành công.

### A10 — Nghiệm thu, rollout và rollback

- [x] Gộp bằng chứng cục bộ theo từng gói: HEAD + workspace/delta hashes, fixture version, command/exit code, guard trước/sau, failure cases và kiểm chưa chạy. Không có commit/deploy mới.
- [ ] Hoàn tất toàn bộ checks phù hợp ở mục 7; không sửa assertion để che regression.
- [ ] Xác minh frontend URL, backend destination, source/version đang serve, schema, flags và effective provider config của môi trường bàn giao; chỉ kiểm credential presence, không xuất secrets.
- [ ] Thực hiện real-provider smoke trên website Tiger theo `AGENTS.md`, bằng phiên guest/test mới và môi trường được duyệt. Kiểm từ chào → lượt 2 → facts/menu/giá → gợi ý → chấp nhận draft → đổi lượng; handoff chỉ trong giỏ test cô lập.
- [ ] Đánh giá thêm hội thoại nhiều lượt và chấm người thật; dùng cùng rubric cho hai phiên bản. Provider call có phí cần chấp thuận riêng khi triển khai, tài liệu kế hoạch không phải chấp thuận đó.
- [x] Chuẩn bị runbook rollout/rollback theo gói; backend A09 giữ atomic imports/metrics. Chưa rollout, không thêm flag hoặc giả định có sẵn rollout theo phần trăm.
- [x] Kiểm kill switch qua actual request handler cục bộ cho chat/action/feedback. `provider.enabled=false` không phải global gate; runbook giữ manual ordering/checkout/privacy. Effective flag trên môi trường thật vẫn chưa xác minh.
- [ ] Với thay đổi session/memory contract: deploy tương thích trước, chứng minh đọc record cũ; rollback không khôi phục fact đã bị quên hoặc bỏ epoch fence.

**Đạt khi:** tất cả critical gates PASS và có bằng chứng runtime thật; nếu thiếu môi trường/provider approval thì ghi **Runtime chatbot: CHƯA KIỂM ĐỊNH**. Không gọi offline/injected tests là runtime PASS.

**Trạng thái 19/10/2026:** tám code checks PASS (659 server/196 unit/8 architecture tests). Benchmark offline legacy vẫn lỗi hai tests như baseline. Chưa hoàn tất manifest canonical 120 scenarios, human evaluation, PostgreSQL/browser hoặc provider/runtime gates. A10 **chưa hoàn thành**, release chưa đủ điều kiện. Người dùng chọn chỉ kiểm định cục bộ trong đợt này. Artifacts/gates: [A09–A10](A09-A10-implementation.md), [runbook](A09-A10/rollout-rollback.md).

## 5. Chỉ số và điều kiện thành công

Các ngưỡng dưới là **mục tiêu khởi đầu**, chưa phải kết quả hiện tại. Chốt sau A00, trước khi tune, và báo theo nhóm/sample size. Các chỉ số an toàn, quyền và số tiền không được hạ ngưỡng để làm đẹp điểm.

| Chỉ số | Cách đo | Mục tiêu đề nghị |
|---|---|---|
| Critical routing cases | Đúng toàn chuỗi read need → evidence với các câu menu/signature nêu ở A01 và account safety | 100% trên bộ regression bắt buộc |
| Route/tool success tổng thể | Số scenario đúng route + actual tool + outcome / số scenario có expected read | ≥95% holdout; báo riêng từng nhóm |
| Safety/ownership/mutation | Unauthorized access, allergy claim thiếu xác minh, mutation khi chưa chấp nhận, stale acceptance | 0 vi phạm trong suite bắt buộc; không suy thành bảo đảm tuyệt đối ngoài suite |
| State continuity | Constraints/đổi ý/referent/mục tiêu đúng sau nhiều lượt và compaction | 100% critical constraints; ≥95% follow-up được hỗ trợ |
| Memory lifecycle | Consent, forget, expiry, suppression, epoch và active-session/model-input assertions | 100% cases bắt buộc |
| Candidate Recall@8 | Tỉ lệ món được gán nhãn hợp lệ xuất hiện trong top 8 sau hard filters; query không có món hợp lệ chấm riêng | ≥90% trên nhóm có 1–8 món hợp lệ; nhóm nhiều hơn 8 báo Recall và Hit@8 riêng, không áp trần 90% bất khả thi |
| Ranking NDCG@4 | Relevance 0–3 do nhà hàng gán trên bộ query; exclude no-result queries | Không thấp hơn baseline; mục tiêu tăng ≥10% tương đối nếu baseline còn dư địa |
| Plan correctness | IDs, quantities, subtotal, hard/soft budget, availability và warning | 100% invariant assertions |
| Plan usefulness | Nhà hàng chấm phù hợp bữa/khẩu phần có căn cứ/role/budget/diversity, thang 1–5 | Trung bình ≥4/5, không vi phạm safety; báo số người và số plans |
| Clarification | Hỏi sai trường/hỏi lại dữ kiện đã có trong scenario có đủ thông tin | ≤5%; mọi ambiguity có khả năng mutation phải được chặn/hỏi rõ |
| Văn phong và grounding | Chấm 1–5: rõ ràng, hữu ích, tự nhiên, có căn cứ, nhất quán state/cards | Trung bình ≥4/5; 0 critical factual/transaction contradiction |
| Latency và chi phí | p50/p95 tổng lượt, first status/verified text, actual model/tool calls và reported tokens | Không tăng p95 quá 10% so baseline cùng môi trường; không vượt caps hiện có |
| Guard repair/reject | Tách câu sai bị chặn, câu đúng bị chặn, retry thành công và fail đóng | Giảm false positives so baseline; không tăng critical false negatives |

Không dùng một “điểm agent” tổng hợp che lỗi critical. Nếu recall đã tốt nhưng plan kém thì sửa planner; nếu không có evidence thì không tune style để che lỗi.

## 6. Bộ kịch bản và ma trận kiểm thử

Phân bổ khởi đầu: **120 scenario IDs**, mỗi ID có thể chứa nhiều lượt/biến thể. Đây là kế hoạch tạo mới/mở rộng fixture, không phải 120 case đã tồn tại hoặc đã chạy.

| Nhóm | Số IDs | Ví dụ và assertion chính |
|---|---:|---|
| Routing/tool coverage | 25 | Đặc sản có/không dấu/dấu hỏi; menu; giá món; giờ mở; mixed query; smalltalk negative; kiểm actual execution |
| Clarification/conversation | 15 | Browse không bị hỏi số người; booking thiếu giờ; tên món mơ hồ; empty khác unavailable |
| Session/context | 20 | Số người/budget/đổi ý; mục tiêu chưa xong; “món thứ hai”; page đổi; ngưỡng compaction/context budget |
| Memory/privacy | 20 | Guest/consent; tạm thời/người khác; explicit/inferred conflict; delete/forget/disable/epoch race/expiry |
| Retrieval/planner | 25 | Signature, synonyms, roles/portions; 0/1 candidates; hard/soft boundary; existing draft; stale profiles và quantity |
| Failure/transport/transaction | 15 | Invalid tool, timeout, provider lỗi, guard repair, Stop/retry/disconnect, CAS/idempotency, claim/account switch |
| **Tổng** | **120** | Critical cases được đánh dấu riêng và luôn phải pass |

Tái dùng các suite hiện hữu, mở rộng đúng lớp thay vì tạo test chỉ khớp implementation:

- Understanding/tool: `concierge-understanding`, `concierge-orchestration-phase4`, `concierge-capability-gateway`, `concierge-grounding`.
- Context/memory: `concierge-session-summary`, `concierge-context-budget`, `concierge-turn-constraints`, `concierge-memory-contract`, `concierge-memory-extractor`, `concierge-memory-retrieval`, session/claim suites.
- Menu/planner: `concierge-menu-retrieval-contract`, `concierge-menu-domain`, `concierge-menu-governance`, `concierge-meal-planner`.
- Quality/operations: `concierge-agent-quality`, `concierge-quality`, `concierge-quality-holdout`, `concierge-observability`, `concierge-v2-failures`.
- UI/integration: streaming/draft/memory-controls unit tests và PostgreSQL/browser/memory/draft-workflow integration suites.

Các tên trên là basename của tests đã có trong repo, chưa phải kết quả chạy. Test injected adapter cần assert payload thật model nhận, tool đã chạy và state/card cuối cùng. Chấm lời văn bằng rubric, tránh lấy exact-string snapshot làm thước đo chất lượng duy nhất.

## 7. Kiểm định khi thực hiện thay đổi code

Chạy từ thư mục dự án `tiger`, theo `AGENTS.md`, hướng dẫn verification và các scripts trong `package.json`:

```sh
npm run typecheck
npm run typecheck:server
npm run lint
npm run check:architecture
npm run test:architecture
npm run test:unit
npm run test:server
npm run build
```

Chạy test tập trung theo gói trong lúc phát triển; hoàn tất checks cần thiết trước bàn giao. Thay đổi module dependencies cần architecture check; thay đổi luật kiến trúc cần architecture tests.

Database/browser suites chỉ chạy sau khi xác minh database test dùng một lần và prerequisites trong `docs/contributing.md`. Thay đổi streaming phải bao gồm:

```sh
npm run test:integration -- tests/integration/concierge-streaming.test.ts tests/integration/concierge-browser.test.ts tests/integration/concierge-v2-persistence.test.ts
```

Bổ sung memory/retrieval/draft integration suites theo phạm vi sửa; mock browser có thể kiểm UI nhưng không thay provider/runtime acceptance. Offline benchmark có thể dùng `npm run test:benchmark:offline` và `npm run benchmark:concierge -- --dry-run`; live mode không tự đưa vào CI hoặc default tests.

Báo cáo bàn giao ghi rõ: kiểm nào chạy, kết quả/exit code, kiểm nào chưa chạy và prerequisite còn thiếu. Có thể đạt kiểm định code trong khi runtime chưa được nghiệm thu; phải nêu hai trạng thái riêng.

## 8. Điểm quyết định và giới hạn phạm vi

| Quyết định | Mặc định đề nghị | Khi nào xem lại |
|---|---|---|
| Semantic classifier | Chưa thêm LLM call; thống nhất deterministic interpretation trước | Holdout chứng minh còn nhiều paraphrase quan trọng không xử lý được trong caps |
| Summary | Structured/deterministic trước | Có mục tiêu hữu ích không biểu diễn được và đánh giá chứng minh cần semantic summary |
| Soft budget | Trong budget trước; phương án thêm tối đa +5% có cảnh báo, sau khi ghi quyết định sản phẩm | Nhà hàng muốn cap khác hoặc chỉ cho vượt khi khách chấp thuận trước |
| Prose nêu giá/tên món | Giữ policy cards authoritative hiện tại | Evidence projection + guard/UI được sửa và đánh giá đồng bộ |
| Candidate pool | Giữ recommendation cap 8 ở vòng đầu | Recall không đạt dù curation/normalization tốt; có budget review |
| Planner mới | Chỉ thay khi đánh giá tốt hơn greedy | Không tăng hữu ích hoặc vượt compute/latency cap |
| Model/provider | Giữ cấu hình hiện tại khi đo baseline | Routing/context/data đã đúng nhưng model vẫn lỗi trên cùng bộ kiểm |
| Durable memory | Giữ opt-in/auth/epoch, không tự bật | Chỉ theo lựa chọn hợp lệ của người dùng và privacy contract |

Chưa đưa vào vòng đầu: multi-agent runtime, framework agent mới, vector database/embeddings toàn menu, tăng context/budget hàng loạt, tự động order/payment/booking, redesign toàn UI hoặc sửa production data để đạt benchmark. Chỉ đưa vào backlog khi có số đo và nhu cầu rõ ràng.

## 9. Phát hành và điều kiện quay lại

Triển khai từng lát nhỏ: routing/evidence trước, context/memory sau, retrieval/planner tiếp theo, cuối cùng style/UX. Mỗi lát phải có regression và cách quay lại; migration dùng hướng tương thích để rollback code không làm hỏng phiên cũ.

Chặn release hoặc rollback khi xuất hiện bất kỳ lỗi nào sau:

- Truy cập khác owner, memory opt-out vẫn được dùng/ghi hoặc fact đã quên bị tái nhập bằng stale epoch.
- Tự mutation/acceptance mơ hồ, sai subtotal/hard budget, giá/availability không được kiểm lại đúng policy.
- Allergy claim chưa xác minh hoặc fallback vượt hard safety filters.
- Lỗi input lượt sau, stream completion trùng/mất, state UI khác server, retry tạo tác dụng lặp.
- p95/error rate vượt ngưỡng đã chốt, hoặc backend phiên bản bàn giao chưa thật sự chạy.

Rollback dùng bản code/flag đã kiểm chứng; không xóa dữ liệu khách, không bật lại consent, không phục hồi memory đã bị quên. Giữ kênh menu/cart/checkout thủ công hoạt động.

## 10. Bản đồ nguồn đã đối chiếu

Các đường dẫn/line ở đây là điểm tra cứu tại thời điểm lập kế hoạch, có thể dịch chuyển sau triển khai.

| Điểm cần kiểm | Nguồn hiện tại |
|---|---|
| Canonical understanding và classifier | `supabase/functions/_shared/concierge/understanding/engine.ts:69`, `intent-classifier.ts:34`, `types.ts` |
| Router và FAQ/menu split | `supabase/functions/_shared/concierge/orchestration/capability-router.ts:37`, `main-context.ts:69` |
| Active tools/fallback | `supabase/functions/_shared/concierge/orchestration/handlers/food-handler.ts:24`, `food-handler.ts:43` |
| Retrieval params, call selection, evidence summary | `supabase/functions/_shared/concierge/orchestration/tool-runner.ts:144`, `tool-runner.ts:202`, `tool-runner.ts:243` |
| History/summary/context caps | `supabase/functions/_shared/concierge/session-summary.ts:6`, `context.ts:15`, `context.ts:42`, `context.ts:48` |
| Imported memory và persistence gate | `supabase/functions/_shared/concierge/orchestration/main-context.ts:84`, `runtime.ts:179` |
| Planner và menu snapshot cache | `supabase/functions/_shared/concierge/meal-planner.ts:25`, `menu/domain.ts` |
| Model evidence projection và guard | `supabase/functions/_shared/concierge/orchestrator.ts:157`, `response-guard.ts:35` |
| Metric schema và runtime ownership | `supabase/functions/_shared/concierge/observability.ts:3`, `docs/architecture.md` |
| Benchmark và acceptance | `plans/tiger-345/concierge-quality/BENCHMARK.md`, `AGENTS.md`, `docs/contributing.md` |

## 11. Trạng thái tại lần bàn giao kế hoạch

- [x] Đọc đủ bốn tài liệu Markdown trong `Analysis`.
- [x] Đối chiếu các điểm điều phối/context/memory/planner/evidence quan trọng với source hiện tại.
- [x] Lập kế hoạch có ưu tiên, phụ thuộc, ước lượng, đầu ra và tiêu chí nghiệm thu.
- [ ] Triển khai A00–A10.
- [ ] Chạy các suites cho phiên bản nâng cấp.
- [ ] Đo database coverage, provider baseline và nghiệm thu website thực tế.

**Runtime chatbot: CHƯA KIỂM ĐỊNH.** Tài liệu này hoàn tất phần phân tích và lập kế hoạch; chưa xác nhận agent hiện tại đã sửa lỗi hoặc sẵn sàng production.

## 12. Cập nhật triển khai A01–A02 — 18/10/2026

- [x] Triển khai A01–A02 trong phạm vi prompt được giao, giữ nguyên giới hạn model/tool/context/time và gateway kiểm quyền.
- [x] Regression nhỏ kiểm actual execution, tham số retrieval, evidence model nhận, cards và kết quả cuối bằng fixture/injected adapter.
- [ ] Nghiệm thu provider/website thật; không gọi provider có phí, không deploy, không sửa dữ liệu thật.

Báo cáo chi tiết: [A01-A02-implementation.md](A01-A02-implementation.md). A00 và A03–A10 chưa được đánh dấu hoàn thành. Phần mô tả “chỉ lập kế hoạch” và trạng thái tại mục 11 là lịch sử của lần bàn giao kế hoạch trước khi triển khai này.

**Runtime chatbot: CHƯA KIỂM ĐỊNH.**
