CREATE TABLE public.user_ai_memory_settings (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    enabled boolean NOT NULL DEFAULT false,
    consent_version integer NOT NULL DEFAULT 1 CHECK (consent_version BETWEEN 1 AND 10000),
    memory_epoch integer NOT NULL DEFAULT 0 CHECK (memory_epoch >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_ai_memories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    memory_type text NOT NULL CHECK (memory_type IN ('preference', 'dislike', 'allergy')),
    memory_key text NOT NULL CHECK (memory_key ~ '^[a-z0-9]+(?:-[a-z0-9]+){0,15}$' AND char_length(memory_key) <= 80),
    value jsonb NOT NULL CHECK (
        jsonb_typeof(value) = 'object'
        AND jsonb_typeof(value -> 'food') = 'string'
        AND value = jsonb_build_object('food', value ->> 'food')
        AND char_length(btrim(value ->> 'food')) BETWEEN 1 AND 120
    ),
    source text NOT NULL CHECK (source IN ('explicit', 'order_history')),
    confidence smallint NOT NULL CHECK (confidence BETWEEN 0 AND 100),
    observed_at timestamptz NOT NULL,
    expires_at timestamptz NULL CHECK (expires_at IS NULL OR expires_at > observed_at),
    schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version = 1),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, memory_type, memory_key, source)
);

CREATE TABLE public.user_ai_memory_suppressions (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    memory_type text NOT NULL CHECK (memory_type IN ('preference', 'dislike', 'allergy')),
    memory_key text NOT NULL CHECK (memory_key ~ '^[a-z0-9]+(?:-[a-z0-9]+){0,15}$' AND char_length(memory_key) <= 80),
    source text NOT NULL DEFAULT 'order_history' CHECK (source = 'order_history'),
    memory_epoch integer NOT NULL CHECK (memory_epoch >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, memory_type, memory_key, source)
);

CREATE INDEX user_ai_memories_owner_active_idx ON public.user_ai_memories (user_id, memory_type, source, observed_at DESC) WHERE expires_at IS NULL;
CREATE INDEX user_ai_memories_owner_expiry_idx ON public.user_ai_memories (user_id, expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX user_ai_memory_suppressions_owner_idx ON public.user_ai_memory_suppressions (user_id, memory_epoch);

ALTER TABLE public.user_ai_memory_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_memory_suppressions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_ai_memory_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.user_ai_memories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.user_ai_memory_suppressions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_ai_memory_settings TO authenticated;
GRANT SELECT ON public.user_ai_memories TO authenticated;
GRANT SELECT ON public.user_ai_memory_suppressions TO authenticated;

CREATE POLICY "user_ai_memory_settings_owner_read" ON public.user_ai_memory_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_ai_memories_owner_read" ON public.user_ai_memories FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_ai_memory_suppressions_owner_read" ON public.user_ai_memory_suppressions FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.concierge_v2_memory_account_is_active(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deletion_requested_at timestamptz;
BEGIN
    SELECT deletion_requested_at INTO v_deletion_requested_at FROM public.customer_profiles WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND OR v_deletion_requested_at IS NOT NULL THEN
        RETURN false;
    END IF;
    IF EXISTS (SELECT 1 FROM public.customer_tombstones WHERE user_id = p_user_id) THEN
        RETURN false;
    END IF;
    IF EXISTS (SELECT 1 FROM public.account_deletion_jobs WHERE user_id = p_user_id AND status <> 'cancelled') THEN
        RETURN false;
    END IF;
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.concierge_v2_memory_settings_dto(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object('enabled', settings.enabled, 'consent_version', settings.consent_version, 'memory_epoch', settings.memory_epoch, 'updated_at', settings.updated_at)
    FROM public.user_ai_memory_settings AS settings
    WHERE settings.user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.concierge_v2_set_memory_enabled(p_user_id uuid, p_enabled boolean, p_consent_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_settings public.user_ai_memory_settings%ROWTYPE;
BEGIN
    IF p_consent_version NOT BETWEEN 1 AND 10000 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_MEMORY_SETTINGS');
    END IF;
    IF NOT public.concierge_v2_memory_account_is_active(p_user_id) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'ACCOUNT_INELIGIBLE');
    END IF;
    INSERT INTO public.user_ai_memory_settings (user_id, enabled, consent_version, memory_epoch) VALUES (p_user_id, false, p_consent_version, 0) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_settings FROM public.user_ai_memory_settings WHERE user_id = p_user_id FOR UPDATE;
    IF p_enabled THEN
        UPDATE public.user_ai_memory_settings SET enabled = true, consent_version = p_consent_version, updated_at = now() WHERE user_id = p_user_id RETURNING * INTO v_settings;
    ELSE
        DELETE FROM public.user_ai_memories WHERE user_id = p_user_id;
        DELETE FROM public.user_ai_memory_suppressions WHERE user_id = p_user_id;
        UPDATE public.user_ai_memory_settings SET enabled = false, consent_version = p_consent_version, memory_epoch = memory_epoch + 1, updated_at = now() WHERE user_id = p_user_id RETURNING * INTO v_settings;
    END IF;
    RETURN jsonb_build_object('ok', true, 'settings', jsonb_build_object('enabled', v_settings.enabled, 'consent_version', v_settings.consent_version, 'memory_epoch', v_settings.memory_epoch, 'updated_at', v_settings.updated_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.concierge_v2_forget_all_memory(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_settings public.user_ai_memory_settings%ROWTYPE;
BEGIN
    IF NOT public.concierge_v2_memory_account_is_active(p_user_id) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'ACCOUNT_INELIGIBLE');
    END IF;
    INSERT INTO public.user_ai_memory_settings (user_id, enabled, consent_version, memory_epoch) VALUES (p_user_id, false, 1, 0) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_settings FROM public.user_ai_memory_settings WHERE user_id = p_user_id FOR UPDATE;
    DELETE FROM public.user_ai_memories WHERE user_id = p_user_id;
    DELETE FROM public.user_ai_memory_suppressions WHERE user_id = p_user_id;
    UPDATE public.user_ai_memory_settings SET enabled = false, memory_epoch = memory_epoch + 1, updated_at = now() WHERE user_id = p_user_id RETURNING * INTO v_settings;
    RETURN jsonb_build_object('ok', true, 'settings', jsonb_build_object('enabled', v_settings.enabled, 'consent_version', v_settings.consent_version, 'memory_epoch', v_settings.memory_epoch, 'updated_at', v_settings.updated_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.concierge_v2_write_memory_fact(p_user_id uuid, p_expected_memory_epoch integer, p_memory_type text, p_memory_key text, p_value jsonb, p_source text, p_confidence smallint, p_observed_at timestamptz, p_expires_at timestamptz, p_schema_version smallint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_settings public.user_ai_memory_settings%ROWTYPE;
    v_fact public.user_ai_memories%ROWTYPE;
    v_fact_exists boolean;
BEGIN
    IF p_expected_memory_epoch < 0 OR p_memory_type NOT IN ('preference', 'dislike', 'allergy') OR p_memory_key !~ '^[a-z0-9]+(?:-[a-z0-9]+){0,15}$' OR char_length(p_memory_key) > 80 OR p_source NOT IN ('explicit', 'order_history') OR p_confidence NOT BETWEEN 0 AND 100 OR p_schema_version <> 1 OR p_observed_at IS NULL OR (p_expires_at IS NOT NULL AND p_expires_at <= p_observed_at) OR jsonb_typeof(p_value) <> 'object' OR jsonb_typeof(p_value -> 'food') <> 'string' OR p_value <> jsonb_build_object('food', p_value ->> 'food') OR char_length(btrim(p_value ->> 'food')) NOT BETWEEN 1 AND 120 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_MEMORY_FACT');
    END IF;
    IF NOT public.concierge_v2_memory_account_is_active(p_user_id) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'ACCOUNT_INELIGIBLE');
    END IF;
    SELECT * INTO v_settings FROM public.user_ai_memory_settings WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND OR NOT v_settings.enabled THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'MEMORY_DISABLED');
    END IF;
    IF v_settings.memory_epoch <> p_expected_memory_epoch THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'MEMORY_EPOCH_MISMATCH');
    END IF;
    IF p_source = 'order_history' AND EXISTS (SELECT 1 FROM public.user_ai_memory_suppressions WHERE user_id = p_user_id AND memory_type = p_memory_type AND memory_key = p_memory_key AND source = p_source AND memory_epoch = v_settings.memory_epoch) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'MEMORY_SUPPRESSED');
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.user_ai_memories WHERE user_id = p_user_id AND memory_type = p_memory_type AND memory_key = p_memory_key AND source = p_source) INTO v_fact_exists;
    IF NOT v_fact_exists AND (SELECT count(*) FROM public.user_ai_memories WHERE user_id = p_user_id) >= 100 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'MEMORY_LIMIT_REACHED');
    END IF;
    INSERT INTO public.user_ai_memories (user_id, memory_type, memory_key, value, source, confidence, observed_at, expires_at, schema_version) VALUES (p_user_id, p_memory_type, p_memory_key, p_value, p_source, p_confidence, p_observed_at, p_expires_at, p_schema_version)
    ON CONFLICT (user_id, memory_type, memory_key, source) DO UPDATE SET value = EXCLUDED.value, confidence = EXCLUDED.confidence, observed_at = EXCLUDED.observed_at, expires_at = EXCLUDED.expires_at, schema_version = EXCLUDED.schema_version, updated_at = now()
    RETURNING * INTO v_fact;
    RETURN jsonb_build_object('ok', true, 'fact', jsonb_build_object('id', v_fact.id, 'memory_type', v_fact.memory_type, 'memory_key', v_fact.memory_key, 'value', v_fact.value, 'source', v_fact.source, 'confidence', v_fact.confidence, 'observed_at', v_fact.observed_at, 'expires_at', v_fact.expires_at, 'schema_version', v_fact.schema_version, 'updated_at', v_fact.updated_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.concierge_v2_delete_memory_fact(p_user_id uuid, p_memory_type text, p_memory_key text, p_source text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_settings public.user_ai_memory_settings%ROWTYPE;
    v_deleted_count integer;
BEGIN
    IF p_memory_type NOT IN ('preference', 'dislike', 'allergy') OR p_memory_key !~ '^[a-z0-9]+(?:-[a-z0-9]+){0,15}$' OR char_length(p_memory_key) > 80 OR p_source NOT IN ('explicit', 'order_history') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_MEMORY_FACT');
    END IF;
    IF NOT public.concierge_v2_memory_account_is_active(p_user_id) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'ACCOUNT_INELIGIBLE');
    END IF;
    SELECT * INTO v_settings FROM public.user_ai_memory_settings WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND OR NOT v_settings.enabled THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'MEMORY_DISABLED');
    END IF;
    IF p_source = 'order_history' AND NOT EXISTS (SELECT 1 FROM public.user_ai_memory_suppressions WHERE user_id = p_user_id AND memory_type = p_memory_type AND memory_key = p_memory_key AND source = p_source) AND (SELECT count(*) FROM public.user_ai_memory_suppressions WHERE user_id = p_user_id) >= 100 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'MEMORY_LIMIT_REACHED');
    END IF;
    DELETE FROM public.user_ai_memories WHERE user_id = p_user_id AND memory_type = p_memory_type AND memory_key = p_memory_key AND source = p_source;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF p_source = 'order_history' THEN
        INSERT INTO public.user_ai_memory_suppressions (user_id, memory_type, memory_key, source, memory_epoch) VALUES (p_user_id, p_memory_type, p_memory_key, p_source, v_settings.memory_epoch)
        ON CONFLICT (user_id, memory_type, memory_key, source) DO UPDATE SET memory_epoch = EXCLUDED.memory_epoch, created_at = now();
    END IF;
    RETURN jsonb_build_object('ok', true, 'deleted', v_deleted_count > 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.concierge_v2_restore_behavioral_memory_fact(p_user_id uuid, p_memory_type text, p_memory_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_settings public.user_ai_memory_settings%ROWTYPE;
    v_restored_count integer;
BEGIN
    IF p_memory_type NOT IN ('preference', 'dislike', 'allergy') OR p_memory_key !~ '^[a-z0-9]+(?:-[a-z0-9]+){0,15}$' OR char_length(p_memory_key) > 80 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_MEMORY_FACT');
    END IF;
    IF NOT public.concierge_v2_memory_account_is_active(p_user_id) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'ACCOUNT_INELIGIBLE');
    END IF;
    SELECT * INTO v_settings FROM public.user_ai_memory_settings WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND OR NOT v_settings.enabled THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'MEMORY_DISABLED');
    END IF;
    DELETE FROM public.user_ai_memory_suppressions WHERE user_id = p_user_id AND memory_type = p_memory_type AND memory_key = p_memory_key AND source = 'order_history';
    GET DIAGNOSTICS v_restored_count = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'restored', v_restored_count > 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.concierge_v2_purge_memory_for_deletion(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_ai_memory_settings (user_id, enabled, consent_version, memory_epoch) VALUES (p_user_id, false, 1, 1)
    ON CONFLICT (user_id) DO UPDATE SET enabled = false, memory_epoch = public.user_ai_memory_settings.memory_epoch + 1, updated_at = now();
    DELETE FROM public.user_ai_memories WHERE user_id = p_user_id;
    DELETE FROM public.user_ai_memory_suppressions WHERE user_id = p_user_id;
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.concierge_v2_memory_account_is_active(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.concierge_v2_memory_settings_dto(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.concierge_v2_set_memory_enabled(uuid, boolean, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.concierge_v2_forget_all_memory(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.concierge_v2_write_memory_fact(uuid, integer, text, text, jsonb, text, smallint, timestamptz, timestamptz, smallint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.concierge_v2_delete_memory_fact(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.concierge_v2_restore_behavioral_memory_fact(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.concierge_v2_purge_memory_for_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.concierge_v2_memory_settings_dto(uuid) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.concierge_v2_set_memory_enabled(uuid, boolean, integer) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.concierge_v2_forget_all_memory(uuid) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.concierge_v2_write_memory_fact(uuid, integer, text, text, jsonb, text, smallint, timestamptz, timestamptz, smallint) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.concierge_v2_delete_memory_fact(uuid, text, text, text) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.concierge_v2_restore_behavioral_memory_fact(uuid, text, text) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.concierge_v2_purge_memory_for_deletion(uuid) TO service_role, postgres;
