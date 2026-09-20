# Plan thực thi concierge

## Kiến trúc đích và giới hạn

Một main LLM hiểu/diễn đạt/chọn typed tools. Conversation engine quản lý state và policy. Recommendation engine tính lượng/giá và validator deterministic. PostgreSQL và business services giữ source of truth. Mutation đi qua durable confirmation/action execution; không gọi trực tiếp RPC rồi mới quyết định hành động có hợp lệ không.

Không chọn thêm agent hoặc microservice để giải quyết lỗi orchestration. PostgreSQL full-text trước; pgvector chỉ thêm khi eval chứng minh cần. Tái sử dụng nền tảng hiện có theo thiết kế gốc.

## Vấn đề baseline cần đóng

Các phát hiện của review ngày 2026-09-20 là đầu vào cần tái hiện, không mặc định file/line còn bất biến:

| ID | Finding | Owner |
|---|---|---|
| F01 | Replay trả receipt cũ cho quote/payload khác | C02 |
| F02 | RPC và conversation CAS tách rời, race/lỗi sau commit | C02 |
| F03 | Pending fingerprint/expiry/payload chưa bảo vệ đầy đủ confirmation | C02 |
| F04 | Đặt bàn tự điền Quý khách và thời gian +2h | C07 |
| F05 | LLM adapter có nhưng chưa được runtime gọi | C05 |
| F06 | Customer favorites query dùng is_available thay available | C08 |
| F07 | Eval tên circuit/reload nhưng không kiểm tra cơ chế tương ứng | C10 |
| F08 | Persistence còn fallback RAM khi DB lỗi; reset/cross-instance cần xác minh | C01 |
| F09 | Order chat chưa phát quote và thu thập đầy đủ qua UI | C06 |
| F10 | Admin knowledge/config/approval và release evidence chưa đủ | C03, C11 |

## Dependency và thứ tự

Mặc định thực hiện tuần tự C00 → C01 → ... → C11. Không spawn agent. Dependencies tối thiểu giúp xác định phần độc lập khi bị chặn:

| Task | Dependency bắt buộc | Đầu ra |
|---|---|---|
| C00 | Không | Baseline, map, test isolation, evidence convention |
| C01 | C00 | Persistent session/state, reset, guest identity |
| C02 | C01 | Durable pending/action protocol, transaction/reconcile |
| C03 | C00 | Authoritative knowledge/admin workflow/retrieval |
| C04 | C03 | Validated proposals và action eligibility |
| C05 | C01, C03, C04 | Main model nối runtime, bounded tools |
| C06 | C02, C04, C05 | Order và cart UI xuyên suốt |
| C07 | C02, C05 | Reservation UI xuyên suốt |
| C08 | C01, C05, C06 | Customer context và reorder |
| C09 | C01, C02, C03, C04 | Feedback, privacy, operational controls |
| C10 | C05, C06, C07, C08, C09 | Eval hành vi đầy đủ, regression CI |
| C11 | C00–C10 | Evidence tổng và review package |

Ví dụ: nếu C02 bị chặn bởi DB test, có thể làm C03 với fixture rõ nguồn; không nối submit C06 trước khi C02 đạt.

## Cổng kiểm soát

| Gate | Điều kiện | Tác động nếu chưa đạt |
|---|---|---|
| G0 | DB test cô lập và baseline C00 | Không chạy integration mutations |
| G1 | Session ownership/persistence/CAS C01 | Không mở flow giao dịch phụ thuộc state |
| G2 | Action binding, transaction và replay C02 | Giữ submit concierge disabled; không gọi thành công giả |
| G3 | Knowledge eligibility + validator C03/C04 | Không xuất recommendation với dữ liệu chưa đủ như đã được duyệt |
| G4 | LLM và UI workflows C05–C08 | Không tuyên bố hoàn thành trải nghiệm end-to-end |
| G5 | Operations/eval C09/C10 | Không đề xuất mở pilot khách thật |
| G6 | C11 reviewer + xác nhận vận hành | Chưa release dù các test tự động xanh |

Gate kỹ thuật do tests chứng minh và reviewer xác nhận. Coding agent có thể tiếp tục implementation sau khi tự kiểm tra đạt, không tự mở production traffic.

## Mapping A0–A7 gốc

| Phase gốc | Task đóng góp | Điều kiện không được bỏ |
|---|---|---|
| A0 | C00, C03 | Owner và dữ liệu thật được quán duyệt vẫn là external gate |
| A1 | C01, C05, C09 | Runtime thực sự gọi model, persistent state và tool policy |
| A2 | C03, C04 | Constraints, budget, serving, allergen, ranking |
| A3 | C04, C06 | Proposal/cart version, action permissions, deduplication |
| A4 | C02, C06 | Quote → confirm → transaction → reconcile/status |
| A5 | C02, C07 | Ngày giờ/name thật, pending reservation, status |
| A6 | C08 | History/favorites/reorder và logout, không chỉ auth |
| A7 | C09, C10, C11 | Feedback, metrics, human review, regression và rollout |

## Rollback và phạm vi file

Mỗi task sở hữu phần thay đổi liệt kê trong file task. Code overlap được xử lý tuần tự. Migration mới theo thứ tự timestamp hiện có, không sửa migration đã áp dụng hoặc xóa dữ liệu để rollback.

Khi lỗi: tắt feature flag tương ứng, giữ status lookup/reconciliation và checkout nền tảng khi còn an toàn. Không rollback bằng xóa transaction đã tạo. Prompt/model/config cần version và đường quay về phiên bản trước đã kiểm thử.

## Đánh giá cuối

Phân biệt ba kết quả: implementation được reviewer chấp nhận; kiểm chứng live provider/infrastructure; phê duyệt dữ liệu và vận hành quán. Không cộng ba kết quả thành “100% hoàn thành” nếu một kết quả còn thiếu. Các task không phải lịch cam kết; estimate thực hiện sau C00 dựa trên code thực tế.
