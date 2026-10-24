# Runbook A09–A10 — 19/10/2026

Trạng thái: chuẩn bị bàn giao cục bộ, **chưa deploy; release bị chặn**. Người dùng đã chọn chỉ kiểm định cục bộ trong đợt này. Runbook không phải quyền deploy, thay đổi môi trường hoặc gọi provider có phí.

## 1. Gói triển khai và phiên bản

- **Gói A09 backend:** `context.ts`, `response-guard.ts`, `orchestrator.ts`, `observability.ts`, `runtime.ts` trong `supabase/functions/_shared/concierge/`. Triển khai cùng nhau vì orchestrator/runtime dùng error type và metrics mới. Không tách rollout các imports phụ thuộc nhau.
- **Gói A10:** scripts/tests và artifacts kiểm định; không có runtime flag, database migration hoặc thay đổi frontend cần deploy trong đợt này.
- HEAD nền: `2fbbc65da9dd2425af5822abfd6d00623c72473f`. HEAD không nhận diện đủ phiên bản vì A01–A09 chưa commit. Khi đóng gói, dùng `tiger-a09-a10-baseline/delta-manifest.json` và hashes `after_sha256` của từng file để xác minh source đã đóng gói. Sau khi người quản lý tạo release, ghi image/build digest và commit cụ thể vào phiếu nghiệm thu.
- Giữ greedy mặc định. Bounded planner vẫn chỉ offline. Không thêm rollout flag hoặc giả định có sẵn rollout theo phần trăm.

## 2. Gates trước phát hành

| Gate | Điều kiện đạt | Bằng chứng hiện có | Trạng thái |
|---|---|---|---|
| Code checks | Hai typechecks, lint, architecture/checker tests, unit/server, build qua | `checks-v1.json`; 659 server, 196 unit, 8 architecture tests | PASS cục bộ |
| Critical guard | Không vi phạm trong regression bắt buộc, repair tối đa một lần, fail đóng | 52 guard cases, 45 A09 regressions và suites cũ | PASS trong phạm vi fixture; không bảo đảm mọi paraphrase |
| Facts/state | Tool thực thi, payload model, cards và draft được kiểm đúng | A01–A09 suites; no-commit khi guard thất bại | PASS synthetic/injected |
| Benchmark cũ | Khắc phục lỗi fixture/adapter hoặc quyết định thay thế benchmark có review và bằng chứng tương đương | Hai tests đã lỗi ở baseline, vẫn lỗi; không đổi assertions | BLOCKED |
| 120 scenarios | Manifest canonical, expected outcomes, 80/40 development/holdout, mapping kết quả toàn chuỗi | Kế hoạch chỉ phân bổ 120; fixtures cũ và mới khác mức bằng chứng | PENDING |
| Database/integration | Disposable DB đã xác minh; streaming/browser/persistence và memory/draft suites cần thiết qua | Chưa có DB/prerequisites hợp lệ | PENDING |
| Human evaluation | Rubric cùng fixture/môi trường, số người/số mẫu, ≥4/5 theo kế hoạch và không lỗi critical | Phiếu trống `human-evaluation.md`, chưa có người chấm | PENDING |
| Latency | Baseline/after cùng môi trường, đủ mẫu để đánh giá p95, không vượt caps | Chỉ sáu mẫu synthetic; không kết luận p95 | PENDING |
| Runtime | Website Tiger thật, frontend/backend/source/schema/flags/provider xác minh, fresh test session | Không thực hiện theo lựa chọn local-only | CHƯA KIỂM ĐỊNH |

Không phát hành nếu bất kỳ critical gate nào FAIL hoặc chưa có bằng chứng bắt buộc. Baseline error không biến thành PASS chỉ vì thay đổi A09 không tạo ra nó.

## 3. Quy trình rollout khi được duyệt riêng

1. Xác minh frontend URL, backend destination, source/build digest, schema và flags trên môi trường được bàn giao. Chỉ kiểm credential presence; không xuất keys, capability, raw transcript hoặc secret-bearing logs.
2. Hoàn tất các gates còn chờ. Không dùng injected tests, mock browser hoặc một provider khác thay nghiệm thu target.
3. Đóng gói backend A09 cùng các thay đổi A01–A08 đã được review. Kiểm hashes của từng gói; không coi toàn bộ dirty diff với HEAD là riêng A09.
4. Triển khai vào môi trường test đã duyệt. Không đổi provider/model/budgets, consent, memory epoch hoặc bật bounded planner.
5. Sau khi có chấp thuận provider riêng, chạy chuỗi guest/test mới: chào → lượt hai → facts/menu/giá → gợi ý → nhận draft → đổi lượng. Handoff chỉ trong giỏ test cô lập. Kiểm desktop/mobile, Stop/retry/disconnect, input, completion và canonical state; không tạo order/payment/booking thật.
6. Ghi command, thời gian, phiên bản, điều kiện và kết quả; chỉ nâng trạng thái runtime khi có bằng chứng. Không suy backend đã deploy từ frontend build xanh.

## 4. Kill switch ở request path

Nguồn: `public-api/concierge-handlers.ts` gọi `getConciergeFeatureFlags(pool, true)` trước rate limit, runtime/model execution cho `/concierge/chat`, `/concierge/action`, `/concierge/feedback`.

- Global gate thực tế là **`concierge_disabled`**. Khi được duyệt thay đổi môi trường, người vận hành đặt flag có hiệu lực rồi gửi request test để xác minh `DEPENDENCY_UNAVAILABLE`, không model/tool/mutation execution. Không chỉ quan sát nút UI.
- Ba regression A09 gọi chính request handler với fixture DB trả flag true; model không được gọi. Đây là bằng chứng request path cục bộ, chưa chứng minh flag đã bật trên website đang chạy.
- `CONCIERGE_DISABLED` là default từ environment; row `system_settings.concierge_disabled` có thể ghi đè default. Phải xác minh effective value và response, không coi chỉ đặt env là đủ.
- `provider.enabled=false` có thể chuyển sang environment provider qua `llm-config.ts`, **không phải global kill switch**.
- `CONCIERGE_STREAM_V2_DISABLED=true` chỉ đổi transport sang legacy; không tắt chatbot. Health circuit breaker chỉ là protection dependency, không thay global gate.
- Claim/prepare-claim đi trước global chat gate trong handler; không suy rằng flag chặn mọi endpoint concierge.
- Menu/cart/checkout thủ công nằm ngoài gate này. Không bật cờ tắt đặt món toàn hệ thống khi chỉ cần ngừng trợ lý. Việc đặt và gỡ flags trên runtime thật chưa thực hiện.

## 5. Điều kiện dừng hoặc rollback

Dừng rollout khi có claim sai transaction/allergy, ownership/consent/epoch vi phạm, ambiguous acceptance gây mutation, sai tiền/hard budget, state/cards lệch, input kẹt, duplicate completion, retry tạo tác dụng lặp, p95/error rate vượt ngưỡng đã chốt hoặc source đang chạy không khớp artifact.

Không che lỗi bằng canned answer, ẩn error banner, bỏ guard, nới allowlist hoặc đổi provider để smoke test đạt.

## 6. Hoàn tác riêng A09–A10

Baseline nằm ngoài repo: `C:\Users\USER\Downloads\New Agent\tiger-a09-a10-baseline`.

1. Đọc `delta-manifest.json`; mỗi đường dẫn có kind và before/after SHA-256. `before/` chứa workspace trước A09, đã gồm A01–A08 chưa commit; `after/` chứa nội dung bàn giao của các file thay đổi.
2. So SHA-256 file hiện tại với `after_sha256`. Nếu khác, giữ công việc mới và merge từng hunk; không khôi phục cả file hoặc áp reverse patch mù.
3. Nếu hashes còn khớp và được duyệt hoàn tác, file modified có thể lấy lại nội dung từ `before/`. File added chỉ được gỡ sau khi xác nhận không có thay đổi hoặc dependency mới cần giữ.
4. Hoàn tác năm backend files A09 cùng nhau; giữ nguyên code A01–A08 trong baseline. Không dùng Git HEAD để restore toàn bộ file dùng chung. `a09-a10.patch` là tài liệu đối chiếu, không phải lệnh tự động rollback.
5. Không reset/clean repository, không xóa sessions/database, không sửa consent hoặc memory epoch, không khôi phục fact đã quên. Không lấy dữ liệu production từ bản sao cũ để phục hồi.
6. Không có thay đổi session/database schema hoặc public wire contract riêng A09 cần migration ngược. Các yêu cầu compatibility và epoch của A03–A05 vẫn phải được giữ.
7. Kiểm lại code checks, manual menu/cart/checkout và runtime smoke trên phiên test khi có quyền phù hợp. Ghi phiên bản và bằng chứng sau rollback.

**Runtime chatbot: CHƯA KIỂM ĐỊNH.**
