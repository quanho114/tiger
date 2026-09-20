# Hợp đồng thực thi cho coding agent

## 1. Phạm vi được phép

Được khảo sát, sửa code concierge và tích hợp tối thiểu cần thiết, thêm migration mới, viết tests, chạy checks trên môi trường local/test cô lập. Không sửa migration đã áp dụng; không reset DB dùng chung; không deploy, mua dịch vụ hoặc thêm sản phẩm ngoài scope.

Trước mỗi task: đọc status/diff và các file liên quan; nhận diện edits của mình. Không kết luận file thuộc mình chỉ vì đang untracked. Không xóa/revert edits khác. Nếu cùng file thay đổi đồng thời, đọc lại và dùng patch nhỏ; nếu mâu thuẫn trực tiếp chưa thể dung hòa, ghi blocker cho phần đó và tiếp tục phần độc lập.

## 2. Một task phải hoàn thành theo vòng lặp

1. Hiểu đường chạy hiện tại và dependency.
2. Tái hiện lỗi hoặc xác định observable behavior cần có.
3. Ghi test bắt đúng lỗi, không chỉ kiểm tra prose/metadata.
4. Implement và nối từ entrypoint thật.
5. Chạy verification ở mức phù hợp.
6. Tự review failure paths, auth, data flow và scope diff.
7. Ghi report và status; chuyển task khi implementation checks đạt.

Không lập một lượt báo cáo “tất cả xong” thay cho report từng task. Không bỏ task do đã có helper cùng tên. Có thể xác minh code cũ đạt và giữ nguyên, nhưng vẫn cần test/evidence tương ứng.

## 3. Invariants không được nới

- Mutation cần quyền sở hữu, pending action đúng payload/version/expiry và điều kiện nghiệp vụ hiện tại.
- Đã commit giao dịch phải có kết quả bền vững để tra lại. Lỗi transport/state không được kích hoạt giao dịch mới ngoài ý muốn.
- Giá, availability, phí và trạng thái từ business source; thiếu dữ liệu không thay bằng mock thành công.
- Không đoán ngày/giờ, tên/phone/address để gửi giao dịch.
- Unknown/may_contain/unverified dị nguyên không thành kết luận an toàn.
- User correction mới nhất có ưu tiên; dữ liệu agent tự nói không là confirmation.
- Không dùng IP làm credential sở hữu guest. Rate limit theo IP là mục đích riêng.
- Production thiếu secret/provider/database không được âm thầm dùng stub hoặc ký bằng secret mặc định.
- Context khách không lộ qua logout, đổi tài khoản hoặc truy cập cross-user.

## 4. Tiêu chuẩn test

Mỗi test hành vi phải ghi rõ trigger, setup, expected result và forbidden side effects. Một assertion “card tồn tại” không chứng minh đơn thật; một `is_adversarial = true` không kiểm tra chống tấn công.

Với một failure path quan trọng, chứng minh test có thể bắt lỗi tương ứng: đầu vào đối nghịch, injected failure hoặc controlled mutation trong môi trường test. Không vô hiệu guardrail trong production hoặc trên DB chung. Không sửa expected outcome chỉ để chấp nhận lỗi hiện tại.

- Unit: math/schema/parser thuần.
- Contract: tool/API DTO, auth, errors.
- Integration: entrypoint/service với PostgreSQL test thật.
- Browser E2E: click/type trên UI thật, API và persistence thật; model có thể là test adapter ghi nhãn.
- Live provider: gọi provider được cấu hình, synthetic/minimized data; ghi riêng với deterministic tests.
- Human review: nhân sự quán duyệt dữ liệu/khẩu phần; không thay bằng LLM judge hoặc placeholder.

Các lệnh đã có: `npm run test:unit`, `npm run test:server`, `npm run test:integration`, `npm run test:policies`, `npm run test:e2e`, `npm run typecheck`, `npm run typecheck:server`, `npm run lint`, `npm run build`. Xác minh package/config hiện tại trước chạy. Nếu thêm filter hoặc runner, ghi exact command và số test thực thi; không mô tả filtered suite là toàn bộ suite.

## 5. Database test

C00 phải cung cấp môi trường cô lập và guard ngăn suite mutate DB chưa được đánh dấu test. Không chỉ nhìn port 54322 rồi kết luận an toàn. Định danh project/database/test marker, endpoint target và quy trình teardown cần được kiểm tra mà không in secrets.

Không sửa env của người khác. Dùng env test riêng, transaction rollback hoặc fixtures phạm vi test. Không xóa toàn bộ business_hours/rate_limit/orders để tiện test trên DB dùng chung.

## 6. Evidence và provenance

Report ghi timestamp, commit nếu có, workspace fingerprint của file task, command/exit code, environment class, test IDs và artifact paths. Repo chưa commit vẫn review được bằng snapshot/diff có định danh; không tự commit thay đổi người khác để có hash.

Không lưu credentials, auth token, raw phone/address thật hoặc nội dung nhạy cảm vào report. Kết quả dùng stub ghi STUB; không viết “live provider” hoặc “DB thật” nếu không chạy.

## 7. Status và dependency

Status theo README. READY_FOR_REVIEW chỉ dùng khi mọi acceptance kỹ thuật của task đạt. Nếu còn một hạng mục bắt buộc chưa làm, status giữ IN_PROGRESS hoặc BLOCKED và liệt kê phần đã hoàn tất.

External validation (dữ liệu quán/live provider) tách khỏi code readiness: có thể ghi implementation READY_FOR_REVIEW với synthetic test đủ khi task cho phép, nhưng external gate vẫn BLOCKED/NOT_VERIFIED và release chưa được duyệt.

Không chờ reviewer từng task để làm phần đã được phép. Nếu task dependent cần contract chưa ổn định thì chưa nối mutation dựa trên contract đó; làm phần độc lập hoặc ghi blocker.

## 8. Thay đổi kế hoạch

Được tách task thành suffix a/b nếu quá lớn; giữ đầy đủ requirement IDs, dependency, owner và acceptance. Ghi lý do trong report và PLAN. Không được xóa/nới acceptance hoặc giảm scope A0–A7 để làm bảng xanh. Thay đổi ranh giới nghiệp vụ cần được user quyết định; các lựa chọn triển khai thường ngày tự xử lý.

## 9. Tự review trước bàn giao

- Production entrypoint có gọi implementation mới không?
- Dữ liệu được persist có được đọc lại đúng không?
- Test có đi qua đúng đường production không?
- Có side effect trước auth/action claim/CAS khiến báo lỗi sau commit không?
- Retry có kiểm tra fingerprint và trả đúng receipt không?
- UI có dùng cùng action permission với backend không?
- Error fallback có che thiếu dữ liệu hoặc làm mất lỗi không?
- Báo cáo có khẳng định điều chưa kiểm chứng không?
