-- Tiger Agent V3 Phase 5: authoritative menu AI/service profiles.
-- menu_items stays the selling/availability truth (price, published, available,
-- is_signature, is_bestseller). This table holds serving/taste/allergen/
-- recommendation metadata, replacing hardcoded SERVING_PROFILES/ALLERGEN_PROFILES.
-- Migrated rows keep their provenance: demo estimates stay UNVERIFIED.

CREATE TABLE IF NOT EXISTS public.menu_item_ai_profiles (
  menu_item_id UUID PRIMARY KEY REFERENCES public.menu_items(id) ON DELETE CASCADE,

  serving_unit TEXT,
  serving_description TEXT,
  people_min INTEGER CHECK (people_min IS NULL OR people_min >= 1),
  people_max INTEGER CHECK (people_max IS NULL OR people_max >= 1),
  CHECK (people_min IS NULL OR people_max IS NULL OR people_max >= people_min),
  meal_role TEXT CHECK (meal_role IS NULL OR meal_role IN
    ('main_protein', 'carb', 'vegetable', 'soup_hotpot', 'side', 'dessert', 'drink', 'alcohol', 'set')),
  meal_context TEXT NOT NULL DEFAULT 'shared' CHECK (meal_context IN
    ('single_main', 'shared', 'side_pairing')),

  protein_score DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (protein_score >= 0 AND protein_score <= 1.5),
  carb_score DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (carb_score >= 0 AND carb_score <= 1.5),
  vegetable_score DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (vegetable_score >= 0 AND vegetable_score <= 1.5),
  soup_score DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (soup_score >= 0 AND soup_score <= 1.5),

  spice_level INTEGER CHECK (spice_level IS NULL OR (spice_level >= 0 AND spice_level <= 2)),
  richness_level INTEGER CHECK (richness_level IS NULL OR (richness_level >= 0 AND richness_level <= 2)),

  taste_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  dietary_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  pairing_item_ids JSONB NOT NULL DEFAULT '[]'::jsonb,

  allergens JSONB NOT NULL DEFAULT '{}'::jsonb,
  allergen_source TEXT NOT NULL DEFAULT 'demo_estimate' CHECK (allergen_source IN
    ('system_seed', 'demo_estimate', 'kitchen_audited')),
  allergen_verified BOOLEAN NOT NULL DEFAULT FALSE,
  allergen_verified_at TIMESTAMPTZ,
  allergen_verified_by TEXT,
  kitchen_notes TEXT NOT NULL DEFAULT '',

  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN
    ('restaurant_defined', 'estimated', 'unknown')),
  provenance TEXT NOT NULL DEFAULT 'admin',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.menu_item_ai_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.menu_item_ai_profiles FROM anon, authenticated;
REVOKE ALL ON public.menu_item_ai_profiles FROM PUBLIC;

-- One-time backfill: adopt concierge_knowledge serving/allergen overlay rows
-- (admin edits) for menu items that still exist. Overlay wins over seed.
-- Rows referencing deleted items are skipped (reported by the audit test).
INSERT INTO public.menu_item_ai_profiles (
  menu_item_id, serving_unit, serving_description, people_min, people_max,
  meal_role, meal_context, protein_score, carb_score, vegetable_score, soup_score,
  confidence, provenance
)
SELECT
  m.id,
  NULLIF(k.payload->>'serving_unit', ''),
  NULLIF(k.payload->>'pieces_or_weight', ''),
  NULLIF(k.payload->>'people_min', '')::INTEGER,
  NULLIF(k.payload->>'people_max', '')::INTEGER,
  NULLIF(k.payload->>'meal_role', ''),
  COALESCE(NULLIF(k.payload->>'meal_context', ''), 'shared'),
  COALESCE(NULLIF(k.payload->'contributions'->>'protein', '')::DOUBLE PRECISION, 0),
  COALESCE(NULLIF(k.payload->'contributions'->>'carb', '')::DOUBLE PRECISION, 0),
  COALESCE(NULLIF(k.payload->'contributions'->>'vegetable', '')::DOUBLE PRECISION, 0),
  COALESCE(NULLIF(k.payload->'contributions'->>'soup', '')::DOUBLE PRECISION, 0),
  COALESCE(NULLIF(k.payload->>'confidence', ''), 'unknown'),
  'migrated:concierge_knowledge'
FROM public.concierge_knowledge k
JOIN public.menu_items m ON m.id::text = k.key AND (k.payload->>'item_id') = k.key
WHERE k.kind = 'serving'
ON CONFLICT (menu_item_id) DO NOTHING;

INSERT INTO public.menu_item_ai_profiles (
  menu_item_id, allergens, allergen_source, allergen_verified, kitchen_notes, provenance
)
SELECT
  m.id,
  COALESCE(k.payload->'allergens', '{}'::jsonb),
  -- Provenance preserved: demo estimates stay unverified. Never auto-verify.
  CASE WHEN COALESCE((k.payload->>'verified_by_kitchen')::BOOLEAN, FALSE) THEN 'kitchen_audited' ELSE 'demo_estimate' END,
  FALSE,
  COALESCE(k.payload->>'kitchen_notes', ''),
  'migrated:concierge_knowledge'
FROM public.concierge_knowledge k
JOIN public.menu_items m ON m.id::text = k.key AND (k.payload->>'item_id') = k.key
WHERE k.kind = 'allergen'
ON CONFLICT (menu_item_id) DO UPDATE SET
  allergens = EXCLUDED.allergens,
  allergen_source = EXCLUDED.allergen_source,
  allergen_verified = FALSE,
  kitchen_notes = EXCLUDED.kitchen_notes,
  provenance = EXCLUDED.provenance,
  updated_at = now();
