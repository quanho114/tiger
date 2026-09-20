# Ma trận yêu cầu

Tất cả trạng thái ban đầu là NOT_VERIFIED. Đây là coverage thực thi, không thay thế chi tiết trong thiết kế gốc. Khi thiết kế có yêu cầu con, coding agent phải liệt kê trong report task; không dùng một test đại diện để đóng cả nhóm.

| ID | Yêu cầu | Mục thiết kế gốc | Owner | Evidence tối thiểu | Trạng thái |
|---|---|---|---|---|---|
| R01 | Phạm vi, baseline, isolation và bằng chứng | 1, 3, 26, 27 | [C00](tasks/C00-baseline-and-test-isolation.md) | AT01; report code path + test artifacts | NOT_VERIFIED |
| R02 | Persistent session, CAS, ownership, reset | 6, 18, 20 | [C01](tasks/C01-state-and-session.md) | AT02, AT03; report code path + test artifacts | NOT_VERIFIED |
| R03 | Confirmation binding, durable transaction, replay/reconcile | 6, 15, 16, 17, 21 | [C02](tasks/C02-confirmation-and-transactions.md) | AT04, AT05, AT06; report code path + test artifacts | NOT_VERIFIED |
| R04 | Structured knowledge, RAG, admin, provenance | 8, 9, 13, 14, 22, 28 | [C03](tasks/C03-knowledge-and-admin.md) | AT07, AT08; report code path + test artifacts | NOT_VERIFIED |
| R05 | Clarification, serving/budget, candidates, allergen validator | 7, 10, 11, 12, 13 | [C04](tasks/C04-recommendation-and-safety.md) | AT09, AT10; report code path + test artifacts | NOT_VERIFIED |
| R06 | Single LLM runtime, typed tools, output và giới hạn | 2, 3, 4, 5, 7, 14, 15, 18 | [C05](tasks/C05-llm-orchestration.md) | AT11, AT12; report code path + test artifacts | NOT_VERIFIED |
| R07 | Cart/order/quote/status và UI | 5, 16, 18, 19 | [C06](tasks/C06-cart-and-order-ui.md) | AT13, AT14; report code path + test artifacts | NOT_VERIFIED |
| R08 | Reservation collection/confirmation/status và UI | 5, 17, 18, 19 | [C07](tasks/C07-reservation-ui.md) | AT15; report code path + test artifacts | NOT_VERIFIED |
| R09 | Personalization, reorder, privacy phiên | 5, 20 | [C08](tasks/C08-personalization.md) | AT16; report code path + test artifacts | NOT_VERIFIED |
| R10 | Feedback, observability, operational controls, metrics | 21, 22, 23, 25, 28, 29 | [C09](tasks/C09-feedback-and-operations.md) | AT17, AT18; report code path + test artifacts | NOT_VERIFIED |
| R11 | Eval hành vi, regression, human review | 24, 25, 27 | [C10](tasks/C10-evaluation.md) | AT19; report code path + test artifacts | NOT_VERIFIED |
| R12 | Review tổng, roadmap coverage và pilot approval | 1–29 | [C11](tasks/C11-final-verification.md) | AT20; report code path + test artifacts | NOT_VERIFIED |

## Quy tắc coverage

Mọi mục 1–29 của thiết kế gốc đều phải được map vào report. C11 kiểm tra coverage độc lập; không chỉ viện dẫn C11 để che yêu cầu chưa triển khai. R04 cần dữ liệu quán duyệt, R06 cần kiểm chứng provider thật và R10/R12 cần owner vận hành; bằng chứng synthetic không thay thế các xác nhận này.
