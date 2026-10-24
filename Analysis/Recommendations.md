# Phân tích chất lượng gợi ý món của agent Tiger345

> Phạm vi: cách agent chọn món và lập mâm sau khi đã đi đúng luồng menu. Đây là phân tích source và đề xuất tinh chỉnh, không phải báo cáo đã sửa hoặc đã nghiệm thu chatbot.
>
> Không sửa code/cấu hình/database, không chạy app, tests hoặc provider trong đợt phân tích tài liệu này. Vấn đề nhận diện yêu cầu và gọi tool đã được tách riêng tại [Toolcalling.md](Toolcalling.md).

## 1. Kết luận chính

Chất lượng gợi ý hiện phụ thuộc chủ yếu vào **dữ liệu hồ sơ món, heuristic retrieval và meal planner xác định**, không phải model tự đọc toàn bộ menu rồi tối ưu bữa ăn.

```text
Catalog + hồ sơ món
       + constraints khách / draft hiện tại
                  |
                  v
           Lọc và xếp hạng món
                  |
                  v
      Candidate pool giới hạn (recommend: 8)
                  |
                  v
       Planner lập tối đa 2 mâm
                  |
                  v
      Cards + pending suggestions
                  |
                  v
       Khách chấp nhận rõ ràng
                  |
                  v
      Draft + revalidation/handoff
```

Ba tầng phải được đánh giá độc lập:

1. **Retrieval:** món phù hợp có lọt vào tập ứng viên không?
2. **Planner:** tổ hợp, số lượng và tổng tiền có hợp lý không?
3. **Draft:** đề xuất được chấp nhận có còn hợp lệ theo giá/availability/constraints hiện hành không?

Một câu trả lời văn phong tốt không chứng minh ba tầng này chọn được bữa ăn tốt.

## 2. Nguồn dữ liệu: món bán được khác với món đủ metadata để tư vấn

### 2.1. Phân tách dữ liệu

- `menu_items`: dữ liệu thương mại như tên, giá, published/available, hình thức phục vụ, tags và nhãn signature/bestseller.
- `menu_item_ai_profiles`: serving unit/description, people range, meal role, vị, dietary tags, pairing và hồ sơ dị ứng.
- Menu Domain tải snapshot và cung cấp adapter cho retrieval/planner/safety.

Nguồn: `supabase/functions/_shared/concierge/menu/repository.ts:14`, `menu/types.ts:51`, `docs/architecture.md:133`.

Món chưa có profile vẫn có thể tồn tại trong menu snapshot; việc thiếu profile không đồng nghĩa món đã bị ngừng bán. Tuy nhiên nó hạn chế khả năng tính khẩu phần và tư vấn có căn cứ.

### 2.2. Readiness không đồng nghĩa allergy safety

Profile quality có các mức `EMPTY`, `PARTIAL`, `READY_FOR_RECOMMENDATION`, `KITCHEN_VERIFIED`.

**Đủ dữ liệu để gợi ý không đồng nghĩa bếp đã xác minh dị ứng.** Không dùng nhãn readiness hoặc bản nháp AI để suy an toàn.

Nguồn: `supabase/functions/_shared/concierge/menu/profile-quality.ts:16`.

### 2.3. Cache ảnh hưởng thời điểm thấy thay đổi

Menu snapshot cache TTL là **45 giây**, dùng chung trong phạm vi pool/isolate. Nếu refresh lỗi nhưng đã có snapshot cũ, code có thể phục vụ snapshot cũ; chưa có snapshot thì lỗi.

Nguồn: `supabase/functions/_shared/concierge/menu/domain.ts:21,35,52`.

Khi thử cập nhật profile, cần phân biệt cache chưa hội tụ với thuật toán không sử dụng metadata. Không suy từ thao tác save thành công rằng mọi isolate đã phục vụ dữ liệu mới tức thì. Đặc biệt, nên kiểm riêng quy tắc freshness cho metadata an toàn; tài liệu này chưa nghiệm thu stale-snapshot behavior trên runtime.

## 3. Candidate retrieval hiện hoạt động thế nào?

### 3.1. Hard filters trước ranking

`retrieveMenuCandidates()` kiểm các điều kiện như:

- Availability và giá có thể dùng để định giá.
- Dine-in/delivery.
- Category, signature nếu có yêu cầu.
- Mức cay.
- Ngân sách.
- Dislikes.
- Dị ứng và mức xác minh hồ sơ.

Nguồn: `supabase/functions/_shared/concierge/menu-retrieval.ts:98`.

Món chứa dị nguyên hoặc conflict bị loại; món thiếu xác minh không được tự biến thành verified-safe. Planner với allergy constraints còn yêu cầu ứng viên `verified_safe`.

Nguồn: `menu-retrieval.ts:159`, `meal-planner.ts:30`.

**Không nên nới allergy/ownership/availability để tăng số kết quả hoặc điểm benchmark.**

### 3.2. Ranking là lexical heuristic

Các trọng số nổi bật trong source:

| Tín hiệu | Điểm cộng |
|---|---:|
| Tên khớp chính xác | 150 |
| Tên khớp tiền tố | 100 |
| Tên chứa truy vấn | 60 |
| Khớp category | 30 |
| Khớp tags | 25 |
| Khớp mô tả | 15 |
| Token đủ dài khớp tên / tags | 20 / 10 |
| Không có query: điểm cơ sở | 50 |
| Signature | 20 |
| Verified-safe | 10 |

Sau điểm số, tie-break ưu tiên signature, giá thấp hơn và ID ổn định.

Nguồn: `supabase/functions/_shared/concierge/menu-retrieval.ts:200`.

Điều này đem lại tính giải thích và ổn định, nhưng không tương đương semantic search hoặc đánh giá độ ngon. Sở thích diễn đạt bằng từ khác, mục đích ăn nhẹ/no, cân bằng bữa và pairing chưa tự động trở thành điểm xếp hạng chỉ vì có dữ liệu trong profile.

### 3.3. Candidate pool là nút thắt

Runner lấy:

- Search: tối đa **4** candidates.
- Recommendation: tối đa **8**, có diversify category.

Nguồn: `supabase/functions/_shared/concierge/orchestration/tool-runner.ts:144`.

Planner không thể cân nhắc món đã bị loại khỏi pool. Vì thế nên đo **candidate recall** riêng trước khi đổi cách lập mâm. Tăng pool có thể tăng độ phủ nhưng kéo theo chi phí tính toán/serialization và cần kiểm budget.

### 3.4. Signature, nổi bật và bán chạy

- `is_signature` có filter và cộng điểm trong retrieval.
- Runner hiện chưa ánh xạ yêu cầu đặc sản thành filter này: xem [Toolcalling.md](Toolcalling.md).
- Domain đọc `is_bestseller`, nhưng không thấy nhãn này tham gia score retrieval trong đoạn đã khảo sát.

Không được kết luận “agent đang ưu tiên bán chạy” chỉ vì menu có cột `is_bestseller`. “Đặc sản”, “bán chạy”, “mới” và “nổi bật” cần ngữ nghĩa sản phẩm riêng.

## 4. Meal planner: có lập mâm, nhưng chưa phải bộ tối ưu tổ hợp đầy đủ

### 4.1. Giới hạn output

Một plan có **2–3 dòng**, quantity nguyên **1–99**, subtotal, `PASS` hoặc `WARNING`, tối đa 3 warnings. Một kết quả có tối đa **2 plans**.

Nguồn: `supabase/functions/_shared/concierge/meal-planner.ts:6`.

`PASS` ở đây là trạng thái validation theo logic hiện tại, không phải chứng nhận dinh dưỡng, đủ no cho mọi người hoặc allergy-safe cho mọi hoàn cảnh.

### 4.2. Nhánh có serving profile

Món đủ điều kiện khi serving profile có confidence `restaurant_defined`, `people_max > 0`, không thuộc drink/alcohol/dessert. Với allergy constraints, item phải `verified_safe`.

Số người quy đổi:

```text
(adults × adult_factor + children × child_factor)
× appetite_factor
```

Defaults trong knowledge config: adult **1.0**, child **0.6**; appetite light **0.85**, normal **1.0**, heavy **1.2**.

Quantity mỗi món:

```text
ceil(diners / serving.people_max), giới hạn 1–99
```

Nguồn: `meal-planner.ts:25`, `knowledge.ts:14`.

Planner thử hai thứ tự: danh sách hiện tại và đảo ngược. Nó chọn primary từ main protein/hotpot/set, sau đó đi qua candidates, tối đa một món mỗi meal role, dừng ở ba dòng.

**Đây là greedy selection theo thứ tự, không phải duyệt/chấm mọi tổ hợp.** Một tổ hợp tốt hơn có thể không được xét. Hai phương án cũng không tự bảo đảm đa dạng theo giá, vị hoặc loại đạm.

### 4.3. Khẩu phần và độ cân bằng

Quantity hiện dựa trên `people_max` của từng món, không thấy tính đóng góp năng lượng/dinh dưỡng tổng bữa hoặc kết hợp nhiều món để tối ưu mức đủ no.

Config có `ideal_macro_ratios` và budget tolerances, nhưng không thấy `buildMealPlans()` dùng các giá trị đó để chấm tổ hợp. **Có field cấu hình không chứng minh field đang tác động thuật toán.**

Nguồn: `knowledge.ts:23`, toàn bộ `meal-planner.ts:25–89`.

Nếu muốn dùng macro scores, phải xác định rõ đây là heuristic cân bằng vai trò món hay dữ liệu dinh dưỡng được xác minh; không được quảng bá heuristic thành tư vấn y khoa/dinh dưỡng chính xác.

### 4.4. Ngân sách cứng và mềm chưa có hành vi như tên gọi dễ gợi ý

Trong nhánh thêm món, nếu `budget_vnd` tồn tại thì planner bỏ món làm:

```text
existing draft subtotal + plan subtotal + item cost > budget
```

Điều kiện này áp dụng dù `is_hard_budget` là false. Vì vậy không nên giả định ngân sách mềm mặc định cho vượt **5%** chỉ vì config có tolerance như vậy.

Source có cảnh báo vượt ngân sách mềm sau khi lập plan, nhưng nhánh dựng plan đã chặn vượt ngân sách trước đó. Đây là điểm cần quyết định chính sách và kiểm thử, không nên chỉ đổi một câu cảnh báo.

Nguồn: `meal-planner.ts:49,60,81`.

Subtotal món không bao gồm tự động phí giao và mọi khoản checkout. Không dùng số tiền plan để hứa tổng thanh toán cuối cùng.

### 4.5. Fallback khi thiếu profile

Nếu không có plan từ serving profiles:

- Suy role từ tên category đã normalize.
- Chọn primary và tối đa một món mỗi role.
- Quantity **1** mỗi món.
- Ít nhất hai dòng mới có plan.
- Luôn cảnh báo khẩu phần chưa được nhà hàng xác nhận.

Nguồn: `meal-planner.ts:15,67`.

Fallback giúp menu chưa hoàn thiện profile vẫn có gợi ý, nhưng không được nói “đủ cho cả nhóm” dựa trên fallback. Chất lượng còn phụ thuộc cách đặt tên category.

## 5. Cards và chấp nhận đề xuất

Food handler tạo plan IDs/suggestion IDs, ghi pending items gắn state version. Có meal plan thì hiển thị plan cards; không có plan thì tối đa bốn candidate cards.

Nguồn: `supabase/functions/_shared/concierge/orchestration/handlers/food-handler.ts:67`.

Khi khách chấp nhận:

- Kiểm IDs khớp mâm và state version.
- Thực hiện draft operations xác định.
- Chặn vượt hard budget.
- Review/handoff revalidate theo catalog và safety.
- Chuyển sang giỏ không đồng nghĩa submit order.

Nguồn: `orchestration/handlers/draft-handler.ts:26,49,80`.

Nên giữ phân tách **gợi ý → chấp nhận → draft → review/handoff**, không dùng một model reply để coi là khách đã đặt món.

## 6. Những gì có thể cải thiện qua curation và những gì cần sửa thuật toán

| Nhóm | Điểm tinh chỉnh | Lưu ý |
|---|---|---|
| Dữ liệu menu | Availability, service mode, category/tags, signature/bestseller | Chỉ phản ánh merchandising/kinh doanh đúng thực tế |
| Serving profile | Unit, people range, role, serving description | Cần căn cứ nhà hàng, không tự suy từ tên |
| Taste/pairing | Taste tags, richness/spice, pairing IDs | Có metadata chưa chắc đã có consumer trong scoring |
| Allergy | Nguồn, bếp xác minh, notes/reviewer | Tách khỏi AI draft và readiness |
| Retrieval | Lexical weights, synonyms, pool, diversification | Đo recall/precision trước và sau |
| Planner | Quantity, bounded combinations, diversity, budget policy | Giữ giá authoritative và safety hard filters |

Menu Intelligence thể hiện coverage/quality; draft review tách serving/taste khỏi xác minh dị ứng. Không coi nội dung AI draft chưa chấp nhận là runtime truth.

Nguồn: `src/features/admin/menu-intelligence/MenuIntelligencePage.tsx:66`, `components/DraftReview.tsx:69`, `supabase/functions/_shared/concierge/menu/profile-repository.ts:139`.

Các trọng số retrieval/planner chủ yếu là code. Chưa thấy một control panel đầy đủ cho mọi trọng số trong phạm vi khảo sát; không hứa có thể tune toàn bộ bằng Admin hiện tại.

## 7. Thứ tự tinh chỉnh đề xuất

1. **Định nghĩa “gợi ý tốt”:** phù hợp nhu cầu, đủ khẩu phần, cân bằng role, trong ngân sách, đa dạng và dễ chấp nhận. Không chỉ đo văn phong.
2. **Đo coverage profile:** ưu tiên serving/role/taste có nguồn; giữ allergy verification độc lập.
3. **Chốt soft/hard budget:** semantics nhất quán từ retrieval đến planner/draft.
4. **Đánh giá recall và ranking:** label truy vấn thực tế, tách signature/bestseller, kiểm bias giá rẻ và category.
5. **Cải thiện bounded combination search:** nếu greedy thật sự kém trên bộ đánh giá, thử số tổ hợp hữu hạn và score có thể giải thích.
6. **Cá nhân hóa có kiểm soát:** chỉ dùng dữ liệu consent/constraints hợp lệ; không nới safety để đạt sở thích.

Đây là các đề xuất, chưa triển khai. Không mặc định nâng model sẽ thay thế được các bước trên.

## 8. Kiểm thử hiện có và ma trận cần đo

Đã tìm thấy các suite:

- `tests/server/concierge-menu-retrieval-contract.test.ts`.
- `tests/server/concierge-meal-planner.test.ts`.
- `tests/server/concierge-menu-domain.test.ts` và `concierge-menu-governance.test.ts`.
- `tests/server/concierge-agent-quality.test.ts`.
- `tests/integration/concierge-menu-retrieval.test.ts`.

Tên test/fixture chỉ chứng minh có mã kiểm thử, không phải test đã chạy hoặc đã bao phủ chất lượng production. Test planner đọc được có case fallback với nhóm/ngân sách; cần kiểm thêm coverage nhánh profile xác nhận, không kết luận không có coverage ở mọi suite khác.

| Nhóm | Tình huống cần kiểm |
|---|---|
| Query/ranking | Có/không dấu, synonyms, category, signature/bestseller, tie-break, truy vấn rộng/hẹp |
| Safety | Nhiều allergens, unknown/contains/conflict, profile thiếu/stale; không quay lại qua fallback |
| Portions | Adults/children, appetite, serving min/max, role trùng, nhóm lớn, chưa xác nhận số người |
| Budget | Draft hiện hữu, đúng ngưỡng/vượt một đồng, soft/hard, phí giao riêng, giá đổi |
| Plan quality | Pool ít món, 0/1 ứng viên, 2–3 dòng, diversity hai phương án, greedy bỏ lỡ tổ hợp |
| Acceptance | IDs/version cũ, giá/availability đổi, không tự tạo order |
| Curation | Coverage/audit/cache, draft AI chưa apply, allergy cần xác minh riêng |

Ngoài deterministic/injected tests, cần đánh giá người thật trên bộ yêu cầu có tiêu chí rõ để kết luận món được gợi ý có hợp bữa không. Benchmark model/fixture không thay nghiệm thu đầy đủ trên website.

Khi có sửa code, chạy toàn bộ checks trong `CLAUDE.md`; DB/browser integration cần môi trường đúng theo `AGENTS.md`. Provider thật cần chấp thuận riêng.

## 9. Trạng thái và ranh giới

- Chỉ phân tích source; chưa sửa thuật toán hoặc dữ liệu.
- Chưa đo coverage của database đang phục vụ trong đợt này.
- Không chạy tests/build hoặc provider để tạo tài liệu.
- Không khẳng định các tổ hợp gợi ý đã được nhà hàng nghiệm thu.
- **Runtime chatbot: CHƯA KIỂM ĐỊNH.**

Phần liên quan: [Toolcalling.md](Toolcalling.md), [Conversation.md](Conversation.md), [Memory.md](Memory.md).
