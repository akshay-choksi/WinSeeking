-- Track which tournament round is complete enough to announce a day leader,
-- and per-member dismissals of that banner.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS last_completed_round integer
  CHECK (last_completed_round IS NULL OR (last_completed_round BETWEEN 1 AND 4));

CREATE TABLE public.league_day_leader_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_round integer NOT NULL CHECK (completed_round BETWEEN 1 AND 4),
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, tournament_id, user_id, completed_round)
);

CREATE INDEX league_day_leader_dismissals_lookup_idx
  ON public.league_day_leader_dismissals (league_id, tournament_id, user_id);

ALTER TABLE public.league_day_leader_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Day leader dismissals: members read own"
  ON public.league_day_leader_dismissals
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_league_member(league_id, auth.uid())
  );

CREATE POLICY "Day leader dismissals: members insert own"
  ON public.league_day_leader_dismissals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_league_member(league_id, auth.uid())
  );

CREATE POLICY "Day leader dismissals: members delete own"
  ON public.league_day_leader_dismissals
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_league_member(league_id, auth.uid())
  );
