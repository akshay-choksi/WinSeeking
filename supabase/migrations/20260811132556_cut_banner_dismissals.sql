-- Per-member dismissals for Made-Cut Survivor / Cut Victim banner.
-- Separate from league_day_leader_dismissals so the two banners don't collide.

CREATE TABLE public.league_cut_banner_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_round integer NOT NULL CHECK (completed_round BETWEEN 2 AND 4),
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, tournament_id, user_id, completed_round)
);

CREATE INDEX league_cut_banner_dismissals_lookup_idx
  ON public.league_cut_banner_dismissals (league_id, tournament_id, user_id);

ALTER TABLE public.league_cut_banner_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cut banner dismissals: members read own"
  ON public.league_cut_banner_dismissals
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_league_member(league_id, auth.uid())
  );

CREATE POLICY "Cut banner dismissals: members insert own"
  ON public.league_cut_banner_dismissals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_league_member(league_id, auth.uid())
  );

CREATE POLICY "Cut banner dismissals: members delete own"
  ON public.league_cut_banner_dismissals
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_league_member(league_id, auth.uid())
  );
