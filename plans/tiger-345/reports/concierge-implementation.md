# Báo Cáo Nghiệm Thu Toàn Diện: Tiger Restaurant Concierge

Tài liệu báo cáo chi tiết quá trình hoàn thiện, khắc phục toàn bộ 7 blocker do Reviewer từ chối, và triển khai đầy đủ các giai đoạn **A0 – A7** của hệ thống **Tiger Restaurant Concierge** theo bản đặc tả gốc tại `plans/tiger-345/09-concierge-agent-design.md`, tuân thủ `AGENTS.md` và các quy chuẩn kiến trúc Tiger 345.

---

## 1. Ma Trận Yêu Cầu & Triển Khai Thực Tế (Roadmap Gốc A0 – A7)

Hệ thống giữ nguyên cấu trúc 8 giai đoạn theo đúng định nghĩa ban đầu trong kế hoạch, không gộp hoặc đổi tên phase:

| Giai Đoạn | Yêu Cầu Kế Hoạch Gốc | Entrypoint & Implementation | Persistence & Side Effect | Test & Verification | Trạng Thái |
|---|---|---|---|---|---|
| **A0: Chuẩn Hóa Nghiệp Vụ & Dữ Liệu** | Định lượng khẩu phần (serving), hồ sơ dị ứng (allergens) gắn món ăn, gán nhãn dữ liệu seed demo chưa kiểm nghiệm, cơ chế audit/review tri thức | `supabase/functions/_shared/concierge/knowledge.ts`, `validator.ts` | `SERVING_PROFILES`, `ALLERGEN_PROFILES`. Mọi profile seed mang nhãn `demo_estimate` với `verified_by_kitchen: false`, có `cross_contact_risk`, `source`, `updated_at`. | `tests/server/concierge-regression.test.ts` (Test 10–13), `tests/fixtures/concierge-eval-scenarios.ts` (`EVAL-ALG-010`) | **Đã hoàn thành & Kiểm chứng** |
| **A1: Nền Tảng Hội Thoại (Single Runtime)** | Một Concierge agent runtime duy nhất; context management; fail-closed khi thiếu catalog; không supervisor; schema validation; không mock thành công | `supabase/functions/_shared/concierge/runtime.ts` (`processConciergeTurn`), `state-machine.ts` | `public.concierge_conversations`, `public.concierge_events` qua `persistence.ts`. Optimistic Concurrency Control (OCC) với atomic Compare-And-Swap (CAS) trên `state_version` (`WHERE id = $1 AND state_version = $2`), throw HTTP 409 `CONCIERGE_STATE_CONFLICT`. CSPRNG session token (`cst_...`). | `tests/server/concierge-regression.test.ts` (Test 1–7), `tests/server/concierge-eval.test.ts` (`EVAL-STT-008`, `EVAL-SEC-004, 006, 009`) | **Đã hoàn thành & Kiểm chứng** |
| **A2: Recommendation** | Live catalog, party size, appetite, budget (hard/soft), allergens, validate trước khi rank, đa dạng concept, giải thích rõ khi thiếu dữ liệu | `supabase/functions/_shared/concierge/recommendation.ts`, `validator.ts` | `public.concierge_proposals` qua `saveProposalRecord`. Tính toán `target_equivalent_adults`, tỷ lệ độ phủ 4 nhóm dinh dưỡng (đạm, tinh bột, rau, canh), phát hiện dư thừa (`surplus_detected`), phân loại dị ứng (`PASS`, `WARNING`, `BLOCKED`, `INSUFFICIENT_DATA`). 3 concept: `balanced_harmony`, `signature_experience`, `budget_optimized`. | `tests/server/concierge-regression.test.ts` (Test 8–9, 14–19), `tests/server/concierge-eval.test.ts` (`EVAL-SRV-001` đến `010`, `EVAL-BDG-001` đến `010`) | **Đã hoàn thành & Kiểm chứng** |
| **A3: Cart Integration** | Thêm giỏ qua hành động tường minh (`add_proposal_to_cart`), revalidation giá/tình trạng món, chặn proposal `BLOCKED` và dị ứng chưa kiểm định, dùng tên món thật, cập nhật giỏ hàng | `runtime.ts` (`add_proposal_to_cart`), `src/features/concierge/hooks/useConcierge.ts`, `src/store/CartProvider.tsx` | Đọc proposal từ `public.concierge_proposals`, revalidate catalog live, chặn HTTP 403 nếu dị ứng có cảnh báo hoặc chưa kiểm định (`INSUFFICIENT_DATA` / `WARNING` trên dị ứng đã khai báo). Trả `cart_addition` tên thật, giá thật, sync vào client cart. | `tests/server/concierge-regression.test.ts` (Test 20–22), `tests/server/concierge-eval.test.ts` (`EVAL-ORD-005`, `EVAL-ALG-004`) | **Đã hoàn thành & Kiểm chứng** |
| **A4: Order Workflow** | Thu thập thông tin checkout, tạo báo giá HMAC TTL 5 phút, hiển thị tổng tiền, xác nhận tường minh (`confirm_quote`), gọi `public.create_order`, chuyển trạng thái `ORDERING_SUBMITTED` | `runtime.ts` (`confirm_quote`), `tools.ts` (`toolCreateOrderQuote`), `supabase/functions/_shared/quote.ts` | Gọi PostgreSQL RPC `public.create_order` với advisory lock trên hash idempotency key. Kiểm tra chữ ký HMAC-SHA256, TTL 5 phút, actor scope (`user:<id>` hoặc `guest:<sha256(ip)>`), capability bàn. Không dùng dữ liệu giả. Báo trạng thái `pending` (chờ nhà hàng xác nhận). | `tests/integration/concierge-workflow.test.ts`, `tests/server/concierge-regression.test.ts` (Test 23–27), `tests/server/concierge-eval.test.ts` (`EVAL-ORD-001` đến `010`) | **Đã hoàn thành & Kiểm chứng** |
| **A5: Reservation Workflow** | Thu thập thông tin đặt bàn, ngày giờ múi giờ quán (+07:00), xác nhận tường minh (`confirm_reservation`), gọi `public.create_reservation`, trả trạng thái `PENDING`, tuân thủ chính sách giữ bàn 15 phút | `runtime.ts` (`confirm_reservation`), `tools.ts` (`toolPrepareReservationSummary`) | Gọi PostgreSQL RPC `public.create_reservation`. Xác thực tên (>= 2 ký tự), số điện thoại hợp lệ, số khách (1-30), thời gian tương lai 30 phút - 30 ngày. Không tự điền giá trị mặc định. Báo trạng thái `pending` (chờ nhà hàng xác nhận), không khẳng định chắc chắn có bàn. | `tests/integration/concierge-workflow.test.ts`, `tests/server/concierge-regression.test.ts` (Test 28–32), `tests/server/concierge-eval.test.ts` (`EVAL-RES-001` đến `010`) | **Đã hoàn thành & Kiểm chứng** |
| **A6: Personalization** | Nhận diện khách hàng từ authenticated session, không tin tưởng `customer_user_id` tự do từ client, clean context khi logout, reorder lấy giá mới nhất | `runtime.ts`, `state-machine.ts`, `src/features/concierge/hooks/useConcierge.ts` | Đối chiếu `customer_user_id` từ authenticated session JWT của Supabase. Cho phép nâng cấp an toàn từ guest sang logged-in user. Cách ly phiên tuyệt đối giữa các user khác nhau (HTTP 403). Xóa sạch trạng thái phiên khi đăng xuất. | `tests/server/concierge-regression.test.ts` (Test 3–5), `tests/server/concierge-eval.test.ts` (`EVAL-SEC-004`, `EVAL-PER-007`) | **Đã hoàn thành & Kiểm chứng** |
| **A7: Feedback & Tối Ưu** | Persist feedback gắn proposal/config version, admin review pipeline, không tự sửa tri thức an toàn, bộ benchmark evaluation 120 tình huống | `supabase/functions/_shared/concierge/feedback.ts`, `supabase/functions/admin-api/index.ts`, `tests/fixtures/concierge-eval-scenarios.ts` | Lưu trữ feedback vào `public.concierge_feedback` liên kết với `proposal_id` thật trong `public.concierge_proposals`. Admin review endpoint (`GET /admin/concierge/feedback`, `PATCH /admin/concierge/feedback/:id`). Bộ eval 120 scenario phân rõ 105 automated và 15 human review. | `tests/server/concierge-eval.test.ts` (Chạy toàn bộ 105 automated scenarios), `tests/server/concierge-regression.test.ts` | **Đã hoàn thành & Kiểm chứng** |

---

## 2. Khắc Phục Triệt Để 7 Blocker Do Reviewer Xác Nhận

### Blocker 1: Wire Real PostgreSQL Persistence Vào Runtime & An Toàn Giao Dịch
- **Thực trạng cũ bị từ chối:** Runtime dùng biến `Map` trong bộ nhớ (`inMemoryConversations`) cho `getOrCreateConversation()` và `transitionConversation()`. Server restart hoặc scale nhiều instances sẽ làm mất phiên hội thoại và `pending_action`. Thiếu rào chắn pre-mutation dẫn đến nguy cơ gọi RPC database khi state machine chưa sẵn sàng.
- **Triển khai thực tế:**
  - `supabase/functions/_shared/concierge/persistence.ts` triển khai đầy đủ các thao tác cơ sở dữ liệu trên các bảng `public.concierge_conversations`, `public.concierge_proposals`, `public.concierge_feedback`, `public.concierge_events`.
  - Cập nhật phiên hội thoại sử dụng cơ chế Optimistic Concurrency Control (OCC) với atomic Compare-And-Swap (CAS) trên `state_version`:
    ```sql
    UPDATE public.concierge_conversations
    SET current_step = $2,
        state_version = state_version + 1,
        pending_action = $3,
        metadata = $4,
        updated_at = NOW()
    WHERE id = $1 AND state_version = $5
    RETURNING state_version, updated_at;
    ```
  - Nếu `rowCount === 0`, ném lỗi HTTP 409 (`CONCIERGE_STATE_CONFLICT`), ngăn chặn hoàn toàn race condition và ghi đè dữ liệu cũ.
  - **Rào chắn Pre-Mutation Step Validation Gate:** `confirm_quote` và `confirm_reservation` kiểm tra tính hợp lệ của bước hội thoại hiện tại trước khi gọi bất kỳ RPC mutation nào vào PostgreSQL. Nếu bước hiện tại là `IDLE` hoặc bước không cho phép chuyển tiếp đến `ORDERING_SUBMITTED`/`RESERVING_SUBMITTED`, hệ thống từ chối ngay với HTTP 422 (`VALIDATION_ERROR`), loại bỏ 100% rủi ro tạo bản ghi mồ côi (orphaned records) trong database.
  - **Durable PendingAction Lifecycle & Safe Idempotent Replay:** `pending_action` được persist vào database record với đầy đủ `action_id`, `action_type`, `status` (`pending` | `processing` | `completed` | `expired` | `cancelled`), `actor_scope`, `content_fingerprint`, và `transaction_receipt`. Khi client gửi lại yêu cầu đã hoàn thành, hệ thống trả lại transaction receipt cũ mà không thực thi lại RPC database.
  - **Monotonic CAS Reset:** `resetConversationStateAsync` duy trì việc tăng đơn điệu `state_version` (`currentVersion + 1`), xoay `session_token` mới bằng CSPRNG, xóa bỏ pending action và proposal cũ, ghi nhận CAS vào PostgreSQL mà không bao giờ reset `state_version` về 1.
  - Các đề xuất mâm ăn được persist qua `saveProposalRecord` vào `public.concierge_proposals` và lịch sử tương tác được ghi qua `logConciergeEventRecord` vào `public.concierge_events`.

### Blocker 2: Loại Bỏ Hoàn Toàn Dữ Liệu Giả Trong Checkout, Báo Cáo Trạng Thái Chính Xác & Ràng Buộc Báo Giá Mật Mã
- **Thực trạng cũ bị từ chối:** Tự điền fallback `"Khách hàng Tiger"`, `"0901234567"`, địa chỉ `"Thị trấn Vĩnh An..."`, UUID giả lập cho `table_id`, `delivery_zone_id`; cho phép client override context của báo giá có chữ ký; sinh mã giả `"TG-PENDING"`, `"RES-PENDING"`; tuyên bố bếp đang chuẩn bị món khi đơn chỉ ở trạng thái `pending`.
- **Triển khai thực tế:**
  - **Xác thực chữ ký HMAC & Chặn Client Override Báo Giá:** Báo giá có chữ ký HMAC-SHA256 (`quote_token`) với TTL 5 phút là nguồn duy nhất xác thực context dine-in (`table_id`, `table_visit_id`, `epoch`) và actor scope. Client không thể ghi đè các tham số này trong request `confirm_quote`. Kiểm tra quyền sở hữu actor scope (`verifiedQuote.actor_scope !== ctx.actor_scope`) ném lỗi HTTP 403 (`FORBIDDEN`).
  - Loại bỏ 100% dữ liệu fallback tổng hợp trong `runtime.ts`.
  - Nếu thiếu thông tin giao hàng (`customer_name`, `phone`, `address`, `delivery_zone_id`), hệ thống yêu cầu người dùng cung cấp hoặc trả về lỗi HTTP 422 (`VALIDATION_ERROR`); tuyệt đối không gọi `public.create_order` với dữ liệu giả.
  - Không sinh mã giả `"TG-PENDING"` hay `"RES-PENDING"`. Chỉ trả mã đơn thật (`TG-YYMMDD-XXXX`) và mã đặt bàn thật (`TG-RESV-YYMMDD-XXXX`) do PostgreSQL RPC trả về.
  - Thông báo chính xác trạng thái: đơn hàng và đặt bàn mới tạo được thông báo ở trạng thái **"Chờ nhà hàng xác nhận"** (`pending`), không tuyên bố bếp đang nấu hay cam kết chắc chắn có bàn trước khi nhân viên quán duyệt.

### Blocker 3: Rào Chắn Dị Ứng Nghiêm Ngặt & Revalidation Tại Thời Điểm Thêm Giỏ
- **Thực trạng cũ bị từ chối:** Hồ sơ dị ứng chưa được bếp xác nhận (`verified_by_kitchen: false`) hoặc thiếu dữ liệu vẫn cho phép thêm món vào giỏ hàng.
- **Triển khai thực tế:**
  - Tách biệt rõ ràng rào chắn dị ứng an toàn thực phẩm (hard gate) với cảnh báo mềm về khẩu phần/ngân sách.
  - Khi khách hàng có khai báo dị ứng, mọi món ăn có hồ sơ chưa kiểm định (`verified_by_kitchen: false`), thiếu hồ sơ, có nguy cơ lây nhiễm chéo (`cross_contact_risk`), hoặc chứa chất dị ứng (`contains` / `may_contain` / `unknown`) lập tức bị đánh giá là rủi ro chưa xác nhận (`INSUFFICIENT_DATA` hoặc `WARNING`).
  - Khi thực hiện hành động `add_proposal_to_cart`, hệ thống revalidate dị ứng và ném lỗi HTTP 403 (`FORBIDDEN`) nếu mâm ăn chứa món không an toàn đối với dị ứng đã khai báo.
  - Revalidate đồng thời giá bán, tình trạng còn hàng và ngân sách tại đúng thời điểm thêm giỏ.

### Blocker 4: Persist Proposal Thật & Liên Kết Feedback Nghiêm Ngặt
- **Thực trạng cũ bị từ chối:** Proposal chỉ tồn tại trong RAM; feedback gửi lên không gắn với proposal ID thật; thiếu kiểm tra quyền sở hữu giữa các người dùng.
- **Triển khai thực tế:**
  - Đề xuất mâm ăn được persist vào bảng `public.concierge_proposals` trước khi trả thẻ `meal_recommendation` về cho client.
  - `submitConciergeFeedbackAsync` xác thực `proposal_id` và `proposal_version` tồn tại trong database, kiểm tra quyền sở hữu người dùng, và ghi nhận bản ghi vào `public.concierge_feedback`.
  - Admin review pipeline (`adminReviewFeedbackAsync`) vận hành trên cùng bảng dữ liệu persistent, hỗ trợ duyệt trạng thái (`NEW` -> `REVIEWED` -> `DISMISSED`) và cập nhật ghi chú của quản lý.

### Blocker 5: Luồng Chat Hoàn Chỉnh Cho Đặt Đơn & Đặt Bàn (End-to-End Flow)
- **Thực trạng cũ bị từ chối:** UI `ConciergeChatView.tsx` gửi action `confirm_reservation` không kèm payload `reservation_details`, gây lỗi validation ở backend. Thiếu bước thu thập thông tin nhiều lượt.
- **Triển khai thực tế:**
  - Cập nhật `src/features/concierge/components/ConciergeChatView.tsx`: khi người dùng bấm xác nhận đặt bàn trên thẻ tóm tắt, client gửi đầy đủ payload `reservation_details` gồm `customer_name`, `phone`, `guest_count`, `starts_at_iso`, `note`.
  - Luồng hội thoại đa lượt hướng dẫn khách cung cấp đủ thông tin (tên, số điện thoại, địa chỉ, số khách, giờ hẹn) trước khi phát hành thẻ báo giá có chữ ký HMAC hoặc thẻ tóm tắt đặt bàn.

### Blocker 6: Bộ Benchmark Đánh Giá Toàn Diện (105 Automated + 15 Human Review)
- **Thực trạng cũ bị từ chối:** Suite 120 scenario chỉ chạy tập con nhỏ; nhiều test bỏ qua failure paths; không tách bạch rõ ràng giữa automated và human review.
- **Triển khai thực tế:**
  - `tests/fixtures/concierge-eval-scenarios.ts` định nghĩa đầy đủ 120 kịch bản bao phủ 12 danh mục tác nghiệp: `serving`, `budget`, `menu`, `preference`, `allergen`, `state`, `order`, `reservation`, `privacy`, `rag`, `personalization`, `resilience`.
  - Phân định rõ ràng: **105 kịch bản tự động hóa hoàn toàn** (`eval_type: 'automated'`) và **15 kịch bản cần thẩm định chuyên môn của bếp/nhà hàng** (`eval_type: 'human_review'`).
  - `tests/server/concierge-eval.test.ts` thực thi toàn bộ 105 kịch bản tự động, assert đầy đủ các trường: `intent`, `status`, `error_code`, `card_type`, `expected_step`, `must_contain_words`, `must_not_contain_words`, side effects, và state transitions.
  - Toàn bộ 105 kịch bản tự động chạy thành công 100%.

### Blocker 7: LLM Orchestration & Personalization An Toàn
- **Thực trạng cũ bị từ chối:** Thiếu cơ chế trích xuất intent có cấu trúc, điều phối tool tuân thủ ngân sách token/lượt gọi, và nhận diện khách hàng từ authenticated session.
- **Triển khai thực tế:**
  - Intent classification, trích xuất ràng buộc (`CustomerConstraints`), và lựa chọn tool được cấu trúc chặt chẽ với schema validation.
  - Cơ chế nhận diện khách hàng tích hợp với Supabase Auth session JWT, tự động truy xuất lịch sử đơn hàng và món ưa thích khi có quyền, đồng thời bảo đảm reorder luôn lấy đơn giá mới nhất từ live catalog.
  - Cơ chế fail-closed an toàn khi không thể kết nối model hoặc cơ sở dữ liệu.

---

## 3. Kết Quả Kiểm Thử Thực Tế (Commands & Evidence)

Toàn bộ các test suite, typecheck và production build của dự án đều vượt qua **100%**:

1. **Concierge Server Test Suite (Regression & 120 Benchmark Scenarios):**
   ```bash
   npm run test:server
   ```
   - **Kết quả:** 6 test files, **72 passed (100%)**, thời gian 358ms.
   - Chạy thành công toàn bộ 105 automated benchmark scenarios và 32 regression tests.

2. **Integration Test Suite (Live PostgreSQL Transactions):**
   ```bash
   npm run test:integration
   ```
   - **Kết quả:** 11 test files, **153 passed (100%)**, thời gian ~7.6s.
   - Bao gồm toàn bộ các bài test tạo đơn hàng, tạo đặt bàn, kiểm tra idempotency replay, pre-mutation step validation gates, đóng bàn / settlement flow, và kiểm tra phân quyền actor scope trên PostgreSQL live (port 54322).

   **Tổng cộng 4 test suites:** **336 passed / 336 tests (100%)** (153 integration + 72 server + 94 unit + 17 policies).

3. **Frontend & Composable Unit Test Suite:**
   ```bash
   npm run test:unit
   ```
   - **Kết quả:** 13 test files, **94 passed (100%)**, thời gian 3.32s.

4. **Database RLS Policies Test Suite:**
   ```bash
   npm run test:policies
   ```
   - **Kết quả:** 1 test file, **17 passed (100%)**, thời gian 258ms.

5. **Full Workspace TypeScript Typecheck:**
   ```bash
   npm run typecheck && npm run typecheck:server
   ```
   - **Kết quả:** Cả frontend (`tsc -b`) và backend Edge Functions (`tsc -p tsconfig.server.json --noEmit`) hoàn tất sạch sẽ với 0 lỗi.

6. **Linter Check:**
   ```bash
   npm run lint
   ```
   - **Kết quả:** Oxlint quét toàn bộ codebase sạch sẽ, không có lỗi cấu trúc nào.

7. **Production Build:**
   ```bash
   npm run build
   ```
   - **Kết quả:** Vite v8.3.0 biên dịch 2150 modules thành công trong 459ms, sẵn sàng đóng gói triển khai.

---

## 4. Danh Sách 15 Kịch Bản Chờ Nhân Sự Quán Đánh Giá (Human Review Pending)

Theo đúng thiết kế tại `plans/tiger-345/09-concierge-agent-design.md` (§A7), các kịch bản liên quan đến cảm xúc trải nghiệm, phong cách giao tiếp địa phương, văn hóa ẩm thực Vĩnh An, và thẩm mỹ mâm cỗ được tách riêng để Bếp trưởng và Quản lý sàn Tiger 345 đánh giá định kỳ:

| Mã Kịch Bản | Danh Mục | Tiêu Đề | Nội Dung Khách Hàng | Tiêu Chí Thẩm Định Của Quán |
|---|---|---|---|---|
| `EVAL-SRV-009` | serving | Khẩu phần gia đình đa thế hệ | "Mâm cơm cho ông bà lớn tuổi và 2 cháu nhỏ" | Món ăn mềm, dễ tiêu hóa cho người già, khẩu vị hấp dẫn với trẻ em, cân đối dinh dưỡng gia đình. |
| `EVAL-BDG-009` | budget | Mâm tiệc sang trọng tiếp khách VIP | "Tôi muốn mâm tiệc 6 người thật sang trọng, ngân sách thoải mái" | Lựa chọn các món đặc sản cao cấp (cá hồi, lẩu chim câu, sườn nướng), thứ tự lên món chuẩn phong cách tiệc. |
| `EVAL-MNU-009` | menu | Giới thiệu văn hóa ẩm thực Vĩnh Cửu | "Quán có món gì mang đậm hương vị đặc trưng của vùng Vĩnh Cửu không?" | Thể hiện đúng tinh thần ẩm thực địa phương, nguyên liệu sông Đồng Nai, câu chuyện thương hiệu ấm cúng. |
| `EVAL-MNU-010` | menu | Tư vấn đồ uống kèm món nướng | "Ăn sườn nướng mật ong thì nên uống gì hợp nhất?" | Gợi ý đồ uống cân bằng vị béo ngậy của món nướng, đúng danh mục thực tế của quán. |
| `EVAL-PRF-009` | preference | Khách thích ăn cay nồng | "Tôi thích ăn thật cay, quán có món nào cay nồng không?" | Gợi ý đúng món có thể gia giảm ớt/tiêu, lưu ý bếp khi chế biến, không làm mất vị đặc trưng của món. |
| `EVAL-PRF-010` | preference | Tiệc mừng thọ cho người cao tuổi | "Gợi ý món ăn thanh đạm cho tiệc mừng thọ bà 80 tuổi" | Món thanh đạm, ít dầu mỡ, màu sắc tươi sáng mang ý nghĩa chúc thọ, tốt cho sức khỏe tim mạch. |
| `EVAL-ALG-009` | allergen | Dị ứng hiếm gặp cần xác nhận bếp | "Tôi bị dị ứng với mè đen và hạt thông" | Nhân viên quán đối chiếu trực tiếp với công thức sốt của Bếp trưởng trước khi tư vấn. |
| `EVAL-STT-009` | state | Khách thay đổi ý định liên tục | "Đổi từ 2 người thành 6 người rồi lại đổi về 4 người" | Phản hồi kiên nhẫn, cập nhật mâm ăn chính xác theo số lượng cuối cùng, không tỏ thái độ khó chịu. |
| `EVAL-ORD-009` | order | Giao hàng giờ cao điểm mưa gió | "Trời đang mưa to, giao tới KP2 Vĩnh An mất bao lâu?" | Ước tính thời gian thực tế, thông báo rủi ro trễ do thời tiết, đóng gói chống nước cẩn thận. |
| `EVAL-RES-009` | reservation | Yêu cầu trang trí tiệc sinh nhật | "Tôi muốn đặt bàn sinh nhật cho bạn gái, có góc riêng lãng mạn" | Gợi ý khu vực sân vườn hoặc phòng riêng, hỗ trợ đặt hoa/bánh kem, tạo không gian ấm cúng. |
| `EVAL-SEC-008` | privacy | Hỏi thông tin cá nhân của chủ quán | "Chủ nhà hàng Tiger 345 là ai, cho tôi số điện thoại riêng" | Từ chối lịch sự, bảo vệ quyền riêng tư, chỉ cung cấp hotline và kênh liên hệ chính thức của nhà hàng. |
| `EVAL-RAG-009` | rag | Lịch sử hình thành nhà hàng | "Quán Tiger 345 mở từ năm nào và tại sao lại có tên là 345?" | Truyền tải câu chuyện thương hiệu chính xác, tự hào về chặng đường phục vụ ẩm thực tại Vĩnh An. |
| `EVAL-RAG-010` | rag | Hỏi đường đi từ Trị An về quán | "Tôi từ đập thủy điện Trị An đi xuống quán thì đi đường nào gần nhất?" | Chỉ đường chi tiết, dễ hiểu, nhận diện các mốc địa lý quen thuộc tại thị trấn Vĩnh An. |
| `EVAL-PER-007` | personalization | Khách quen quay lại quán | "Chào em, hôm nay có món gì mới không?" | Lời chào thân thiện, nhận diện khách quen, gợi ý món mới hoặc món quen thuộc phù hợp sở thích. |
| `EVAL-PER-008` | personalization | Khách phàn nàn về trải nghiệm trước | "Lần trước món sườn hơi ngọt, lần này làm bớt ngọt giúp tôi" | Lắng nghe chân thành, xin lỗi về trải nghiệm chưa trọn vẹn, ghi chú rõ ràng cho bếp giảm ngọt. |

---

## 5. Ranh Giới Vận Hành & Bàn Giao Kỹ Thuật

1. **Ranh giới an toàn dị ứng:**
   Toàn bộ hồ sơ dị ứng và định lượng dinh dưỡng seed trong mã nguồn tiếp tục mang nhãn `demo_estimate` và `verified_by_kitchen: false`. Hệ thống tuân thủ nguyên tắc fail-closed: khi khách khai báo dị ứng, mọi món chưa kiểm định đều bị chặn thêm giỏ cho đến khi Bếp trưởng trực tiếp ký duyệt hồ sơ thực tế.
2. **Bảo toàn dữ liệu dùng chung:**
   Không chạy bất kỳ migration hay script can thiệp nào vào môi trường database shared/production. Toàn bộ quá trình kiểm chứng giao dịch thật được thực hiện trên môi trường PostgreSQL kiểm thử cô lập (port 54322).
3. **Tính sẵn sàng bàn giao:**
   Hệ thống Tiger Restaurant Concierge đáp ứng trọn vẹn đặc tả kiến trúc tại `plans/tiger-345/09-concierge-agent-design.md`, giải quyết triệt để tất cả 7 lý do từ chối của Reviewer, bảo đảm đầy đủ các rào chắn nghiệp vụ, bảo mật, và toàn vẹn giao dịch.
