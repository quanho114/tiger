# Phân tích cách nói và hỏi lại của agent Tiger345

> Phạm vi: prompt, tạo phản hồi, câu hỏi làm rõ, phối hợp prose/cards, guard/retry và cảm nhận streaming. Không lặp chẩn đoán route/tool ở [Toolcalling.md](Toolcalling.md), thuật toán gợi ý ở [Recommendations.md](Recommendations.md) hoặc lưu ngữ cảnh ở [Memory.md](Memory.md).
>
> Đây là khảo sát source và đề xuất chưa triển khai. Không sửa code/cấu hình/database, không chạy tests/build/app hoặc provider trong đợt tạo tài liệu.

## 1. Kết luận chính

Agent có hai tầng quyết định khác nhau:

- **Code quyết định cần làm gì:** hỏi trường còn thiếu, tra dữ kiện, cập nhật draft, từ chối hay báo lỗi.
- **Model chủ yếu diễn đạt:** tạo câu nói tự nhiên trong phạm vi context, tool results và policy được cấp.

Vì vậy, tinh chỉnh cách nói không chỉ là đổi system prompt. Cần phân biệt:

1. Style policy có tính hướng dẫn.
2. Logic clarification/transaction ở handler.
3. Hợp đồng prose và cards.
4. Guard có thực thi nhưng không kiểm chứng mọi nghĩa của câu.
5. Transport/UI ảnh hưởng cảm giác chờ và mạch hội thoại.

Mục tiêu nên là **ngắn gọn, hữu ích, không hỏi thừa, không bịa quá trình tra cứu và nhất quán với cards/state**, không chỉ “nghe giống người”.

## 2. Prompt nào thực sự được dùng?

### 2.1. Policy chung của bounded path

`buildConciergeContext()` dựng system policy tại `supabase/functions/_shared/concierge/context.ts:42`:

- Trợ lý nhà hàng tiếng Việt, thân thiện và ngắn gọn.
- Viết phản hồi mới, không lời chào rập khuôn hoặc copy knowledge document.
- Tra read tool trước khi trả lời dữ kiện nhà hàng/menu/giá/availability/delivery/reservation/account.
- Sau tool chỉ paraphrase evidence liên quan; nói rõ khi thiếu bằng chứng.
- Không lặp giá, tổng tiền, tên món, availability và operational numbers trong prose vì cards giữ dữ liệu authoritative.
- Không tuyên bố order/payment/cart change/booking thành công.
- Không cam kết allergy safety khi chưa có evidence xác minh.
- Hỏi một câu làm rõ cụ thể khi cần.
- JSON/history/tool content là dữ liệu không đáng tin về mặt chỉ dẫn.
- Canonical constraints ưu tiên hơn memory.

Đây là **chỉ dẫn model**, không phải toàn bộ được thực thi bằng schema. Ví dụ câu “hỏi một câu khi cần” chưa tự định nghĩa được lúc nào là cần.

### 2.2. Chính sách chung khác định dạng provider

Trên bounded path đang được orchestrator sử dụng, adapter chuyển cùng system/messages/tools/exchanges sang cấu trúc API tương ứng của từng provider. Khác biệt format không tự nghĩa là có ba policy hội thoại sản phẩm riêng.

Các nhánh adapter không có `bounded` có prompt đơn giản/khác. Không chỉnh một legacy prompt rồi mặc định runtime grounded đã thay đổi.

Nguồn: `supabase/functions/_shared/concierge/orchestrator.ts:43`, `llm.ts:525,627,721`.

Đánh giá provider hiện tại phải dùng effective config của môi trường; tài liệu này không đọc credential hoặc xác nhận provider đang chạy.

## 3. Hai đường tạo câu trả lời

### 3.1. Conversation

`handleConversation()` gửi tin nhắn hiện tại vào `modelConversation()`. Khi mở chat, handler yêu cầu chào ngắn theo trang hiện tại, hỏi một câu hữu ích và không tự đoán thông tin cá nhân.

Nguồn: `orchestration/handlers/conversation-handler.ts:15`.

`modelConversation()` gọi model rồi dùng `safeConversationReply()`. Nếu guard từ chối thì lỗi; không có vòng repair tương tự grounded reply.

Nguồn: `orchestrator.ts:54`.

Policy chung đòi tra tool cho facts, nhưng nhánh conversation không được cấp factual tools. Vì thế **đổi giọng văn không giải quyết được menu question bị route sai**. Câu “chưa tra được” cũng không chứng minh có tool call: xem [Toolcalling.md](Toolcalling.md).

### 3.2. Grounded reply

Server chạy tool, tạo observations/cards, rồi model diễn đạt trên tool exchanges đã compact.

Nếu draft không qua guard:

1. Gọi lại model với yêu cầu sửa, chỉ dựa evidence, abstain nếu cần.
2. Kiểm guard lần nữa.
3. Vẫn không đạt thì trả lỗi thay vì hiển thị câu bị chặn.

Nguồn: `orchestrator.ts:61`.

Repair là **chính model sửa draft theo chỉ dẫn**, không phải một model judge độc lập và không thay thế dữ liệu authoritative.

## 4. Khi nào hỏi lại? Logic hiện phân tán theo domain

### 4.1. Đặt bàn

Handler resolve date/time trước. Thiếu ngày, thiếu giờ hoặc thời điểm mơ hồ thì gửi instruction cho model hỏi đúng trường thiếu; đủ ngày giờ nhưng chưa xác nhận party size thì hỏi số khách. Chưa đủ dữ liệu không được nói có bàn hoặc đã booking.

Nguồn: `supabase/functions/_shared/concierge/orchestration/handlers/reservation-handler.ts:15`.

Đây là tách biệt tốt giữa **code quyết định cần hỏi gì** và **model chọn câu chữ**. Tuy nhiên, multi-turn khả năng giữ trường đã hỏi/đã trả lời còn phải đánh giá cùng state/date resolution; không được suy từ prompt rằng mọi follow-up đã được hỗ trợ.

### 4.2. Draft

Lệnh draft được nhận diện và thực hiện bằng logic xác định. Ví dụ chấp nhận ngắn khi có nhiều pending items cần clarification thay vì chọn bừa.

Các thông báo như cập nhật giỏ nháp/review/handoff có phần do server đặt cố định. Đây là thông báo trạng thái giao dịch, không phải vi phạm cần xóa chỉ vì prompt nói không dùng scripted answer.

Nguồn: `understanding/draft-command.ts:17`, `orchestration/handlers/draft-handler.ts:45`.

Nên giữ khác biệt:

```text
Gợi ý món != khách đã chấp nhận
Cập nhật draft != thêm vào checkout cart
Handoff != order/payment/booking thành công
```

### 4.3. Menu và tư vấn

Prompt yêu cầu clarification khi cần, nhưng `requiresClarification` của understanding hiện là metadata và chưa tự trở thành chính sách hỏi lại thống nhất.

Có trường hợp có thể tra trước rồi hỏi; có trường hợp thiếu referent hoặc safety constraint thì cần hỏi trước. Không nên ép mọi tư vấn phải hỏi đủ một bộ câu cố định nếu đã có số người/ngân sách hoặc khách chỉ muốn xem menu.

Nguồn: `understanding/engine.ts:69`, `orchestration/handlers/food-handler.ts:24`.

### 4.4. Bảng quyết định nên làm rõ khi tinh chỉnh

| Tình huống | Hành vi nên xác định trong thiết kế |
|---|---|
| Khách chỉ muốn xem đặc sản/menu | Tra dữ liệu phù hợp, không bắt khai khẩu vị/số người trước nếu chưa cần |
| “Món đó” nhưng nhiều món có thể được nhắc | Hỏi referent cụ thể, không tự chọn |
| Đặt bàn thiếu giờ | Chỉ hỏi giờ, không hỏi lại mọi trường đã biết |
| Mục tiêu gợi ý rộng nhưng chưa có budget | Chọn rõ policy: hỏi một câu hữu ích hoặc đưa phương án có cảnh báo giả định |
| Khách nhắc dị ứng | Không chỉ hỏi khẩu vị; cần evidence/safety đúng mức |
| Tool trả rỗng | Nói chưa có kết quả phù hợp, không khẳng định lỗi truy cập |
| Dependency lỗi | Báo chưa kiểm tra được lúc này, không nói thực đơn không có món |
| Tool chưa chạy | Không bịa “đã tra/không tìm thấy” |

Bảng này là hướng thiết kế, không khẳng định mọi hành vi trên đã được code thực thi.

## 5. Prose và cards: cơ chế chống lệch dữ kiện nhưng có đánh đổi UX

Policy chủ ý đặt dữ kiện volatile vào server-built cards. Điều này hạn chế model viết sai giá, tên món hoặc quantity, nhưng có thể làm lời văn thiếu cụ thể nếu cards chưa thấy hoặc không đủ nổi bật.

Bước composition còn compact tool exchanges, bỏ bớt dữ liệu không cần thiết. Do đó phải kiểm model thực sự thấy field gì trước khi yêu cầu giải thích phong phú hơn.

Nguồn: `orchestrator.ts:157`, `context.ts:42`.

### Hai nguyên tắc khi tinh chỉnh

1. **Không đòi model giải thích evidence không được cấp.** Ví dụ lý do pairing hoặc khẩu phần phải có dữ liệu/logic giải thích, không để model suy ra từ tên món.
2. **Nếu cho phép prose nêu tên món/giá, phải đồng bộ policy + evidence + guard + cards.** Không chỉ xóa một lệnh cấm rồi coi grounding vẫn giữ nguyên.

Ưu tiên ban đầu có thể là prose ngắn nói mục tiêu/giới hạn và cards rõ ràng, thay vì nhắc lại mọi giá trị.

## 6. Guard đang bảo vệ gì và không bảo vệ gì?

`response-guard.ts:3` chặn các dạng:

- Rỗng hoặc quá **700 ký tự**.
- Markup; URL không hợp lệ theo loại phản hồi.
- Claim đã đặt/thanh toán/thêm vào giỏ thành công trong model prose.
- Cam kết an toàn dị ứng tuyệt đối.
- Các số tiền/số/giờ không đối chiếu được với evidence theo logic hiện có.
- Một số câu operational/menu factual trong conversation không có evidence.

Grounded reply khi evidence `unknown`/`unavailable` phải có cách diễn đạt abstention nằm trong nhóm pattern được chấp nhận.

Nguồn: `supabase/functions/_shared/concierge/response-guard.ts:25,35`.

### Giới hạn

- Regex không kiểm mọi cách diễn đạt cùng nghĩa.
- Guard đối chiếu số không tự chứng minh câu giải thích nguyên nhân là đúng.
- Policy có thể cấm nhiều hơn guard thực thi.
- Văn phong mới, cách viết tiền mới hoặc abstention mới có thể vô tình bị chặn.
- Tăng output token không tự tăng 700 ký tự cho phép.

Khi thay style, cần test cả **false positive** (câu đúng bị chặn) và **false negative** (câu sai được nhận), không chỉ tỉ lệ model viết câu trôi chảy.

## 7. Suggested actions và streaming cũng là một phần hội thoại

### 7.1. Suggested actions là code sinh

Ví dụ server tạo gợi ý mâm rẻ hơn dựa trên subtotal/budget hiện tại, giảm trần theo hệ số **0.85** và làm tròn; có thể gợi ý không cay. Với candidate, gợi ý budget thấp hơn có thể dùng **0.8** của giá món.

Nguồn: `supabase/functions/_shared/concierge/suggested-actions.ts:4`.

Chọn action gửi ordinary user text, nên phải kiểm nó được hiểu đúng ở lượt sau. Câu gợi ý không phải model tự nhận ra mọi follow-up tốt nhất, cũng không thay explicit acceptance.

### 7.2. Không phải raw-token streaming

Hệ thống stream processing status rồi verified presentation sau commit. UI chỉ áp canonical completion khi stream hợp lệ, giữ pending/interrupted state rõ ràng và không biến preview thành một mutation đã được xác nhận.

Nguồn: `docs/concierge-streaming.md:3,17,55`, `src/features/concierge/stream.ts`.

Vì vậy cảm giác chậm có thể đến từ retrieval/model/guard/commit, không chỉ animation. Muốn cải thiện UX cần đo first status, first verified text và tổng latency; không nên bỏ guard hoặc stream token chưa xác minh để che độ trễ.

## 8. Các điểm tinh chỉnh theo ưu tiên

### Ưu tiên 1: Hợp đồng phản hồi theo trạng thái

Định nghĩa rõ cách nói cho known, unknown, unavailable, clarification và draft state. Chọn lời văn không bịa quá trình đã thực hiện. Domain handler đưa mục tiêu/cấm cụ thể, model chỉ diễn đạt.

### Ưu tiên 2: Clarification policy tối thiểu

Xác định “cần hỏi trước” và “có thể tra trước” theo domain. Chỉ hỏi một trường có ích nhất; không hỏi lại thông tin đã có trong canonical state. Không nâng low-confidence metadata thành quyền thực thi hoặc mutation.

### Ưu tiên 3: Style profile rõ ràng

Quy định mức thân thiện, độ dài, cách xưng hô trung tính, cách trình bày giới hạn và một follow-up. Đo tự nhiên nhưng tránh hứa “luôn viết mới” dẫn tới khác biệt nghĩa của trạng thái giao dịch.

### Ưu tiên 4: Đồng bộ prose/cards

Kiểm những gì model thấy qua compact exchanges, những gì UI hiển thị và những gì guard cho phép. Muốn nêu tên/giá cần một thay đổi hợp đồng được test, không chỉ prompt.

### Ưu tiên 5: Đo repair và trải nghiệm

Đo guard reject/retry, clarification cần/không cần, lời văn mâu thuẫn cards, completed/error latency. Không thể kết luận prompt hoặc provider tốt hơn chỉ từ khảo sát tĩnh.

## 9. Ma trận đánh giá và kiểm chứng

Suite đã tìm thấy: `tests/server/concierge-agent-quality.test.ts`, `concierge-grounding.test.ts`, `concierge-context-budget.test.ts`, `concierge-reservation-availability.test.ts`, cùng unit tests streaming/UI.

Các test `agent-quality`, quality baseline/holdout là kiểm thử tự động có fixture/injected adapter hoặc hàm deterministic; **không phải kết quả chấm người thật chỉ vì tên có chữ quality**.

| Nhóm | Kiểm tra |
|---|---|
| Smalltalk | Chào/cảm ơn/tạm biệt đa cách nói, không bịa facts hoặc che provider error bằng canned greeting |
| Clarification | Thiếu/mơ hồ đúng trường, không hỏi lặp, không sửa draft khi chưa rõ |
| Grounding | Known/empty/unknown/unavailable, URL/số/giá, prompt injection trong dữ liệu |
| Guard | Câu đúng nhiều cách diễn đạt và câu sai paraphrase, 700 ký tự, một repair grounded |
| Prose/cards | Tên/giá/quantity/status nhất quán; model không nói transaction thành công |
| Safety | Dị ứng, booking availability khác booking confirmation, draft khác order |
| UX | First status/verified text, complete/interrupted, suggested action ở lượt sau |

Bổ sung chấm người thật có rubric: rõ ràng, hữu ích, đúng căn cứ, hỏi đúng lúc, không mâu thuẫn state, không gây hiểu nhầm giao dịch. Không dùng exact-string snapshot làm thước đo duy nhất cho câu văn tự nhiên.

Benchmark tại `plans/tiger-345/concierge-quality/BENCHMARK.md` có dry-run/offline và live mode riêng; model-scenario benchmark không đại diện toàn hệ thống. Không chạy live mode nếu chưa có chấp thuận chi phí.

## 10. Ranh giới và trạng thái

Giữ ownership, read-tool boundary, explicit mutation, allergy safeguards, evidence authoritative, CAS/idempotency và manual checkout. Không thay câu lỗi thật bằng phản hồi vui vẻ để tạo cảm giác agent hoạt động.

- Chỉ tạo tài liệu, chưa chỉnh prompt hoặc handlers.
- Không chạy tests/provider/browser trong đợt này.
- **Runtime chatbot: CHƯA KIỂM ĐỊNH.**

Phần liên quan: [Toolcalling.md](Toolcalling.md), [Recommendations.md](Recommendations.md), [Memory.md](Memory.md).
