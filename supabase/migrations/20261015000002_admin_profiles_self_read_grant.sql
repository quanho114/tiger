-- Allow the login page and auth provider to read the current admin profile.
-- The existing admin_profiles_self_read RLS policy limits reads to auth.uid().
GRANT SELECT (user_id, active, display_name)
ON public.admin_profiles
TO authenticated;
