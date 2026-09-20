# Acceptance và cổng bàn giao

Đây là test specification, chưa phải kết quả đã chạy. Mỗi hàng là một nhóm case bắt buộc; report phải liệt kê từng biến thể và test ID thực thi. Dùng DB cô lập C00 cho mọi write. Stub model được dùng cho deterministic tests nhưng phải ghi rõ.

| ID | Owner | Mức kiểm tra | Trigger/setup | Kết quả cần có | Side effect/hành vi cấm |
|---|---|---|---|---|---|
| AT01 | C00 | Integration guard | Target DB thiếu marker hoặc trỏ nhầm shared DB | Từ chối trước fixture/migration/write; test target riêng có cleanup giới hạn | Bất kỳ mutation lên target chưa xác minh |
| AT02 | C01 | Integration + policies | Hai instance cùng state_version, DB unavailable, process mới đọc phiên | Một CAS thắng; conflict rõ; đọc state bền vững; DB lỗi fail closed | RAM success che DB lỗi; lost update |
| AT03 | C01 | Integration + UI | Cross-user, guest upgrade, reset cạnh tranh và token cũ | Ownership kiểm tra mọi endpoint; version tăng; token/pending cũ vô hiệu; không lộ context | Truy cập bằng IP hoặc ID đoán được; stale response khôi phục context đã logout |
| AT04 | C02 | Integration | Confirm sai payload/quote/owner/version; ok không có action cụ thể | Không mutation; sửa nội dung phải summary/quote mới và confirmation mới | Receipt của quote khác hoặc giá khác được trả như thành công |
| AT05 | C02 | Integration hai connections/instances | Confirm cùng action đồng thời với hai request keys khác nhau | Một business row; receipts cùng kết quả hợp lệ; key khác không vượt action consumption | Hai đơn/đặt bàn cho cùng confirmed action |
| AT06 | C02 | Integration fault injection | Crash sau commit trước CAS/response; retry khi quote đã hết TTL; reset cạnh tranh | Reconcile theo durable action/business key, trả receipt đúng owner; expired unconsumed quote bị chặn | Tạo lại giao dịch; mất receipt; báo chắc chắn chưa tạo khi commit còn chưa xác định |
| AT07 | C03 | Integration + policies | Admin sửa serving/allergens/config; user thường gọi cùng endpoint | Validate, persist, audit, version và cache refresh; non-admin denied | Seed/unverified tự thành kitchen-approved |
| AT08 | C03 | Server + integration | RAG source stale/withdrawn/missing/conflicting hoặc chứa prompt injection | Cite source/version hợp lệ; thiếu bằng chứng trả thiếu dữ liệu; không nhận chỉ dẫn từ tài liệu | Bịa FAQ, giá hoặc thực thi tool theo tài liệu độc hại |
| AT09 | C04 | Unit + server | Party ambiguities, appetite, role overlap, 100 lẩu/2 người, budget chặt | Math từ config; hỏi ít và đúng; warning dư thật; hard budget giữ đúng; infeasible được báo | Đếm trùng serving, ngầm vượt budget 5%, bịa option/giá |
| AT10 | C04 | Server + integration | Allergy contains/may_contain/unknown/missing/unverified; catalog hết món | Hard gate theo dị ứng khai báo, giải thích uncertainty; action eligibility server quyết định | Khẳng định an toàn hoặc add/submit qua đường khác bỏ qua safety context |
| AT11 | C05 | API contract + integration | Gửi message qua production entrypoint với adapter test được inject rõ | Adapter thực sự được gọi; tool schemas/allowlist và limits enforce ngoài model | Unused adapter vẫn báo orchestration hoàn tất; prod default stub |
| AT12 | C05 | Server + streaming contract | Malformed model output, injection, provider timeout lặp, disconnect SSE | Reject invalid actions; circuit mở/hồi phục thật; stream facts đã validate; không retry mutation mù | Raw SQL, secret leakage, endless tool loop, stream giá/giao dịch bịa |
| AT13 | C06 | Browser E2E + DB | Recommendation → add cart; double click; proposal hết hạn/giá hoặc availability đổi | UI dùng backend permissions; revalidate, dedupe và hiển thị thay đổi cần chấp thuận | Nhân đôi cart ngoài ý muốn; dùng proposal cũ không kiểm tra |
| AT14 | C06 | Browser E2E + DB | Điền checkout → xem quote tổng → confirm → reload/status | Business row thật khớp tổng/fulfillment; pending đúng; status ownership; receipt bền vững | Tự submit khi recommend; fake contact/UUID; client sửa phí/table context |
| AT15 | C07 | Browser E2E + DB | Ngày mai 19h, đổi giờ, chen FAQ, reload; gần nửa đêm; thiếu tên/phone | Ngày tuyệt đối đúng Asia/Ho_Chi_Minh; thiếu hỏi lại; DB khớp summary và pending | Tự +2h/Quý khách; đổi payload sau confirm; khẳng định đã giữ bàn |
| AT16 | C08 | Integration + UI | Hai user có history/favorites khác nhau, reorder giá mới, logout request pending | Query schema thật; đúng context; reprice/revalidate; clear caches và ignore stale response | Cross-user data, địa chỉ tự tiết lộ, reorder âm thầm submit |
| AT17 | C09 | Integration + policies | Feedback proposal/version giả; admin review; user thường review | Bind owner/proposal/version và persist; admin audit; policy đúng | Feedback mồ côi hoặc review không có quyền |
| AT18 | C09 | Integration + operational tests | PII trong input, rate limit, flags off, retention cutoff | Redaction; giới hạn thật; mutations disabled nhưng receipt lookup an toàn; retention đúng phạm vi | Token/phone/address raw trong logs; xóa business records ngoài policy |
| AT19 | C10 | Eval runner + CI | Expectation không hỗ trợ, scenario chưa chạy, broken critical guard có kiểm soát | Runner fail; regression bắt guard hỏng; counts reconcile; human pending tách biệt | Silent skip/slice, keyword test thay side-effect assertion, human counted passed |
| AT20 | C11 | Full suites + review package | Đối chiếu requirements/gates với artifact trên snapshot cuối | Full commands có exit/evidence; finding unresolved và external gates hiện rõ; READY_FOR_REVIEW | Tự ACCEPTED, tự deploy, kết luận 100% dù human/provider/owner chưa verified |

## Cổng ngoài automated tests

| Gate | Bằng chứng cần | Owner xác nhận | Trạng thái ban đầu |
|---|---|---|---|
| X01 Knowledge quán | Serving, allergens/cross-contact, menu và nguồn đã duyệt; demo tách biệt | Người phụ trách bếp/quán được chỉ định | NOT_VERIFIED |
| X02 Provider thật | Smoke qua runtime với model/prompt version, latency/token/error artifact đã redacted | Người phụ trách kỹ thuật | NOT_VERIFIED |
| X03 Nghiệp vụ | Giờ mở cửa/cutoff/horizon, phí, ngân sách tolerance, retention và handoff đúng policy | Chủ quán/product owner | NOT_VERIFIED |
| X04 Human eval | Từng scenario human có người duyệt, thời điểm, nhận xét và verdict | Nhân sự quán | NOT_VERIFIED |
| X05 Pilot | Owner vận hành, flags, rollback, metric threshold và cách xử lý incident được duyệt | User/owner vận hành | NOT_VERIFIED |

Thiếu credential không cho phép bịa live test. Thiếu xác nhận bếp không cho phép tự set verified_by_kitchen. Coding agent hoàn thành phần code độc lập và giữ gate mở; không chờ vô hạn, không biến gate thành PASS. Các ngưỡng pilot chưa có trong thiết kế phải ghi là đề xuất cần owner quyết định.

## Kết luận được phép

- Technical READY_FOR_REVIEW: đủ tests bắt buộc, không còn thiếu implementation; reviewer chưa xác nhận.
- Technical ACCEPTED: reviewer/user xác nhận trên snapshot được chỉ định.
- Pilot/release approval: quyết định riêng sau các external gates liên quan; task này không cấp quyền deploy.

Nếu test fail vì environment, ghi BLOCKED cùng command/error đã redacted. Không đổi thành PASS hoặc dùng test mock để thay bằng chứng integration còn thiếu.
