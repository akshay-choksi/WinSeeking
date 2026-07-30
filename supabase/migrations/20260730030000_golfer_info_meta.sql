-- Player info meta for draft/lineup popovers (DataGolf + Wikipedia/ESPN cache)

ALTER TABLE public.golfers
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS is_amateur boolean,
  ADD COLUMN IF NOT EXISTS dg_rank integer,
  ADD COLUMN IF NOT EXISTS espn_athlete_id text,
  ADD COLUMN IF NOT EXISTS birth_place text,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS college text,
  ADD COLUMN IF NOT EXISTS handedness text,
  ADD COLUMN IF NOT EXISTS bio_extract text,
  ADD COLUMN IF NOT EXISTS bio_url text,
  ADD COLUMN IF NOT EXISTS bio_source text,
  ADD COLUMN IF NOT EXISTS bio_fetched_at timestamptz;

ALTER TABLE public.player_prices
  ADD COLUMN IF NOT EXISTS model_win_prob numeric,
  ADD COLUMN IF NOT EXISTS model_make_cut_prob numeric,
  ADD COLUMN IF NOT EXISTS model_top5_prob numeric;
