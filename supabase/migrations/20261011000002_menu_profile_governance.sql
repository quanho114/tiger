-- Tiger Agent V3 Phase 5.5: profile provenance + AI draft workflow.
-- Per-section sources distinguish admin/kitchen truth from AI estimates.
-- AI drafts live in their own table and NEVER auto-verify safety data.

ALTER TABLE public.menu_item_ai_profiles
  ADD COLUMN IF NOT EXISTS serving_source TEXT NOT NULL DEFAULT 'admin' CHECK (serving_source IN
    ('restaurant_admin', 'kitchen', 'ai_draft', 'migration', 'system_default', 'admin')),
  ADD COLUMN IF NOT EXISTS taste_source TEXT NOT NULL DEFAULT 'admin' CHECK (taste_source IN
    ('restaurant_admin', 'kitchen', 'ai_draft', 'migration', 'system_default', 'admin'));

-- Normalize legacy 'admin' source label forward; keep history readable.
-- (No data rewrite: existing rows keep their stored source.)

CREATE TABLE IF NOT EXISTS public.menu_item_ai_profile_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider TEXT,
  model TEXT,
  created_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_profile_drafts_item_status
  ON public.menu_item_ai_profile_drafts (menu_item_id, status);

ALTER TABLE public.menu_item_ai_profile_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.menu_item_ai_profile_drafts FROM anon, authenticated;
REVOKE ALL ON public.menu_item_ai_profile_drafts FROM PUBLIC;
