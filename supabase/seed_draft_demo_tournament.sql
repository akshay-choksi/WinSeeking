-- Dedicated "WinSeeking Draft Demo" event for screenshots / walkthrough.
-- Does NOT touch FedEx St. Jude, 3M Open, or The Open.
-- Clones salaries/odds from whichever real event currently has the largest field.
-- Re-runnable. Prefer local DB; if you run on shared prod, teardown after screenshots.
--
-- Run (SQL editor): paste this file.
-- Run (CLI, linked project):
--   supabase db query --linked -f supabase/seed_draft_demo_tournament.sql --yes
-- Teardown:
--   supabase db query --linked -f supabase/seed_draft_demo_tournament_teardown.sql --yes
--
-- In the app: any league → event dropdown → "WinSeeking Draft Demo" → Set lineup.

DO $$
DECLARE
  v_demo uuid := 'c0ffee00-d000-4000-8000-0000000000d1';
  v_source uuid;
  v_source_name text;
  v_copied int;
BEGIN
  SELECT pp.tournament_id, t.name
    INTO v_source, v_source_name
  FROM public.player_prices pp
  JOIN public.tournaments t ON t.id = pp.tournament_id
  WHERE t.dg_event_id NOT LIKE 'ws-demo-%'
  GROUP BY pp.tournament_id, t.name
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  IF v_source IS NULL THEN
    RAISE EXCEPTION 'No player_prices to clone. Sync odds on a real event first.';
  END IF;

  INSERT INTO public.tournaments (
    id, dg_event_id, name, start_date, end_date, season_year,
    event_type, fedex_multiplier, status, lineup_lock_at
  ) VALUES (
    v_demo,
    'ws-demo-draft',
    'WinSeeking Draft Demo',
    CURRENT_DATE + 21,
    CURRENT_DATE + 24,
    EXTRACT(YEAR FROM CURRENT_DATE)::int,
    'standard',
    1.0,
    'open',
    now() + interval '21 days'
  )
  ON CONFLICT (dg_event_id) DO UPDATE SET
    name = EXCLUDED.name,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    season_year = EXCLUDED.season_year,
    status = 'open',
    lineup_lock_at = now() + interval '21 days'
  RETURNING id INTO v_demo;

  DELETE FROM public.player_prices WHERE tournament_id = v_demo;

  INSERT INTO public.player_prices (
    tournament_id, golfer_id, salary, decimal_odds, implied_prob,
    model_win_prob, model_make_cut_prob, model_top5_prob
  )
  SELECT
    v_demo,
    pp.golfer_id,
    pp.salary,
    pp.decimal_odds,
    pp.implied_prob,
    pp.model_win_prob,
    pp.model_make_cut_prob,
    pp.model_top5_prob
  FROM public.player_prices pp
  WHERE pp.tournament_id = v_source;

  GET DIAGNOSTICS v_copied = ROW_COUNT;
  RAISE NOTICE 'Draft demo opened; cloned % prices from % (%)',
    v_copied, v_source_name, v_source;
END $$;

SELECT t.id, t.name, t.status, t.lineup_lock_at, t.start_date, COUNT(pp.golfer_id) AS field_size
FROM public.tournaments t
LEFT JOIN public.player_prices pp ON pp.tournament_id = t.id
WHERE t.dg_event_id = 'ws-demo-draft'
GROUP BY t.id, t.name, t.status, t.lineup_lock_at, t.start_date;
