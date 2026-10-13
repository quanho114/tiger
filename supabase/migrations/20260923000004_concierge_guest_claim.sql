-- One-time, short-lived handoff for a guest conversation during login.
CREATE TABLE public.concierge_v2_claim_tickets (
  ticket_hash text PRIMARY KEY CHECK (ticket_hash ~ '^[a-f0-9]{64}$'),
  session_id uuid NOT NULL UNIQUE REFERENCES public.concierge_v2_sessions(session_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE INDEX concierge_v2_claim_tickets_expiry_idx ON public.concierge_v2_claim_tickets (expires_at);
ALTER TABLE public.concierge_v2_claim_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.concierge_v2_claim_tickets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concierge_v2_claim_tickets TO service_role;
