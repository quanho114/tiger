-- Guest feedback contains counts only, without proposal/session IDs or free text.
CREATE TABLE public.concierge_feedback_aggregates (
  day date NOT NULL DEFAULT CURRENT_DATE,
  rating text NOT NULL CHECK (rating IN ('perfect', 'too_much', 'too_little', 'too_expensive', 'dislike')),
  count bigint NOT NULL DEFAULT 1 CHECK (count > 0),
  PRIMARY KEY (day, rating)
);
ALTER TABLE public.concierge_feedback_aggregates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.concierge_feedback_aggregates FROM anon, authenticated;
GRANT ALL ON public.concierge_feedback_aggregates TO service_role;
