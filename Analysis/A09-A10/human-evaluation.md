# Phiếu đánh giá người thật A09–A10

Trạng thái: **CHỜ ĐÁNH GIÁ**. Số người chấm: 0. Điểm trung bình: chưa có. Không dùng kết quả guard/test kỹ thuật thay phiếu này.

## Chuẩn bị

Người điều phối điền trước khi chấm: fixture/version/hash, nhãn development/holdout, frontend/backend URL, source/build version, schema/flags/effective provider, thời gian/múi giờ, số hội thoại và người chấm. Không ghi keys, capability, thông tin khách thật hoặc raw private logs.

Dùng hội thoại tổng hợp và phiên guest/test mới. Hai phiên bản phải dùng cùng rubric, fixture và môi trường; có thể đảo thứ tự và ẩn nhãn phiên bản để giảm thiên lệch. Cần duyệt riêng trước khi gọi provider có phí. Đợt hiện tại chỉ kiểm định cục bộ.

## Rubric 1–5

| Tiêu chí | 1 | 3 | 5 |
|---|---|---|---|
| Rõ ràng | Khó hiểu hoặc mâu thuẫn | Hiểu được nhưng cần đọc lại | Ngắn gọn, ý chính rõ |
| Hữu ích | Không giải quyết yêu cầu | Giải quyết một phần | Giúp khách quyết định hoặc đi tiếp đúng bước |
| Tự nhiên | Cứng, rập khuôn hoặc xưng hô không phù hợp | Chấp nhận được | Tiếng Việt tự nhiên, trung tính, phù hợp tình huống |
| Có căn cứ | Claim thiếu evidence | Có giới hạn chưa rõ | Phân biệt facts/tư vấn/giả định và thiếu/lỗi dữ liệu |
| Hỏi đúng lúc | Hỏi lại hoặc hỏi không liên quan | Có một câu chưa cần thiết | Tái dùng thông tin đã biết, chỉ hỏi điều ảnh hưởng quyết định |
| Đúng state/cards | Gây hiểu nhầm giỏ/đơn/booking | Đúng nhưng chưa dễ hiểu | Phân biệt đề xuất/draft/transaction, khớp cards/server |

Điểm 2 và 4 là mức trung gian. Không dùng một điểm tổng hợp che lỗi critical.

## Phiếu cho mỗi scenario

| Trường | Giá trị người chấm điền |
|---|---|
| Scenario ID / fixture version | |
| Phiên bản A/B / thứ tự | |
| Reviewer ID / ngày giờ | |
| Ý định và thông tin đã có của khách | |
| Evidence/state/cards dùng đối chiếu | |
| Rõ ràng / hữu ích / tự nhiên / có căn cứ / hỏi đúng / đúng state (1–5) | |
| Có hỏi lại điều đã biết không? | |
| Có kết luận thiếu dữ liệu thành không có món, hoặc lỗi thành empty không? | |
| Có claim transaction/allergy/factual sai không? | |
| Có hứa đủ khẩu phần khi evidence thiếu không? | |
| Có lỗi input/completion/Stop/retry/UI không? | |
| Critical violation / mã lỗi / request ID đã làm sạch | |
| Nhận xét và bước tiếp theo | |

Nhóm cần chấm: chào/smalltalk; known/empty/unknown/unavailable/mixed; clarification nhiều lượt; browse/gợi ý; portions thiếu dữ liệu; explicit draft acceptance/đổi lượng; lỗi provider/guard; Stop/retry/disconnect. Desktop/mobile cần nghiệm thu hiển thị riêng.

## Tổng hợp và điều kiện đạt

Báo số người, số scenario/hội thoại, số lượt và kết quả từng nhóm. Mục tiêu theo `plan.md`: trung bình văn phong/usefulness ≥4/5 và 0 critical factual/transaction contradiction trong phạm vi bộ chấm. Báo clarification sai/hỏi lặp riêng; mọi ambiguity có thể gây mutation phải được chặn hoặc hỏi rõ.

Chưa có phiếu điền thì ghi PENDING, không báo ≥4/5. Tập holdout đã dùng để tối ưu phải chuyển vào regression; bổ sung holdout độc lập và tăng version trước lần đánh giá tiếp theo.
