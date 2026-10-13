-- Server-only flags. An absent override uses the environment/default value.
CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_settings FROM anon, authenticated;
GRANT ALL ON public.system_settings TO service_role;
