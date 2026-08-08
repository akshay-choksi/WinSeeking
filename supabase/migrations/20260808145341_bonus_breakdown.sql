-- Persist DK Classic bonus component counts for lineup breakdown tooltips.
ALTER TABLE public.player_results
  ADD COLUMN IF NOT EXISTS bonus_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;
