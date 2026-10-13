-- Admin-approved concierge knowledge shared by every Edge Function instance.
CREATE TABLE public.concierge_knowledge (
  kind text NOT NULL CHECK (kind IN ('config', 'serving', 'allergen', 'document')),
  key text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, key)
);

ALTER TABLE public.concierge_knowledge ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.concierge_knowledge FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.concierge_knowledge TO service_role;
