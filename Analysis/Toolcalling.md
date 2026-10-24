# Phân tích harness và tool calling của agent Tiger345

> Phạm vi: phân tích cấu trúc hiện tại và các điểm có thể tinh chỉnh, tập trung vào **hiểu đúng yêu cầu → chọn đúng nhánh → cấp và gọi đúng tool**.
>
> Tài liệu này không xác nhận agent đã được sửa. Chưa thay đổi code, cấu hình provider hay database để thực hiện các đề xuất bên dưới. Chưa nghiệm thu chatbot bằng provider thật trong đợt phân tích này.

## 1. Kết luận chính

Agent Tiger345 sử dụng **harness tự viết, điều phối bằng code quanh model**. Model không tự do truy cập database hoặc tự quyết định toàn bộ vòng đời tác vụ.

Harness quyết định:

- Cách hiểu và phân loại tin nhắn.
- Nhánh nào xử lý yêu cầu.
- Dữ liệu nào được tải vào lượt hiện tại.
- Tool nào được model nhìn thấy.
- Tool call nào hợp lệ và được thực thi.
- Kết quả nào được chuyển thành cards, pending suggestions hoặc draft.
- Câu trả lời nào được phép hiển thị.
- Khi nào kết quả được commit vào phiên và stream tới trình duyệt.

**Vì vậy, nâng model hoặc đổi system prompt không tự giải quyết được lỗi khi harness đã chọn sai route hoặc không cấp tool cần thiết.**

Điểm ưu tiên tinh chỉnh là cả chuỗi **understanding → route → context → active tools → fallback**, không chỉ classifier.

## 2. Bản đồ kiến trúc

```text
Tin nhắn khách + page context
              |
              v
HTTP guards / feature flags / rate limit
              |
              v
Runtime: actor, session, version, idempotency, lease
              |
              v
Understanding: normalization, intent, entities, constraints
              |
              v
Capability router
              |
   +----------+---------------------+
   |          |                     |
conversation restaurant/reservation main
   |          |                     |
model       specialized tools      loadMainContext
không có                            |
menu tool                           v
                              deterministic draft handling
                                    |
                                    v
                              active tools + fallback
                                    |
                                    v
                              model chọn read tool
                                    |
                                    v
                              ToolGateway kiểm và thực thi
                                    |
                                    v
                              observations -> cards/state
                                    |
                                    v
                              model diễn đạt theo evidence
   |          |                     |
   +----------+---------------------+
              |
              v
Response guard -> runtime CAS -> verified presentation streaming
```

### Các điểm vào chính

| Thành phần | Vị trí | Trách nhiệm |
|---|---|---|
| UI state và thao tác | `src/features/concierge/useConcierge.ts` | Gửi tin, page context, loading/activity, stop/retry, session phía client |
| Client transport | `src/features/concierge/api.ts`, `stream.ts` | HTTP/SSE, kiểm completion và recovery |
| HTTP handler | `supabase/functions/public-api/concierge-handlers.ts` | Parse request, flags, rate limit, mapping lỗi |
| Runtime | `supabase/functions/_shared/concierge/runtime.ts` | Session, idempotency, lease, cancellation, commit state |
| Orchestrator | `supabase/functions/_shared/concierge/orchestrator.ts` | Hiểu lượt, định tuyến, gọi handlers/tools/model, hoàn tất kết quả |

Theo `docs/architecture.md:120`, production có một runtime Concierge. Tên protocol `concierge-v2` và các chú thích Tiger Agent V3 không biểu thị hai runtime chạy song song. Các tài liệu lịch sử trong `plans/` không nên được coi là nguồn mô tả chính xác code hiện tại nếu chưa đối chiếu.

## 3. Understanding: agent hiểu câu khách như thế nào?

### 3.1. Luồng hiện tại

`understandTurn()` trong `supabase/functions/_shared/concierge/understanding/engine.ts:69` tạo:

- Dạng câu đã chuẩn hóa.
- Intent.
- Confidence.
- Constraint delta: số người, trẻ em, ngân sách, độ cay.
- Draft signal.
- Memory intent.
- Entity truy vấn tên món.
- `requiresClarification`.

Classifier hiện là **deterministic, regex-first**, với thứ tự first-match:

```text
smalltalk -> reservation -> account reads -> FAQ
         -> food -> constraints -> other
```

Nguồn: `supabase/functions/_shared/concierge/understanding/intent-classifier.ts:34`.

### 3.2. Hạn chế

- Cách nói không nằm trong các cue có thể rơi xuống `other`.
- Một câu khách hiểu rõ về mặt ngữ nghĩa chưa chắc được classifier nhận diện đúng.
- Confidence hiện chủ yếu là metadata; không tự kích hoạt semantic fallback hoặc hỏi làm rõ trong router.
- `requiresClarification` không đồng nghĩa harness hiện đã thực thi một chính sách hỏi lại đầy đủ.
- Cùng một yêu cầu có thể bị ảnh hưởng bởi từ khóa hoặc dấu hỏi.

Không nên giải quyết bằng cách chuyển mọi `other` thành tìm menu: câu ngoài chủ đề và câu mơ hồ vẫn cần được xử lý riêng.

## 4. Router: hiểu câu và chọn khả năng là hai việc khác nhau

`resolveRoute()` nằm tại `supabase/functions/_shared/concierge/orchestration/capability-router.ts:37`.

| Route | Hành vi |
|---|---|
| `refresh` | Cập nhật trạng thái phiên |
| `account_refusal` | Từ chối guest đọc dữ liệu tài khoản |
| `restaurant_fact` | Tra dữ kiện vận hành nhà hàng |
| `reservation` | Làm rõ thời gian/số người và kiểm tra khả dụng |
| `conversation` | Hội thoại qua model, không tải factual context trong handler |
| `main` | Luồng menu, gợi ý, draft và account phù hợp |

Nhánh `conversation` được xử lý và return tại `orchestrator.ts:124`, trước bước `loadMainContext()` tại `orchestrator.ts:131`.

Điều này có nghĩa: nếu route sai sang conversation, model không được cấp menu tool hay kết quả tra menu của lượt đó.

### Cần kiểm tra cả hai lớp sau router

1. `orchestration/main-context.ts:67` tự tính lại `factualQuestion` và `faq`. `faq` ảnh hưởng việc có tải catalog hay không.
2. `orchestration/handlers/food-handler.ts:43` chọn active tools. Khi `faq || factualQuestion`, code chỉ cấp `lookup_restaurant_info`.

**Một câu đã đi vào main vẫn có thể không được cấp menu tools.** Sửa intent hoặc router đơn lẻ chưa đủ.

## 5. Tool calling: model đề xuất, harness thực thi

### 5.1. Luồng chính

Trong `orchestrator.ts:129` trở đi:

1. Tải context cần thiết.
2. Xử lý draft bằng code xác định.
3. Dựng fallback calls.
4. Chọn active tools.
5. Gọi model để đề xuất tool calls.
6. Lọc tool calls bằng `selectToolCalls()`.
7. Thực thi qua gateway.
8. Chuyển observations thành cards/pending state.
9. Gọi model diễn đạt dựa trên evidence.
10. Kiểm grounded reply; nếu cần, thử sửa một lần.

Đây là chuỗi hữu hạn, không phải vòng lặp agent tự chủ vô hạn.

### 5.2. Active tools và fallback

Các menu tools chủ đạo:

- `search_menu_items`.
- `get_menu_item`.
- `recommend_meal`.

Các khả năng khác dùng tool chuyên biệt:

- `lookup_restaurant_info`.
- `check_reservation_availability`.
- `get_recent_orders`.
- `get_saved_addresses`.

`buildFallbackCalls()` và `activeToolsFor()` nằm trong `orchestration/handlers/food-handler.ts:24`.

Model không tạo call hợp lệ thì harness có fallback xác định. Tuy nhiên, fallback không cứu được yêu cầu đã bị return ở nhánh conversation. Khi tinh chỉnh cần đảm bảo fallback cũng thuộc tập active tools hợp lệ, không tạo đường tắt vượt quyền.

### 5.3. Gateway là ranh giới an toàn

`ToolGateway.execute()` tại `supabase/functions/_shared/concierge/tools/gateway.ts:84` kiểm:

```text
Tool tồn tại / không bị cấm
 -> input schema
 -> principal capabilities
 -> ownership
 -> timeout
 -> executor
 -> output schema
 -> projection / event
```

Principal được tạo từ actor/session đã xác minh, không lấy từ câu người dùng hoặc model arguments.

**Active-tool selection là chính sách điều phối, không thay thế authorization.** Dù model nhìn thấy hoặc yêu cầu một tool, gateway vẫn phải kiểm quyền.

## 6. Dữ liệu menu và ý nghĩa truy vấn

### 6.1. Nguồn dữ liệu

- Menu/giá: `menu_items`.
- Serving, taste, allergy metadata: `menu_item_ai_profiles` và Menu Domain.
- Dữ kiện vận hành: settings/hours/closures/delivery zones tương ứng.
- Nội dung knowledge: snapshot đã được quản trị, không thay thế dữ kiện vận hành có nguồn cấu trúc.

Tham khảo `docs/architecture.md:133` và `docs/concierge-phase1-knowledge.md:3`.

### 6.2. Retrieval hiện có

`orchestration/tool-runner.ts:126` dựng selection/query và truyền:

- Category.
- Allergies/dislikes.
- Order mode.
- Hard budget.
- Max spice level.
- Diversification cho recommendation.

Search ở runner lấy tối đa 4 candidates; recommendation lấy 8 để dựng meal plans. Cards gợi ý món đơn lẻ hiển thị tối đa 4 candidates.

`menu-retrieval.ts` còn có ranking theo độ khớp tên và signature. Đây là logic code, không phải model tự chấm toàn bộ thực đơn.

### 6.3. Khoảng trống signature

Retrieval có filter `is_signature`, nhưng đoạn truyền tham số hiện tại trong `tool-runner.ts:144` chưa chuyển ý định “đặc sản” thành filter này.

Do đó có hai vấn đề riêng:

1. Yêu cầu đặc sản có tới được menu tools hay không?
2. Khi tới menu tools, có thực sự lọc đúng món signature hay chỉ trả các món được xếp hạng chung?

Không nên đồng nhất “đặc sản”, “nổi bật” và “bán chạy” nếu không có quy tắc và dữ liệu rõ ràng.

## 7. Phân tích trường hợp trong ảnh

Tin nhắn: **“đặc sản của quán”**.

Kết quả đã tái hiện trực tiếp bằng các hàm understanding/router trên code của workspace chính, không gọi provider:

| Tin nhắn | Intent | Confidence | Route |
|---|---|---|---|
| `đặc sản của quán` | `other` | `low` | `conversation` |
| `món đặc sản của quán` | `food` | `medium` | `main` |
| `đặc sản của quán?` | `other` | `low` | `main` |

Dấu hỏi ở biến thể thứ ba kích hoạt nhận diện factual question về quán. Tuy nhiên, biến thể này còn có nguy cơ bị xử lý như FAQ/restaurant lookup tại main-context và active-tool selection, không tự bảo đảm menu retrieval.

### Ý nghĩa của câu “Mình chưa tra được thực đơn…”

Không tìm thấy nguyên văn câu trả lời trong ảnh là literal trong source đã tìm kiếm. Ở nhánh conversation, model có thể tạo câu này mà **không có truy vấn menu nào được thực hiện**.

Vì vậy không được suy ngược:

```text
Model nói chưa tra được menu != database từ chối truy cập menu
```

### Bằng chứng dữ liệu và giới hạn

Lần kiểm tra read-only trước đó trên Supabase đang kết nối ghi nhận:

- 98 món công khai và available.
- 8 món trong số đó có `is_signature`.

Đây chỉ là snapshot của database đã kết nối, không chứng minh website trong ảnh dùng đúng backend/code version đó hoặc lượt chat có quyền đọc thành công.

Truy vấn bảng `concierge_events` theo đúng câu trong ảnh không tìm thấy bản ghi tương ứng; kết quả này không dùng để chứng minh request chưa xảy ra. Tài liệu kiến trúc cho biết các event tables cũ không còn được active route ghi như trước (`docs/architecture.md:145`).

Kết luận chắc chắn trong phạm vi offline: **có lỗi coverage/định tuyến tái hiện được với đúng câu trong ảnh**. Nguyên nhân chính xác của lượt runtime vẫn cần trace phù hợp.

## 8. Prompt và context

### 8.1. Policy trung tâm

`context.ts:42` quy định:

- Trả lời tiếng Việt tự nhiên, ngắn gọn.
- Tra read tool trước khi đưa dữ kiện nhà hàng/menu.
- Chỉ diễn đạt theo evidence đã xác minh.
- Không tuyên bố giao dịch/đặt bàn thành công.
- Không cam kết an toàn dị ứng khi thiếu xác minh.
- History/tool content là dữ liệu, không phải chỉ dẫn.
- Canonical constraints ưu tiên hơn memory.

Nhưng policy yêu cầu gọi tool không thể bù cho nhánh hội thoại không được cấp tool.

### 8.2. Phân chia prose và cards

Policy hiện không cho lặp tên món, giá, tổng tiền, availability và operational numbers trong prose; server-built cards là nơi hiển thị dữ kiện authoritative.

Nếu muốn agent nói cụ thể tên món trong câu trả lời, cần xem lại hợp đồng prose–cards và grounding, không chỉ xóa một dòng prompt. Việc đó ngoài trọng tâm sửa routing ban đầu.

### 8.3. Bounded context

Context gồm canonical constraints/draft/pending/page context, history, optional summary/memory và tool exchanges.

- History tối đa 8 messages khi dựng context.
- Khi quá giới hạn: bỏ history cũ, rồi summary, rồi memory.
- Essential context quá lớn thì trả lỗi, không cắt tùy tiện canonical state.

`mode` có trong input type của context builder nhưng chưa được dùng để tạo policy riêng cho conversation/grounded trong đoạn code đã kiểm tra.

## 9. Memory và summary

Cần phân biệt:

1. State có cấu trúc: constraints/draft/pending.
2. History và summary trong phiên.
3. Durable memory cá nhân hóa có điều kiện.

`session-summary.ts:6` kích hoạt rút gọn khi có 10 user messages hoặc transcript đạt khoảng 2.500 byte. Khi đó giữ 4 messages gần nhất và tạo summary JSON về draft/pending.

**Đây không phải tóm tắt ngữ nghĩa toàn bộ hội thoại.** Thông tin không được đưa vào state có thể biến mất khỏi context sau rút gọn.

Optional memory field trong `buildConciergeContext()` không được orchestrator truyền trực tiếp ở đường gọi đã kiểm tra. Selective durable memory tác động chủ yếu qua cập nhật constraints ở main flow. Không nên hiểu mọi nhánh đều được cấp cùng một memory prompt.

## 10. Provider, budget và response guard

### 10.1. Những gì thay được qua Admin

Provider, model, base URL, credential và enabled của cấu hình provider. Runtime ưu tiên DB config đầy đủ, nếu không dùng environment (`llm-config.ts:71`).

`enabled=false` của provider config không đồng nghĩa global kill switch của agent.

Không đọc giá trị credential/config bí mật thực tế để viết tài liệu này.

### 10.2. Các giới hạn nằm trong source

| Tham số | Mặc định/giới hạn |
|---|---:|
| Model calls/lượt | 3 |
| Tool executions/lượt | 6 |
| Estimated input upper-bound/call | 6.000 |
| Estimated input upper-bound/lượt | 12.000 |
| Turn budget | 25 giây |
| Provider timeout | 10 giây |
| Model wrapper timeout | 11 giây |
| Tool timeout | 4 giây |
| Output tokens mặc định / cap | 1.024 / 2.048 |
| Reply guard | 700 ký tự |
| Server stream / client deadline | 25 / 30 giây |

Nguồn: `context.ts:27`, `llm.ts:287`, `orchestrator.ts:48`, `tools/gateway.ts:65`, `response-guard.ts:3`, `docs/concierge-streaming.md:65`.

Input upper-bound dựa trên UTF-8 bytes, không phải tokenizer thực của provider. Không nên coi số 6.000 này là đúng 6.000 billed tokens.

### 10.3. Tương tác cần nhớ

- Tăng output tokens không vượt được guard 700 ký tự.
- Tăng context/calls có thể vượt deadline hoặc tăng chi phí.
- Schema observability cũng chặn max calls/tokens/tools; thay budget phải đồng bộ schema/tests.
- Adapter hiện không gửi temperature knob.
- Grounded reply fail guard được sửa tối đa một lần; vẫn không đạt thì fail đóng.
- Regex guard kiểm số/claim/URL không phải bộ chứng minh đầy đủ tính đúng đắn ngữ nghĩa.

## 11. Streaming và quan sát

Streaming là **verified presentation streaming**: trạng thái xử lý, rồi văn bản/cards đã kiểm định sau commit. Không phải phát token model thô tới khách. Xem `docs/concierge-streaming.md:3`.

Metrics hiện có:

- Outcome/reason và latency.
- Model calls, tool count.
- Estimated/reported input tokens, output tokens.
- Summary used, context trimmed.
- Safety blocks, draft/handoff.

Nguồn: `observability.ts:3`.

Turn metrics hiện chưa cho thấy đầy đủ intent, route, active tools, fallback reason, candidate count hoặc evidence status. Vì vậy các triệu chứng sau có thể khó phân biệt nếu chỉ xem metrics tổng:

```text
Route sai
Không cấp tool
Model không gọi tool
Tool input sai
Tool trả rỗng
Dependency lỗi
Guard chặn câu trả lời
```

Nếu bổ sung trace sau này, nên dùng metadata bounded/enum đã khử nhạy cảm. Không log raw transcript, prompt, key, user contact, capability hoặc secret-bearing payload.

## 12. Hướng tinh chỉnh được ưu tiên: hiểu đúng và gọi tool

Các mục dưới là **đề xuất chưa triển khai**, không phải danh sách thay đổi đã hoàn thành.

### 12.1. Một interpretation chung cho nhu cầu tra cứu

Mở rộng `TurnUnderstanding` hiện có bằng metadata typed về nhu cầu đọc menu/thông tin vận hành hoặc thiếu mục tiêu rõ ràng. Đây không phải quyền authorization.

Classifier, router, main-context và food-handler cần dùng cùng interpretation, tránh mỗi nơi tự diễn giải lại bằng regex khác nhau.

Không thêm model call phân loại ở bước đầu. Chỉ cân nhắc semantic fallback sau khi bộ regression đo được giới hạn của cách deterministic có kiểm soát.

### 12.2. Đồng bộ route, catalog và active tools

Một yêu cầu được hiểu là menu phải:

1. Vào nhánh hỗ trợ menu.
2. Tải catalog authoritative.
3. Nhìn thấy menu read tools.
4. Có fallback menu hợp lệ khi model không tạo call sử dụng được.
5. Có evidence/cards trước khi đưa dữ kiện.

Không chỉ assert intent=`food` rồi coi là đã sửa.

### 12.3. Nối yêu cầu đặc sản với filter có sẵn

Dùng tín hiệu signature đã hiểu để truyền filter `is_signature` hiện có vào retrieval, đồng thời giữ allergy, availability, order mode và hard budget.

Nếu không có signature phù hợp, không tự thay bằng món thường rồi gọi đó là đặc sản.

Không đại tu ranking hoặc mở rộng “bán chạy” khi chưa có luồng metadata được xác minh.

### 12.4. Mơ hồ và follow-up

- Tái dùng constraints, pending items và page context hiện có.
- “Món này” có page context hợp lệ thì đọc món tương ứng.
- Nhiều candidates nhưng “món đó” không xác định được thì hỏi rõ.
- Smalltalk/off-topic không tự tải menu.
- Không dùng mọi low-confidence input để kích hoạt retrieval hoặc hỏi lại máy móc.
- Không tự khẳng định đã tra thất bại khi thực tế chưa gọi tool.

### 12.5. Tái dùng các ranh giới sẵn có

Giữ `selectToolCalls()`, `V2_TOOL_REGISTRY`, `ToolGateway`, `understandDraft()` và runtime version/idempotency checks.

Không thay schema DB, provider, UI hoặc chính sách quyền chỉ để giải quyết lỗi tool routing này nếu không có nhu cầu cụ thể được chứng minh.

## 13. Vị trí source liên quan nếu triển khai sau

Các đường dẫn rút gọn server bên dưới nằm trong `supabase/functions/_shared/concierge/`.

| Nhóm | File trọng tâm |
|---|---|
| Interpretation | `understanding/types.ts`, `engine.ts`, `intent-classifier.ts`, `normalizer.ts` |
| Routing | `orchestration/capability-router.ts`, `orchestrator.ts`, `orchestration/turn-context.ts` |
| Context và cấp tools | `orchestration/main-context.ts`, `orchestration/handlers/food-handler.ts` |
| Retrieval/tool execution | `orchestration/tool-runner.ts`, `menu-retrieval.ts`, `tool-registry.ts`, `tools/gateway.ts` |
| Phân loại food cho memory | `memory-retrieval.ts` nếu cần dùng chung cue, không đổi consent |
| Regression | `tests/server/concierge-understanding.test.ts`, `concierge-orchestration-phase4.test.ts`, `concierge-grounding.test.ts` |

Đây là bản đồ can thiệp, không yêu cầu sửa tất cả các file.

## 14. Ma trận kiểm thử đề xuất

| Nhóm | Ví dụ / điều cần xác nhận |
|---|---|
| Bug gốc | `đặc sản của quán`, thêm “món”, thêm dấu hỏi, dạng không dấu: không bị đưa vào conversation hoặc chỉ cấp restaurant lookup |
| Menu browsing | `cho xem thực đơn`, `quán có món gì`: dùng nguồn menu |
| Dish detail | Câu hỏi giá/cay/availability của món cụ thể: đúng search/detail, không tự tạo draft |
| Operational facts | Địa chỉ, giờ mở, phí giao, chính sách đặt bàn: đúng nguồn vận hành |
| Follow-up | Pending suggestions, page item, số người/ngân sách: dùng đúng state; entity mơ hồ phải hỏi lại |
| Negative/mixed | Smalltalk/off-topic không retrieval; câu đa nhu cầu không âm thầm bỏ một phần rồi bịa câu trả lời |
| Model/tool failure | Không call/call sai schema: fallback đúng active set; phân biệt tool rỗng và load catalog lỗi |
| Safety | Guest account refusal, ownership, read-only tools, stale draft, allergy fail-closed giữ nguyên |

Nên assert cả chuỗi **intent/read need → route → catalog load → active tools → actual tool execution → evidence/cards**, thay vì chỉ kiểm câu trả lời mock.

### Verification khi có thay đổi code

Theo `CLAUDE.md`:

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

DB/browser suites có prerequisite riêng theo `AGENTS.md` và `docs/contributing.md`. Không tự ghi dữ liệu production hoặc chạy provider trả phí.

Nghiệm thu runtime cần:

- Đúng frontend/backend/version/provider của môi trường bàn giao.
- Xác nhận backend source mới đã được serve/deploy, không suy từ frontend build.
- Phiên guest/test mới, không đụng hội thoại/giỏ hiện tại.
- Hỏi menu và giá rồi đối chiếu dữ liệu authoritative.
- Kiểm lượt tiếp theo và draft-only regression.
- Không submit đơn, thanh toán hoặc booking.
- Chấp thuận rõ ràng trước khi phát sinh provider calls có phí.

## 15. Ranh giới không nên nới để tăng chất lượng

- Authorization và ownership.
- Model-visible tools chỉ đọc.
- Giá/availability dựa trên catalog hiện hành.
- Dị ứng fail-closed khi không xác minh.
- Explicit draft operations, state version, idempotency và CAS.
- Manual checkout; không tuyên bố order/payment/booking thành công từ lời model.
- Provider destination validation và bảo vệ credential.

## 16. Trạng thái

- Đã phân tích source và đối chiếu các điểm điều phối chính.
- Đã tái hiện offline lỗi intent/router của câu trong ảnh ở bước phân tích trước.
- Chưa triển khai các đề xuất trong tài liệu.
- Không có kết quả full verification suite cho thay đổi code vì chưa thực hiện thay đổi code.
- **Runtime chatbot: CHƯA KIỂM ĐỊNH.** Phân tích code và kiểm tra HTTP trang chủ không thay thế nghiệm thu agent trên backend/provider thực tế.
