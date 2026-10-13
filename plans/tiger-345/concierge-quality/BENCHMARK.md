# Chạy benchmark chatbot trên endpoint OpenAI-compatible

Runner dùng catalog/FAQ/bảng giờ **giả trong bộ nhớ**, không kết nối PostgreSQL, không tạo đơn hay thay đổi cấu hình production. Tám tình huống được chấm bằng trạng thái, card và dữ liệu đã xác minh, không so khớp nguyên văn câu trả lời. File JSON chỉ chứa ID, pass/fail, số lượt gọi/token và độ trễ; không lưu key hay nội dung chat.

## Chuẩn bị miễn phí

```sh
npm run benchmark:concierge -- --dry-run
npm run test:benchmark:offline
```

Test offline dựng HTTP server giả trên loopback; **không gọi provider thật**.

## Chạy trên endpoint cục bộ (có thể phát sinh phí)

Key đã được gửi qua cuộc trò chuyện: nên thu hồi/đổi key trước khi sử dụng. Nhập key mới trực tiếp trong terminal, không ghi vào `.env`, lệnh shell hoặc tệp JSON:

```sh
read -r -s -p 'Benchmark API key: ' BENCHMARK_LLM_API_KEY; echo
export BENCHMARK_LLM_API_KEY
export BENCHMARK_LLM_BASE_URL='http://localhost:20128/v1'
npm run --silent benchmark:concierge -- --list-models
export BENCHMARK_LLM_MODEL='<model-id-từ-lệnh-trên>'
npm run --silent benchmark:concierge -- --confirm-live > /tmp/tiger-concierge-benchmark.json
unset BENCHMARK_LLM_API_KEY
```

Chạy từng model bằng cùng fixture và so sánh `summary.passed`, từng `results[].id`, `p50_model_scenario_ms`, `p95_model_scenario_ms`, `provider_requests`, `reported_input_tokens` và `reported_output_tokens`. p50/p95 tính **theo tình huống có model call**, không phải độ trễ mỗi HTTP request. Nếu proxy không trả token usage, trường token bằng 0 và **không được** hiểu là miễn phí. Chỉ chấm response/business logic, không dùng kết quả này để tuyên bố chất lượng production.

Runner chỉ nhận URL `/v1` dạng HTTP loopback, cấm redirect và dừng gọi sau tối đa **16 request**, mỗi lần yêu cầu tối đa **256 output tokens**. Giới hạn này không phải trần USD: giá và số token đầu vào phụ thuộc gateway/model; xác nhận chi phí riêng trước khi chạy. Endpoint có thể lỗi hoặc không hỗ trợ OpenAI-compatible `chat/completions`; runner không tự chuyển sang provider khác. `--list-models` chỉ gọi GET `/v1/models`; nếu gateway không có route này, tìm model ID từ giao diện/ tài liệu gateway và đặt `BENCHMARK_LLM_MODEL` thủ công.

Có thể thử riêng một tình huống bằng `npm run --silent benchmark:concierge -- --confirm-live --case group-budget` để giới hạn request trong lần chẩn đoán. Gateway tại máy đã trả SSE nếu thiếu `stream: false`; backend nay ghi rõ tham số này cho request nonstream. Báo cáo chạy thật ngày 2026-09-25 nằm ở `reports/2026-09-25-live-smoke.md`.

Thao tác này **khác** Jev browser eval và không chứng minh checkout/đặt bàn thực. So với benchmark offline tại `reports/2026-09-25-offline.md`; để đo trải nghiệm toàn hệ thống cần staging được cô lập và bộ hội thoại có đánh giá người thật theo `../concierge-v2/live-evaluation.md`.
