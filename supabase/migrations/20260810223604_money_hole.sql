-- Daily money hole: one random hole (1–18) per tournament round; 3× hole points on it.

CREATE TABLE public.tournament_money_holes (
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_number smallint NOT NULL CHECK (round_number BETWEEN 1 AND 4),
  hole_number smallint NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, round_number)
);

GRANT SELECT ON public.tournament_money_holes TO authenticated;
GRANT ALL ON public.tournament_money_holes TO service_role;

ALTER TABLE public.tournament_money_holes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Money holes: auth read"
  ON public.tournament_money_holes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Money holes: admin write"
  ON public.tournament_money_holes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin));

-- Extra fantasy points from the ×3 money-hole multiplier (base hole pts already in tallies).
ALTER TABLE public.player_results
  ADD COLUMN IF NOT EXISTS money_hole_points numeric NOT NULL DEFAULT 0;

-- Optional money_hole_points arg on compute_fantasy_points (keeps SQL in sync with edge TS).
DROP FUNCTION IF EXISTS public.compute_fantasy_points(integer, integer, integer, integer, integer, integer, integer, numeric);

CREATE OR REPLACE FUNCTION public.compute_fantasy_points(
  _position integer,
  _double_eagles integer DEFAULT 0,
  _eagles integer DEFAULT 0,
  _birdies integer DEFAULT 0,
  _pars integer DEFAULT 0,
  _bogeys integer DEFAULT 0,
  _double_bogeys integer DEFAULT 0,
  _bonus_points numeric DEFAULT 0,
  _money_hole_points numeric DEFAULT 0
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  finish_pts numeric := 0;
  hole_pts numeric := 0;
BEGIN
  IF _position IS NOT NULL THEN
    IF _position = 1 THEN finish_pts := 30;
    ELSIF _position = 2 THEN finish_pts := 20;
    ELSIF _position = 3 THEN finish_pts := 18;
    ELSIF _position = 4 THEN finish_pts := 16;
    ELSIF _position = 5 THEN finish_pts := 14;
    ELSIF _position = 6 THEN finish_pts := 12;
    ELSIF _position = 7 THEN finish_pts := 10;
    ELSIF _position = 8 THEN finish_pts := 9;
    ELSIF _position = 9 THEN finish_pts := 8;
    ELSIF _position = 10 THEN finish_pts := 7;
    ELSIF _position BETWEEN 11 AND 15 THEN finish_pts := 6;
    ELSIF _position BETWEEN 16 AND 20 THEN finish_pts := 5;
    ELSIF _position BETWEEN 21 AND 25 THEN finish_pts := 4;
    ELSIF _position BETWEEN 26 AND 30 THEN finish_pts := 3;
    ELSIF _position BETWEEN 31 AND 40 THEN finish_pts := 2;
    ELSIF _position BETWEEN 41 AND 50 THEN finish_pts := 1;
    END IF;
  END IF;

  hole_pts :=
    GREATEST(COALESCE(_double_eagles, 0), 0) * 13
    + GREATEST(COALESCE(_eagles, 0), 0) * 8
    + GREATEST(COALESCE(_birdies, 0), 0) * 3
    + GREATEST(COALESCE(_pars, 0), 0) * 0.5
    + GREATEST(COALESCE(_bogeys, 0), 0) * (-0.5)
    + GREATEST(COALESCE(_double_bogeys, 0), 0) * (-1);

  RETURN finish_pts
    + hole_pts
    + GREATEST(COALESCE(_bonus_points, 0), 0)
    + COALESCE(_money_hole_points, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_fantasy_points(
  integer, integer, integer, integer, integer, integer, integer, numeric, numeric
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_fantasy_points(
  integer, integer, integer, integer, integer, integer, integer, numeric, numeric
) TO service_role;
