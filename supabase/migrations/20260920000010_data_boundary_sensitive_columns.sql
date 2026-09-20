-- Tiger 345 - Data Boundary & Sensitive Column Restrictions (F02 Remediation)
--
-- Fact-Forcing Metadata:
-- - Importers/Callers: Executed by Supabase migration runner; affects direct PostgREST queries
-- - Affected API: PostgREST REST API (GET /rest/v1/orders, GET /rest/v1/reservations, GET /rest/v1/order_status_history, GET /rest/v1/order_items)
-- - Data Schemas:
--   - public.orders (removes SELECT on internal_note from authenticated & anon)
--   - public.reservations (removes SELECT on internal_note, contact_outcome, contacted_at from authenticated & anon)
--   - public.order_status_history (removes SELECT on actor_admin_id, reason from authenticated & anon)
--   - public.order_items (revokes SELECT from anon)
-- - Verbatim Instructions:
--   - "BƯỚC 5 — F02: DATA BOUNDARY & SENSITIVE COLUMNS"
--   - "Kiểm tra toàn bộ privileges / policies trên orders, reservations, order_history."
--   - "Khóa triệt để đường đọc direct PostgREST đối với internal_note, actor_admin_id, metadata nhạy cảm của nhân viên/hệ thống mà customer không được phép thấy."
--   - "Tạo migration chuẩn hóa projection/grant hoặc RLS column security phù hợp."
--   - "Viết integration test gửi request dạng REST table trực tiếp bằng customer JWT để chứng minh không thể đọc internal_note."

-- 1. Ensure anon cannot read ANY columns from orders, reservations, order_status_history, or order_items
REVOKE ALL PRIVILEGES ON TABLE public.orders FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.reservations FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.order_status_history FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.order_items FROM anon;

-- 2. Revoke table-level SELECT for authenticated role on sensitive tables
REVOKE SELECT ON TABLE public.orders FROM authenticated;
REVOKE SELECT ON TABLE public.reservations FROM authenticated;
REVOKE SELECT ON TABLE public.order_status_history FROM authenticated;

-- 3. Grant column-level SELECT for authenticated role on public.orders (EXCLUDING internal_note)
GRANT SELECT (
    id,
    code,
    customer_user_id,
    order_type,
    status,
    table_id,
    table_visit_id,
    table_name_snapshot,
    customer_name,
    customer_phone,
    delivery_zone_id,
    address_snapshot,
    zone_name_snapshot,
    subtotal_vnd,
    shipping_fee_vnd,
    total_vnd,
    note,
    payment_status,
    payment_method,
    paid_at,
    confirmed_at,
    completed_at,
    cancelled_at,
    version,
    created_at,
    updated_at
) ON TABLE public.orders TO authenticated;

-- 4. Grant column-level SELECT for authenticated role on public.reservations
--    (EXCLUDING internal_note, contact_outcome, contacted_at)
GRANT SELECT (
    id,
    code,
    customer_user_id,
    customer_name,
    customer_phone,
    starts_at,
    ends_at,
    guest_count,
    seating_area_id,
    area_name_snapshot,
    status,
    note,
    version,
    created_at,
    updated_at
) ON TABLE public.reservations TO authenticated;

-- 5. Grant column-level SELECT for authenticated role on public.order_status_history
--    (EXCLUDING actor_admin_id, reason)
GRANT SELECT (
    id,
    order_id,
    from_status,
    to_status,
    created_at
) ON TABLE public.order_status_history TO authenticated;

-- 6. Grant SELECT on order_items to authenticated (no sensitive employee columns)
GRANT SELECT ON TABLE public.order_items TO authenticated;
