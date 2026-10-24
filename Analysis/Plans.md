# Audit & kế hoạch triển khai Dynamic Budget-Aware Food Recommendation — Tiger345

> **Ngày audit:** 20/10/2026, múi giờ Asia/Bangkok (UTC+07). Snapshot menu công khai lúc **21:38:17**.
>
> **Phạm vi bàn giao lần này:** audit source hiện tại, đối chiếu prompt và lập kế hoạch triển khai hoàn chỉnh. **Chưa triển khai business logic mới, chưa migration/deploy, chưa thay đổi dữ liệu nhà hàng.** Yêu cầu “triển khai, tích hợp, kiểm thử, bàn giao” trong prompt được chuyển thành các gói công việc bắt buộc bên dưới; tài liệu này không tự nhận những gói đó đã hoàn thành.
>
> **Kết luận:** dự án có nền tảng tốt về server-authoritative tools, menu domain, draft có xác nhận, CAS/idempotency và guard; **chưa đáp ứng Dynamic Budget-Aware Recommendation**. Không giải quyết chỉ bằng đổi system prompt hoặc bỏ một dòng lọc giá.
>
> **Runtime chatbot trong đợt audit này: CHƯA KIỂM ĐỊNH.** Không gọi provider AI thật. Báo cáo runtime trước đó ghi FAIL cho bản cloud khi tra món; chưa có bằng chứng bản sửa local đã deploy và nghiệm thu.

## Mục lục

1. [Phạm vi, phương pháp và bằng chứng](#1-phạm-vi-phương-pháp-và-bằng-chứng)
2. [Kiến trúc và luồng hiện tại](#2-kiến-trúc-và-luồng-hiện-tại)
3. [Kết quả audit, mức độ và nguyên nhân](#3-kết-quả-audit-mức-độ-và-nguyên-nhân)
4. [Ma trận đối chiếu prompt](#4-ma-trận-đối-chiếu-prompt)
5. [Quyết định nghiệp vụ và invariants](#5-quyết-định-nghiệp-vụ-và-invariants)
6. [Thiết kế đích và hợp đồng dữ liệu](#6-thiết-kế-đích-và-hợp-đồng-dữ-liệu)
7. [Thuật toán, scoring và validator](#7-thuật-toán-scoring-và-validator)
8. [Kế hoạch triển khai và phụ thuộc](#8-kế-hoạch-triển-khai-và-phụ-thuộc)
9. [Ma trận kiểm thử và nghiệm thu](#9-ma-trận-kiểm-thử-và-nghiệm-thu)
10. [Triển khai, quan sát, rollback và bàn giao](#10-triển-khai-quan-sát-rollback-và-bàn-giao)
11. [Rủi ro, điều kiện còn thiếu và Definition of Done](#11-rủi-ro-điều-kiện-còn-thiếu-và-definition-of-done)

## 1. Phạm vi, phương pháp và bằng chứng

### 1.1. Phạm vi audit thực tế

- Đọc hướng dẫn [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md), [architecture.md](../docs/architecture.md) và [contributing.md](../docs/contributing.md).
- Audit sâu capability tư vấn món: understanding → constraints/context → router → menu/profile retrieval → tools → planner → guard → cards/SSE → draft → handoff/quote. Khảo sát các miền auth, admin, catalog, ordering, payments và reservations tại ranh giới phụ thuộc; **không phải penetration test hay security audit toàn bộ từng endpoint**.
- Đối chiếu source đang có trên working tree, không chỉ HEAD hoặc tài liệu lịch sử. Baseline Git đọc được: `2fbbc65` — `chore: remove Jev browser evaluation integration`.
- Working tree đã có **41 files modified và 27 untracked entries** ở thời điểm ghi nhận, bao gồm các cải tiến agent và tài liệu trước đó. Đây không phải toàn bộ thay đổi của đợt audit này. Không revert, không ghi đè các thay đổi đó.
- Hai lane review độc lập kiểm planner/pricing/fees và understanding/tools/UI/tests; kết luận tổng hợp được đối chiếu với source và tái hiện thuần local.
- Chỉ GET menu công khai; không truy vấn đơn hàng, khách hàng hoặc cấu hình bí mật. Không đọc file môi trường/credentials, không chạy seed/reset, không tạo đơn/booking/payment và không gọi provider thật.
- Các tài liệu [Recommendations.md](Recommendations.md), [plan.md](plan.md) là bối cảnh hữu ích nhưng không là bằng chứng source hiện tại. **Giữ nguyên các tài liệu cũ; tài liệu mới là `Plans.md`, không thay `plan.md`.**

### 1.2. Môi trường và dữ liệu đã xác nhận

| Thành phần | Bằng chứng | Giới hạn kết luận |
|---|---|---|
| Frontend do người dùng chỉ định | `http://127.0.0.1:5173/` | Không có browser smoke mới trong đợt audit này |
| Backend menu công khai | `https://njguhcnrecvqdlcjxtoo.supabase.co/functions/v1/public-api/menu` | GET 200 chứng minh endpoint menu có dữ liệu, không chứng minh tool chatbot, provider hoặc deployed revision |
| Snapshot lúc 21:38:17 UTC+07 | 98 mục, 10 danh mục, 98 available; request ID `355c717a-fb8d-415c-aa24-b47726d3d71c` | Số liệu theo thời điểm, không hardcode thành điều kiện sản phẩm |
| Kiểu giá | fixed **33**, range **54**, market **8**, unknown **3** | 65/98 mục bị fixed-only retrieval loại trước scoring |
| Merchandising | `is_bestseller=true`: **8**; signature: **8**; new: **0** | Hai cờ cùng tổng số không chứng minh đồng nghĩa hay cùng tập; featured rank không phải sales/popularity rank |
| Variant/popularity | Không có field variant/popularity chuyên biệt trong response menu đã đọc | Không khẳng định toàn bộ cloud schema không có bảng khác; mô hình canonical hiện hành chưa hỗ trợ end-to-end |
| Backend source/schema/flags/provider hiệu lực | Chưa xác minh parity/deployment/version | Phải xác minh trước runtime acceptance và rollout |

Ví dụ dữ liệu thực: Gà nướng muối ớt **280.000–300.000đ**, bestseller; Cơm lam **22.000–25.000đ**, bestseller; Lẩu hải sản **250.000–300.000đ**, không gắn bestseller; Bò nướng tảng **200.000đ**, không gắn bestseller. Không được tự đổi nhãn hoặc suy sales rank từ tên/ảnh/văn phong.

Báo cáo trước [menu-lookup 20/10](../plans/tiger-345/concierge-quality/reports/2026-10-20-menu-lookup.md#L18-L41) ghi lỗi UUID input strict với seeded IDs, fix local đã có nhưng chưa deploy. Đây là bằng chứng lịch sử riêng: **không nhầm fix UUID với fix dynamic budget** và không coi thành runtime PASS mới.

### 1.3. Baseline kiểm định chạy lại trong audit

Chạy `npm.cmd` trên Windows vì `npm.ps1` bị ExecutionPolicy chặn. Node **v26.10.0**, npm **11.19.1**. Lệnh kiểm tra phiên bản npm ban đầu thất bại vì PowerShell policy; đã xác định nguyên nhân và dùng executable `.cmd`, không thay policy máy.

| Lệnh đã chạy | Kết quả mới |
|---|---|
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run typecheck:server` | PASS |
| `npm.cmd run lint` | PASS — **36 warnings, 0 errors** |
| `npm.cmd run check:architecture` | PASS — **267 source files** |
| `npm.cmd run test:architecture` | PASS — **8/8** |
| `npm.cmd run test:unit` | PASS — **196/196**, 32 files |
| `npm.cmd run test:server` | PASS — **662/662**, 47 files |
| `npm.cmd run build` | PASS — Vite production build |

Có cảnh báo React `act(...)` ở unit tests và lint warnings baseline; không che giấu hoặc giảm assertions. Build/typecheck có thể sinh build artifacts/cache nhưng không deploy backend. Không chạy DB integration/policies/browser E2E do chưa xác minh disposable test stack; không dùng cloud nhà hàng làm fixture. **Tests xanh hiện tại không phủ đầy đủ prompt mới.**

## 2. Kiến trúc và luồng hiện tại

### 2.1. Ownership cần giữ

- React 19/TypeScript/Vite 8; frontend theo `app`, `features`, `shared`. Backend qua Supabase PostgreSQL, Auth và ba HTTP gateways public/customer/admin.
- Domain recommendation thuộc server Concierge; schemas portable thuộc `@contracts`; frontend chỉ import portable contracts, không import optimizer/DB/server runtime.
- Một production runtime, protocol identifier `concierge-v2`, PostgreSQL session backend. Không tạo chatbot/runtime thứ hai hoặc thêm dịch vụ optimizer bên ngoài nếu không có nhu cầu chứng minh.
- Gateway giữ guards/auth/rate limit/dispatch. SQL giữ atomic financial/availability invariants. Feature cart được dùng qua API công khai của feature.

Nguồn: [architecture:63–106](../docs/architecture.md#L63-L106), [architecture:120–143](../docs/architecture.md#L120-L143).

### 2.2. Luồng hiện tại

```text
Tiger chat UI → Concierge API/SSE → public-api/concierge-handlers → runtime
    → load session + capabilities + CAS/idempotency + feature gates
    → understanding: intent/readNeeds/entities/constraint delta
    → merge constraints + context/memory (nguồn riêng)
    → capability router → loadMainContext
          ├─ concierge_knowledge (documents/config)
          ├─ Menu Domain snapshot + serving/allergen adapters
          └─ fetchAuthoritativeCatalog (SQL đọc thứ hai)
    → clarification / draft deterministic branch
    → model chọn read tools trong active set + fallback
    → ToolGateway → search_menu_items / get_menu_item / recommend_meal
    → retrieveMenuCandidates (fixed-only, output tối đa 8)
    → buildMealPlans (production greedy, 2–3 dòng, tối đa 2 mâm)
    → schema parse + server cards + grounded prose guard
    → commit session → SSE presentation/completion → UI
    → explicit acceptance → guarded draft → review/handoff → cart → quote/order
```

**Điểm tái sử dụng:** authoritative IDs, prices, published/available; menu/profile provenance; allergy fail-closed; read tool authorization/timeout; current versus imported preferences; deterministic draft batch; exact pending IDs/state version; price-change review; signed quote và SQL revalidation; SSE chỉ công bố kết quả đã qua execution/commit.

**Điểm chưa có:** một cost model khoảng giá/phí chuẩn hóa, dynamic request model, variable-cardinality production optimizer và independent final recommendation validator.

## 3. Kết quả audit, mức độ và nguyên nhân

### F01 — P0: Câu ví dụ chính chưa được nhận ngân sách

[constraint-extractor:45–59](../supabase/functions/_shared/concierge/understanding/constraint-extractor.ts#L45-L59) chỉ chấp nhận một số marker; `priceQuestion` có `combo`, `gia`, `bao nhieu`, `mon nao`, `phi ship` thì tắt toàn bộ budget parse. Tái hiện thuần local bằng loader hiện có, không provider/database:

| Input | Constraint delta hiện tại | Hệ quả |
|---|---|---|
| “Tôi có 1 triệu đồng, tư vấn cho tôi những món best seller ngon nhất.” | `childCount:null`; **không có budgetVnd** | Câu ví dụ không thiết lập trần 1 triệu |
| “Gợi ý combo cho 4 người ngân sách tối đa 500k” | partyTotal=4; **không budget** | Từ combo làm mất ngân sách rõ ràng |
| “Tối đa 1.000.000 đồng” | Không budget | Thiếu grouped currency parser |
| “Gợi ý 5 món cho 4 người tối đa 500k” | partyTotal=4, budget=500000; **không requested count** | Mất ràng buộc 5 món |
| “Mỗi người 200k cho 4 người” | partyTotal=4, budget=200000 | Diễn giải budget/người thành tổng budget |

Không kết luận mọi lượt đều bỏ budget: merge có thể giữ budget cũ, và orchestrator hiện hỏi lại số người nếu chưa xác nhận. Lỗi là input mới không được hiểu đúng, có thể dùng budget cũ/không budget. Cần sửa trước optimizer, không trông cậy LLM tự bổ sung.

### F02 — P0: Giá khoảng bị loại khỏi tìm kiếm và recommendation

[menu-retrieval:121–150](../supabase/functions/_shared/concierge/menu-retrieval.ts#L121-L150) loại mọi non-fixed, kiểm budget bằng `price_vnd`. [tool-runner:136–177](../supabase/functions/_shared/concierge/orchestration/tool-runner.ts#L136-L177) dùng chung cho search và recommend. Candidate mapper hiện không đưa min/max trở lại dù schema đã có field.

- Không được chỉ xóa fixed filter rồi giữ phép tính `price_vnd × quantity`: với range, `price_vnd` có thể là giá thấp nhất, gây cam kết sai.
- Exact detail `get_menu_item` là nhánh khác, đã hỗ trợ bounds; không phải mọi câu hỏi món đều đi qua lỗi này.
- Browse/discovery, budget-advisory eligibility và exact order eligibility phải là ba chính sách riêng.

### F03 — P0: Bestseller có trong database/API nhưng không vào luồng recommendation

[menu-retrieval:22–95](../supabase/functions/_shared/concierge/menu-retrieval.ts#L22-L95) thiếu `is_bestseller`/`is_new`; [tool-runner:156–158](../supabase/functions/_shared/concierge/orchestration/tool-runner.ts#L156-L158) còn chủ động lấy tập rỗng cho bestseller/new-only needs. Public API đã trả cờ thật, Menu Domain đã có bestseller. Không dùng signature/tags/featured_rank thay bestseller. Không có verified popularity rank thì dùng cờ boolean, không tạo rank/“ngon nhất” tuyệt đối.

### F04 — P0: Budget hiện là food subtotal, chưa phải hóa đơn tối đa

[budget:1–10](../supabase/functions/_shared/concierge/budget.ts#L1-L10) chỉ kiểm safe-integer subtotal; planner tính đơn giá fixed × lượng. Cả hard và soft đang cap bảo thủ giống nhau. Không có worst-case range total, fee completeness, tax inclusion policy hoặc final-bill guarantee.

Quote hiện tính shipping theo zone/min-order/free threshold, xem [quotes-handlers:267–318](../supabase/functions/public-api/quotes-handlers.ts#L267-L318). Không tìm thấy VAT/service-fee authoritative trong flow tính tiền đã khảo sát. **Không tìm thấy không có nghĩa phí bằng 0.** Không tự thêm VAT 8%/10% hoặc tự tuyên bố giá đã bao gồm VAT.

### F05 — P0: Chưa có independent final semantic validator cho recommendation

Zod/tool gateway kiểm shape, không kiểm chứng toàn bộ tổ hợp. [food-handler:82–110](../supabase/functions/_shared/concierge/orchestration/handlers/food-handler.ts#L82-L110) dùng subtotal/status từ plan; [response-guard:56–75](../supabase/functions/_shared/concierge/response-guard.ts#L56-L75) kiểm các số xuất hiện trong evidence, không chứng minh tổng đúng/phí đầy đủ/budget phù hợp. Cần validator độc lập trước cards/evidence/prose, trước commit/publication và ở các đường replan/action.

### F06 — P1: Không có default 4 món, nhưng hiện bị khóa 2–3 món

- [meal-planner:7–13](../supabase/functions/_shared/concierge/meal-planner.ts#L7-L13): min2/max3 lines, max2 alternatives.
- [meal-planner:26–90](../supabase/functions/_shared/concierge/meal-planner.ts#L26-L90): greedy chọn primary, mỗi role tối đa một, dừng ở 3; đảo danh sách cho lựa chọn khác; fallback cũng 2–3.
- [meal-planner:100–184](../supabase/functions/_shared/concierge/meal-planner.ts#L100-L184): production vẫn greedy. Bounded planner **offline only**, pool8, chỉ pairs/triples, 560 evaluations/50ms; chưa phải giải pháp dynamic production.
- Scoring offline có role coverage cộng theo role và chút utilization, không bestseller; không có quality objective production hoàn chỉnh. Không promote nguyên trạng hoặc đổi max3 thành max5 rồi gọi là tối ưu động.

### F07 — P1: Trần số món nằm xuyên suốt protocol/session/UI

[contracts action](../supabase/functions/_shared/contracts/concierge-v2.ts#L189-L190), [meal card](../supabase/functions/_shared/contracts/concierge-v2.ts#L258-L262): min2/max3. [pending](../supabase/functions/_shared/contracts/concierge-v2.ts#L563-L566), [display context](../supabase/functions/_shared/contracts/concierge-v2.ts#L502-L506): max8. Handler cộng cả alternatives vào 8 slots và có thể bỏ nguyên plan nếu không đủ chỗ. [conversation-context:88–118](../supabase/functions/_shared/concierge/conversation-context.ts#L88-L118) ordinals/display giới hạn 8; context builder còn compact pending.

Chỉ sửa planner sẽ bị contract reject, bỏ cards hoặc acceptance fail. Cần cùng version/cap policy và không silent truncate.

### F08 — P1: Thiếu mô hình requested count, meal context có kiểu và party unknown

[constraints schema](../supabase/functions/_shared/contracts/concierge-v2.ts#L465-L479) chưa có requested distinct count, budget scope, fee context. Runtime default adults2; [orchestrator:221–224](../supabase/functions/_shared/concierge/orchestrator.ts#L221-L224) yêu cầu party confirmed trước mọi recommendation. Prompt cho phép thiếu party nhưng không cho suy “đủ cho nhóm”; nên cho budget-only advice với khẩu phần unknown, chỉ hỏi khi cần portion-specific guarantee/per-person budget.

### F09 — P1: Chưa có real variant end-to-end

Pricing modes schema là fixed/range/market/unknown, không phải variant model. Quote/draft/cart identity hiện dựa item và note, không authoritative option ID. Không coi 280k là “phần nhỏ”, 300k là “phần lớn” nếu chưa có dữ liệu nhà hàng. Hỗ trợ đầy đủ variant cần migration, admin, DTO, resolver, quantity/merge key, quote signature và order SQL, không chỉ thêm field UI.

### F10 — P1: Candidate recall và freshness ảnh hưởng tính khả thi

Top8 output trở thành optimizer pool8 nên có thể loại tổ hợp tốt trước khi tối ưu. Menu Domain hiện tối đa 2000 records, TTL45s, có stale fallback; query catalog khác lại đọc dữ liệu mới. Nguồn [menu/domain:35–66](../supabase/functions/_shared/concierge/menu/domain.ts#L35-L66), [menu/repository](../supabase/functions/_shared/concierge/menu/repository.ts#L16-L38). Cần một versioned pricing view cho một lần solve; không trộn giá cũ mới; stale không được bảo đảm giá hiện tại/allergy verified.

### F11 — P1: UI và guard chưa biểu đạt min/max + fee certainty

[ConciergeChatView:94–117](../src/features/concierge/components/ConciergeChatView.tsx#L94-L117) hiển thị flat `price_vnd`, subtotal và CTA nhận cả mâm; blanket “chưa bao gồm phí giao hàng”. Cần price intervals, fee scope/status, tiền dư tính từ worst case, CTA advisory versus orderable. Không đưa số tiền tự tính ở browser vào authority.

### F12 — P1: Knowledge dependency, rollout và test evidence cần tách rõ

Menu tool còn yêu cầu knowledge snapshot, dù menu endpoint có thể khỏe. Thiếu schema/knowledge/profile freshness phải phân biệt `empty`, `unknown`, `unavailable`, không trả “quán không có món”. Local fix UUID đang có cần giữ regression; không sửa seeded IDs hoặc đổi DB cho khớp RFC validator. Bản cloud chưa xác minh parity; build frontend không deploy Edge Functions. Test baseline mạnh về fixed-price draft nhưng thiếu phần lớn 20 tình huống mới.

## 4. Ma trận đối chiếu prompt

| Nhóm yêu cầu | Hiện trạng | Phần phải làm | Gói |
|---|---|---|---|
| Hiểu budget, preferences, diet, party, count, meal context | Có một phần; chính ví dụ budget miss | Money parser có scope/provenance, requested count, clear/correction, party unknown | B02 |
| Fixed normalization | Có safe integer và fixed arithmetic | Dùng chung normalized bound + checked arithmetic | B03 |
| Range và max hard validation | Detail có range; search/planner loại range | Interval price, worst-case sum và phí, giữ min/max ra DTO | B03–B04 |
| Variant có dữ liệu thật | Chưa có canonical support | Mô hình authoritative option + tích hợp end-to-end, không suy từ range | B05 |
| Unknown upper bound | Bị loại | Hiển thị thiếu dữ liệu/tra nguồn có sẵn; không đưa vào guaranteed combination | B03–B04 |
| Bestseller thực | Public có; chatbot không dùng | Mapping boolean source, strict/priority semantics, missing evidence | B01, B06 |
| Candidate nhiều cardinality | Production chỉ2–3 | Internal candidate pool độc lập output cards, variable cardinality/quantity | B06 |
| Quality > count/spend | Greedy; scoring offline giới hạn | Versioned normalized score + penalties, test ít/nhiều đều có thể thắng | B07 |
| Bounded stable optimization | Offline pairs/triples; time-dependent cap | Stable deterministic work cap/tie-break, search status, exact small oracle | B07 |
| Final validation mọi plan | Schema/prose/draft checks rời | Independent validator giá/phí/IDs/constraints trước publication | B04, B08 |
| Thay đổi budget/sở thích giữa chat | Có merge/context/draft guard | Invalidate snapshots/pending, regenerate + revalidate, không cộng draft hai lần | B02, B08 |
| UX tự nhiên, truthful totals | Single subtotal, 2–3 cards | Min/max + fee certainty + budget status + safe CTA, no algorithm jargon | B09 |
| 20 unit/integration scenarios | Phần lớn thiếu/partial | Matrix đầy đủ + property/adversarial/database/browser | B10 |
| Kiểm thử thực tế/bàn giao | Cloud lỗi tra món theo report; chưa parity | Offline gates + disposable DB + approved Tiger real runtime + rollout/rollback | B00, B11 |

## 5. Quyết định nghiệp vụ và invariants

### 5.1. Ý nghĩa budget, số món và lượng

1. Budget khách đưa là **trần cứng để được gọi “trong ngân sách”**, kể cả câu dùng “tầm/khoảng”; không tự dùng soft +5%. Nếu muốn phương án vượt trần phải xin khách đổi budget, không gắn valid.
2. `dish_count` là **số món phân biệt theo parent item**, không số phần. Quantity là phần/đơn vị của mỗi món; hai variant cùng parent không được lách để tính thành hai món trừ khi khách xác nhận cách đếm khác.
3. “Đúng 5 món” là hard equality nếu input rõ; “khoảng 5 món” là preference/range được diễn giải minh bạch; “thêm 2 phần món này” là quantity mutation, không requested dish count. Với draft có sẵn, mặc định count áp dụng **toàn mâm sau kết hợp**: draft2 món + “mâm đúng5 món” cần thêm3 parent khác; chỉ câu rõ “thêm5 món mới” mới áp count cho phần đề xuất mới. Replace plan yêu cầu5 thì mâm thay thế có5. Dedup parent giữa draft và đề xuất, quantity/variant không lách count. Nếu ý định không rõ thì hỏi lại, không tự clamp count vượt trần kỹ thuật.
4. Mặc định budget là **tổng nhóm** nếu câu rõ tổng. Nếu per-person, chỉ nhân khi biết party phù hợp và đã giải nghĩa trẻ em; không tự dùng adults default. Input mơ hồ cần một câu hỏi rõ nghĩa.
5. Có draft: mặc định giữ legacy **additive whole-meal scope**: budget bao gồm draft đã chọn + đề xuất mới + mandatory fees tính **một lần cho cả tổ hợp**. “Đổi cả mâm” là replace/replan, không cộng draft cũ. Không lấy cart/đơn của khách tự động trừ budget khi chưa có ý định rõ.
6. Thiếu party: có thể tư vấn giá với quantity1 như đơn vị tham khảo; không khẳng định đủ ăn, không tự chọn quantity theo default2. Thiếu serving metadata: `portion_status=unknown`; không cộng điểm khẩu phần giả.
7. Strict dietary/allergy restrictions không được tự nới. Thiếu ingredient/kitchen verification phải abstain hoặc loại khỏi lời hứa an toàn; thực đơn marketing không phải danh sách nguyên liệu đầy đủ.
8. “Chỉ món best seller” lọc cờ thật. “Ưu tiên best seller” cho score ưu tiên, không gọi món thường là bestseller; nếu cần bổ sung món ngoài tập phải giải thích. Không có cờ/rank đủ căn cứ thì trả đúng trạng thái thiếu evidence, không giả thứ hạng.

### 5.2. Phân biệt ba loại kết quả

| Kết quả | Cho phép | Không cho phép |
|---|---|---|
| Discovery/detail | Liệt kê món có giá market/unknown kèm nhãn đúng | Cam kết chi phí khi không có max |
| Budget recommendation estimate | Fixed/range/real variant có max căn cứ; totals thấp/cao; unknown fee thì conditional | Biến estimate thành unit price đã đồng ý; đưa unknown-price line vào valid guaranteed plan |
| Orderable draft/quote | Exact fixed price hoặc real fixed variant được pipeline hỗ trợ, khách xác nhận, revalidated | Lấy giá min/max range làm giá order; bỏ qua signed quote/SQL |

Range plan có thể đạt **giới hạn ngân sách của bản dự toán** mà vẫn chưa orderable. Nếu cả mâm có line chưa đặt được giá chính xác thì tắt CTA “Chọn cả mâm vào giỏ nháp”, giải thích cần nhân viên/option xác minh. Có thể nhận từng món orderable riêng khi khách chủ động chọn và validator kiểm lại. Không âm thầm nhận một phần khi khách đồng ý cả mâm.

### 5.3. Phạm vi phí và ngôn ngữ bảo đảm

- Phân biệt `food_only`, `whole_meal`, `final_bill`; lưu nguồn hiểu scope. Nếu khách nói “1 triệu tổng hóa đơn” thì không trả `food_only` như đã đáp ứng toàn bộ.
- Mọi dòng tiền dùng VND integer; số thực LLM, NaN, âm, tràn integer, quantity0/phân số đều không hợp lệ. Không làm tròn giảm giá để vừa budget.
- `known_required_fees` không bao gồm unknown fees giả bằng0. **Known zero cần evidence**: giá đã bao gồm VAT, không phụ phí bắt buộc và mode hợp lệ, có ngày hiệu lực/version.
- Nếu còn phí bắt buộc unknown: chỉ nói “tiền món + các phí đã xác định trong mức X; chưa bảo đảm hóa đơn cuối”. Không trả `verified_within_budget` ở scope final_bill.
- Tính số tiền dư bảo thủ: `budget − validated_total_max` cho đúng scope; nếu phí chưa đủ, nhãn rõ “còn theo tiền món/phí đã biết”, không gọi là tiền dư cuối cùng.
- Policy thương mại cần người có thẩm quyền nhà hàng xác nhận; không suy VAT từ luật chung, dữ liệu seed hoặc model.

## 6. Thiết kế đích và hợp đồng dữ liệu

### 6.1. Modules và đường tích hợp

Thêm domain nhỏ, thuần, có dependency một chiều dưới `supabase/functions/_shared/concierge/recommendation/` (các tên dưới đây là **file dự kiến**, chưa tồn tại):

```text
recommendation/
  request.ts       request normalized, scope/count/context/constraint hash
  price.ts         normalize price/variant → bounded or unbounded
  cost.ts          checked multiply/sum + draft scope + shared fee adapter
  candidates.ts    eligible pool, evidence, exclusions and truncation
  quality.ts       component score + reasons + provenance + weights version
  optimizer.ts     deterministic variable-cardinality bounded search
  validate.ts      independent final budget/constraint validation
  present.ts       validated result → portable cards/tool evidence
```

- Không dựng pricing engine song song checkout. Bóc tách **quy tắc phí thương mại dùng chung** vào server-owned domain phù hợp để recommendation, quote HTTP và SQL parity tests cùng căn cứ; quote/order vẫn authority cho giao dịch.
- Tái dùng Menu Domain và safety functions; thống nhất adapter đọc pricing/bestseller/profile thành một versioned snapshot. Đảm bảo active categories parity với public catalog; không khôi phục dữ liệu seed khi DB lỗi.
- Giữ `recommend_meal` là read tool. Model-visible tool input tiếp tục tối giản; constraints authoritative lấy từ parsed/validated session, không tin model tự truyền budget/price/count.
- `meal-planner.ts` có thể giữ facade compatibility delegating sang engine mới. Không để production greedy và dynamic engine cùng tự chọn bằng LLM; chỉ một strategy được server gate xác định. Bounded offline cũ là benchmark/reference, không nâng lên production nguyên trạng.
- Server handler build cards từ validated result; UI chỉ render portable schemas qua `@contracts`. Không đưa optimizer hoặc secret/config vào bundle frontend.

### 6.2. Request model đề xuất

```text
RecommendationRequest
  budget: { amount_vnd, basis: total|per_person, scope, source, confirmed }
  operation: add_to_draft | replace_plan | new_meal
  requested_distinct_count?: { kind: exact|preferred|range, min, max,
                              scope: final_meal|new_additions, source }
  party: { confirmed, adults?, children?, effective_diners? }
  meal_context?: lunch|dinner|group|snack|other + explicit source
  merchandising: { bestseller: required|preferred|none, new?, signature? }
  preferences/dislikes/dietary/allergies + current/imported provenance
  order_mode + delivery_zone_id? (không tự lấy address)
  existing_draft_snapshot + version (nếu additive)
  catalog_version, profile_version, fee_policy_version
  scorer_version, search_policy_version, constraint_hash
```

Chuẩn hóa money token trước intent heuristic: hỗ trợ `1 triệu`, `1tr`, `1tr5`, `1,5 triệu`, `1.000.000đ`, `1 000 000 đồng`, `500k`, “tôi có…”, “giảm xuống…”, “bỏ giới hạn”. Tách price-question amounts khỏi budget bằng ngữ cảnh clause, không blanket disable vì từ combo/giá. Đổi count/party/context/budget phải vào changed fields và invalidation tương tự preference correction. Không lưu budget/count của nhóm vào durable personal memory mặc định.

### 6.3. Price model

```text
NormalizedPrice =
  bounded: { kind: fixed|range|variant, min_vnd, max_vnd,
             item_id, variant_id?, source_version, orderable_exact }
  unbounded: { kind: market|unknown|invalid,
               known_min_vnd?, missing_fields, reason }
```

- Fixed: min=max=authoritative unit price.
- Range: yêu cầu min/max integer không âm, min≤max; không fallback `price_vnd` nếu max thiếu. Price0 chỉ hợp lệ nếu authoritative rõ là giá0, không chuyển market/unknown price0 thành miễn phí.
- Variant: một option có ID thật, parent đúng, published/available/mode đúng và exact price; chọn option là biến tối ưu. Nếu option unavailable hoặc thiếu max thì không dùng để guarantee.
- Market/unknown: thử nguồn xác minh có sẵn với tool/read budget hữu hạn; không có approved bounded quote/option thì loại khỏi guaranteed combination, vẫn có thể hiện ở discovery với lý do.
- Cập nhật constraint DB range nonnegative, consistency fixed/variant nếu cần bằng **migration mới** sau audit dữ liệu, không sửa migration lịch sử và không chạy destructive seed.

### 6.4. Fees và interval costing

`FeePolicySnapshot` cần scope/mode/effective dates/version/source/verified status, tax inclusive/exclusive, rounding và taxable base; có explicit complete/no-extra-fee attestation. Bổ sung schema/config/admin tối thiểu cho dữ liệu thật cần thiết, không gán default zero cho record cũ.

Tái dùng delivery zone fee/free-threshold/minimum-order rules đang có. Thiếu mode/zone thì mức bảo đảm final bill unknown; có thể hỏi lại hoặc giữ food-only conditional. Không đọc saved address khi khách chưa yêu cầu.

**Cảnh báo nonmonotonic:** khi subtotal qua ngưỡng free shipping, phí giảm. Không được chỉ tính `foodMax + shipping(foodMax)` để suy totalMax.

Ví dụ: food∈[450.000,500.000], free shipping từ500.000, ship30.000. Tổng ở500.000 là500.000 nhưng ở499.999 có thể là529.999. Giải pháp:

1. Shared pure fee calculator với rounding/threshold chính xác; tính cực trị trên các endpoints và mọi breakpoint/điểm ngay dưới breakpoint hợp lệ của giá nguyên.
2. Nếu chưa chứng minh reachable subtotal set, dùng upper bound bảo thủ `foodMax + maxApplicableMandatoryFee`, có thể false negative nhưng không false guarantee; ghi phương pháp bound.
3. VAT/phí theo phần trăm, fee-tax base và rounding cũng cần interval bound đúng, không cộng percentage ước lượng.
4. Nếu nhà hàng thực sự thu phí mới chưa có trong quote/order, phải tích hợp signed quote/SQL tài chính cùng feature; nếu chưa có hỗ trợ, final-bill guarantee để conditional. **Không hiển thị một phí như khoản checkout đã thu nếu pipeline không thu.**

### 6.5. Result/card model có version

```text
ValidatedRecommendation
  schema_version, plan_id, semantic_key
  lines[]: item_id, variant_id?, quantity, verified name,
           unit_price_min/max, line_min/max, bestseller_evidence,
           orderability, serving_status
  distinct_count, total_quantity
  costs: proposed_food_min/max, existing_food_min/max,
         combined_food_min/max, required_fees_min/max,
         bounded_total_min/max?, unknown_fee_reasons[], scope
  budget_check: within|conditional|over_budget|unverifiable
  validation: valid|invalid + reason_codes + validator_version
  portion_status: verified_estimate|unknown|insufficient
  quality: score, component_scores, reason_codes, evidence_refs
  search_status: complete|bounded_best_found|incomplete|no_feasible_proven
  snapshot_versions, constraint_hash, as_of, expires_at
  acceptance: exact_orderable|needs_price_confirmation|not_available
```

`valid` về shape/safety/food-bound không đồng nghĩa `within` ở final-bill scope. Không giữ tên `PASS` mơ hồ làm duy nhất một cờ. `total_max=null` nếu không có upper bound; prohibited guarantee phải do typed state, không phụ thuộc lời văn LLM.

**Transport/cardinality policy đề xuất v1:** tối đa **30 distinct dishes/plan**, quantity1..99, tối đa **2 alternatives**; đây là trần tài nguyên tương thích draft hiện tại, **không phải số món mục tiêu**. Một món hợp lệ phải có thể được trả. Trường hợp khách yêu cầu >30 hoặc >supported options phải báo giới hạn, không clamp xuống30.

Nâng đồng bộ action/card schemas, pending IDs/items tối đa60 cho hai alternatives, display references tối đa60 hoặc dùng typed references theo plan. Context model không cần nhét60 dòng giàu metadata: chỉ compact IDs + constraint/status, không silent bỏ dòng actionable. Audit mọi `.slice(0,8)`, ordinal1–8 và response size cap. Nếu payload quá budget, ưu tiên một plan đã validate và nói còn alternative, không bỏ plan chính âm thầm.

Giữ protocol identifier hiện tại nếu negotiated schema extension tương thích. Nếu strict clients/session parser không đọc được, dùng schema-version negotiation hoặc staged backend compatible reader/writer; không tự đổi protocol literal tùy tiện. Persisted old sessions/results đọc được qua explicit adapter; replay là historical result theo request ID, không tính lại thành một phản hồi khác. UI đánh dấu as-of/historical và yêu cầu revalidation trước fresh guarantee/action.

### 6.6. Real variants — không loại khỏi full scope

B05 phải triển khai khả năng khi có dữ liệu thật; deployment không có option nào vẫn hoạt động với fixed/range. Data curation có thể pending nhưng **test variant không được đánh dấu N/A chỉ vì live menu chưa có**.

- Bảng option có UUID-compatible ID, parent FK, name, exact price, publication/availability/mode, serving override nếu verified, version; RLS/admin ownership theo mô hình menu hiện có.
- Admin/API CRUD và validation; không tự sinh sizes từ range. Old base item tiếp tục tương thích.
- Bổ sung `variant_id` xuyên DTO, draft, cart merge key, line snapshots, canonical recommendation key, quote normalization/hash/signature, order request/RPC SQL validation và idempotency. Notes không thay variant ID.
- Server verify option thuộc parent và giá/version hiện tại. Revalidate option deleted/disabled/price changed trước draft/quote/order.
- Đây là financial boundary expansion có review riêng; rollback tắt variant writes nhưng đọc được historic orders, không drop dữ liệu.

## 7. Thuật toán, scoring và validator

### 7.1. Eligibility và candidate recall

1. Parse constraints; nhận diện budget/count/scope mơ hồ để hỏi đúng một điểm quan trọng. Không hỏi số món nếu khách chưa chỉ định; đó là biến tối ưu.
2. Load consistent, versioned commercial snapshot + profiles + fee context. Nếu giá/fee stale: force read hoặc downgrade guarantee; không lấy stale allergy profile làm verified.
3. Filter hard: published, active category, available, mode, bounds, required bestseller, explicit dietary constraints, allergies, dislikes và valid options.
4. Candidate pool nội bộ **khác** giới hạn candidates serialize cho model/cards. V1 giữ tối đa48 distinct parents, tối đa4 real options/parent, quantity options tối đa4/parent (từ explicit user/verified serving/quantity1); report khi cut. Không loại món chỉ vì category role trùng.
5. Nếu catalog≤48 dùng toàn bộ eligible. Nếu lớn hơn, chọn stable stratified pool theo required IDs/category/price tiers/merchandising/preferences; đo recall riêng. Không khẳng định global infeasible khi pool bị rút gọn.
6. Đối với missing party/profiles: quantity1 cho các đơn vị tham khảo, portions unknown; không suy people_max giả. Verified restaurant serving dùng lựa chọn lượng có căn cứ và over-order penalty.

### 7.2. Variable-cardinality bounded optimization

Thiết kế baseline deterministic beam/branch search (hoặc exact branch-and-bound nếu benchmark chứng minh phù hợp), không giới hạn business ở cardinality2/3/4/5.

- Sort canonical item/variant IDs trước expand. Mỗi bước chọn skip/include và quantity/option hợp lệ, không lặp cùng parent tự ý. **Decision horizon duyệt toàn bộ tối đa48 parents; không dừng ở parent thứ30.** Trần30 là số parent được chọn, độc lập số quyết định skip/include.
- Xét candidate hoàn chỉnh tại **mọi selected cardinality từ1 đến min(30,eligibleCount)**; exact requested count kiểm theo scope final_meal/new_additions, gồm dedup với draft khi cần. Không bắt tạo đủ tất cả cardinalities.
- Giữ frontier theo cardinality/role/quality, tránh beam chung bị tất cả tổ hợp dài hoặc ngắn chiếm chỗ; canonical dedup theo item+variant+quantity.
- Hard validate partial lower bound an toàn để prune; không prune sai chỉ dựa `shipping(subtotal)` khi fee threshold không monotonic. Dùng valid lower bound hoặc food cost-only prune khi fees chưa xác định nonnegative.
- Tài nguyên v1 khởi điểm: beam128/frontier, **50.000 expanded states/solve**, max30 selected dishes và decision horizon tối đa48 parents; mọi option/quantity expansion đều tính vào cap. Tuning chỉ sau benchmark. Giới hạn200ms là SLO/cancellation watchdog đề xuất, không deadline quyết định frontier được gọi stable; count cap/order mới là cơ chế tái lập chính.
- Dừng do deterministic cap: trả `bounded_best_found` nếu có validated candidate, không gọi là global optimum. Watchdog/deadline: `incomplete`, không bảo đảm same winner hoặc báo infeasible; có thể trả best đã validate với giới hạn rõ, không publish trạng thái “đã tối ưu toàn bộ”.
- Chỉ `no_feasible_proven` khi search exhaustive trên tập đầy đủ/upper bounds và constraints đã biết. Truncation ở **bất kỳ** tầng pool, variant options, quantity options, frontier/beam hoặc evaluation cap đều không được gắn `complete` hay suy global infeasible nếu không có chứng minh dominance/bounds độc lập. Nếu search cut/metadata thiếu, trả “chưa tìm được phương án xác minh được”, không nói “không thể có”.
- Tie-break: quality desc → chất lượng evidence/portion match → lower validated totalMax khi quality bằng → canonical key. Không đưa số món vào tie-break ưu tiên mặc định; không chọn đắt nhất mặc định.
- Trả phương án tốt nhất và tối đa một alternative có khác biệt thực về khẩu vị/cấu trúc/chi phí, không chỉ đảo line order. Tất cả alternatives đều phải validate.

### 7.3. Scoring v1 minh bạch, hiệu chỉnh được

Mọi component integer/fixed-point, chuẩn hóa0..1000, config versioned server-side; max tổng100 điểm. Khởi điểm dưới đây là **thiết kế đề xuất**, chưa phải dữ liệu chứng minh nhà hàng đồng ý trọng số.

| Component | Trọng số | Quy tắc cơ bản |
|---|---:|---|
| Bestseller relevance | 25 | Tỷ lệ có trọng số giữa món có cờ bestseller thật và tổng món hợp lệ; optional verified popularity rank chỉ dùng khi tồn tại và rõ nguồn; không cộng theo số món tuyệt đối |
| Preference match | 25 | Coverage các nhu cầu hiện tại/explicit trước inferred; score bounded theo nhu cầu, không cộng vô hạn theo count; không dùng model đoán metadata |
| Meal coherence | 20 | Fit mục đích snack/lunch/dinner/group bằng role/verified pairing; role coverage bão hòa theo context, không bắt mọi bữa phải đủ bộ vai trò |
| Food diversity | 15 | Đa dạng category/role và kỹ thuật/nguyên liệu **nếu có nguồn**; reward bão hòa, phạt trùng không cần thiết; missing metadata neutral, không fabrication |
| Portion suitability | 10 | Chỉ khi party confirmed và serving verified; adequacy/over-order theo nguồn; unknown không nhận điểm đủ ăn và output cảnh báo |
| Budget utilization | 5 | Bonus bão hòa sớm, không thưởng tiêu hết; ví dụ `min(foodMax / residualBudget, 0.70) / 0.70`, chỉ là tie-level objective, không áp floor phải dùng70% |

- Khi người dùng không yêu cầu bestseller, không gắn “bán chạy” vào lý do; trọng số inactive đặt0 theo config context, **không tự normalize tăng các tín hiệu thiếu evidence thành ưu thế**. Cùng context dùng cùng denominator.
- Penalties versioned riêng: redundant category/role khi không phục vụ nhu cầu, quá nhiều phần so serving upper estimate, dislike soft chỉ khi được phép (explicit exclusion vẫn hard), incoherent combination. Tổng penalty cap rõ, ví dụ0..25 điểm; không có penalty “ít món”.
- Không thưởng theo số dòng hoặc tổng tiền. Food diversity/context adequacy có thể làm 4–5 món tốt hơn3, nhưng quality3 có thể vượt5. Một snack1 món có thể thắng bữa5 món thừa; không so khác context bằng cùng template.
- Missing serving/popularity không được biến thành positive score; thiếu evidence về khẩu phần không làm hard no-plan trừ khách yêu cầu đủ ăn như điều kiện bắt buộc.
- Không quảng bá contribution heuristic thành dinh dưỡng y khoa/“ngon nhất toàn quán”. Giải thích chỉ bằng reason codes có evidence (“ưu tiên món được đánh dấu bán chạy”, “có rau kèm”, “đúng sở thích đã nêu”).
- Test ablation, fixtures ít món thắng/nhiều món thắng và restaurant review trước hiệu chỉnh. Freeze holdout trước tune, không báo điểm trên dữ liệu đã dùng điều chỉnh như independent acceptance.

### 7.4. Independent deterministic final validator

Không tin subtotal, price, `PASS`, count hoặc guarantee do optimizer/tool/LLM gửi. Validator resolve lại IDs từ authoritative snapshot/version, độc lập scoring. Đầu vào chủ yếu IDs/variant IDs/quantity + constraints/fee snapshot, không nhận model prices làm authority.

```text
validate(plan, currentSnapshot, request, feePolicy, existingDraft):
  validate unique parent/variant relation, count semantics, quantity and safe arithmetic
  check published/active/available/order mode + diet/allergy/source requirements
  normalize every selected price from authority; reject unbounded guarantee lines
  recompute lineMin/Max = unitMin/Max × quantity (checked integer)
  combine draft once according to add/replace scope
  recompute required fee bounds with thresholds/rounding/completeness
  verify exact requested count + explicit quantity + no missing mandatory item
  derive totalMin/Max + budget scope/status (not optimizer supplied)
  validate versions/freshness/expiry + party/serving claims + bestseller evidence
  return structured validation + canonical totals/reasons or rejection
```

Bất biến: `foodMin≤foodMax`, `totalMin≤totalMax` khi bounded; mọi multiplication/sum an toàn; **`verified_within` chỉ khi totalMax≤budget và required fees complete ở scope đã nhận**. Tổng đúng bằng budget hợp lệ, hơn1đ không hợp lệ. Unknown mandatory fees chỉ conditional, unknown price không có committed bounded plan.

Vị trí gọi:

1. Trước tool result/evidence trả cho composer; không cho LLM nhìn một plan được đánh dấu hợp lệ trước validation.
2. Trước chuyển thành card và final result/commit; invalid card không được lọt qua SSE, kể cả deterministic fallback hoặc injected/malformed tool.
3. Mọi replan sau budget/preferences/count/party/draft/mode/zone thay đổi; clear pending refs của plan cũ.
4. Trước accept/review/handoff: dữ liệu mới, exact prices chỉ nhận khi orderable, atomic reject nếu fail. Không tự đổi quantity cho khách.
5. Replay giữ nguyên historical response cho idempotency; không tái gắn guarantee hiện tại. Fresh redisplay/action bắt buộc revalidate; compatibility adapter không biến historical estimate thành live confirmation.

Không yêu cầu gọi DB cho từng token/card: validation gắn một snapshot/constraints hash hợp lệ mỗi completion; publication verify hash/status. Không stream tiền/guarantee chưa validate rồi mới sửa ở completion.

## 8. Kế hoạch triển khai và phụ thuộc

### 8.1. Lộ trình tổng thể

Tất cả checkbox dưới đây **chưa triển khai trong đợt audit**. Ước lượng **ngày công kỹ thuật**, không gồm chờ nhà hàng xác minh phí/khẩu phần/variants, quyền deploy hay approval provider. Tổng sơ bộ **24–37 ngày công**, chỉnh sau B00/B01. Có thể chia milestones nhưng không được gọi full prompt hoàn thành khi thiếu variants/fee safety/runtime.

| ID | Gói việc | Ưu tiên | Phụ thuộc | Công dự kiến |
|---|---|---|---|---:|
| B00 | Chốt baseline, target và acceptance fixtures | P0 | Không | 1–2 |
| B01 | Commercial data contract, menu truth và prerequisites | P0 | B00 | 1–2 |
| B02 | Understanding/context: money, count, scope, correction | P0 | B00 | 2–3 |
| B03 | Normalized price bounds + safe arithmetic | P0 | B01 | 1–2 |
| B04 | Authoritative fee policy + final validator core | P0 | B01–B03 | 3–4 |
| B05 | Real variants end-to-end + tài chính parity | P1 bắt buộc full scope | B01, B03 | 4–6 |
| B06 | Eligibility/discovery split + recall/pool | P1 | B01–B04 | 2–3 |
| B07 | Quality scoring + variable-cardinality optimizer | P1 | B02–B06 | 3–4 |
| B08 | Tool/contract/session/draft integration | P0 trước release | B04–B07 | 2–3 |
| B09 | UX/card/prose/SSE nhất quán | P1 | B08 | 1–2 |
| B10 | Regression/property/integration/quality evidence | P0 trước release | Xuyên suốt, chốt B09 | 2–3 |
| B11 | Deployment, real runtime acceptance, handoff/rollback | P0 trước release | B10 + quyền/môi trường | 2–3 |

Critical path: **B00 → B01/B02 → B03 → B04/B05 → B06 → B07 → B08 → B09 → B10 → B11**. Viết tests red từ đầu mỗi gói; B10 không phải đợi cuối mới test.

Milestones:

- **M1:** parser/source flags/normalization đúng, browse thấy range/unknown mà không mở cửa ordering sai. Chưa dynamic optimizer.
- **M2:** dynamic advice fixed/range + typed conditional fees + final validator + UX chạy trên isolated stack. Nếu variant chưa xong phải ghi partial, không full completion.
- **M3:** variants và phí thật/order parity đạt; 20-case matrix + regression xanh; code đủ điều kiện deploy.
- **M4:** đúng artifacts deploy, real Tiger provider smoke PASS trên approved target và bàn giao đủ evidence. Mới được gọi hoàn tất runtime.

### B00 — Baseline, target, fixtures và quyền

- [ ] Ghi working-tree diff inventory, commit/release artifact hash, frontend/backend URL, schema migration list, flags và config hiệu lực dạng đã redacted. Không dump env/service-role/provider key.
- [ ] Xác nhận narrow UUID fix local và bản cloud đã chứa hay chưa; giữ seeded-ID regressions. Không deploy cả dirty tree không review.
- [ ] Tạo disposable stack theo contributing; xác nhận marker trước fixture mutations. DB cloud hiện tại chỉ làm public read evidence.
- [ ] Tạo synthetic menu fixtures versioned gồm fixed/range/market/unknown, flags, profiles provenance, zero/unknown fees, real variants. Dev/holdout tách biệt.
- [ ] Ghi baseline commands mục1 và 20-case acceptance mapping; runtime/prerequisite status riêng.
- **Đạt khi:** biết rõ môi trường nào test/deploy, fixture không chứa khách thật, có baseline tái lập và lý do từng suite pending.

### B01 — Data truth và contract inventory

- [ ] Audit columns, active categories, source/version; map bestseller/new đầy đủ; không thay signature thành bestseller.
- [ ] Hợp nhất commercial read contract với Menu Domain, preserve details/images/mode và verified profiles; giữ degrade an toàn khi optional metadata thiếu.
- [ ] Truy vết tất cả caps2–3/8, DTO/storage/session/hash/UI consumers trước đổi schema.
- [ ] Nhà hàng xác nhận dữ liệu giá bounds, policy VAT/fees/inclusion/rounding, serving/option thực. Không lấy synthetic fixture làm evidence nhà hàng.
- **Đạt khi:** metadata thiếu được báo rõ; một source/version nhất quán cho solve; price/availability không bị profile AI override.

### B02 — Understanding và context

- [ ] Refactor parser/tokenizer tiền; fix chính câu ví dụ và combo/grouped digits/per-person scope; reject/clarify ambiguous numbers.
- [ ] Parse exact/preferred distinct count, per-item quantity, meal context, party composition và clear/correction. Không coi “4 người” là “4 món”.
- [ ] Bỏ mandatory party gate cho budget-only advisory, giữ clarification khi cần per-person/portion guarantee. Không default đủ2 người.
- [ ] Extend session/context compat, changed fields, invalidation và follow-up (“giảm còn700k”, “thêm1 món”, “đổi cả mâm”, “chỉ bán chạy”). Không tự đổi durable memory.
- **Đạt khi:** câu prompt có budget1000000 và bestseller intent đúng; mọi cập nhật recompute có constraints hash mới, không giữ guarantee cũ.

### B03 — Price normalization

- [ ] Pure checked integer arithmetic, normalize fixed/range/variant/unbounded theo mục6.3; explicit errors.
- [ ] Update candidate DTO giữ min/max; unknown không đổi thành free0; no invented variant.
- [ ] Audit range DB constraint và migration mới nếu cần, report bad records trước validate constraint; không chạy seed delete.
- **Đạt khi:** mọi line có authoritative bound hoặc reason unbounded; max chứ không min/avg dùng để proof.

### B04 — Fees + validator core

- [ ] Authoritative fee policy schema/admin read + completeness, zero evidence, mode/zone/effective dates/tax rule; no invented tax defaults.
- [ ] Extract shared pure fee rules từ quote đúng ownership; SQL parity tests giữ financial invariants. Nếu khoản phí thực sự mới, update quote/order contracts và SQL cùng transaction boundary, có review riêng.
- [ ] Interval bound qua free-threshold/rounding/tax bases, minimum delivery, missing zone; scope/add/replace và draft cost tính một lần.
- [ ] Implement independent validator + typed budget guarantee status; adversarial tests giả subtotal/fees/flag/count.
- **Đạt khi:** false guarantee bằng0 trong exhaustive fixtures/property runs; unknown fees luôn conditional; exact cap và cap+1 behavior đúng.

### B05 — Variants có căn cứ

- [ ] Add migration/table/index/RLS/admin API/options source + version, parent relation và availability/mode; không đổi giá range thành sizes.
- [ ] Extend portable DTO/legacy adapter, draft/cart identities, merge keys, pending/referent và UI selected option.
- [ ] Extend quote normalization/hash/signed payload/request validation/order SQL/line snapshots + safe old-data read; idempotency nhận variant identity.
- [ ] Test option mismatch/stale/deleted/unpublished/price changed và duplicate parents/canonical keys.
- **Đạt khi:** engine chọn real affordable option, đơn giá lấy đúng source, option đi xuyên guarded draft/isolated quote-order test; old non-variant orders không regression. Không tạo đơn thật.

### B06 — Retrieval và candidates

- [ ] Tách discovery (mọi price mode), advisory (bounded price eligibility) và exact ordering (fixed/verified real variant).
- [ ] Dùng cờ bestseller thật, strict vs preference; missing popularity neutral. Fix new-flag mapping trong cùng contract, không mở rộng sang suy sales analytics.
- [ ] Internal pool48 có truncation/recall metrics, không bị wire top8 làm giới hạn optimizer; hard constraints áp trước scoring.
- [ ] Knowledge outage khác missing serving khác empty menu; basic commercial lookup không lệ thuộc config không liên quan, allergy vẫn fail-closed.
- **Đạt khi:** range bestseller xuất hiện trong advice hợp lệ; market/unknown vẫn đọc được detail nhưng không guarantee; không nói unavailable thành “không có món”.

### B07 — Scorer và optimizer

- [ ] Implement versioned component score/reason/provenance theo mục7, over-order/redundancy penalties; không count/spend objective trá hình.
- [ ] Variable cardinality1..resource ceiling, quantities/options, exact count; stable expansions/work cap/canonical dedup.
- [ ] Exact exhaustive oracle cho small fixtures; compare bounded winner quality/feasibility/search completeness. Measure recall separately.
- [ ] Không promote offline planner cũ nguyên trạng; remove/mark legacy strategy để không có hai production truths.
- **Đạt khi:** valid1/2/3/4/5+ đều được sinh khi phù hợp; ít món thắng và nhiều món thắng có fixtures độc lập; same semantic input/snapshot/config cho cùng kết quả khi không watchdog cancel.

### B08 — Tools, protocol, session và draft

- [ ] Replace planner facade/tool execution nhưng giữ auth/capability/read budgets. Constraint model lấy server, không tin tool args model.
- [ ] Align action/card/pending/display/context caps/version theo mục6.5, migrate/compat old sessions và historical replay; không silent drop alternative.
- [ ] Validate trước evidence/cards/commit; invalid tool output không được composer hoặc SSE biến thành guarantee.
- [ ] Revalidate on accept/budget change/quantity/price review/handoff, all-or-none batch; preserve CAS/idempotency/stale action checks.
- [ ] Range estimate có CTA riêng; fixed-only resolver/order guards giữ nguyên cho unresolved prices. Variants chỉ orderable sau B05.
- **Đạt khi:** chọn mâm1/5+/30 món trong supported policy không schema fail; stale refs/malformed plans bị chặn, không partial acceptance.

### B09 — UX, prose và streaming

- [ ] Extract frontend price formatter/presentation helper dùng lại detail; card hiển thị quantities, verified bestseller badge, interval food/fees/total, scope, certainty, as-of.
- [ ] Natural prose có lý do từ reason codes, không nói thuật toán, không hứa ngon nhất/đủ ăn khi thiếu data; dùng deterministic amount formatting cho totals/savings.
- [ ] Cập nhật guard/compact tool evidence cho các amount fields mới; giữ numerical grounding, không chỉ whitelist số rồi cho LLM tự làm toán.
- [ ] Responsive/accessibility, clear conditional text, safe CTA disabled cho unresolved/unknown; input tiếp tục dùng được; không duplicate completion.
- **Đạt khi:** text/card/server totals thống nhất; không bao giờ thấy guarantee tiền tạm trước final validation; Stop/retry không làm mutation giả rollback.

### B10 — Kiểm thử và quality gate

- [ ] 20-case matrix mục9 thành executable tests; add parameterized/property/exhaustive oracle, permutation/determinism/resource tests.
- [ ] Update legacy tests 2–3-count/party clarification một cách có chủ đích; giữ assertions pricing/safety/ownership, không xóa market-cart restrictions để green.
- [ ] Disposable PostgreSQL/browser integration và policy tests cho migrations/variants/fees; quote/order parity và no partial mutation.
- [ ] Full offline checks, record warnings/failures; benchmark p50/p95/p99 trên catalog98,200,2000+truncation và pathological variants/quantities.
- **Đạt khi:** mọi regression liên quan có report, quality không chỉ feasibility; chưa có runtime approval vẫn ghi pending, không giả PASS.

### B11 — Deploy và acceptance

- [ ] Review artifacts/dependencies/migrations/feature gates, release hash; backend compatible deploy trước UI dùng schema mới, hoặc negotiated rollout.
- [ ] Apply additive migration trên approved target sau backup/review; no seed/reset shared DB; deploy relevant Edge Function artifacts chứa shared domain, không suy từ frontend build.
- [ ] Verify backend source/schema/flags/provider destination/credentials presence/allowlist redacted; user approval riêng cho real-provider calls và approved test session.
- [ ] Real Tiger smoke và budget scenarios; report PASS/FAIL/CHƯA KIỂM ĐỊNH cùng request IDs/time/URL/artifact.
- [ ] Canary observe, rollback drill, handoff runbook + known data gaps.
- **Đạt khi:** runtime thực tế PASS theo AGENTS, không chỉ server tests injected hoặc HTTP200.

## 9. Ma trận kiểm thử và nghiệm thu

### 9.1. Hai mươi scenario bắt buộc từ prompt

Trạng thái “partial” dưới đây nói về baseline đã đọc, **không là test mới đã viết**. Tên suite mới là đề xuất.

| ID | Scenario | Baseline | Assertion/fixture phải thêm | Tầng |
|---|---|---|---|---|
| T01 | Budget nhỏ phù hợp1–2 món | Thiếu1 món | Menu giá có căn cứ; optimizer trả1 hoặc2 theo quality, không min2 | Pure+tool+UI |
| T02 | Budget phù hợp3 món | Partial fixed greedy | 3 thắng theo score, không template default; validated max | Pure+integration |
| T03 | Budget phù hợp4 món | Không hỗ trợ | 4 distinct thật, quantity separate, card/action đi xuyên | Pure+UI+integration |
| T04 | Budget phù hợp5+ món | Không hỗ trợ | 5/6 distinct hợp bữa và cap, không schema drop | Pure+tool+UI+integration |
| T05 | Nhiều cardinality cùng valid | Thiếu | 2/3/4/5 candidates valid, stable best theo score | Pure/exhaustive oracle |
| T06 | Ít món chất lượng hơn nhiều | Thiếu | 3 highly matched beats5 redundant, score reasons đúng | Pure+holdout |
| T07 | Nhiều món thực sự tốt hơn | Thiếu | 5 coherent beats3, không mặc định phạt nhiều món | Pure+holdout |
| T08 | Giá fixed | Partial mạnh | min=max, quantity totals, safe ints,0 verified, cap+1 | Pure+DB parity |
| T09 | Giá range | Detail only | Bounds đầy đủ, max dùng validator, quantity×bounds | Pure+tool+UI |
| T10 | Mixed fixed/range | Thiếu | Recompute mixed min/max, no fixed-price draft bypass | Pure+integration |
| T11 | Min fits, max exceeds | Thiếu | candidate E950k..1.1m bị reject với budget1m | Pure+adversarial |
| T12 | Max bằng budget | Fixed partial | range totalMax=budget PASS nếu fees complete; +1 reject | Pure+integration |
| T13 | Budget đổi giữa hội thoại | Partial draft/context | 1m→700k replan, invalidate pending old, không giữ guarantee | Tool+session+browser |
| T14 | Chỉ định count/quantity | Partial draft qty | đúng5 món khả thi; draft2 + final5 → thêm3; replace5 →5; thêm5 mới khác final5; exact count infeasible proof/unknown; qty2 khác2 món | Parser+optimizer+actions |
| T15 | Giá chưa xác minh | Partial exclusion | Missing max/market0 không guarantee/free; typed reasons/detail | Pure+tool+UI |
| T16 | Thiếu bestseller evidence | Chưa đúng | missing flags/rank, no signature synonym; known-none khác unavailable | Retrieval+tool+UI |
| T17 | Real variant | Thiếu | parent/option real identity, choose affordable option, unavailable/mismatch fail | Pure+DB+quote+UI |
| T18 | Phí làm vượt budget | Thiếu | food980k+fee30k>1m reject; missing fees conditional; threshold cross | Cost+validator+DB |
| T19 | LLM/tool trả quá chi phí | Partial prose/schema | Forged subtotal/fee/PASS/count, invented IDs/price bị semantic reject trước SSE | Gateway+orchestrator+stream |
| T20 | Same input/data scoring stable | Partial offline | Permute catalog, stable tied score/quantities/options; count cap reproducible | Pure+property+benchmark |

T01–T07 không dùng ngân sách làm expected count một cách máy móc. Fixtures được thiết kế có nhu cầu/context khác nhau để chứng minh thắng theo quality, không chỉ affordability. Dùng example A/B/C/D/E trong prompt như acceptance fixture trừu tượng: E fail; A–D chọn theo context/score, không mặc định5 hoặc990k.

### 9.2. Bổ sung bắt buộc ngoài20

- Money parser exact prompt, combo+budget, grouped currency, `1tr5`, per-person unknown party, budget clear/correction, no accidental price-question→budget; count tiếng Việt/không dấu/“thêm”/“đổi”.
- Food versus final-bill scope, additive draft/replace, existing total đã hơn budget; fee tính một lần cho combined meal, không tính riêng từng candidate/draft rồi cộng sai.
- VAT inclusive/exclusive, rounding tại từng line/total đúng rule; known-zero versus unknown; free-shipping breakpoint, min-delivery; fee policy expired/unknown zone.
- Negative/min>max/missing max/overflow/safe-integer limits; zero/malformed quantities, duplicate parent variants, invalid UUID-compatible IDs; no human-key leakage.
- Requested cardinality >resource cap không silently truncate; capped search không kết luận impossible. Search quality small fixture so exact oracle; quantity bounds/variants cap có status.
- Allergy verified/stale/unverified/contains/may-contain; explicit dietary requirements without evidence; imported preferences không override current correction. Không dùng sample seed để lấp data outage.
- Adversarial tool/card injection giá/tổng đã có trong evidence nhưng arithmetic sai; guarantee sai scope; malformed fee completeness; expiry/hash mismatch.
- Multi-plan display/pending>8 và support boundary30/60; ordinal/reference không chọn nhầm option; explicit all-or-none acceptance, stale version, duplicate request, CAS race, changed price after display.
- Persisted old session đọc được; replay historical không ghi lại memory/mutation, không reissue fresh guarantee; new request revalidate.
- SSE pending→validated cards→single completion, Stop/retry/disconnect, no false rolled-back mutation; keyboard/mobile/desktop input/CTA accessibility.
- Cart/order/payment/reservation/auth regression không bị thay logic ngoài scope; variants order test chỉ trên disposable DB, không submit thật.

### 9.3. Tái sử dụng test assets và vị trí thêm

Tái dùng, mở rộng có chủ đích:

- [understanding tests](../tests/server/concierge-understanding.test.ts), [turn constraints](../tests/server/concierge-turn-constraints.test.ts), [A03](../tests/server/concierge-a03.test.ts), [A04](../tests/server/concierge-a04.test.ts): input/correction/clarification/context.
- [meal planner tests](../tests/server/concierge-meal-planner.test.ts), [A08](../tests/server/concierge-a08.test.ts): exact caps, canonical keys, atomic draft, bounded-resource baseline. A08 có assertions2..3 phải cập nhật khi spec đổi, không dùng lại làm bằng chứng dynamic.
- [retrieval contract](../tests/server/concierge-menu-retrieval-contract.test.ts), [grounding](../tests/server/concierge-grounding.test.ts), [A01–A02](../tests/server/concierge-a01-a02.test.ts): price modes, source flags, seeded IDs/detail behavior.
- [quote tests](../tests/server/quote.test.ts), [menu retrieval integration](../tests/integration/concierge-menu-retrieval.test.ts), [AI profiles integration](../tests/integration/menu-ai-profiles.test.ts): authoritative SQL/fee/variant parity.
- [draft UI tests](../tests/unit/concierge-draft-ui.test.tsx), [real menu pricing UI](../tests/unit/real-menu-pricing.test.tsx), [streaming UI](../tests/unit/concierge-chat-streaming.test.tsx): presentation/action safety.

Thêm suites thuần `dynamic-price`, `dynamic-fees`, `dynamic-validator`, `dynamic-quality`, `dynamic-optimizer`, fixtures/scenarios versioned và integration dynamic recommendation dưới test ownership hiện hành. Có thể dùng seeded deterministic generator + exhaustive small oracle trước thêm library property test. Nếu thêm dependency phải review và chạy architecture checks.

### 9.4. Commands và bằng chứng cần ghi khi triển khai

```powershell
npm.cmd run typecheck
npm.cmd run typecheck:server
npm.cmd run lint
npm.cmd run check:architecture
npm.cmd run test:architecture
npm.cmd run test:server
npm.cmd run test:unit
npm.cmd run build

# Sau khi đã xác minh disposable DB + browser prerequisites:
npm.cmd run test:policies
npm.cmd run test:integration
npm.cmd run test:e2e:mock

# Streaming/session regression tối thiểu khi contracts/cards/SSE bị ảnh hưởng:
npm.cmd run test:integration -- tests/integration/concierge-streaming.test.ts tests/integration/concierge-browser.test.ts tests/integration/concierge-v2-persistence.test.ts
```

Lựa chọn thêm E2E thực theo config/test stack đã review; tên script “real” không tự nghĩa real-provider. Không gọi paid eval trong mặc định CI/test/pre-commit. Mọi failure phải lưu nguyên nhân, scope, next action; không giảm assertion hoặc thay provider/stub để gắn PASS.

## 10. Triển khai, quan sát, rollback và bàn giao

### 10.1. Safe rollout

1. Chốt approved target và maintainer review clean release diff; baseline dirty tree không deploy mù.
2. Additive DB migrations + compatible readers trước writers; không sửa migration cũ, không reset/seed cloud. Policy data chưa xác minh giữ unknown.
3. Gate server-owned `dynamic_budget_recommendation` nếu cần, default off; không thêm unreviewed default-on provider behavior. Gate tách khỏi auth/order guards; hỗ trợ canary trên approved test traffic.
4. Deploy backend Edge Function/shared artifacts, xác minh revision/health/menu/config/schema compatibility; sau đó build/deploy affected frontend và refresh URL Tiger hiện có. Không mở server thay thế rồi gọi là đã cập nhật target.
5. Canary exact prompt + recommendation/cardinality/range/fees/variants; đo rate invalid plan, unknown fee và latency. Không đưa private conversation vào logs.
6. Feature off khi incident không được fallback greedy rồi gắn guarantee mới; dùng advisory safe fallback hoặc abstain rõ ràng. Unknown provider/knowledge/menu error không được fabricate answer.

### 10.2. Observability không nội dung riêng tư

Ghi enum/count/latency/version: parse outcome, constraint change kinds, eligible/pool size, exclusion reason counts, truncation, expanded states, search status, scorer/validator versions, budget_check/scope, fee completeness, plan cardinality/quantity counts, validation rejection code, stale snapshot, delivery completion/repair/cancel.

Không log raw prompt/transcript, địa chỉ, allergy text, capability/token/key; request IDs và hashes không chứa raw data. Có thể cần redact cả số budget/giá trị tài chính khỏi analytics user-level; metrics dùng buckets, không dump tool payload.

Operational gates đề xuất: zero invalid guaranteed plan trong kiểm thử và runtime mẫu; no regression deterministic hard cap; optimizer p95 mục tiêu≤200ms trên fixture98 với phần cứng ghi rõ; không vượt existing per-tool4s/turn25s/model3/tools6 hoặc token-estimate budgets. Nếu thay các budget đó phải có profiling/review riêng, không tăng im lặng để suite chạy qua.

### 10.3. Real Tiger acceptance sau explicit approval

Trước thử xác nhận URL frontend/backend, artifact hash, schema, flags, effective provider/URL allowlist và credential presence redacted. Session guest/test mới, dữ liệu tổng hợp, không dùng cart/cuộc hội thoại cá nhân có sẵn.

- Greeting nhận reply hoàn tất không rỗng; lượt2 input vẫn dùng được.
- Restaurant fact + menu price khớp authority hoặc abstain đúng.
- Câu prompt1 triệu bestseller: nhận đúng budget, nhãn có nguồn; nếu thiếu party có advice conditional hoặc hỏi phù hợp, không tự hứa đủ nhóm.
- Scenarios đại diện fixed/range/mixed/unknown fees, cap bằng/vượt, requested count, real variant khi test data cho phép; UI min/max/fees khớp server.
- Đổi budget/preference/quantity giữa lượt, plan cũ stale và plan mới validate lại.
- Fixed/real exact variant plan: nhận rõ vào guarded draft, chỉnh quantity và review đúng server. Range unresolved: CTA không chuyển estimate thành giá đã chốt.
- Handoff chỉ isolated test cart; không submit order/payment/reservation thật, không sửa địa chỉ hay bật durable memory.
- Desktop/mobile, status/text/completion ổn định, không loading kẹt/disabled input/duplicate completion/unhandled exception. Stop/retry/disconnect không suy mutation đã rollback.

HTTP200/SSE completed vẫn có thể trả nội dung sai; phải kiểm semantic result. Real provider không thay bằng request interception/injected orchestrator/canned responses. Không có approval/provider access/approved environment thì ghi **“Code đã kiểm định; chatbot thực tế chưa nghiệm thu”** kèm prerequisite cụ thể.

### 10.4. Rollback và handoff

- Rollback bằng gate/artifact trước, không destructive rollback/drop variant/fee/history tables đang được dùng. Old readers phải hiểu historic base items hoặc compatibility shape.
- Nếu release sửa financial quote/order flow, coordinate frontend/backend/SQL versions, signed quote TTL và pending request idempotency; không tái dùng quote cũ dưới price semantics mới.
- Có lưu versions/hash cho plan, expire stale actionable refs; rollback không auto chuyển range plan thành fixed hoặc tự giảm lượng.
- Handoff gồm: reviewed files/diff, schema migrations, policy/variant data provenance, scorer weights/version, search caps/completeness semantics, fixtures/20-case results, all commands/results/warnings, environment/time/revision, sanitized HTTP/SSE request IDs, deployed artifacts, known limitations, rollback steps/owner.

## 11. Rủi ro, điều kiện còn thiếu và Definition of Done

### 11.1. Register rủi ro

| Rủi ro | Tác động | Giảm thiểu / owner |
|---|---|---|
| Parser miss budget hoặc lấy budget cũ | Khuyến nghị vượt ý khách | B02 P0 + exact prompt regression; backend owner |
| Bỏ fixed filter nhưng giữ scalar price | False budget guarantee | B03/B04 trước rollout; cost owner |
| Fee unknown bị coi0, threshold sai | Hóa đơn vượt trần | Completeness + interval bounds + quote parity; nhà hàng + finance/backend |
| Range bị coi variant/exact order | Sai giá giao dịch | Advisory/orderability split; B05 full variant boundary |
| Bestseller thiếu mapping/rank | Tư vấn sai nhãn | Commercial fields + provenance; menu owner |
| TopK/cap làm miss feasible set | Kết luận “không có” sai | Internal recall pool + incomplete status + exhaustive oracle |
| Reward role/count lấn quality | Nhiều món thừa/tiêu hết budget | Bounded normalized score + redundancy/over-order + holdout/restaurant review |
| Serving metadata AI/unknown | Cam kết đủ ăn/an toàn sai | Provenance, unknown status, allergy fail-closed; kitchen verification |
| Contract/session caps không đồng bộ | Mất card/accept fail | Inventory2..3/8/ordinals + compatibility + larger-plan integration |
| Cached price/profile stale | Guarantee/action sai dữ liệu mới | Freshness/version/hash, force revalidation trước action |
| Dirty tree/deploy mismatch | Local tests đúng nhưng cloud vẫn lỗi | Reviewed release artifact + backend revision check; maintainer |
| Paid calls/shared DB mutation | Chi phí/rủi ro dữ liệu | Explicit provider opt-in, verified disposable DB, no destructive seed |

### 11.2. Điều kiện cần nhà hàng/maintainer xác nhận

- Policy thực tế VAT đã bao gồm hay chưa, phụ phí bắt buộc, cách làm tròn, mode/zone/threshold và dữ liệu hiệu lực. Nếu chưa có, phát hành conditional UX được nhưng **không final-bill guarantee**.
- Semantics “best seller” là cờ staff curated hay có sales rank; không có rank thì boolean là mức evidence hiện có. Không yêu cầu tạo doanh số giả.
- Serving/meal-role/taste/variant nào được xác minh; thiếu thì giữ unknown, không block mọi discovery.
- Approved deployment target, disposable test environment, reviewer cho financial variants/fees và quyền deploy. Chưa có thì không đánh dấu B11 hoàn tất.
- Explicit user approval cho số lượng/tình huống real-provider smoke. Approval policy công cụ “never” không thay thế opt-in chi phí hoặc cho phép giả PASS.

Không cần chờ mọi metadata đầy đủ để bắt đầu B00–B04. Missing data phải là trạng thái first-class và test được; không phải lý do skip core validator/conditional behavior.

### 11.3. Definition of Done toàn bộ prompt

- [ ] Exact prompt được hiểu đúng budget và bestseller intent; count/quantity/context/party corrections được giữ đúng qua nhiều lượt.
- [ ] Không còn business default2/3/4 món; có thể trả1/2/3/4/5+ theo quality và constraints; resource ceilings được công bố, không làm target.
- [ ] Fixed/range/real variants normalize đúng; unknown max không guarantee; range không bị biến thành order price.
- [ ] Mọi plan được gọi hợp lệ đã qua independent validator, `validated totalMax` **đã gồm mọi mandatory charges theo scope** được bound đúng theo policy, không cộng phí lần hai; equality cap đúng.
- [ ] Fee incompleteness/unknown serving/popularity/profiles được nói rõ, không giả data hoặc guarantee toàn hóa đơn.
- [ ] Scoring versioned/testable, fewer-vs-more đều có evidence thắng phù hợp; không ưu tiên count/spend cao nhất.
- [ ] Stable same semantic input/snapshot/config, deterministic count cap; search incomplete không giả global optimum/infeasible proof.
- [ ] Tool/cards/session/SSE/UI/draft/quote/variants nhất quán; all-or-none acceptance, current prices, CAS/idempotency/safety nguyên vẹn.
- [ ] 20-case matrix, property/adversarial/exhaustive small oracle, disposable DB/browser regression và quality holdout đạt; warnings/failures công khai.
- [ ] Đúng backend/schema/frontend artifacts đã deploy vào target được duyệt; không suy từ build.
- [ ] Real Tiger provider acceptance PASS, có evidence môi trường/time/revision/scenarios, rollback/handoff hoàn chỉnh.

### 11.4. Trạng thái bàn giao của tài liệu này

**Đã thực hiện:** audit source và architecture liên quan; fresh public-menu read; tái hiện parser lỗi bằng hàm local; chạy lại8 offline gates; đối chiếu yêu cầu và viết plan chi tiết.

**Chưa thực hiện:** business code mới, test scenarios mới, migrations, DB fixtures/integration/policies, browser E2E, provider smoke, deployment hoặc nghiệm thu Dynamic Budget-Aware runtime. Các mục B00–B11 là công việc tiếp theo, không checkbox hoàn thành giả.

**Runtime chatbot: CHƯA KIỂM ĐỊNH trong audit này.** Báo cáo lịch sử gần nhất ghi cloud menu lookup FAIL và local fix chưa deploy; không có bằng chứng mới để nâng trạng thái đó thành PASS.

**Nguyên tắc triển khai cuối cùng: Recommendation Quality > Item Count; Budget Constraint và tính trung thực dữ liệu luôn là điều kiện bắt buộc.**