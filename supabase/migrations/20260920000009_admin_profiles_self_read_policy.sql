-- Tiger 345 - Admin Profiles Self-Read RLS Policy (F03 Remediation)
-- Fact-Forcing Metadata:
-- Importers/Callers: Executed by Supabase migration runner; queried by AdminLoginPage.tsx & AuthProvider.tsx
-- Affected API: PostgREST GET /rest/v1/admin_profiles
-- Data Schemas: public.admin_profiles (user_id, display_name, active)
-- Verbatim Instruction: BƯỚC 4 — F03: ADMIN LOGIN THẬT: Khắc phục cơ chế authorization/RLS để admin đăng nhập thật thành công, không bị RLS chặn chính mình.

-- 1. Ensure anon cannot read admin profiles under any circumstances
REVOKE SELECT ON public.admin_profiles FROM anon;

-- 2. Allow authenticated users to read only their own row
DROP POLICY IF EXISTS "admin_profiles_self_read" ON public.admin_profiles;
CREATE POLICY "admin_profiles_self_read"
    ON public.admin_profiles
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
