-- Capacity is opt-in: existing tables stay unverified until an admin enters seats.
ALTER TABLE public.dining_tables
  ADD COLUMN IF NOT EXISTS capacity int NULL CHECK (capacity BETWEEN 1 AND 30);

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS assigned_table_id uuid NULL REFERENCES public.dining_tables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_assigned_window
  ON public.reservations (assigned_table_id, starts_at, ends_at)
  WHERE assigned_table_id IS NOT NULL AND status IN ('pending', 'confirmed');

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_assigned_table_no_overlap
  EXCLUDE USING gist (
    assigned_table_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (assigned_table_id IS NOT NULL AND status IN ('pending', 'confirmed'));

CREATE OR REPLACE FUNCTION public.assign_reservation_table()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id uuid;
BEGIN
  IF NEW.status NOT IN ('pending', 'confirmed') OR NEW.assigned_table_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Legacy requests have no table assignment; their overlap prevents a reliable seat claim.
  IF EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.assigned_table_id IS NULL AND r.status IN ('pending', 'confirmed')
      AND r.starts_at < NEW.ends_at AND r.ends_at > NEW.starts_at
      AND (NEW.seating_area_id IS NULL OR r.seating_area_id IS NULL OR r.seating_area_id = NEW.seating_area_id)
  ) THEN
    RETURN NEW;
  END IF;

  -- Preserve the old request workflow until at least one matching table is configured.
  IF NOT EXISTS (
    SELECT 1 FROM public.dining_tables t
    WHERE t.active AND t.capacity IS NOT NULL
      AND (NEW.seating_area_id IS NULL OR t.seating_area_id = NEW.seating_area_id)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT t.id INTO v_table_id
  FROM public.dining_tables t
  WHERE t.active AND t.capacity >= NEW.guest_count
    AND (NEW.seating_area_id IS NULL OR t.seating_area_id = NEW.seating_area_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.assigned_table_id = t.id AND r.status IN ('pending', 'confirmed')
        AND r.starts_at < NEW.ends_at AND r.ends_at > NEW.starts_at
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.table_visits v WHERE v.table_id = t.id AND v.status = 'open'
    )
  ORDER BY t.capacity, t.sort_order, t.id
  FOR UPDATE OF t SKIP LOCKED
  LIMIT 1;

  IF v_table_id IS NULL THEN
    -- Unknown capacities and active visits need manual confirmation; keep the legacy pending path.
    IF EXISTS (
      SELECT 1 FROM public.dining_tables t
      WHERE t.active AND (NEW.seating_area_id IS NULL OR t.seating_area_id = NEW.seating_area_id)
        AND (t.capacity IS NULL OR (t.capacity >= NEW.guest_count AND EXISTS (
          SELECT 1 FROM public.table_visits v WHERE v.table_id = t.id AND v.status = 'open'
        )))
    ) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'NO_CAPACITY: Chưa có bàn phù hợp cho khung giờ này' USING ERRCODE = 'P0023';
  END IF;
  NEW.assigned_table_id := v_table_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_reservation_table ON public.reservations;
CREATE TRIGGER trg_assign_reservation_table
  BEFORE INSERT ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.assign_reservation_table();
