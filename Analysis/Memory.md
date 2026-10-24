# Phân tích khả năng nhớ ngữ cảnh của agent Tiger345

> Phạm vi: canonical session state, transcript/context/summary, tham chiếu ở lượt sau, vòng đời phiên và durable personalization. Đây là khảo sát source và đề xuất chưa triển khai; không phải kết quả nghiệm thu runtime.
>
> Không sửa source/cấu hình/database, không bật memory, không chạy app, tests hoặc provider trong đợt tạo tài liệu. Các hướng liên quan: [Toolcalling.md](Toolcalling.md), [Recommendations.md](Recommendations.md), [Conversation.md](Conversation.md).

## 1. Kết luận chính

Agent không có một bộ nhớ duy nhất. Cần tách ít nhất bốn lớp:

| Lớp | Vai trò | Giới hạn quan trọng |
|---|---|---|
| Canonical session state | Constraints, draft, pending suggestions và state version | Chỉ giữ những gì được code trích xuất/cập nhật; không tự hiểu toàn bộ hội thoại |
| Transcript và summary | Lịch sử gần đây và bản tóm trạng thái để hỗ trợ model | Có giới hạn và bị rút gọn; summary hiện không phải tóm tắt ngữ nghĩa |
| Model context của từng lần gọi | Phần state/history/evidence thực sự gửi provider | Không đồng nghĩa toàn bộ session record; còn bị trimming theo budget |
| Durable personalization | Sở thích/không thích/dị ứng được cho phép lưu và sở thích suy từ đơn hàng | Auth, consent, intent, epoch, expiry và retrieval gates; không phải bộ nhớ toàn bộ chat |

**Tăng context window hoặc bật durable memory không tự sửa mọi lỗi “quên”.** Trước hết cần xác định thông tin đã mất ở đâu: không được trích xuất, bị merge sai, không được gửi model, bị summary/trimming loại bỏ, hoặc session đã hết hạn/đổi danh tính.

Điểm đáng chú ý nhất hiện tại:

1. Summary giữ draft/pending IDs và trạng thái, không giữ lý do hay mục tiêu hội thoại dạng tự nhiên.
2. Model chỉ thấy một phần history; không thể suy từ transcript lưu trên server rằng model đã đọc toàn bộ.
3. Durable facts được merge vào session constraints trên đường main hiện tại, thay vì truyền riêng dưới dạng optional memory có source tags.
4. Lưu durable facts có food-intent gate ở runtime, không áp dụng mặc nhiên cho mọi tin nhắn.
5. Xóa durable memory, clear giao diện và xóa server session là ba thao tác khác nhau.

## 2. Canonical state là bộ nhớ nghiệp vụ chính

Schema phiên giữ constraints, draft, pending suggestions, transcript, summary và thông tin concurrency/ownership.

Nguồn: `supabase/functions/_shared/contracts/concierge-v2.ts:515–538`.

Các giới hạn schema quan trọng gồm transcript tối đa **60 messages**, summary tối đa **2400 ký tự**, idempotency records tối đa **32**. Đây là giới hạn cấu trúc, không phải cam kết model sẽ thấy tất cả dữ liệu này.

### 2.1. Constraints được cập nhật bằng code

Party size, children, budget và mức cay đi qua deterministic extraction/merge. Ví dụ:

- Có tổng số người thì đánh dấu party size đã xác nhận và phân bổ adults/children.
- Một số cách nói thêm/bớt trẻ em được xử lý theo delta.
- Spice clear xóa giới hạn; zero đặt mức cay bằng 0.
- Budget cập nhật cùng hard/soft marker theo tập pattern được hỗ trợ.

Nguồn: `supabase/functions/_shared/concierge/understanding/constraint-extractor.ts:55–89`.

Đây không phải khả năng sửa constraint tự do bằng mọi câu tiếng Việt. Cần test từng cách nói, nhất là đổi ý, phủ định và câu chỉ áp dụng cho bữa hiện tại.

### 2.2. Session constraints không cần bật durable memory

Main context trích explicit preferences/dislikes/allergies vào session, kể cả khi durable memory bị tắt. Một nhánh riêng áp dụng dị ứng của nhóm hiện tại từ câu hỏi hoặc phát biểu tạm thời/nhắc người khác, nhưng không vì thế biến thông tin đó thành durable personal fact.

Nguồn: `supabase/functions/_shared/concierge/orchestration/main-context.ts:70–82`.

Điều này hợp lý cho an toàn bữa ăn, nhưng phải giữ phân biệt:

```text
“Bữa này có người dị ứng tôm” -> constraint của nhóm/bữa
“Tôi dị ứng tôm” + đủ điều kiện lưu -> có thể là durable fact
```

Không được biến mọi constraint của nhóm thành hồ sơ sức khỏe cá nhân lâu dài.

## 3. “Món đó”, “như lúc nãy” và chấp nhận đề xuất

Nhớ referent không chỉ dựa trên prose history. Hệ thống còn có:

- Pending suggestion IDs/items gắn state version.
- Draft hiện tại với item IDs và quantities.
- Page context, ví dụ menu item đang mở.
- Deterministic draft-command resolution.

Main context nhận diện một số cụm “món này/cái này/món đang xem” kết hợp yêu cầu chi tiết, sau đó tra item ID từ page context trong catalog. Không tìm thấy thì abstain, không lấy một tên món model tự suy làm authoritative identity.

Nguồn: `supabase/functions/_shared/concierge/orchestration/main-context.ts:100–108`.

Với acceptance, nhiều pending items hoặc version cũ phải được xử lý rõ, không chọn bừa theo câu trả lời gần nhất. Hướng tinh chỉnh là resolver có giới hạn dựa trên state/page/IDs, không dùng semantic summary làm quyền sửa draft.

Nguồn liên quan: `supabase/functions/_shared/concierge/understanding/draft-command.ts`, `orchestration/handlers/draft-handler.ts`.

Cần đánh giá riêng các câu “món thứ hai”, “đổi món đó”, “giống lần trước”: có hội thoại trước không đồng nghĩa mọi dạng tham chiếu đã được hỗ trợ.

## 4. Summary hiện là tóm trạng thái, không phải tóm hội thoại

`summarizeSession()` giữ nguyên state nếu đồng thời:

- Có dưới **10 user messages** trong transcript hiện tại.
- JSON transcript nhỏ hơn **2500 UTF-8 bytes**.

Khi một ngưỡng bị chạm, nó tạo JSON gồm:

- `source: session_state`.
- Draft ID.
- Tối đa 3 accepted menu item IDs.
- Tối đa 3 pending suggestion IDs.
- Trạng thái unresolved/review.

Summary được giới hạn **400 UTF-8 bytes**; nếu cần thì dùng bản ngắn hơn chỉ còn draft ID và counts. Transcript giữ **4 messages cuối**, không phải 4 cặp lượt.

Nguồn: `supabase/functions/_shared/concierge/session-summary.ts:3–17`.

### Hệ quả

Canonical constraints/draft vẫn tồn tại riêng, không bị thay bằng lossy summary. Tuy nhiên, thông tin chưa được đưa vào structured state có thể không còn được truyền khi history cũ bị bỏ, ví dụ:

- Lý do khách loại một phương án.
- Mục đích dịp ăn hoặc ưu tiên diễn đạt tự do chưa được extractor hỗ trợ.
- Một câu hỏi dang dở không được biểu diễn trong state.

Đây là giới hạn thiết kế suy ra từ source, chưa phải báo cáo đã tái hiện một lỗi cụ thể trên provider thật. Không nên mô tả summary hiện tại là model đã đọc/tóm mọi ý trước đó.

## 5. Model thực sự được nhận gì?

`buildConciergeContext()` đưa vào:

1. Shared system policy.
2. Canonical constraints và draft.
3. Pending tối đa 8 entries dưới dạng name/quantity.
4. Page context.
5. Optional memory/summary nếu có.
6. Tối đa **8 history messages** và message/prompt hiện tại.
7. Tools và tool exchanges của lần gọi.

Nguồn: `supabase/functions/_shared/concierge/context.ts:37–56`.

Pending rút gọn trong context không thay authoritative pending IDs ở session. Model không được quyền dùng tên món nhớ được để bỏ qua acceptance/version validation.

### 5.1. Budget và trimming

Context estimate dùng UTF-8 byte length của payload JSON cộng **512** framing allowance. Khi vượt **6000**:

```text
Bỏ history cũ nhất
    -> bỏ summary
    -> bỏ optional memory
    -> nếu essentials vẫn quá lớn: lỗi
```

Nguồn: `context.ts:55–62`.

TurnBudget còn giới hạn tối đa 3 model calls, tổng input estimate 12000, 6 tool calls và ngưỡng thời gian 25 giây khi kiểm budget.

Nguồn: `context.ts:15–34`.

Các số input estimate này **không phải token usage chính xác do provider báo**. Tiếng Việt, schema và serialization có thể làm byte estimate tăng nhanh. Source có usage counters riêng cho reported input/output tokens.

Tăng history hoặc thêm semantic summary cần đo cả retrieval/composition/repair calls, không chỉ một prompt đơn lẻ. Tăng model context window không tự đổi các giới hạn harness.

### 5.2. Optional memory tồn tại trong API nhưng chưa phải đường truyền hiện hành

Context builder nhận `memory?: RetrievedMemoryFact[]`, cap 12 facts và 400 UTF-8 bytes serialized. Tuy nhiên lời gọi `buildConciergeContext()` trong orchestrator đang truyền state/message/tools/exchanges/page context, không truyền `memory` riêng.

Nguồn: `context.ts:39,46–47`; `supabase/functions/_shared/concierge/orchestrator.ts` tại lời gọi `buildConciergeContext()`.

Vì vậy, không suy từ việc có `formatMemoryPrompt()` hoặc parameter `memory` rằng model đang thấy đầy đủ source-tagged durable facts.

## 6. Durable personalization: đọc, lưu và suy từ lịch sử là các đường khác nhau

### 6.1. Consent và authentication

Memory repository mặc định `enabled: false`. Guest không được lưu durable personal facts bằng explicit-memory pipeline. Authenticated customer cũng phải có consent và epoch hợp lệ.

Nguồn: `supabase/functions/_shared/concierge/memory-repository.ts:28–30`, `memory-extractor.ts:348–385`.

Tắt durable memory không xóa nhu cầu giữ state ngắn hạn để vận hành phiên; ngược lại, có phiên trong PostgreSQL không đồng nghĩa đã bật personalization lâu dài.

### 6.2. Gate thực sự ở runtime

Runtime chỉ tạo repository cho đường persistence/aggregation này khi:

- Có authenticated user.
- Có message.
- `understandTurn(...).intent === 'food'`.
- `CONCIERGE_MEMORY_DISABLED` không bằng `true`.

Sau đó:

- Behavioral aggregation chỉ chạy nếu settings enabled và transcript đang rỗng.
- Explicit persistence chạy sau CAS commit, không replay, có message và settings enabled.
- Các lỗi memory được xử lý fail-soft ở đường này.

Nguồn: `supabase/functions/_shared/concierge/runtime.ts:179–197`.

Hệ quả quan trọng: một câu sở thích được extractor hỗ trợ vẫn chưa chắc được lưu nếu runtime phân loại nó ngoài food intent. Nếu phiên mở bằng smalltalk rồi mới hỏi món, không thể mặc định nhánh `!record.transcript.length` vẫn được thỏa mãn.

Không nên nới consent/auth chỉ để tăng tỉ lệ “nhớ được”; nên đánh giá sự nhất quán giữa understanding và memory policy trước.

### 6.3. Explicit facts và correction

Extractor dùng patterns để nhận preference/dislike/allergy/correction và lọc một số câu tạm thời, xã hội hoặc nghi vấn. Đây không phải LLM tự quyết định lưu mọi câu.

Pipeline kiểm consent/epoch, xóa fact correction theo selector, rồi lưu facts mới với source `explicit`. Facts explicit mới trong đoạn đã khảo sát có `expires_at: null`.

Nguồn: `supabase/functions/_shared/concierge/memory-extractor.ts:285–327,348–435`.

“Không còn thích”, “không thích”, “hết dị ứng” và “chỉ bữa này không ăn” có semantics khác nhau. Không nên gộp chúng thành một thao tác xóa chung hoặc tự suy một phủ định là xác nhận y khoa.

### 6.4. Behavioral memory không phải đọc toàn bộ lịch sử chat

Aggregation đọc đơn của đúng customer, với điều kiện:

- Order completed và payment paid.
- Trong **90 ngày**.
- Món xuất hiện trong ít nhất **2 đơn khác nhau**.
- Tối đa **20 candidates**.
- Confidence heuristic 70–85, thấp hơn explicit preference 90 trong extractor.
- Expiry bằng lần đặt cuối cộng 90 ngày.

Nguồn: `supabase/functions/_shared/concierge/behavioral-memory.ts:62–128,188–201`.

Số lượng nhiều trong một đơn không tương đương nhiều lần gọi. Món từng gọi không chứng minh khách thích, không chứng minh bữa hiện tại muốn món đó và không thể lấn allergy/dislike.

Runtime đã khảo sát không refresh behavioral aggregates sau mọi order hoặc theo timer; chỉ thấy trigger có điều kiện ở đầu phiên như trên. Không khẳng định tồn tại lịch refresh đầy đủ chỉ vì comment đề cập refresh policy.

## 7. Retrieval và việc trộn nguồn vào constraints

`retrieveSelectiveMemory()`:

- Bỏ lookup với FAQ được nhận diện.
- Guest/opt-out nhận zero facts.
- Repository failure trả empty facts theo fail-soft paths.
- Loại facts hết hạn và xử lý xung đột ưu tiên dietary/current constraints hơn favorites.
- Có compact source-tagged formatter và giới hạn số facts/token estimate riêng.

Nguồn: `supabase/functions/_shared/concierge/memory-retrieval.ts:61–76,127–172` và phần triển khai retrieval phía dưới.

Nhưng tại `main-context.ts:84–90`, facts trả về được merge vào `next.constraints`:

- Allergies có thể tiếp tục merge.
- Preferences/dislikes chỉ được import nếu nhóm constraint đó chưa có giá trị trước vòng merge.
- Source/confidence/expiry không được giữ như metadata riêng trên từng string constraint.

### Đánh đổi cần chú ý

Ưu điểm: retrieval/planner sử dụng ngay các constraint đã merge mà không trông chờ model đọc optional memory.

Giới hạn:

- Khó phân biệt current explicit fact và historical inferred preference ở downstream chỉ nhận string arrays.
- Precedence ở mức cả nhóm preferences/dislikes có thể thô hơn precedence từng fact.
- Fact hết hạn/xóa ở durable store không tự chứng minh bản đã copy vào active session sẽ biến mất.

Đây là các điểm cần kiểm chứng lifecycle, không phải kết luận đã tái hiện bug quên/xóa dữ liệu. Hướng tinh chỉnh nên giữ provenance, scope và expiry thay vì chỉ tăng số facts.

## 8. Vòng đời phiên và chuyển guest sang tài khoản

### 8.1. Session không tồn tại vô hạn

Giới hạn trong session store:

- Idle timeout **45 phút**.
- Absolute timeout **4 giờ**.
- Session record tối đa **256 KiB**.

Nguồn: `supabase/functions/_shared/concierge/session-store.ts:18–20`; idle/absolute expiry được kiểm trong `session-store-postgres.ts`.

Production dùng PostgreSQL session store; in-memory store không phải bằng chứng về persistence production.

Nguồn: `docs/architecture.md` phần Concierge runtime/session.

Ownership binding, capability, CAS state version, lease và idempotency bảo vệ cập nhật phiên. Không được bỏ các lớp này để làm follow-up “mượt hơn”. Logical expiry cũng không đồng nghĩa đã chứng minh record vật lý được xóa ngay tại thời điểm hết hạn.

### 8.2. Guest claim

Claim ticket có hạn tối đa **5 phút**, còn bị giới hạn bởi expiry của session. Khi claim hợp lệ:

- Bind authenticated user.
- Rotate session capability.
- Tăng state version.
- Clear idempotency cũ.
- Trả lại transcript/draft được giữ.

Nguồn: `supabase/functions/_shared/concierge/session-claim.ts:11–30,41–69`.

Đây là cơ chế continuity có kiểm soát, không phải quyền đọc bất kỳ phiên guest nào khi đăng nhập.

### 8.3. UI reset khác server deletion

Frontend có abort/epoch guards và clear local state khi logout/account switch. Cần đánh giá phản hồi đang bay để không hiện dữ liệu tài khoản cũ sau đổi danh tính.

Nguồn: `src/features/concierge/useConcierge.ts` và `api.ts` trong feature Concierge.

Không khẳng định logout xóa server record nếu chưa thấy và kiểm endpoint deletion tương ứng. Cũng không coi localStorage ticket là nơi lưu durable personal profile.

## 9. Forget, disable và suppression phải có semantics riêng

Repository có APIs quản lý settings, delete fact, forget all và restore behavioral fact. Epoch fencing ngăn stale writer tiếp tục ghi bằng epoch cũ; suppression giúp fact behavioral đã quên không bị học lại ngay.

Nguồn: `supabase/functions/_shared/concierge/memory-repository.ts`, `memory-extractor.ts:378–417`, `behavioral-memory.ts:135–137` và các RPC liên quan.

Cần phân biệt rõ trong sản phẩm và kiểm thử:

| Thao tác | Điều phải xác nhận |
|---|---|
| Disable personalization | Chặn retrieval/write mới theo policy; có xóa facts hay không phải đúng hợp đồng |
| Delete một fact | Xóa đúng type/key/source, chống write race, suppression nếu phù hợp |
| Forget all durable memory | Epoch và facts/suppression đúng hợp đồng; không tự đồng nghĩa xóa mọi session |
| Clear/reset chat | UI và server session xử lý thế nào, có còn draft/pending không |
| Fact đã merge vào session | Có còn được dùng sau forget/expiry không; scope/provenance có đủ để loại bỏ không |
| Restore behavioral fact | Chỉ phục hồi theo hành động/quyền hợp lệ, không tự bật consent |

Không thể chỉ kiểm durable table rỗng rồi kết luận model không còn thấy thông tin: phải kiểm active session và model input. Ngược lại, không được khẳng định data leak khi mới thấy khả năng copy mà chưa kiểm toàn lifecycle.

## 10. Thứ tự tinh chỉnh đề xuất

### 1. Quan sát đúng điểm mất thông tin

Trace metadata có giới hạn: intent/route, session version, summary/trimming, số history messages, loại nguồn memory và reason không dùng fact. Không log raw transcript, allergy text, capability/token hoặc dữ liệu cá nhân để debug mặc định.

### 2. Chuẩn hóa scope và provenance

Phân biệt current meal/group constraints, explicit durable facts và inferred preferences. Current constraints thắng historical preferences, nhưng allergy cần quy tắc correction và xác minh riêng. Giữ source/expiry để có thể áp dụng consent/forget đúng vòng đời.

### 3. Cải thiện nhớ mục tiêu mà không trao quyền cho prose

Chỉ bổ sung structured fields/semantic summary nếu có nhu cầu chưa được state bao phủ. Tóm mục tiêu chưa giải quyết, quyết định và lý do có ích; không chứa giả định thành facts. Draft/acceptance vẫn dùng IDs, version và deterministic operations.

### 4. Đồng bộ memory gates

Kiểm câu preference/correction thật đi qua classifier, main context, postcommit persistence và retrieval như thế nào. Định nghĩa rõ unsupported/temporary statements, tránh “đã nhớ” khi không lưu hoặc bị consent chặn.

### 5. Đo context thay vì tăng tùy ý

Đo byte estimates, provider tokens, history bị bỏ và chất lượng follow-up tiếng Việt. Thử riêng threshold và summary content. Tăng history có thể làm essentials/tool evidence thiếu budget hoặc tăng lỗi, không mặc định luôn tốt hơn.

### 6. Hoàn thiện lifecycle/privacy trước mở rộng personalization

Kiểm logout/claim/account switch, delete/forget/disable, epoch races, suppression, expiry và bản fact trong active session. Không tự bật memory cho người dùng để chạy đánh giá.

## 11. Ma trận kiểm chứng

Các suite liên quan đã tìm thấy gồm:

- `tests/server/concierge-session-summary.test.ts`.
- `tests/server/concierge-context-budget.test.ts`.
- `tests/server/concierge-turn-constraints.test.ts`.
- `tests/server/concierge-memory-contract.test.ts`.
- `tests/server/concierge-memory-extractor.test.ts`.
- `tests/server/concierge-memory-retrieval.test.ts`.
- `tests/server/concierge-session-store.test.ts`.
- `tests/server/concierge-session-claim.test.ts`.
- `tests/integration/concierge-v2-persistence.test.ts` và behavioral-memory integration.

Tên suite chỉ cho biết có mã test, không phải tests đã được chạy hoặc đã bao phủ mọi case dưới đây.

| Nhóm | Kịch bản cần kiểm |
|---|---|
| Constraint continuity | Số người/budget/nonspicy qua nhiều lượt; đổi ý/phủ định; current-group allergy không thành personal fact |
| Summary | Trước/đúng ngưỡng 10 user messages và 2500 bytes; giữ 4 messages; mục tiêu tự do có mất không |
| Context | Canonical state còn đúng khi history bị bỏ; optional summary/memory trimming; nhiều tool exchanges; tiếng Việt |
| Referent | Một/nhiều pending items, page đổi, “món đó/thứ hai”, stale version; không mutation mơ hồ |
| Explicit memory | Guest/auth, consent off/on, food/nonfood intent, correction, temporary/third-party statement, postcommit/replay |
| Behavioral | Một đơn nhiều quantity khác hai đơn; completed+paid, 90 ngày, top20/expiry; explicit dislike/allergy thắng favorites |
| Retrieval | FAQ zero lookup, storage fail-soft, current versus historical facts, từng fact versus cả nhóm precedence |
| Privacy | Forget/disable giữa lượt đang chạy, stale epoch, suppression/restore, active session đã import fact |
| Session | Idle/absolute expiry, CAS conflict, retry/idempotency, claim hết hạn/dùng lại, account switch và in-flight response |
| Model ingestion | Kiểm payload đã sanitize của injected adapter để biết model thực thấy gì; không suy từ DB record |

Deterministic/injected tests giúp kiểm contracts nhưng không thay real-provider multi-turn smoke trên website Tiger. Browser/database suites chỉ dùng môi trường test được xác minh; paid provider cần chấp thuận riêng theo `AGENTS.md`.

## 12. Trạng thái và ranh giới

- Chỉ phân tích và tạo tài liệu; chưa thay đổi session/memory implementation.
- Không bật consent, không đọc dữ liệu khách thật hoặc ghi database.
- Không chạy tests/build/provider/browser trong đợt này.
- Chưa đo chất lượng nhớ nhiều lượt trên runtime thực tế.
- **Runtime chatbot: CHƯA KIỂM ĐỊNH.**

Phần liên quan: [Toolcalling.md](Toolcalling.md), [Recommendations.md](Recommendations.md), [Conversation.md](Conversation.md).
