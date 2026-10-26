# Báo cáo benchmark Concierge

Ngày chạy: **2026-10-26**.

## 1. Phạm vi và cấu hình

Benchmark sử dụng **dữ liệu nhà hàng giả lập và provider LLM thật** thông qua endpoint cục bộ. Đây không phải bài nghiệm thu chatbot trên website hoặc kiểm thử database production.


| Cấu hình                     | Giá trị                                        |
| ---------------------------- | ---------------------------------------------- |
| Script                       | `scripts/concierge-quality-benchmark.mjs`      |
| Fixture                      | `synthetic-restaurant-v1`                      |
| Endpoint người dùng cung cấp | `http://localhost:20128/v1`                    |
| Endpoint thực thi            | `http://127.0.0.1:20128/v1`                    |
| Provider adapter             | `openai` — giao thức tương thích OpenAI        |
| Model lượt 1                 | `cx/gpt-6.1-sol`                               |
| Model lượt 2                 | `cx/gpt-6-luna`                                |
| Số kịch bản mỗi lượt         | 8; ca điều chỉnh ngân sách có 2 lượt hội thoại |
| Giới hạn request             | 16 request provider mỗi lần chạy               |
| Giới hạn output              | 256 token mỗi request                          |
| Timeout cấu hình             | 10.000 ms mỗi request                          |
| Cho phép gọi provider thật   | Được người dùng cho phép rõ ràng               |


Cấu hình local chỉ áp dụng cho tiến trình benchmark:

```text
NODE_ENV=development
CONCIERGE_LLM_DEV_BASE_URL=http://127.0.0.1:20128/v1
BENCHMARK_LLM_BASE_URL=http://127.0.0.1:20128/v1
```

`127.0.0.1` được dùng thay cho `localhost` để đáp ứng kiểm tra URL phát triển cục bộ có sẵn. Không sửa hoặc nới lỏng chính sách URL production.

**Báo cáo không chứa API key.** Key không được ghi vào file cấu hình hoặc commit trong quá trình benchmark. Tuy nhiên, key đã được truyền trực tiếp qua lệnh công cụ ở các lượt được xác thực, nên có thể tồn tại trong lịch sử phiên; không thể khẳng định key chỉ tồn tại trong bộ nhớ tiến trình. Khuyến nghị thu hồi hoặc đổi key đã chia sẻ.

## 2. So sánh kết quả tổng hợp

Các số liệu dưới đây là đầu ra của runner, không phải ước tính.


| Chỉ số                            | `cx/gpt-6.1-sol`           | `cx/gpt-6-luna`            |
| --------------------------------- | --------------------------: | --------------------------: |
| Timestamp báo cáo, UTC            | `2026-10-26T01:31:02.736Z` | `2026-10-26T01:49:07.211Z` |
| Kịch bản pass                     | 2/8                        | 4/8                        |
| Kịch bản fail                     | 6/8                        | 4/8                        |
| Request provider                  | 14                         | 15                         |
| Input token được báo cáo          | 3.778                      | 5.681                      |
| Output token được báo cáo         | 480                        | 443                        |
| p50 độ trễ theo runner            | 7.115 ms                   | 3.169 ms                   |
| p95 độ trễ theo runner            | 12.568 ms                  | 4.812 ms                   |
| Sự kiện timeout provider được log | 3                          | 0                          |
| Exit code                         | 1                          | 1                          |


Lưu ý cách đo:

- p50/p95 được tính trên các kịch bản có `model_calls > 0` và không có trường `error`; vẫn bao gồm ca trả về bình thường nhưng không đạt assertion.
- Đây là độ trễ **kịch bản**, không phải độ trễ từng request provider.
- Ca phát sinh exception có thể ghi `latency_ms: 0`, `model_calls: 0` và token bằng 0 dù đã gửi request. Các giá trị này không chứng minh phản hồi tức thời hoặc không phát sinh chi phí.
- Token có thể chưa bao gồm phần tiêu thụ của các ca lỗi. Không có dữ liệu giá hoặc hóa đơn để xác định chi phí thực tế.

## 3. Chi tiết `cx/gpt-6.1-sol`


| ID                  | Kịch bản                                           | Kết quả | Error                | Độ trễ runner (ms) | Request provider | Model calls ghi nhận | Input token | Output token |
| ------------------- | -------------------------------------------------- | ------- | -------------------- | ------------------: | ----------------: | --------------------: | -----------: | ------------: |
| `greeting`          | Chào hỏi                                           | FAIL    | `unsafe_model_reply` | 0                  | 1                | 0                    | 0           | 0            |
| `known-price`       | Hỏi giá bò nướng                                   | PASS    | —                    | 12.568             | 2                | 2                    | 1.170       | 201          |
| `missing-item`      | Hỏi món không có: pizza                            | FAIL    | Không đạt assertion  | 10.007             | 2                | 2                    | 1.188       | 177          |
| `group-budget`      | Gợi ý cho 4 người, ngân sách 800k                  | FAIL    | `unsafe_model_reply` | 0                  | 2                | 0                    | 0           | 0            |
| `budget-revision`   | Khai báo 4 người rồi điều chỉnh ngân sách còn 700k | FAIL    | `unsafe_model_reply` | 0                  | 1                | 0                    | 0           | 0            |
| `operational-hours` | Hỏi giờ đóng cửa                                   | FAIL    | Không đạt assertion  | 7.115              | 2                | 2                    | 1.026       | 63           |
| `delivery-fee`      | Hỏi phí giao hàng                                  | FAIL    | `app_failure`        | 0                  | 3                | 0                    | 0           | 0            |
| `guest-order`       | Khách chưa đăng nhập hỏi đơn hàng                  | PASS    | —                    | 3.191              | 1                | 1                    | 394         | 39           |


Có 3 sự kiện `provider_timeout` trong log. Chưa xác định từng sự kiện thuộc kịch bản nào từ báo cáo tổng hợp.

## 4. Chi tiết `cx/gpt-6-luna`


| ID                  | Kịch bản                                           | Kết quả | Error               | Độ trễ runner (ms) | Request provider | Model calls ghi nhận | Input token | Output token |
| ------------------- | -------------------------------------------------- | ------- | ------------------- | ------------------: | ----------------: | --------------------: | -----------: | ------------: |
| `greeting`          | Chào hỏi                                           | PASS    | —                   | 2.546              | 1                | 1                    | 368         | 107          |
| `known-price`       | Hỏi giá bò nướng                                   | PASS    | —                   | 3.932              | 2                | 2                    | 1.170       | 86           |
| `missing-item`      | Hỏi món không có: pizza                            | FAIL    | Không đạt assertion | 3.169              | 2                | 2                    | 1.184       | 69           |
| `group-budget`      | Gợi ý cho 4 người, ngân sách 800k                  | FAIL    | `app_failure`       | 0                  | 3                | 0                    | 0           | 0            |
| `budget-revision`   | Khai báo 4 người rồi điều chỉnh ngân sách còn 700k | FAIL    | `app_failure`       | 0                  | 1                | 0                    | 0           | 0            |
| `operational-hours` | Hỏi giờ đóng cửa                                   | FAIL    | Không đạt assertion | 3.561              | 2                | 2                    | 1.041       | 68           |
| `delivery-fee`      | Hỏi phí giao hàng                                  | PASS    | —                   | 4.812              | 3                | 3                    | 1.524       | 79           |
| `guest-order`       | Khách chưa đăng nhập hỏi đơn hàng                  | PASS    | —                   | 2.001              | 1                | 1                    | 394         | 34           |


Không thấy sự kiện timeout provider trong đầu ra của lượt chạy này.

## 5. Diễn giải lỗi và giới hạn benchmark

### `unsafe_model_reply`

Runner ánh xạ `AppError` có mã `SERVICE_UNAVAILABLE` thành `unsafe_model_reply`. Nhãn này **không tự chứng minh model đã tạo nội dung không an toàn**: lỗi provider cũng có thể được bọc thành mã dịch vụ không khả dụng. Cần chẩn đoán sâu hơn trước khi quy nguyên nhân cho model hoặc bộ kiểm tra phản hồi.

### `app_failure`

Runner ánh xạ các `AppError` khác thành `app_failure`. Báo cáo hiện không chứa mã lỗi gốc hoặc stack trace, nên chưa thể kết luận nguyên nhân cụ thể của các ca ngân sách và phí giao hàng.

### Không đạt assertion

Hai ca sau đều fail ở cả hai model nhưng không báo exception:

- `missing-item`: yêu cầu không có card, không tạo draft và thông điệp chứa đúng chuỗi `Chưa tìm được món`.
- `operational-hours`: yêu cầu thông điệp chứa đúng chuỗi `11:00–20:00` và không chứa `22:30`.

Việc fail có thể do sai nội dung, sai trạng thái hoặc cách diễn đạt khác chuỗi cố định. Đầu ra benchmark không chứa câu trả lời thực tế nên **chưa xác minh được nguyên nhân**. Không sửa assertion để làm kết quả xanh.

### Các lượt khởi động không dùng để so sánh chất lượng

- Lượt Sol ban đầu bị chặn bởi kiểm tra URL provider trước khi có báo cáo kịch bản; sau đó dùng cấu hình local được hỗ trợ để có kết quả ở mục 3.
- Lượt Luna lúc `2026-10-26T01:46:32.809Z` dùng key placeholder, nhận 3 lỗi HTTP 401 rồi các ca sau không gửi thêm request. Runner ghi 0/8, nhưng đây là **lỗi xác thực, không phải kết quả chất lượng Luna**. Lượt này không được tính trong bảng so sánh.
- Lượt Luna được xác thực bằng key người dùng cung cấp mới là kết quả ở mục 4.

## 6. Kết luận và trạng thái nghiệm thu

Trong hai lượt chạy được xác thực:

- Luna pass nhiều kịch bản hơn: **4/8 so với 2/8**.
- Luna có p50/p95 theo runner thấp hơn và không có timeout được log.
- Cả hai model vẫn còn kịch bản thất bại; không model nào đạt toàn bộ bộ benchmark này.
- Mỗi model mới có một lượt chạy được xác thực. Chưa đủ dữ liệu để kết luận độ ổn định hoặc chất lượng tổng quát.
- Không sửa mã nguồn trong các lượt benchmark. Không chạy thêm lượt trả phí sau kết quả Luna ở mục 4.

**Runtime chatbot trên website: CHƯA KIỂM ĐỊNH.**

Benchmark này không thay thế nghiệm thu trình duyệt trên website Tiger với backend, dữ liệu và cấu hình provider thực tế theo `AGENTS.md`. Không thực hiện đơn hàng, thanh toán, đặt bàn hoặc thao tác ghi vào database production trong phạm vi benchmark này.