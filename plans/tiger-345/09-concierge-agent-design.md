# Tiger 345 — Kế hoạch thiết kế Restaurant Concierge Agent

Ngày lập: 2026-09-19.

Trạng thái: **Đề xuất thiết kế; chưa triển khai code, chưa kiểm chứng production.**

Tài liệu tổng hợp phương án đã trao đổi với chủ dự án: một agent duy nhất, có structured food knowledge, RAG, business tools và deterministic validator. Bao gồm trải nghiệm, dữ liệu, kiến trúc, rủi ro, kiểm thử và roadmap.

## 1. Phạm vi và quan hệ với kế hoạch hiện có

- Đây là kế hoạch mở rộng AI theo yêu cầu mới, không tự đưa AI vào các task nền tảng hiện tại.
- Các tài liệu [02-architecture.md](02-architecture.md), [03-database.md](03-database.md), [04-api-contracts.md](04-api-contracts.md) và [08-decisions.md](08-decisions.md) tiếp tục là nguồn tham chiếu cho nghiệp vụ nền tảng.
- Khi bắt đầu triển khai agent, phải cập nhật các contract và task bị ảnh hưởng; không âm thầm sửa quy tắc giao dịch.
- Giữ định hướng React/Vite, Supabase PostgreSQL/Auth/Edge Functions, một nhà hàng, login tùy chọn và một quyền Admin.
- Agent gọi lại services nghiệp vụ hiện có. Không tạo một orders engine, bảng khách hàng hoặc hệ thống phân quyền song song.
- Availability ban đầu là trạng thái được hệ thống quản lý, không đồng nghĩa tồn kho thời gian thực khi chưa có inventory.
- Không bổ sung POS, loyalty, payment gateway, CRM hoặc nhiều chi nhánh trong phạm vi này.
- Giá, khẩu phần và hệ số trong ví dụ chỉ là minh họa; cần nhà hàng xác nhận trước khi dùng với khách thật.

## 2. Mục tiêu sản phẩm

| Nhu cầu | Kết quả khách nhận được |
|---|---|
| Hỏi về quán và món | Thông tin có nguồn và đúng tình trạng hiện tại |
| Chọn món | Phương án hợp số người, sức ăn, sở thích và ngân sách |
| Đặt món hoặc đặt bàn | Quy trình rõ ràng, có xác nhận trước khi gửi |
| Cá nhân hóa khi đăng nhập | Giảm thao tác nhờ favorites, lịch sử và lựa chọn đã lưu |

Giá trị trọng tâm: **giúp một nhóm khách chọn được bữa ăn hợp lý từ menu thật và kiến thức khẩu phần của chính nhà hàng**.

Không tối ưu bằng cách cố tiêu hết ngân sách hoặc tăng số món. Ưu tiên phù hợp, chính xác và niềm tin lâu dài.

### Ngoài phạm vi ban đầu

- Multi-agent hoặc supervisor agent.
- Tư vấn y tế hay bảo đảm an toàn dị ứng khi thiếu thông tin.
- Tự quyết định giảm giá, hoàn tiền hoặc thay đổi chính sách.
- Tự đặt đơn, giữ bàn, sửa hoặc hủy giao dịch mà thiếu workflow được hỗ trợ.
- Tự động xuất bản kiến thức học được từ feedback.
- Thu thông tin thẻ thanh toán trong hội thoại.

## 3. Nguyên tắc thiết kế

1. LLM hiểu nhu cầu, chọn tool và diễn đạt; không là nguồn sự thật nghiệp vụ.
2. Backend quyết định quyền, giá, tổng tiền, tính hợp lệ và trạng thái giao dịch.
3. Recommendation phải được kiểm tra trước khi hiển thị như phương án hợp lệ.
4. Thiếu dữ liệu là trạng thái rõ ràng, không bị thay bằng suy đoán.
5. Confirmation và authorization được thực thi bằng backend, không chỉ bằng prompt.
6. Khi AI lỗi, khách vẫn có thể dùng menu, giỏ, checkout hoặc liên hệ nhân viên.
7. Không lưu hidden reasoning hoặc dùng lời agent tự nói làm bằng chứng xác nhận của khách.
8. Không tạo các lần gọi model sửa đáp án ngầm; mọi vòng sửa phải có giới hạn và trace.

## 4. Kiến trúc tổng thể

```text
Chat UI + cards + cart
          |
          v
Assistant API
          |
          v
Conversation Engine
  - Authentication / authorization
  - Intent / workflow state
  - Context builder
  - Confirmation / safety gates
          |
          v
ONE Tiger Concierge LLM
          |
          v
Typed Tool Gateway
  |-- Menu / restaurant settings
  |-- Structured serving / allergens
  |-- Document retrieval / RAG
  |-- Recommendation engine / validator
  |-- Customer context
  `-- Existing order / reservation services
          |
          v
Output / action validation
          |
          v
Structured response -> Chat UI
```

Các module là các trách nhiệm phần mềm, không phải các agent hoặc microservice riêng.

### Phân công trách nhiệm

| Thành phần | Trách nhiệm |
|---|---|
| LLM | Hiểu tiếng Việt tự nhiên, trích constraints, chọn tool, giải thích |
| Conversation engine | Quản lý state, điều phối lượt, áp dụng policy |
| Recommendation engine | Tạo, tính toán và xếp hạng phương án |
| Validator | Kiểm tra ràng buộc và trả lý do pass/warning/block |
| Business services | Giá, quote, quyền, transaction, trạng thái thật |
| UI | Hiển thị dữ liệu đã kiểm tra và thu hành động xác nhận |

Kiểm tra trước tool execution và trước phát hành kết quả là hai bước riêng. Model không tự cấp quyền cho nút hành động bằng text.

## 5. Intent và các hành trình

Intent chính:

- restaurant_info
- menu_lookup
- food_recommendation
- order
- reservation
- order_status
- reservation_status
- customer_history
- general_chat

Intent routing có thể nằm trong structured output của main model. Không mặc định thêm một model call riêng chỉ để classify.

| Hành trình | Luồng |
|---|---|
| Hỏi thông tin | Hiểu câu hỏi -> truy xuất đúng nguồn -> trả lời |
| Tư vấn bữa ăn | Constraints -> clarification nếu cần -> candidate -> validate -> cards |
| Chỉnh combo | Nhận thay đổi -> giữ constraints còn lại -> tính và validate lại |
| Đặt món | Thêm giỏ -> checkout -> quote -> confirm -> submit |
| Đặt bàn | Thu thập -> summary -> confirm -> request -> trạng thái thật |
| Theo dõi | Xác thực quyền -> đọc trạng thái -> giải thích |

## 6. Conversation state và memory

### Nội dung cần lưu

| Nhóm | Nội dung |
|---|---|
| Điều hướng | Intent, workflow và bước hiện tại |
| Recommendation | Adults, children, appetite, budget, preferences, dislikes, allergies, styles, alcohol, meal context |
| Nguồn constraints | Khách nói rõ, hệ thống giả định hoặc chưa biết |
| Phương án | Proposal ID/version, items, validation, assumptions |
| Giỏ | Cart ID/version và tham chiếu dữ liệu thật |
| Xác nhận | Action type, payload reference, version, expiry |
| Dữ liệu | Menu/knowledge/config versions và thời điểm đọc |
| Đồng thời | State version, request ID, turn đang xử lý |

### Quy tắc memory

- Thông tin khách sửa mới nhất thay thế thông tin cũ.
- Giữ phân biệt sở thích khai báo và suy luận từ lịch sử.
- Đổi số người, món, ngân sách hoặc mode phục vụ phải đánh giá lại phương án.
- Đổi tài khoản hoặc logout phải bỏ customer context cũ.
- Session của guest không được truy cập chỉ bằng một conversation ID có thể đoán hoặc bị lộ; cần cơ chế sở hữu phiên.
- Khi guest đăng nhập, gắn/chuyển state phải có chính sách rõ ràng, không trộn dữ liệu giữa người dùng.
- Dùng state version để phát hiện hai tab hoặc hai request cùng sửa.
- Tóm tắt hội thoại chỉ phục vụ context; không thay thế quote, giá, authorization hoặc confirmation thật.

Persist message, structured state, tool events đã lọc và kết quả cần thiết. Không persist chain-of-thought.

### State machine

```text
IDLE
  |-- ANSWERING
  |-- RECOMMENDING
  |     |-- CLARIFYING
  |     |-- BUILDING
  |     |-- PROPOSAL_READY
  |     `-- CART_UPDATED
  |-- ORDERING
  |     |-- COLLECTING
  |     |-- QUOTED / CONFIRMING
  |     |-- SUBMITTING
  |     `-- SUBMITTED / FAILED / RECONCILING
  `-- RESERVING
        |-- COLLECTING
        |-- CONFIRMING
        |-- SUBMITTING
        `-- SUBMITTED / FAILED / RECONCILING
```

RECONCILING nghĩa là đang xác minh kết quả khi timeout, không tự coi giao dịch thất bại rồi gửi lại.

## 7. Clarification policy

Chỉ hỏi thông tin có khả năng thay đổi đáng kể recommendation.

| Tình huống | Hành vi |
|---|---|
| Có số người và ngân sách | Bắt đầu; có thể giả định ăn vừa và ghi rõ |
| Thiếu số người để tính lượng | Hỏi số người |
| Mơ hồ tổng người và số trẻ | Hỏi làm rõ |
| Khách không muốn trả lời | Dùng giả định hợp lý cho tư vấn thông thường |
| Thiếu trường bắt buộc đặt đơn/bàn | Chưa submit |
| Có dị ứng nhưng dữ liệu chưa đủ | Không kết luận an toàn |

Mỗi lượt thường một câu, tối đa hai ý liên quan. Không hỏi lại dữ liệu đã có. Giới hạn hỏi ít không được dùng để bỏ qua yêu cầu an toàn hay dữ liệu giao dịch bắt buộc.

Ví dụ: “7 người, có 2 trẻ” có thể cần hỏi “7 người đã gồm 2 bé chưa?”. Không cần đồng thời hỏi lại ngân sách và sức ăn nếu khách đã nói.

Không mặc định không dị ứng khi khách chưa khai báo.

## 8. Knowledge architecture

| Lớp | Dữ liệu | Source of truth |
|---|---|---|
| Structured facts | Menu, variants, giá, availability, serving, allergens | DB và dữ liệu quán duyệt |
| Documents / RAG | Brand, món, cách chế biến, FAQ, policies | Tài liệu xuất bản có nguồn |
| Customer context | Favorites, lịch sử, addresses, preferences | Authenticated customer services |

Không trộn ba lớp vào một vector store.

### Nhóm dữ liệu cần thiết

- Menu items và variants theo kích cỡ/đơn vị.
- Serving profiles gắn đúng item/variant.
- Allergen profiles và thông tin thay nguyên liệu đã được quán hỗ trợ.
- Recommendation configuration có version.
- Documents/chunks có nguồn và hiệu lực.
- Conversation state/events.
- Recommendation proposals và feedback.
- Confirmation records tham chiếu quote/request thật.
- Knowledge audit log.

Đây là mô hình khái niệm, không phải quyết định tạo bảng trùng với schema hiện có. Khi triển khai phải map vào entities hiện tại.

## 9. Structured serving knowledge

| Trường/nhóm | Ý nghĩa |
|---|---|
| Item / variant | Áp dụng đúng món và kích cỡ |
| Serving unit | Con, phần, cây, đĩa, nồi |
| Pieces / weight | Số miếng hoặc khối lượng nếu quán biết |
| People range | Khoảng người dùng phù hợp |
| Meal context | Món chính duy nhất, ăn cùng món khác, chia sẻ |
| Meal role | Main, protein, carb, vegetable, soup, hotpot, side, snack, dessert, drink, alcohol |
| Contributions | Mức đóng góp theo nhóm đạm/tinh bột/rau… |
| Notes | Điều kiện và lưu ý tư vấn |
| Confidence | Restaurant-defined / estimated / unknown |
| Provenance | Nguồn, người duyệt, ngày cập nhật |

Một cây cơm lam chặt bốn khúc không tự động nghĩa là đủ tinh bột cho bốn người. Cần bối cảnh, kích thước hoặc hướng dẫn thực tế của quán.

Món hỗn hợp, lẩu và combo có thể đóng góp nhiều nhóm. Không cộng lặp thành phần đã nằm trong combo.

Bắt đầu với nhóm món bán chạy có dữ liệu được duyệt. Món thiếu serving vẫn có thể được tra cứu hoặc khách chọn qua menu thông thường, nhưng không được gắn khẳng định đủ khẩu phần chưa có căn cứ.

## 10. Serving math và budget

### Khẩu phần

- Equivalent adult là phép ước tính nội bộ, không phải tư vấn dinh dưỡng.
- Có thể bắt đầu nghiên cứu với adult = 1, child = 0.6; appetite light = 0.85, normal = 1, heavy = 1.2.
- Các hệ số trên chưa được xác thực, phải cấu hình và hiệu chỉnh bằng đánh giá của quán.
- Chỉ hỏi nhóm tuổi trẻ khi có ảnh hưởng đáng kể; không thu thông tin trẻ em không cần thiết.
- Tính coverage theo nhóm món và bối cảnh, không cộng servings của gà và rau thành tổng người.
- Tính cả món đã có trong giỏ khi khách muốn bổ sung cho cùng bữa.
- Không dùng precision giả như “đủ 4,3 người” trên UI.

### Ngân sách

| Cách diễn đạt | Quy tắc |
|---|---|
| Tối đa 800k | Hard cap 800k |
| Khoảng 800k | Ưu tiên không vượt; nếu có phương án cao hơn phải nêu rõ |
| 800k gồm phí giao | Cần phí thật hoặc chưa thể chốt tổng |
| Chưa có ngân sách | Đưa giá rõ ràng, không tự chọn mức cao |

Không mặc định mọi budget được vượt 5%. Không thêm món chỉ để tiêu hết tiền.

Tách giá món tham khảo trong proposal và tổng thanh toán trong order quote. Tiền được tính ở backend theo biểu diễn chính xác phù hợp hệ thống; không để LLM cộng tiền.

## 11. Candidate builder và ranking

1. Chuẩn hóa constraints, phân biệt hard constraints và preferences.
2. Hỏi nếu thiếu biến quan trọng.
3. Lấy menu, variants, giá và availability hiện tại.
4. Lọc điều kiện bắt buộc.
5. Lấy serving và allergens.
6. Tạo một tập nhỏ candidate bằng quy tắc và tìm kiếm có giới hạn.
7. Validate từng candidate.
8. Rank các phương án đạt điều kiện.
9. Chọn 2–3 phương án khác biệt thực sự.
10. LLM giải thích dựa trên kết quả đã kiểm tra.

Các tiêu chí ranking: serving fit, preference fit, budget fit, diversity, restaurant signature. Trọng số là cấu hình được đánh giá; điểm cao không được bù cho vi phạm an toàn hoặc hard budget.

Các phương án có thể là “tiết kiệm”, “vừa đủ theo sở thích”, “đa dạng hơn”. Không tạo nhiều phương án gần như giống nhau.

Nếu không có phương án hợp lệ: nêu ràng buộc gây thiếu lựa chọn và đề nghị khách chọn cách điều chỉnh. Không tự bỏ allergy, tăng hard budget hoặc đổi số người.

## 12. Deterministic validator

### Trạng thái

- PASS: có đủ dữ liệu và đạt các điều kiện áp dụng.
- WARNING: có thể dùng nhưng cần giải thích hạn chế.
- BLOCKED: vi phạm điều kiện bắt buộc.
- INSUFFICIENT_DATA: chưa đủ căn cứ; không được chuyển thành pass ngầm.

### Kiểm tra

| Kiểm tra | Cách xử lý |
|---|---|
| IDs, variants, số lượng, giới hạn | Sai thì chặn |
| Availability | Món không khả dụng bị loại |
| Giá/tổng tiền | Đọc và tính lại từ backend |
| Budget cứng | Vượt thì chặn candidate |
| Allergens khách khai báo | Có hoặc chưa rõ nguy cơ thì không cấp kết luận an toàn |
| Serving | Đánh giá theo nhóm và khoảng dữ liệu |
| Balance | Theo mục đích bữa ăn; thiếu rau không luôn là lỗi chặn |
| Knowledge freshness | Phát hiện thay đổi và yêu cầu validate lại |

Output gồm trạng thái tổng, kết quả từng kiểm tra, tổng tiền, coverage theo nhóm, assumptions, warnings, nguồn/version và thời điểm kiểm tra.

Backend không cấp hành động dựa trên candidate bị chặn. Không để LLM bỏ qua validator rồi hiển thị một phương án khác chưa kiểm tra.

## 13. Allergen guardrail

- Biểu diễn contains, may_contain, unknown; thiếu bản ghi cũng được xem là unknown.
- Nếu cần trạng thái không chứa, phải có định nghĩa, nguồn và phạm vi xác nhận rõ; không suy ra từ việc vắng dữ liệu.
- Phân biệt nguyên liệu trong món và nguy cơ nhiễm chéo khi chế biến.
- Không đoán allergens từ tên món hoặc câu chuyện nguyên liệu trong RAG.
- Không tự hứa bỏ nguyên liệu sẽ làm món an toàn; tùy chỉnh cần được bếp hỗ trợ và xác nhận.
- Với dữ liệu không đủ, hướng khách xác nhận trực tiếp với quán; không đưa bảo đảm tuyệt đối.
- Nếu khách mô tả phản ứng dị ứng đang xảy ra, ngừng tư vấn món và hướng tìm hỗ trợ y tế khẩn cấp phù hợp.

Allergen rules là hard safety constraints; không được nới theo ranking hoặc feedback.

## 14. RAG và retrieval

Bắt đầu bằng PostgreSQL full-text kết hợp tìm tên món/từ khóa và xử lý tiếng Việt. Chỉ thêm pgvector khi eval cho thấy cải thiện cần thiết. Không cần Qdrant/OpenSearch ở giai đoạn đầu.

Document metadata: source, topic, updated_at, effective dates nếu có, người duyệt, draft/published/retired.

Quy tắc:

- Giá và availability hiện tại luôn từ structured services.
- Thông tin thường đổi như giờ mở cửa ưu tiên settings quản lý tập trung.
- Tài liệu cũ không ghi đè dữ liệu nghiệp vụ mới.
- Nguồn mâu thuẫn phải được ghi nhận và xử lý theo thẩm quyền/hiệu lực, không tự ghép thành kết luận chắc chắn.
- Không có nguồn phù hợp thì nói chưa có thông tin.
- Hiển thị nguồn khi hữu ích; không tạo citation giả.
- Retrieved text là dữ liệu không đáng tin về mặt chỉ thị; không có quyền mở thêm tool hoặc đổi policy.

## 15. Typed tools và contract

| Nhóm | Tools/khả năng đề xuất |
|---|---|
| Menu | search_menu, get_menu_items, get_menu_item_details, get_serving_profiles |
| Restaurant | search_restaurant_knowledge, get_restaurant_settings |
| Recommendation | build_meal_candidates, validate_meal_plan, calculate_meal_quote |
| Cart | Đọc/thêm/sửa giỏ qua luồng hiện có |
| Order | create_order_quote, submit_order, get_order_status |
| Reservation | create_reservation_request, get_reservation_status nếu quyền hiện có cho phép |
| Customer | get_customer_context |
| Support | Liên hệ hoặc gửi yêu cầu hỗ trợ nếu có tích hợp thật |

Không cố giữ đúng một số lượng tool. Tách theo trách nhiệm và quyền tác động.

Mỗi contract phải có schema input/output, auth, object ownership, read/write classification, confirmation requirement, timeout, retry policy, idempotency, error codes và provenance.

- Danh tính được backend lấy từ session, không tin user_id do model cung cấp.
- Read tool chỉ trả DTO cần thiết, không trả nguyên bảng.
- Tool lỗi trả lỗi thật, không trả dữ liệu mock như thành công.
- Không raw SQL, arbitrary HTTP hoặc quyền admin cho model.
- Lỗi nghiệp vụ, thiếu dữ liệu và lỗi hạ tầng cần được phân biệt.

## 16. Order workflow và confirmation

```text
Proposal được validate
-> Khách chọn thêm vào giỏ
-> Kiểm tra proposal/cart version và cập nhật giỏ
-> Thu thông tin checkout
-> Tạo quote có thời hạn
-> Hiển thị món, lượng, phí, địa chỉ/mode và tổng
-> Khách xác nhận quote cụ thể
-> Backend kiểm tra lại quyền, giá và điều kiện
-> Submit idempotent
-> Trả trạng thái từ orders service
```

- “Đồng ý thêm giỏ” không đồng nghĩa đồng ý đặt đơn.
- Confirmation gắn với action, quote ID/version, nội dung và expiry; không dùng một boolean chung.
- Thay đổi món, lượng, địa chỉ, mode, phí hoặc tổng làm mất hiệu lực xác nhận cũ.
- Ưu tiên nút xác nhận có structured action. Text “ok” chỉ được xử lý khi có đúng một hành động đang chờ, không mơ hồ và gắn đúng payload.
- Quote TTL dùng chính sách nghiệp vụ hiện có; mặc định đang đề xuất là 5 phút, không tạo TTL khác cho chatbot.
- Nếu timeout sau submit, tra bằng idempotency/reference trước retry.
- QR tại bàn vẫn phải có visit capability hợp lệ theo nền tảng; agent không được vượt qua điều kiện này.
- Guest sử dụng cơ chế quyền/claim hiện có, không mở status lookup công khai chỉ bằng mã đơn hay số điện thoại.
- Đơn đã tạo và đã thanh toán là hai trạng thái riêng. Không thêm gateway thanh toán vào scope này.

## 17. Reservation workflow

```text
Ngày/giờ/số khách/tên/liên hệ/nguyện vọng khu vực
-> Kiểm tra trường và điều kiện nhận yêu cầu
-> Hiển thị summary với ngày giờ cụ thể
-> Khách xác nhận
-> Submit request idempotent
-> Phản ánh pending/confirmed/rejected theo backend
```

- Chuyển “mai 7h tối” thành ngày cụ thể theo múi giờ nhà hàng trước xác nhận.
- Preferred area là nguyện vọng, chưa phải bảo đảm.
- Pending phải nói “đã nhận yêu cầu”, không nói “đã giữ bàn”.
- Phân biệt số người lớn/trẻ nếu quy trình quán cần; không thu thêm dữ liệu không cần thiết.
- Status access phải theo quyền hiện có; không tự thêm guest reservation claim khi nền tảng chưa hỗ trợ.

## 18. Request lifecycle và output

1. Nhận request, kiểm tra kích thước và rate limit.
2. Xác thực optional user hoặc quyền guest session.
3. Load state theo version và kiểm tra request trùng.
4. Build context tối thiểu, loại dữ liệu cũ hoặc không liên quan.
5. Main model trả structured intent/state patch/tool calls.
6. Validate patch và từng tool call trước execution.
7. Execute tools trong giới hạn lượt/thời gian; chỉ parallel read độc lập.
8. Validate kết quả nghiệp vụ, proposal và action permissions.
9. Tạo response envelope gồm text, cards, actions, warnings và references.
10. Persist state/events theo version; phát SSE và kết thúc lượt.

Persistence, business transaction và transport cần xử lý độc lập: client ngắt stream không chứng minh submit thất bại. Khi reconnect, đọc trạng thái đã lưu; không tự phát lại mutation.

Có thể stream tiến trình sớm. Giá, allergy claims và thông báo giao dịch thành công chỉ phát sau khi có dữ liệu đã kiểm tra. Không stream khẳng định chưa validate rồi sửa ở cuối.

Prompt chia base role, business rules, tool policy, recommendation policy, safety và current context. Không nhồi toàn bộ lịch sử hay toàn bộ menu vào mỗi lượt.

## 19. Chat UI

| Component | Nội dung |
|---|---|
| MenuItemCard | Món, variant, giá, availability |
| MealRecommendationCard | Items/quantities, total, khoảng khẩu phần, assumptions/warnings |
| ClarificationChoices | Lựa chọn trả lời nhanh |
| OrderQuoteCard | Tổng thanh toán, phí, expiry, nút confirm |
| ReservationSummaryCard | Ngày giờ, số khách, liên hệ phù hợp |
| Order/ReservationStatusCard | Trạng thái từ hệ thống |
| SuggestedActions | Ăn nhẹ hơn, đổi món, giảm tiền, thêm giỏ |

- Render giá và total trực tiếp từ backend envelope, không parse ngược từ prose của LLM.
- Actions tham chiếu proposal/quote thật và được backend kiểm tra lại khi bấm.
- Proposal hết hiệu lực cần cập nhật trước hành động.
- Chống bấm lặp; hiển thị processing và kết quả rõ ràng.
- Ghi rõ giá món chưa bao gồm phí nếu chưa có checkout quote.
- Hỗ trợ mobile, bàn phím, focus management và screen reader cho streaming/cards.
- Giữ phong cách website hiện có; không lộ tool names, trace hoặc chi tiết triển khai trong trải nghiệm khách.

## 20. Personalization và privacy

Ba cấp:

1. Trong phiên: nhớ nhu cầu và phương án đang chỉnh.
2. Đăng nhập: dùng favorites, frequent items và lịch sử liên quan.
3. Lâu dài: lưu sở thích khi khách chủ động chọn, cho phép xem/sửa/xóa.

Không biến “hay gọi gà” thành “chỉ thích gà”. Lịch sử ăn một món không chứng minh không dị ứng.

- Chỉ đưa customer context cần thiết vào model.
- Có thể chọn saved address bằng ID qua UI thay vì đưa toàn bộ addresses vào prompt.
- Redact phone/address trong logs; không log auth token.
- Cân nhắc re-identification: feedback bỏ tên nhưng còn ID liên kết thì là pseudonymous, không gọi là anonymous tuyệt đối.
- Chốt retention, deletion, quyền truy cập nội bộ và chính sách dữ liệu provider trước production.
- Không tự ghi nhớ thông tin nhạy cảm từ một câu nói nếu khách chưa có cơ chế quản lý thông tin đó.

## 21. Risk register và biện pháp kiểm soát

| Rủi ro | Mức | Kiểm soát | Khi không bảo đảm |
|---|---|---|---|
| Dị ứng bị kết luận an toàn sai | Critical | Structured allergens, unknown gate, nguồn bếp | Không kết luận an toàn; liên hệ quán |
| Đặt đơn thiếu xác nhận | Critical | Backend confirmation binding | Chặn submit |
| Đọc dữ liệu khách khác | Critical | Auth và object-level permission | Từ chối và log an toàn |
| Đơn trùng | High | Idempotency, reconcile timeout | Tra trạng thái trước retry |
| Giá/menu đổi | High | Fresh reads, quote expiry, atomic business checks | Quote lại, xác nhận lại |
| Prompt injection | High | Untrusted retrieval, allowlist, least privilege | Không thực thi chỉ thị từ dữ liệu |
| Knowledge serving sai | High | Người duyệt, audit, giới hạn confidence | Ngừng dùng profile, review |
| Memory cũ/khác tài khoản | High | State ownership/version, clear on logout | Bỏ context không hợp lệ |
| Response/card không khớp | High | Structured output, nguồn dữ liệu chung | Không phát action sai |
| Loop/cost abuse | Medium | Rate limit, token/tool/time budgets | Kết thúc lượt có fallback |
| Provider/tool outage | Medium | Timeout, circuit breaker, UI thông thường | Menu/checkout/manual contact |

Không có thiết kế loại bỏ hoàn toàn rủi ro LLM. Transaction invariants phải được backend thực thi; chất lượng ngôn ngữ được đánh giá và theo dõi liên tục.

### Vận hành khi sự cố

- Công tắc riêng: recommendation, submit order, reservation và toàn bộ LLM.
- Tắt tác vụ lỗi nhưng giữ các chức năng nền tảng còn an toàn.
- Có người chịu trách nhiệm xử lý sự cố và knowledge sai.
- Chỉ báo “đã chuyển nhân viên” khi hệ thống thực sự nhận yêu cầu chuyển.
- Xử lý sự cố bằng trace ID; không yêu cầu khách cung cấp secret hoặc dữ liệu không cần thiết.
- Rollback model/prompt/config phải giữ tương thích state và tool contracts.

## 22. Admin knowledge và feedback

Admin chỉnh serving, bối cảnh, allergens, roles/contributions, FAQs và cấu hình trong giới hạn được phép.

```text
Draft -> Kiểm tra dữ liệu -> Người có trách nhiệm duyệt
      -> Publish -> Audit -> Invalidate cache/proposals bị ảnh hưởng
```

Audit: old/new value, updated_by, updated_at, lý do. Không cần versioning enterprise, nhưng phải truy được thay đổi ảnh hưởng proposal nào.

Feedback: phù hợp/không phù hợp; tùy chọn “nhiều quá”, “ít quá”, “quá đắt”, “không hợp khẩu vị”. Gắn proposal/config version và lượng dữ liệu tối thiểu cần đánh giá.

Feedback tạo tín hiệu review. Không tự sửa allergens, giá hoặc hệ số production. Theo dõi bias vì người phản hồi không đại diện toàn bộ khách.

## 23. Observability

Mỗi turn ghi request/conversation ID, intent, state version, tool names/outcomes, latency, token/cost, error codes, validation results và model/prompt/knowledge/config versions.

Transaction events ghi quote reference, confirmation, submit và reconciliation; đủ đối chiếu nhưng không lưu PII không cần thiết.

Không log full phone/address/auth token hoặc toàn bộ raw tool results theo mặc định. Quyền xem trace và thời hạn giữ trace phải được xác định.

Theo dõi p50/p95 latency, error rate, retry rate, chi phí mỗi phiên hoàn thành và tỷ lệ fallback. Chốt SLO sau benchmark với workload thật, không hứa latency chưa đo.

## 24. Evaluation và release gates

Tạo 100–200 tình huống ban đầu, có cả single-turn và multi-turn, tiếng Việt có dấu/không dấu, cách gọi món địa phương và câu mơ hồ.

| Nhóm | Case quan trọng |
|---|---|
| Serving | Adults/children, light/heavy, mixed dishes, missing profiles |
| Budget | Hard/soft cap, phí phát sinh, không có phương án |
| Menu | Unavailable, price change, variant không hợp lệ |
| Preference | Đổi món, dislikes, món đã có trong giỏ |
| Allergen | Contains, may_contain, unknown, cross-contact |
| State | Sửa thông tin, đổi chủ đề, ambiguous ok, hai tab |
| Order | Quote cũ, bấm lặp, timeout sau commit, reconnect |
| Reservation | Ngày tương đối, missing data, pending vs confirmed |
| Privacy/auth | Cross-user access, logout/login, guest ownership |
| RAG | Thiếu nguồn, nguồn cũ/mâu thuẫn, injected instructions |
| Personalization | Inferred preference sai, lịch sử trống, reorder giá mới |
| Resilience | Provider outage, malformed output, tool loop |

### Bốn lớp kiểm thử

1. Unit/property tests cho phép tính, bounds và invariants deterministic.
2. Contract/integration tests cho tools, permission, transaction và idempotency.
3. Conversation eval với bộ dữ liệu cố định và regression theo version.
4. Nhân viên quán đánh giá combo; pilot thực tế trước khi mở rộng.

Không chỉ dùng LLM-as-judge để đánh giá khẩu phần hoặc an toàn. Kết hợp kiểm tra deterministic và người có chuyên môn nghiệp vụ.

### Điều kiện phát hành

- Không có lỗi đã biết về cross-user access, submit thiếu confirmation, idempotency hoặc allergen claims nguy hiểm.
- Critical scenarios phải đạt; failure nghiêm trọng chặn release dù điểm trung bình cao.
- Menu/serving đưa vào pilot có nguồn và người duyệt.
- UI, tool contracts và business services trả trạng thái nhất quán.
- Có fallback, feature flags, trace và quy trình xử lý sự cố.
- Hoàn thành checks kỹ thuật phù hợp implementation: tests, typecheck, lint, build và review.

Zero failures trong test không chứng minh rủi ro production bằng zero. Tiếp tục giám sát và bổ sung regression từ lỗi thật.

## 25. Metrics

| Nhóm | Chỉ số |
|---|---|
| Product | Recommendation-to-cart, acceptance, số lần sửa |
| Serving | Constraint accuracy, feedback vừa/thiếu/dư |
| Budget/menu | Budget compliance, price accuracy, availability accuracy |
| Safety | Unsupported allergen claims, confirmation compliance |
| Conversation | Clarification efficiency, hỏi lại dữ liệu đã biết |
| Tools | Selection accuracy, execution failures, retries |
| RAG | Recall, grounded answer rate, source accuracy, unsupported claims |
| Operation | Latency p50/p95, cost/session, fallback rate |
| Transactions | Duplicate orders, stale quote rate, unknown outcomes |

Mục tiêu price invention và submit thiếu xác nhận là zero; phân biệt phần được backend bảo đảm và phần ngôn ngữ cần đo liên tục. Mỗi metric phải định nghĩa mẫu số, tập đánh giá và cửa sổ thời gian trước khi dùng làm gate.

## 26. Roadmap

| Phase | Phạm vi | Exit gate |
|---|---|---|
| A0 — Chuẩn hóa nghiệp vụ | Source mapping, serving/allergens mẫu, policies | Dữ liệu có người duyệt và owner |
| A1 — Nền tảng hội thoại | API, state, menu/FAQ tools, tracing, chat | QA có nguồn, auth và lỗi được xử lý |
| A2 — Recommendation | Serving engine, candidates, validator, cards | Bộ case và đánh giá của quán đạt |
| A3 — Cart integration | Add combo, edit, version/revalidate | Không tạo order ngoài ý muốn; giỏ đúng |
| A4 — Order | Quote, confirmation, submit/status/reconcile | Transaction và quyền vượt release gates |
| A5 — Reservation | Summary, confirm, request/status | Phản ánh đúng pending và quyền truy cập |
| A6 — Personalization | Favorites/history/frequent/reorder | Đúng quyền, dữ liệu tối thiểu, quote mới |
| A7 — Feedback/tối ưu | Review feedback, serving tuning, retrieval/cost | Cải thiện qua eval, rollback được |

Pilot đầu tiên nên đi xuyên **A0–A3** trên nhóm món được xác nhận. Menu QA là nền móng, recommendation-to-cart là trải nghiệm cần kiểm chứng.

Các business APIs tương ứng phải ổn định trước A4/A5. Không dùng agent để che thiếu sót của checkout hoặc quy trình vận hành quán.

Ước lượng sơ bộ cho A0–A3: 6–8 tuần nếu menu/cart/API nền tảng đã ổn định, có nhóm đủ năng lực và quán phản hồi dữ liệu kịp thời. Đây không phải cam kết; cần khảo sát implementation và workload trước khi lập lịch chính thức.

## 27. Trách nhiệm và deliverables

| Vai trò | Trách nhiệm |
|---|---|
| Đại diện quán/bếp | Serving, allergens, đánh giá combo |
| Product/UX | Hội thoại, cards, clarification và funnel |
| Backend | Data, recommendation, contracts, permissions/transactions |
| AI engineering | Orchestration, prompts, retrieval, evaluation |
| Frontend | Chat, SSE, cards, cart và accessibility |
| QA/reviewer | Multi-turn, failure cases, integration và release gates |

Một người có thể đảm nhiệm nhiều vai trò; vẫn phải có owner rõ cho từng đầu ra.

Trước coding cần chốt:

1. PRD/phạm vi và tiêu chí nghiệm thu.
2. Kiến trúc và ranh giới tin cậy.
3. Conversation/state/confirmation flows.
4. Data dictionary và nguồn serving/allergens.
5. Tool contracts, DTO và error codes.
6. Recommendation/validator/ranking rules.
7. UI cards và empty/loading/error states.
8. Evaluation dataset có expected outcomes được quán duyệt.
9. Risk register, feature flags và incident runbook.
10. Backlog implementation map vào nền tảng hiện có.

## 28. Quyết định còn cần xác nhận trước triển khai thật

| Nội dung | Trong lúc chưa xác nhận |
|---|---|
| Menu, variants, giá và availability source | Chỉ dùng dữ liệu minh họa trong môi trường test |
| Serving và bối cảnh của món bán chạy | Không gắn nhãn restaurant-defined |
| Allergens và cross-contact | Unknown; không xác nhận an toàn |
| Ai duyệt và cập nhật knowledge | Chưa publish dữ liệu cho khách thật |
| Giới hạn budget và phí checkout | Phân biệt subtotal/total, không đoán phí |
| Quy trình đặt bàn và người trực | Pending đúng nghiệp vụ; không hứa giữ chỗ |
| Provider/model và data policy | Chọn sau đánh giá chất lượng, chi phí và privacy |
| Retention và deletion | Cần policy trước production |
| SLO, traffic/cost budget | Đo benchmark rồi chốt |
| Kế hoạch rollout | Nội bộ -> pilot giới hạn -> mở rộng theo gates |

## 29. Tiêu chí thành công của pilot

- Khách nêu nhu cầu tự nhiên và không phải trả lời một bảng khảo sát dài.
- Agent xử lý đúng các điểm mơ hồ quan trọng và ghi rõ assumptions.
- Combo dùng món đang được hệ thống cho bán, giá thật và serving có nguồn.
- Khẩu phần được đánh giá theo nhóm món; hard budget được tôn trọng.
- Không khẳng định an toàn dị ứng khi thiếu dữ liệu.
- Khách chỉnh được combo và thêm giỏ bằng hành động rõ ràng.
- Không có giao dịch ngoài ý muốn hoặc dữ liệu khách bị lộ.
- Nhân viên quán xác nhận các phương án hợp cách ăn thực tế.
- Có trace để giải thích lỗi, feedback để cải thiện và công tắc để dừng chức năng gặp sự cố.

**Ưu tiên thực thi:** làm chắc serving knowledge của một nhóm món thật, hoàn thành luồng nhu cầu -> recommendation -> validation -> cart, rồi mới mở rộng quyền giao dịch và cá nhân hóa.
