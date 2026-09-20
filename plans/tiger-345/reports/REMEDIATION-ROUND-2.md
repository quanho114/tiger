<!--
Fact-Forcing Metadata:
- Importers/Callers: Project reviewers, QA team, engineers maintaining Tiger 345
- Affected API:
  - GET /functions/v1/public-api/menu
  - GET /functions/v1/public-api/settings
  - POST /functions/v1/public-api/tables/resolve
  - POST /functions/v1/public-api/order-quotes
  - POST /functions/v1/public-api/orders
  - POST /functions/v1/admin-api/orders/:id/transition
  - POST /functions/v1/admin-api/retention/retry-deletions
- Data Schemas:
  - public._test_isolation_marker
  - public.operating_shifts, public.service_closures
  - public.account_deletion_jobs, public.customer_tombstones
  - public.orders, public.order_items, public.table_visits
- Verbatim Instructions:
  - "BÀN GIAO: Tạo plans/tiger-345/reports/REMEDIATION-ROUND-2.md ghi rõ:"
  - "+ Tình trạng 5 điểm review (đã sửa gì, file nào, bằng chứng test nào)."
  - "+ Ma trận các luồng: luồng nào ĐÃ VERIFIED bằng test thật (browser + HTTP + DB), luồng nào NOT VERIFIED (ghi lý do rõ ràng, không giấu)."
  - "+ Hướng dẫn chạy test cho người tiếp theo (đúng lệnh, đúng env, đúng port)."
  - "+ Rủi ro còn lại và việc cần làm tiếp theo."
-->

# Báo cáo Khắc phục & Nghiệm thu Tiger 345 (ROUND 2)

Ngày thực hiện: 2026-09-20  
Phạm vi: Xử lý 5 điểm review của ROUND 2 theo chỉ đạo kỹ thuật nghiêm ngặt.  
Tiêu chí: Trung thực, minh bạch, bảo vệ dữ liệu, không ngụy tạo kết quả, có bằng chứng test thực tế.

---

## 1. Tình trạng thực hiện 5 điểm Review ROUND 2

| # | Hạng mục | Mức độ | Trạng thái | Tóm tắt giải pháp & Bằng chứng kiểm thử |
|---|---|---|---|---|
| **1** | **Database Test Isolation & Reset Guard (P1 Remediation)** | Ưu tiên cao nhất | **HOÀN THÀNH** | • Cập nhật `tests/fixtures/test-db-guard.ts`: Fail-closed ngay khi thiếu/sai marker, cấm tự tạo marker, cấm bypass.<br>• Ràng buộc cổng strictly: chỉ chấp nhận 54322 / 54332 trên loopback (127.0.0.1/localhost). Cấm cổng 5432.<br>• Ràng buộc database_name: chỉ chấp nhận `tiger345_disposable_test_instance`, `ci_disposable_test_instance`, `local_disposable_test_instance`, `postgres`.<br>• Cập nhật `scripts/db-reset-test.sh`: Trích xuất chính xác cổng từ block `[db]` trong `supabase/config.toml` (tránh đọc nhầm cổng API 54321), không fallback mặc định nếu parse lỗi. Kiểm tra chặn remote project ref (`supabase/.temp/project-ref`), buộc flag `--local`, và LOẠI BỎ HOÀN TOÀN biến bypass `CONFIRM_DISPOSABLE_TEST_TARGET=true` (fail-closed 100% khi thiếu marker hoặc lỗi kết nối). Đảm bảo pre-check và reset luôn nhắm vào cùng 1 target đã xác minh.<br>• **Bằng chứng:** `tests/integration/test-db-guard.test.ts`. |
| **2** | **Quy tắc ngày nghỉ (Holidays & Closures)** | Nghiệp vụ cốt lõi | **HOÀN THÀNH** | • Thiết lập phân cấp đóng cửa nghiêm ngặt (Strict Closure Hierarchy):<br>&nbsp;&nbsp;+ `restaurant` đóng cửa: chặn TẤT CẢ dịch vụ (dine-in, delivery, reservation).<br>&nbsp;&nbsp;+ `delivery` đóng cửa: CHỈ chặn giao hàng, dine-in & reservation bình thường.<br>&nbsp;&nbsp;+ `reservation` đóng cửa: CHỈ chặn đặt bàn, dine-in & delivery bình thường.<br>• Đồng bộ 2 tầng: HTTP helper (`schedule.ts`) và Database transaction (`20260920000013_holiday_and_closure_rules.sql` trong `create_order` và `create_reservation`).<br>• **Bằng chứng:** `tests/integration/operating-hours-and-closures.test.ts`. |
| **3** | **Giờ hoạt động nhiều ca (Operating Hours & Shifts)** | Nghiệp vụ cốt lõi | **HOÀN THÀNH** | • Hỗ trợ cấu hình đa ca (`operating_shifts`) theo từng ngày trong tuần.<br>• Đơn hàng hợp lệ nếu rơi vào ít nhất một ca hoạt động.<br>• Đơn giao hàng phải thỏa mãn đồng thời cả ca nhà hàng và ca giao hàng.<br>• Đặt bàn phải có toàn bộ khoảng `[starts_at, ends_at]` nằm trọn trong một ca nhà hàng duy nhất với biên đóng (`open_time <= time <= close_time`).<br>• Đồng bộ cả tầng TypeScript (`schedule.ts`) và SQL (`20260920000014_multi_shift_operating_hours.sql`).<br>• **Bằng chứng:** `tests/integration/operating-hours-and-closures.test.ts`. |
| **4** | **Deletion Worker Recovery & Lease Ownership Fencing (P2 Remediation)** | An toàn dữ liệu | **HOÀN THÀNH** | • Resume workflow từ step đã lưu (`db_cleanup` -> `auth_delete` -> `completed`).<br>• Không đảo ngược thứ tự: hoàn tất DB cleanup và tombstone trước khi xóa Auth để tránh orphan account.<br>• Reclaim hung jobs bằng lease timeout (`lease_expires_at < now()`).<br>• Atomic claim bằng `FOR UPDATE SKIP LOCKED` trong RPC `claim_account_deletion_jobs`.<br>• Khi retry kiệt (`retry_count >= max_retries`), chuyển trạng thái terminal `exhausted` và ghi audit log, không nuốt lỗi.<br>• **Bảo vệ toàn diện Worker Lease Ownership Fencing:** Thêm `20260920000016_worker_lease_ownership_guard.sql` và cập nhật `account-deletion-worker.ts`:<br>&nbsp;&nbsp;1. RPC `process_account_deletion_db` kiểm tra quyền sở hữu lease và trạng thái completed trước khi xóa dữ liệu DB hoặc chuyển step sang `auth_delete`. Nếu worker cũ quay lại sau khi job đã được worker mới hoàn tất, RPC lập tức từ chối (`RETURN false`), ngăn chặn việc đảo ngược trạng thái job về `processing`.<br>&nbsp;&nbsp;2. RPC `complete_account_deletion_job` bắt buộc xác thực `worker_id`. Nếu worker bị hết lease hoặc job đã hoàn tất, mọi cập nhật thất bại muộn màng đều bị từ chối (`RETURN false`), không thể ghi đè kết quả của worker mới.<br>• **Bằng chứng:** `tests/integration/account-deletion-flow.test.ts` (kịch bản Scenario 7 và Scenario 8). |
| **5** | **E2E Thật & Báo cáo trung thực** | Kiểm thử & Nghiệm thu | **HOÀN THÀNH** | • Bổ sung test E2E browser thật không mock trong `tests/e2e/real-browser-http-db.spec.ts` (Test 5):<br>&nbsp;&nbsp;Mở web -> Phân giải QR bàn thật -> Xem menu thật -> Lấy báo giá thật qua Edge HTTP -> Gửi đơn thật vào bếp -> Lưu đơn vào DB thật -> Admin đăng nhập thật -> Xem hàng đợi đơn hàng -> Mở chi tiết -> Tiếp nhận đơn (xác nhận) -> DB cập nhật `confirmed` thật.<br>• Đánh dấu minh bạch ma trận các luồng (chỉ Dine-in QR là VERIFIED, các luồng còn lại là NOT VERIFIED).<br>• Bỏ toàn bộ tuyên bố "9/9 triệt để".<br>• **Bằng chứng:** `tests/e2e/real-browser-http-db.spec.ts` (Test 5 pass). |

---

## 2. Ma trận Trạng thái Kiểm thử các Luồng Nghiệp vụ

| Luồng nghiệp vụ | Phạm vi kiểm thử hiện tại | Trạng thái E2E Browser | Ghi chú & Lý do trung thực |
|---|---|---|---|
| **Dine-in QR Order -> Admin Confirm** | Browser thật -> Edge HTTP thật -> PostgreSQL DB thật -> Admin UI xác nhận | **VERIFIED** | Đã được kiểm chứng thực tế bằng Playwright test 5 trong `tests/e2e/real-browser-http-db.spec.ts`. 100% không dùng route mock. |
| **Delivery Order Flow** | Unit tests + Integration tests HTTP/DB | **NOT VERIFIED** | Chưa có test browser thật cho giao diện đặt giao hàng (nhập địa chỉ, tính phí ship qua map/khoảng cách, chọn thời gian giao). |
| **Payment v1 Flow (Ghi nhận thanh toán thủ công)** | Concurrency test DB (khóa `table_visits`, chống double-settle) | **NOT VERIFIED** | Chưa có test browser thật cho luồng ghi nhận thanh toán thủ công tại quầy/bàn bởi nhân viên. *Lưu ý: Schema và hệ thống hiện tại chỉ hỗ trợ hai phương thức thanh toán là `cash` (tiền mặt) và `bank_transfer` (chuyển khoản), chưa hỗ trợ `card` và chưa tích hợp cổng thanh toán trực tuyến tự động MoMo/VietQR.* |
| **Reservation Flow (Đặt bàn trước)** | Integration test DB constraints & shifts | **NOT VERIFIED** | Chưa có test browser thật cho luồng khách chọn ngày/giờ/số khách và nhận phản hồi xác nhận bàn. |
| **Claim Guest Order Flow (Gắn đơn guest vào tài khoản)** | Integration test logic nghiệp vụ DB/HTTP | **NOT VERIFIED** | Chưa có test browser thật cho luồng khách hàng gắn đơn guest vào tài khoản qua `POST /functions/v1/customer-api/me/orders/:id/claim` (dùng order UUID `:id` và body `{ claim_secret }`, không phải `:code`). *Lưu ý: Claim ở đây là gắn đơn vãng lai vào tài khoản, không phải mã giảm giá/ưu đãi khuyến mãi.* |
| **Account Deletion Flow** | Integration test DB + Worker recovery + Tombstone + Lease Fencing | **NOT VERIFIED** | Chưa có test browser thật cho luồng khách hàng vào Settings -> Yêu cầu xóa tài khoản -> Nhận thông báo xác nhận và đăng xuất. |

> **Cam kết tính trung thực:** Chúng tôi bỏ hoàn toàn nhận định "9/9 triệt để" trước đây. Chỉ luồng gọi món tại bàn qua QR code kết hợp xác nhận của Bếp Trưởng là đã có kiểm chứng E2E từ Trình duyệt đến Cơ sở dữ liệu. Các luồng còn lại hoạt động ở tầng API/DB nhưng chưa được nghiệm thu bằng kịch bản người dùng tương tác trên trình duyệt thật.

---

## 3. Danh sách File thay đổi & Chức năng

1. **`tests/fixtures/test-db-guard.ts`**:
   - Thắt chặt điều kiện cô lập DB: Cổng phải là `54322` hoặc `54332`.
   - Host phải là `127.0.0.1` hoặc `localhost`.
   - Danh sách database hợp lệ: `tiger345_disposable_test_instance`, `ci_disposable_test_instance`, `local_disposable_test_instance`, `postgres`.
   - Cơ chế fail-closed tuyệt đối, không tự tạo marker.

2. **`scripts/provision-test-db.mjs`**:
   - Đóng dấu marker `tiger345_disposable_test_instance` cho DB test sau khi reset.

3. **`scripts/db-reset-test.sh`**:
   - Đọc config trực tiếp từ `supabase/config.toml` (`[db] port`).
   - Kiểm tra chặn triệt để nếu có remote project ref (`supabase/.temp/project-ref`).
   - Buộc lệnh reset có cờ `--local` (`npx supabase db reset --local`).
   - XÓA BỎ HOÀN TOÀN cờ bypass `CONFIRM_DISPOSABLE_TEST_TARGET=true`. Fail-closed 100% khi thiếu marker hoặc lỗi kết nối. Đảm bảo pre-check và CLI reset luôn nhắm vào cùng 1 target đã xác minh.

4. **`supabase/functions/_shared/schedule.ts`**:
   - Cập nhật hàm `checkOperatingStatus`, `isRestaurantOpen`, `isDeliveryOpen`, `isReservationOpen`.
   - Thực thi quy tắc phân cấp đóng cửa: `restaurant` đóng -> chặn tất cả; `delivery` chỉ chặn ship; `reservation` chỉ chặn đặt bàn.
   - Hỗ trợ đa ca (`operating_shifts`) và kiểm tra toàn bộ khoảng thời gian đặt bàn `[starts_at, ends_at]`.

5. **`supabase/migrations/20260920000013_holiday_and_closure_rules.sql`**:
   - Migration cập nhật logic kiểm tra holiday và closure trong PostgreSQL RPC (`check_service_closure_and_hours`, `create_order`, `create_reservation`).

6. **`supabase/migrations/20260920000014_multi_shift_operating_hours.sql`**:
   - Migration hỗ trợ đa ca và kiểm tra khoảng đặt bàn trong cùng một ca nhà hàng.

7. **`supabase/migrations/20260920000015_deletion_worker_recovery_and_lease.sql`**:
   - Thêm cột `lease_expires_at`, `claimed_by` vào `account_deletion_jobs`.
   - Thêm RPC `claim_account_deletion_jobs` (atomic `FOR UPDATE SKIP LOCKED` + reclaim hung jobs).
   - Thêm RPC `complete_account_deletion_job` (hỗ trợ step resume, terminal status `exhausted`).

8. **`supabase/migrations/20260920000016_worker_lease_ownership_guard.sql`**:
   - Nâng cấp RPC `complete_account_deletion_job` với tham số `p_worker_id`.
   - Kiểm tra lease ownership: nếu worker bị hết hạn lease và job đã được worker khác reclaim hoặc đã hoàn tất, từ chối cập nhật (`RETURN false`), bảo vệ kết quả của worker mới không bị worker cũ ghi đè.

9. **`supabase/migrations/20260920000017_worker_lease_db_cleanup_fencing.sql`**:
   - Tạo migration mới theo nguyên tắc bất biến để bảo đảm tương thích với mọi môi trường đã áp dụng migration 00016 trước đó.
   - Nâng cấp RPC `process_account_deletion_db` với tham số `p_worker_id`, kiểm tra quyền sở hữu lease và trạng thái `completed` trước khi thực hiện dọn dẹp DB hoặc chuyển step sang `auth_delete`.
   - Nếu worker cũ quay lại sau khi job đã được worker mới hoàn tất, RPC lập tức từ chối (`RETURN false`), ngăn chặn việc đảo ngược trạng thái job về `processing`.

10. **`supabase/functions/_shared/account-deletion-worker.ts`**:
   - Tích hợp gọi RPC `claim_account_deletion_jobs` và cập nhật tiến trình xóa theo step.
   - Truyền `workerId` vào `process_account_deletion_db(userId, workerId)` và `complete_account_deletion_job(...)`.
   - Xóa bỏ hoàn toàn câu lệnh raw `UPDATE` cập nhật step ngoài code ứng dụng; chuyển bước sang `auth_delete` được thực hiện nguyên tử bên trong stored procedure có bảo vệ lease.

11. **`tests/integration/account-deletion-flow.test.ts`**:
    - Suite 8 tests kiểm thử phục hồi lỗi xóa tài khoản, tombstone, timeout lease, terminal status, lease ownership fencing (Scenario 7) và stale worker DB cleanup fencing (Scenario 8).

12. **`tests/e2e/real-browser-http-db.spec.ts`**:
    - Suite 5 tests Playwright E2E thật 100% không mock: Public API, Admin Login, Disabled Admin, Bad Creds, và Full Dine-In Order Flow.

---

## 4. Hướng dẫn Chạy Test cho Người Tiếp Theo

> **LƯU Ý QUAN TRỌNG VỀ RUNNER CONFIG:**  
> Root `vitest.config.ts` chỉ dành cho unit tests và KHÔNG bao gồm thư mục `tests/integration/`.  
> Nếu chạy `npx vitest run tests/integration/...`, Vitest sẽ báo lỗi: `No test files found, exiting with code 1`.  
> **BẮT BUỘC** phải dùng npm script `test:integration` (sử dụng `vitest.integration.config.ts`):  
> `npm run test:integration -- tests/integration/<file-name>`

### Điều kiện môi trường (Prerequisites)
1. Supabase local stack đang chạy:
   - PostgreSQL target: `127.0.0.1:54322` (DB: `postgres`)
   - Kong Gateway port: `54321`
   - Target database marker: Đã được xác minh qua `public._test_isolation_marker` (`instance_identity = 'tiger345_disposable_test_instance'`, `is_isolated_test_db = true`).
2. Edge Functions đang phục vụ:
   - Chạy lệnh: `npx supabase functions serve --no-verify-jwt`
3. Frontend Vite dev server đang chạy:
   - Port: `http://localhost:5173`

### Lệnh chạy kiểm thử nhanh theo từng phần

#### 1. Kiểm tra Test Isolation Guard:
```bash
npm run test:integration -- tests/integration/test-db-guard.test.ts
```

#### 2. Kiểm tra Deletion Worker Recovery, Tombstone & Lease Ownership (Targeted Test):
```bash
npm run test:integration -- tests/integration/account-deletion-flow.test.ts
```
**Bằng chứng thực thi thực tế (Target: `127.0.0.1:54322`, DB: `postgres`):**
```text
> tiger@0.0.0 test:integration
> vitest run --config vitest.integration.config.ts tests/integration/account-deletion-flow.test.ts

 RUN  v5.0.1 /home/ho-minh-quan/Projects/tiger

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  22:49:46
   Duration  2.65s (tests 75%, transform 19%, import 6%)
```
*(Bao gồm Scenario 7: Worker Lease Fencing và Scenario 8: Stale Worker DB Cleanup Fencing).*

#### 3. Kiểm tra Ràng buộc Đặt bàn & Ca phục vụ:
```bash
npm run test:integration -- tests/integration/reservations.test.ts
```

#### 4. Kiểm tra Real Browser -> Edge HTTP -> DB -> Admin E2E Flow:
```bash
npx playwright test tests/e2e/real-browser-http-db.spec.ts --project=chromium
```

#### 5. Kiểm tra Build & Typecheck (không lỗi cú pháp/kiểu):
```bash
npm run typecheck
npm run build
```

---

## 5. Rủi ro còn lại & Việc cần làm tiếp theo

1. **Rủi ro môi trường Deno Edge Functions:**
   - Khi chỉnh sửa file trong repo, tiến trình `npx supabase functions serve` tự động reload. Trong khoảng 2-3 giây đầu sau reload, có thể phát sinh lỗi 503 tạm thời. Trong môi trường CI cần đảm bảo gateway sẵn sàng trước khi bắn request.
2. **Cần bổ sung Browser Test cho các luồng còn lại:**
   - Xây dựng thêm kịch bản E2E thật cho:
     + Đặt giao hàng (Delivery flow với validation form địa chỉ và số điện thoại).
     + Đặt bàn trước (Reservation flow với date picker và shift selector).
     + Yêu cầu xóa tài khoản từ trang cá nhân (Customer Account deletion flow).
3. **Quyết định vận hành từ Chủ nhà hàng:**
   - Các điểm D01–D06 (cấu hình giờ mở cửa chính thức, danh mục món ăn thực tế, chính sách hoàn tiền khi hủy đơn) cần chủ quán phê duyệt trước khi đưa lên production.
