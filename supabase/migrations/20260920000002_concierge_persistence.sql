-- ==============================================================================
-- Migration: 20260920000002_concierge_persistence.sql
-- Description: PostgreSQL schema for Tiger Restaurant Concierge persistence
-- Enforces:
-- 1. Persistent storage for conversation state replacing in-memory Map
-- 2. Atomic Compare-And-Swap (CAS) on `state_version`
-- 3. Proposal persistence and binding for cart revalidation & feedback
-- 4. Shared persistent storage for customer feedback between public and admin APIs
-- 5. Append-only conversation events audit log
-- ==============================================================================

-- 1. Concierge Conversations Table
CREATE TABLE IF NOT EXISTS public.concierge_conversations (
    id text PRIMARY KEY,
    session_token text NOT NULL,
    customer_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    current_step text NOT NULL DEFAULT 'IDLE',
    state_version int NOT NULL DEFAULT 1,
    constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
    active_proposal_id text NULL,
    pending_action jsonb NULL,
    last_interaction_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concierge_conversations_user
    ON public.concierge_conversations(customer_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_conversations_token
    ON public.concierge_conversations(session_token);

-- 2. Concierge Proposals Table
CREATE TABLE IF NOT EXISTS public.concierge_proposals (
    id text PRIMARY KEY,
    conversation_id text NULL REFERENCES public.concierge_conversations(id) ON DELETE CASCADE,
    proposal_version int NOT NULL DEFAULT 1,
    title text NOT NULL,
    concept text NOT NULL,
    items jsonb NOT NULL DEFAULT '[]'::jsonb,
    validation jsonb NOT NULL DEFAULT '{}'::jsonb,
    total_estimated_vnd bigint NOT NULL DEFAULT 0,
    budget_max_vnd bigint NULL,
    customer_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_scope text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concierge_proposals_conv
    ON public.concierge_proposals(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_proposals_actor
    ON public.concierge_proposals(actor_scope);

-- 3. Concierge Feedback Table
CREATE TABLE IF NOT EXISTS public.concierge_feedback (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id text NULL REFERENCES public.concierge_conversations(id) ON DELETE SET NULL,
    proposal_id text NOT NULL,
    proposal_version int NOT NULL DEFAULT 1,
    config_version text NOT NULL DEFAULT '1.0.0',
    rating text NOT NULL CHECK (rating IN ('perfect', 'too_much', 'too_little', 'too_expensive', 'dislike')),
    feedback_text text NULL CHECK (feedback_text IS NULL OR char_length(feedback_text) <= 1000),
    customer_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_scope text NOT NULL,
    status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'REVIEWED', 'DISMISSED')),
    admin_notes text NULL,
    reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concierge_feedback_status
    ON public.concierge_feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_feedback_proposal
    ON public.concierge_feedback(proposal_id);
CREATE INDEX IF NOT EXISTS idx_concierge_feedback_user
    ON public.concierge_feedback(customer_user_id);

-- 4. Concierge Conversation Events Audit Log
CREATE TABLE IF NOT EXISTS public.concierge_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id text NOT NULL REFERENCES public.concierge_conversations(id) ON DELETE CASCADE,
    actor_scope text NOT NULL,
    turn_type text NOT NULL CHECK (turn_type IN ('chat', 'action')),
    user_message text NULL,
    intent text NULL,
    agent_reply text NULL,
    action_type text NULL,
    action_result jsonb NULL,
    state_version_before int NOT NULL,
    state_version_after int NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concierge_events_conv
    ON public.concierge_events(conversation_id, created_at ASC);

-- 5. Row Level Security & Access Grants
ALTER TABLE public.concierge_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_events ENABLE ROW LEVEL SECURITY;

-- Service role and postgres have full access
GRANT ALL ON TABLE public.concierge_conversations TO service_role, postgres;
GRANT ALL ON TABLE public.concierge_proposals TO service_role, postgres;
GRANT ALL ON TABLE public.concierge_feedback TO service_role, postgres;
GRANT ALL ON TABLE public.concierge_events TO service_role, postgres;

-- Authenticated customers can read their own conversations and proposals
CREATE POLICY "concierge_conversations_customer_read"
    ON public.concierge_conversations FOR SELECT
    TO authenticated
    USING (customer_user_id = auth.uid());

CREATE POLICY "concierge_proposals_customer_read"
    ON public.concierge_proposals FOR SELECT
    TO authenticated
    USING (customer_user_id = auth.uid());

CREATE POLICY "concierge_feedback_customer_read"
    ON public.concierge_feedback FOR SELECT
    TO authenticated
    USING (customer_user_id = auth.uid());
