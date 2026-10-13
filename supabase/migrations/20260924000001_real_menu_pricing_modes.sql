-- Fact-Forcing Gate Context:
-- - Importers/Callers: Supabase db migration engine, Edge Functions, Frontend Admin & Catalog
-- - Affected APIs: GET /menu, POST /order-quotes, GET /menu-items, POST /menu-items, PATCH /menu-items/:id
-- - Data Schemas: public.menu_items (adding pricing_mode, price_min, price_max, image_source, review_note)
-- - User's Verbatim Instruction: "update các món thật này vào, gỡ các món fake ở menu ra đi bạn"

-- Migration: Add 4-tier pricing model, image classification, and review note to menu_items
-- Migration ID: 20260924000001_real_menu_pricing_modes.sql

-- 1. Create pricing_mode and image_source types if not already created
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'menu_item_pricing_mode') THEN
    CREATE TYPE public.menu_item_pricing_mode AS ENUM ('fixed', 'range', 'market', 'unknown');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'menu_item_image_source') THEN
    CREATE TYPE public.menu_item_image_source AS ENUM ('restaurant', 'illustration', 'none');
  END IF;
END $$;

-- 2. Alter menu_items table
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS pricing_mode public.menu_item_pricing_mode NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS price_min bigint NULL,
  ADD COLUMN IF NOT EXISTS price_max bigint NULL,
  ADD COLUMN IF NOT EXISTS image_source public.menu_item_image_source NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS review_note text NULL;

-- 3. Add constraint checks for pricing mode consistency
ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS chk_menu_items_price_range,
  ADD CONSTRAINT chk_menu_items_price_range CHECK (
    (pricing_mode = 'fixed' AND price_vnd >= 0) OR
    (pricing_mode = 'range' AND price_min IS NOT NULL AND price_max IS NOT NULL AND price_min <= price_max) OR
    (pricing_mode IN ('market', 'unknown'))
  );

-- 4. Create indices for pricing_mode and featured_rank queries
CREATE INDEX IF NOT EXISTS idx_menu_items_pricing_mode ON public.menu_items(pricing_mode);
CREATE INDEX IF NOT EXISTS idx_menu_items_featured_rank ON public.menu_items(featured_rank) WHERE featured_rank IS NOT NULL;
