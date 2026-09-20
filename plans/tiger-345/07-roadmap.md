# Roadmap và dependency

Tất cả task TODO. Làm tuần tự T01 → T20 để giảm xung đột và quota; dependency tối thiểu ghi dưới.
Không cần thuê/chạy nhiều agent đồng thời. Một lượt agent = một task + report.

| Task | Kết quả | Phụ thuộc | Status |
|---|---|---|---|
| [T01](tasks/T01-frontend-foundation.md) | Nền frontend, strict types và test harness | — | DONE |
| [T02](tasks/T02-core-database.md) | Schema core và môi trường Supabase local | T01 | DONE |
| [T03](tasks/T03-identity-policies.md) | Schema customer, ownership và chính sách DB | T02 | DONE |
| [T04](tasks/T04-api-auth-foundation.md) | HTTP contracts, auth và hạ tầng API | T03 | DONE |
| [T05](tasks/T05-public-catalog.md) | Menu/settings API và nối website public | T04 | DONE |
| [T06](tasks/T06-table-visits-api.md) | QR bàn, capability và phiên phục vụ API | T04 | DONE |
| [T07](tasks/T07-order-engine.md) | Quote và transaction order dùng chung, bắt đầu dine-in | T05, T06 | DONE |
| [T08](tasks/T08-admin-queue.md) | Admin login, inbox, bàn và chuyển trạng thái | T07 | DONE |
| [T09](tasks/T09-dine-in-client.md) | QR → cart → order → admin, cart persistence | T08 | DONE |
| [T10](tasks/T10-delivery-api.md) | Delivery quote/create và luật vùng giao | T09 | DONE |
| [T11](tasks/T11-delivery-client.md) | Checkout giao hàng thật | T10 | DONE |
| [T12](tasks/T12-reservations.md) | Đặt bàn public và admin xuyên suốt | T11 | DONE |
| [T13](tasks/T13-admin-content.md) | Admin menu/settings/QR và Storage | T12 | DONE |
| [T14](tasks/T14-customer-api.md) | Profile/history/address/favorite/reorder APIs | T13 | DONE |
| [T15](tasks/T15-customer-auth-ui.md) | Login optional và auth callback | T14 | DONE |
| [T16](tasks/T16-account-ui.md) | Account và personalization, saved address checkout | T15 | DONE |
| [T17](tasks/T17-payments-visits.md) | Thanh toán thủ công, hoàn tất và đóng phiên | T16 | DONE |
| [T18](tasks/T18-guest-claim.md) | Guest order claim an toàn sau login | T17 | DONE |
| [T19](tasks/T19-privacy-retention.md) | Xóa account và retention có retry | T18 | DONE |
| [T20](tasks/T20-release-verification.md) | Tổng kiểm thử, CI, staging và bàn giao review | T19 | DONE |

## Mốc nghiệm thu

- T01–T05: frontend honest, DB/Auth/API nền, menu/settings từ dữ liệu thật.
- T06–T09: QR → quote → order pending → admin confirm; gọi thêm cùng visit.
- T10–T13: delivery, reservation, nội dung/QR/settings vận hành được.
- T14–T16: customer optional login, account, saved addresses, favorites, reorder.
- T17: tiền và vòng đời phiên bàn hoàn chỉnh; chưa nhận khách thật trước mốc này.
- T18–T19: guest claim và xóa account/retention.
- T20: full verification + release readiness; production deploy là hành động riêng.

## Điều phối

T06 về kỹ thuật có thể chạy sau T04 song song T05, nhưng mặc định vẫn tuần tự.
Router/package/shared contracts dễ conflict; không giao hai task cùng chạm các file này đồng thời.
Nếu một task quá dài, tách thành a/b trong cùng phạm vi, giữ dependencies và acceptance.
Không đánh DONE nếu phần DB/API thật chưa chạy hoặc còn TODO bắt buộc.
Thời gian triển khai phụ thuộc agent và hạ tầng; không coi 20 task là 20 lượt chắc chắn đủ.

## Map review → implementation

R01–R03 → T01/T02/T04/T07/T08/T09/T10/T11/T12; R04/R05 → T01/T12;
R06/R07 → T07/T09/T10/T11; R08/R09 → T01/T09/T12/T16;
R10/R11/R13/R15 → T01/T20; R12/R14 → T05/T13; R16 → T04/T08/T15;
R17 → T09/T16. Những rủi ro mới QR/claim/payment/privacy → T06/T17/T18/T19.

## Prompt gọi reviewer sau coding

```text
Review implementation theo plans/tiger-345/README.md, contracts và reports/T01..T20.
Đối chiếu diff thực với acceptance criteria, tập trung quyền/DTO/RPC transaction/concurrency,
QR visit lifecycle, payment và claim. Đừng tin report pass nếu thiếu bằng chứng.
Liệt kê findings theo severity + file/line, tests missing và task sửa đề xuất.
Chưa sửa code hoặc deploy trừ khi được yêu cầu.
```
