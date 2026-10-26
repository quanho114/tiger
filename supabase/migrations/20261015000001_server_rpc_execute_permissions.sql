-- These functions are called by the authenticated Edge gateways using the
-- backend database role. Their actor IDs and trusted clock inputs must never
-- be accepted directly from a public Data API caller.
-- Earlier DROP/CREATE migrations reset function ACLs. Resolve all current
-- signatures so a historical overload cannot retain public execution rights.
DO $$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT n.nspname AS schema_name,
               p.proname AS function_name,
               pg_get_function_identity_arguments(p.oid) AS identity_arguments
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prokind = 'f'
          AND p.proname IN (
              'create_order',
              'create_reservation',
              'upsert_customer_address',
              'delete_customer_address',
              'cancel_customer_reservation',
              'replace_business_hours',
              'replace_business_closures',
              'settle_table_visit_payment'
          )
    LOOP
        EXECUTE format(
            'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
            target.schema_name, target.function_name, target.identity_arguments
        );
        EXECUTE format(
            'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role, postgres',
            target.schema_name, target.function_name, target.identity_arguments
        );
    END LOOP;
END;
$$;
