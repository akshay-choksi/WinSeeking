-- Season form stats from ESPN + clear bad Wikipedia miss cache

ALTER TABLE public.golfers
  ADD COLUMN IF NOT EXISTS season_events integer,
  ADD COLUMN IF NOT EXISTS season_cuts integer,
  ADD COLUMN IF NOT EXISTS season_top10s integer,
  ADD COLUMN IF NOT EXISTS season_wins integer,
  ADD COLUMN IF NOT EXISTS season_earnings text,
  ADD COLUMN IF NOT EXISTS fedex_points numeric,
  ADD COLUMN IF NOT EXISTS fedex_rank integer,
  ADD COLUMN IF NOT EXISTS stats_fetched_at timestamptz;

-- Re-try bios that failed under the old "Name golfer" Wikipedia search
UPDATE public.golfers
SET
  bio_fetched_at = NULL,
  bio_source = NULL,
  bio_extract = NULL,
  bio_url = NULL
WHERE bio_source = 'none'
   OR (bio_fetched_at IS NOT NULL AND bio_extract IS NULL);
