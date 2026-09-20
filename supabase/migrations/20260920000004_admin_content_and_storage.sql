-- Migration: 20260920000004_admin_content_and_storage.sql
-- Description: Storage bucket setup for restaurant-media, RLS policies, and atomic business hours/closures replacement RPCs.

-- 1. Create restaurant-media storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'restaurant-media',
    'restaurant-media',
    true,
    5242880, -- 5MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Helper function to check if a user is an active admin (bypasses RLS on admin_profiles)
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE user_id = p_user_id AND active = true
  );
$$;

-- 2. Storage Policies for restaurant-media
DROP POLICY IF EXISTS "restaurant_media_public_read" ON storage.objects;
CREATE POLICY "restaurant_media_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'restaurant-media');

DROP POLICY IF EXISTS "restaurant_media_admin_insert" ON storage.objects;
CREATE POLICY "restaurant_media_admin_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'restaurant-media'
    AND public.is_admin()
);

DROP POLICY IF EXISTS "restaurant_media_admin_update" ON storage.objects;
CREATE POLICY "restaurant_media_admin_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'restaurant-media'
    AND public.is_admin()
)
WITH CHECK (
    bucket_id = 'restaurant-media'
    AND public.is_admin()
);

DROP POLICY IF EXISTS "restaurant_media_admin_delete" ON storage.objects;
CREATE POLICY "restaurant_media_admin_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'restaurant-media'
    AND public.is_admin()
);

-- 3. Atomic replacement RPC for business hours
CREATE OR REPLACE FUNCTION public.replace_business_hours(
    p_expected_settings_version integer,
    p_hours jsonb,
    p_admin_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_current_version integer;
    v_item jsonb;
    v_weekday integer;
    v_service_type text;
    v_open_time time;
    v_close_time time;
    v_hours_inserted integer := 0;
    v_i integer;
    v_j integer;
    v_item_a jsonb;
    v_item_b jsonb;
    v_count integer;
BEGIN
    -- 1. Check settings version and lock row
    SELECT version INTO v_current_version
    FROM public.restaurant_settings
    WHERE id = 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SETTINGS_NOT_FOUND: Cấu hình nhà hàng không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    IF p_expected_settings_version IS NOT NULL AND v_current_version != p_expected_settings_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Phiên bản cài đặt đã thay đổi (hiện tại %, yêu cầu %)', v_current_version, p_expected_settings_version
            USING ERRCODE = 'P0003';
    END IF;

    -- 2. Validate input array
    IF jsonb_typeof(p_hours) != 'array' THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Danh sách giờ làm việc phải là một mảng'
            USING ERRCODE = 'P0012';
    END IF;

    v_count := jsonb_array_length(p_hours);

    -- Validate each item
    FOR v_i IN 0..(v_count - 1) LOOP
        v_item := p_hours->v_i;
        v_weekday := (v_item->>'weekday')::integer;
        v_service_type := v_item->>'service_type';
        v_open_time := (v_item->>'open_time')::time;
        v_close_time := (v_item->>'close_time')::time;

        IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Thứ trong tuần (weekday) phải từ 0 (Chủ nhật) đến 6 (Thứ bảy)'
                USING ERRCODE = 'P0012';
        END IF;

        IF v_service_type NOT IN ('restaurant', 'delivery', 'reservation') THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Loại dịch vụ không hợp lệ (%)', v_service_type
                USING ERRCODE = 'P0012';
        END IF;

        IF v_open_time >= v_close_time THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Giờ mở cửa (%) phải trước giờ đóng cửa (%)', v_open_time, v_close_time
                USING ERRCODE = 'P0012';
        END IF;
    END LOOP;

    -- Check interval overlaps for same (weekday, service_type)
    IF v_count > 1 THEN
        FOR v_i IN 0..(v_count - 2) LOOP
            v_item_a := p_hours->v_i;
            FOR v_j IN (v_i + 1)..(v_count - 1) LOOP
                v_item_b := p_hours->v_j;
                IF (v_item_a->>'weekday')::integer = (v_item_b->>'weekday')::integer
                   AND (v_item_a->>'service_type') = (v_item_b->>'service_type')
                   AND COALESCE((v_item_a->>'active')::boolean, true) = true
                   AND COALESCE((v_item_b->>'active')::boolean, true) = true THEN
                    -- Check interval intersection: max(open_a, open_b) < min(close_a, close_b)
                    IF GREATEST((v_item_a->>'open_time')::time, (v_item_b->>'open_time')::time) <
                       LEAST((v_item_a->>'close_time')::time, (v_item_b->>'close_time')::time) THEN
                        RAISE EXCEPTION 'HOURS_OVERLAP: Khung giờ bị trùng lặp cho thứ % và dịch vụ %',
                            v_item_a->>'weekday', v_item_a->>'service_type'
                            USING ERRCODE = 'P0012';
                    END IF;
                END IF;
            END LOOP;
        END LOOP;
    END IF;

    -- 3. Replace collection
    DELETE FROM public.business_hours;

    FOR v_i IN 0..(v_count - 1) LOOP
        v_item := p_hours->v_i;
        INSERT INTO public.business_hours (
            id,
            weekday,
            service_type,
            open_time,
            close_time,
            active,
            created_at
        ) VALUES (
            gen_random_uuid(),
            (v_item->>'weekday')::integer,
            v_item->>'service_type',
            (v_item->>'open_time')::time,
            (v_item->>'close_time')::time,
            COALESCE((v_item->>'active')::boolean, true),
            now()
        );
        v_hours_inserted := v_hours_inserted + 1;
    END LOOP;

    -- 4. Update settings version
    UPDATE public.restaurant_settings
    SET version = version + 1,
        updated_at = now()
    WHERE id = 1
    RETURNING version INTO v_current_version;

    -- 5. Audit log
    INSERT INTO public.audit_logs (
        admin_id,
        actor_kind,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        p_admin_id,
        'admin',
        'replace_business_hours',
        'restaurant_settings',
        '1',
        jsonb_build_object(
            'hours_count', v_hours_inserted,
            'new_version', v_current_version
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'new_version', v_current_version,
        'new_settings_version', v_current_version,
        'count', v_hours_inserted,
        'rows_inserted', v_hours_inserted
    );
END;
$$;

-- 4. Atomic replacement RPC for business closures
CREATE OR REPLACE FUNCTION public.replace_business_closures(
    p_expected_settings_version integer,
    p_closures jsonb,
    p_admin_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_current_version integer;
    v_item jsonb;
    v_date date;
    v_service_type text;
    v_reason text;
    v_closures_inserted integer := 0;
    v_i integer;
    v_j integer;
    v_item_a jsonb;
    v_item_b jsonb;
    v_count integer;
BEGIN
    -- 1. Check settings version and lock row
    SELECT version INTO v_current_version
    FROM public.restaurant_settings
    WHERE id = 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SETTINGS_NOT_FOUND: Cấu hình nhà hàng không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    IF p_expected_settings_version IS NOT NULL AND v_current_version != p_expected_settings_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Phiên bản cài đặt đã thay đổi (hiện tại %, yêu cầu %)', v_current_version, p_expected_settings_version
            USING ERRCODE = 'P0003';
    END IF;

    -- 2. Validate input array
    IF jsonb_typeof(p_closures) != 'array' THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Danh sách ngày nghỉ phải là một mảng'
            USING ERRCODE = 'P0012';
    END IF;

    v_count := jsonb_array_length(p_closures);

    FOR v_i IN 0..(v_count - 1) LOOP
        v_item := p_closures->v_i;
        v_date := (v_item->>'date')::date;
        v_service_type := v_item->>'service_type';
        v_reason := TRIM(COALESCE(v_item->>'reason', ''));

        IF v_date IS NULL THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Ngày nghỉ (date) không hợp lệ'
                USING ERRCODE = 'P0012';
        END IF;

        IF v_service_type NOT IN ('restaurant', 'delivery', 'reservation', 'all') THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Loại dịch vụ ngày nghỉ không hợp lệ (%)', v_service_type
                USING ERRCODE = 'P0012';
        END IF;

        IF LENGTH(v_reason) = 0 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Lý do nghỉ (reason) không được để trống'
                USING ERRCODE = 'P0012';
        END IF;
    END LOOP;

    -- Check duplicate (date, service_type)
    IF v_count > 1 THEN
        FOR v_i IN 0..(v_count - 2) LOOP
            v_item_a := p_closures->v_i;
            FOR v_j IN (v_i + 1)..(v_count - 1) LOOP
                v_item_b := p_closures->v_j;
                IF (v_item_a->>'date') = (v_item_b->>'date')
                   AND (v_item_a->>'service_type') = (v_item_b->>'service_type') THEN
                    RAISE EXCEPTION 'VALIDATION_ERROR: Ngày nghỉ bị trùng lặp cho ngày % và dịch vụ %',
                        v_item_a->>'date', v_item_a->>'service_type'
                        USING ERRCODE = 'P0012';
                END IF;
            END LOOP;
        END LOOP;
    END IF;

    -- 3. Replace collection
    DELETE FROM public.business_closures;

    FOR v_i IN 0..(v_count - 1) LOOP
        v_item := p_closures->v_i;
        INSERT INTO public.business_closures (
            id,
            date,
            service_type,
            reason,
            created_at
        ) VALUES (
            gen_random_uuid(),
            (v_item->>'date')::date,
            v_item->>'service_type',
            TRIM(v_item->>'reason'),
            now()
        );
        v_closures_inserted := v_closures_inserted + 1;
    END LOOP;

    -- 4. Update settings version
    UPDATE public.restaurant_settings
    SET version = version + 1,
        updated_at = now()
    WHERE id = 1
    RETURNING version INTO v_current_version;

    -- 5. Audit log
    INSERT INTO public.audit_logs (
        admin_id,
        actor_kind,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        p_admin_id,
        'admin',
        'replace_business_closures',
        'restaurant_settings',
        '1',
        jsonb_build_object(
            'closures_count', v_closures_inserted,
            'new_version', v_current_version
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'new_version', v_current_version,
        'new_settings_version', v_current_version,
        'count', v_closures_inserted,
        'rows_inserted', v_closures_inserted
    );
END;
$$;

-- 5. Overwrite rotate_table_qr to atomically bump dining_tables.version (Invariant V07)
CREATE OR REPLACE FUNCTION public.rotate_table_qr(
    p_table_id uuid,
    p_token_hash text,
    p_admin_id uuid DEFAULT NULL,
    p_expected_table_version int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_table public.dining_tables%ROWTYPE;
    v_new_qr_id uuid;
    v_epoch_bumped boolean := false;
BEGIN
    -- 1. Lock table row
    SELECT * INTO v_table
    FROM public.dining_tables
    WHERE id = p_table_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TABLE_NOT_FOUND: Bàn không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    IF p_expected_table_version IS NOT NULL AND v_table.version != p_expected_table_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Thông tin bàn đã bị thay đổi'
            USING ERRCODE = 'P0003';
    END IF;

    -- 2. Deactivate previous active QR tokens
    UPDATE public.table_qr_tokens
    SET active = false,
        rotated_at = now()
    WHERE table_id = p_table_id AND active = true;

    -- 3. Insert new active token
    INSERT INTO public.table_qr_tokens (
        id,
        table_id,
        token_hash,
        active,
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_table_id,
        p_token_hash,
        true,
        now()
    )
    RETURNING id INTO v_new_qr_id;

    -- 4. Atomically bump dining_tables version (Invariant V07)
    UPDATE public.dining_tables
    SET version = version + 1,
        updated_at = now()
    WHERE id = p_table_id
    RETURNING * INTO v_table;

    -- 5. If table has an open visit, bump capability_epoch to revoke capabilities atomically
    UPDATE public.table_visits
    SET capability_epoch = capability_epoch + 1,
        version = version + 1,
        updated_at = now()
    WHERE table_id = p_table_id AND status = 'open';

    IF FOUND THEN
        v_epoch_bumped := true;
    END IF;

    -- 6. Audit log entry
    INSERT INTO public.audit_logs (
        admin_id,
        actor_kind,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        p_admin_id,
        'admin',
        'rotate_qr',
        'dining_table',
        p_table_id::text,
        jsonb_build_object(
            'qr_token_id', v_new_qr_id,
            'epoch_bumped', v_epoch_bumped,
            'table_version', v_table.version
        )
    );

    RETURN jsonb_build_object(
        'qr_token_id', v_new_qr_id,
        'table_id', p_table_id,
        'epoch_bumped', v_epoch_bumped,
        'table', to_jsonb(v_table)
    );
END;
$$;
