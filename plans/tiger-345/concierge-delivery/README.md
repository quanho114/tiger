# Tiger Concierge — Bộ giao việc và kiểm soát nghiệm thu

Ngày lập: 2026-09-20. Trạng thái: kế hoạch giao việc; chưa thực hiện các task bên dưới.

## Bắt đầu tại đây

Đây là bộ thực thi cho [thiết kế concierge](../09-concierge-agent-design.md), được lập sau nhiều lần review phát hiện báo cáo hoàn thành chưa khớp đường chạy thật. Không thay đổi mục tiêu sản phẩm hoặc tự đánh dấu code hiện tại đã đạt.

Đọc theo thứ tự:

1. [Quy tắc thực thi](EXECUTION-CONTRACT.md).
2. [Plan và dependency](PLAN.md).
3. [Ma trận yêu cầu](REQUIREMENTS.md).
4. Task được giao trong `tasks/`.
5. [Danh sách nghiệm thu](ACCEPTANCE.md) và [mẫu báo cáo](reports/TEMPLATE.md).

Chỉ triển khai một task tại một thời điểm. Bắt đầu C00; không nhảy thẳng C11 để chạy test và đóng toàn bộ dự án.

## Phạm vi và thứ tự ưu tiên

- Chỉ dẫn mới của user > thiết kế concierge và bộ giao việc này > tài liệu nền tảng ở phạm vi tương ứng > báo cáo triển khai cũ.
- AI được phép trong phạm vi concierge theo yêu cầu mới; quy tắc “không thêm AI” của roadmap nền tảng không cấm phần mở rộng này. Không mở rộng sang POS, payment gateway, CRM, nhiều chi nhánh hoặc multi-agent.
- Giữ React/Vite và Supabase PostgreSQL/Auth/Edge Functions, guest giao dịch với login tùy chọn, một quyền Admin.
- Báo cáo cũ là lời khai cần kiểm chứng, không là bằng chứng tự động. Không xóa lịch sử báo cáo để che finding cũ.
- Không sửa task T01–T20 hoặc tiến độ công việc nền tảng của agent khác chỉ để khớp tiến độ concierge.
- Một coding agent làm tuần tự; không spawn sub-agent. Bộ này được tự rà soát tài liệu, chưa có review độc lập hay test implementation mới.

## Định nghĩa trạng thái

| Trạng thái | Ý nghĩa | Ai được đặt |
|---|---|---|
| TODO | Chưa khảo sát/triển khai theo task mới | Coding agent |
| IN_PROGRESS | Đang triển khai và kiểm tra | Coding agent |
| BLOCKED | Có dependency cụ thể chưa giải quyết được | Coding agent, phải ghi rõ |
| READY_FOR_REVIEW | Implementation và checks bắt buộc đã có bằng chứng | Coding agent |
| CHANGES_REQUESTED | Reviewer chỉ ra phần cần sửa | Reviewer |
| ACCEPTED | Reviewer độc lập xác nhận các tiêu chí kỹ thuật của task | Reviewer/user |

Không dùng `DONE`, “nghiệm thu”, “100% production-ready” do coding agent tự kết luận. Cột xác nhận vận hành thực tế được ghi riêng: `NOT_VERIFIED`, `BLOCKED`, `VERIFIED_BY_OWNER`. Không tự chuyển trạng thái này từ dữ liệu seed hoặc automated tests.

`READY_FOR_REVIEW` của dependency cho phép coding agent làm task kế tiếp sau khi checks đạt, không cần hỏi user mỗi bước. `ACCEPTED` vẫn do reviewer quyết định sau. Khi dependency có finding làm hỏng giả định của task sau, phải sửa/revalidate các task bị ảnh hưởng.

## Bảng tiến độ ban đầu

| Task | Trọng tâm | Trạng thái |
|---|---|---|
| [C00](tasks/C00-baseline-and-test-isolation.md) | Baseline, mapping, môi trường test cô lập | READY_FOR_REVIEW |
| [C01](tasks/C01-state-and-session.md) | Persistent state, auth phiên, CAS, reset | READY_FOR_REVIEW |
| [C02](tasks/C02-confirmation-and-transactions.md) | Pending action, transaction, replay/reconciliation | READY_FOR_REVIEW |
| [C03](tasks/C03-knowledge-and-admin.md) | Knowledge, serving/allergens, admin approval/RAG | READY_FOR_REVIEW |
| [C04](tasks/C04-recommendation-and-safety.md) | Candidate builder, validator, constraints | READY_FOR_REVIEW |
| [C05](tasks/C05-llm-orchestration.md) | Main LLM nối vào runtime và typed tools | READY_FOR_REVIEW |
| [C06](tasks/C06-cart-and-order-ui.md) | Chat → cart → quote → confirm → order/status | READY_FOR_REVIEW |
| [C07](tasks/C07-reservation-ui.md) | Chat → reservation summary → confirm/status | READY_FOR_REVIEW |
| [C08](tasks/C08-personalization.md) | Customer context, reorder, logout | READY_FOR_REVIEW |
| [C09](tasks/C09-feedback-and-operations.md) | Feedback, metrics, privacy, feature flags | READY_FOR_REVIEW |
| [C10](tasks/C10-evaluation.md) | Eval kiểm tra hành vi từng scenario | READY_FOR_REVIEW |
| [C11](tasks/C11-final-verification.md) | Kiểm chứng tổng và bàn giao reviewer | READY_FOR_REVIEW |

TODO không khẳng định code cũ chưa có gì; nghĩa là chưa được xác minh theo bộ task này.

## Prompt giao coding agent

```text
Đọc plans/tiger-345/concierge-delivery/README.md và EXECUTION-CONTRACT.md.
Thực hiện tuần tự task C00–C11 theo PLAN.md, bắt đầu task đầu chưa đạt.
Mỗi lần chỉ xử lý một task; hoàn tất implementation, checks và report của task
trước khi chuyển tiếp. Tiếp tục task kế tiếp khi dependency đủ bằng chứng,
không cần hỏi lại quyền cho việc đã nằm trong scope.
Không chỉ sửa report/test để tạo kết quả xanh. Không tự spawn sub-agent.
Không revert hoặc ghi đè thay đổi của agent khác. Chỉ dùng DB test cô lập.
Không deploy hoặc chạy migration trên shared/production.
Đối chiếu mọi yêu cầu trong REQUIREMENTS.md và mọi gate trong ACCEPTANCE.md.
Coding agent chỉ được đặt READY_FOR_REVIEW, không tự đặt ACCEPTED.
Ghi reports/Cxx.md theo reports/TEMPLATE.md với bằng chứng thật và checklist.
Thiếu credential/dữ liệu duyệt: hoàn thành phần độc lập, ghi BLOCKED/NOT_VERIFIED
đúng phạm vi, không bịa hoặc đánh dấu full plan đạt.
Cuối cùng tạo reports/FINAL.md cho reviewer, không tự tuyên bố nghiệm thu.
```

Tài liệu không thể cưỡng chế agent như một cơ chế kỹ thuật. Bộ này làm rõ vi phạm và bằng chứng cần kiểm tra; C00/C10 sẽ thiết lập checks tự động phù hợp, reviewer giữ quyền nghiệm thu cuối.
