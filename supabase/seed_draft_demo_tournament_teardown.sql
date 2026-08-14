-- Remove the WinSeeking Draft Demo event only (`dg_event_id = 'ws-demo-draft'`).
-- Unlocks first so lineup lock triggers do not block deletes.

DO $$
DECLARE
  v_demo uuid;
BEGIN
  SELECT id INTO v_demo FROM public.tournaments WHERE dg_event_id = 'ws-demo-draft';
  IF v_demo IS NULL THEN
    RAISE NOTICE 'No draft demo tournament found.';
    RETURN;
  END IF;

  UPDATE public.tournaments
  SET status = 'open', lineup_lock_at = now() + interval '1 hour'
  WHERE id = v_demo;

  DELETE FROM public.tournaments WHERE id = v_demo;
  RAISE NOTICE 'Draft demo removed. Live events unchanged.';
END $$;
