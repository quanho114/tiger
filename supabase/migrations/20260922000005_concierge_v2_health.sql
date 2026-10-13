CREATE TABLE public.concierge_v2_health (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  open_until timestamptz
);
ALTER TABLE public.concierge_v2_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.concierge_v2_health FROM anon, authenticated;
GRANT ALL ON public.concierge_v2_health TO service_role;
INSERT INTO public.concierge_v2_health(singleton) VALUES (true);
