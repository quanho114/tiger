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
    UPDATE public.user_ai_memory_settings SET memory_epoch = memory_epoch + 1, updated_at = now() WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', true, 'deleted', v_deleted_count > 0);
END;
$$;


CREATE OR REPLACE FUNCTION public.concierge_v2_on_account_deleting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.concierge_v2_purge_memory_for_deletion(NEW.user_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.concierge_v2_on_account_deleting() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER concierge_v2_account_deleting AFTER UPDATE OF deletion_requested_at ON public.customer_profiles
FOR EACH ROW WHEN (OLD.deletion_requested_at IS NULL AND NEW.deletion_requested_at IS NOT NULL)
EXECUTE FUNCTION public.concierge_v2_on_account_deleting();

CREATE OR REPLACE FUNCTION public.concierge_v2_delete_memory_fact_fenced(p_user_id uuid, p_memory_type text, p_memory_key text, p_source text, p_expected_epoch bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_epoch bigint;
BEGIN
  IF NOT public.concierge_v2_memory_account_is_active(p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ACCOUNT_INELIGIBLE');
  END IF;
  SELECT memory_epoch INTO v_epoch FROM public.user_ai_memory_settings WHERE user_id = p_user_id FOR UPDATE;
  IF p_expected_epoch IS NOT NULL AND v_epoch IS DISTINCT FROM p_expected_epoch THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'MEMORY_EPOCH_MISMATCH');
  END IF;
  RETURN public.concierge_v2_delete_memory_fact(p_user_id, p_memory_type, p_memory_key, p_source);
END;
$$;
REVOKE ALL ON FUNCTION public.concierge_v2_delete_memory_fact_fenced(uuid,text,text,text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.concierge_v2_delete_memory_fact_fenced(uuid,text,text,text,bigint) TO service_role, postgres;

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
    IF p_source = 'order_history' AND EXISTS (SELECT 1 FROM public.user_ai_memory_suppressions WHERE user_id = p_user_id AND memory_type = p_memory_type AND memory_key = p_memory_key AND source = p_source) THEN
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
