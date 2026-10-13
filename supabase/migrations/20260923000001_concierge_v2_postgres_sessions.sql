-- Short-lived Concierge V2 state. Only the server's database connection may read it.
CREATE TABLE public.concierge_v2_sessions (
  session_id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  record text NOT NULL CHECK (octet_length(record) <= 262144),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX concierge_v2_sessions_expiry_idx ON public.concierge_v2_sessions (expires_at);

ALTER TABLE public.concierge_v2_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.concierge_v2_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concierge_v2_sessions TO service_role;
