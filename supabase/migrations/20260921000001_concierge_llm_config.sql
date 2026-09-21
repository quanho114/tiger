-- ==============================================================================
-- Tiger 345 - Concierge LLM runtime config (admin-managed, DB-driven)
-- Single-row table (id = 1). Admin edits provider/base_url/api_key/model via
-- Admin UI; the concierge runtime loads it per turn and all users share it.
-- API key is service_role-only: RLS enabled with NO policies, so every
-- client role (anon/authenticated) is denied. Only edge functions
-- (service_role pool) can read/write. Admin API masks the key on read.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.concierge_llm_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider text NOT NULL DEFAULT 'stub'
    CHECK (provider IN ('stub', 'openai', 'anthropic', 'gemini')),
  base_url text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.concierge_llm_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.concierge_llm_config ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: deny all client roles, service_role bypasses RLS.
