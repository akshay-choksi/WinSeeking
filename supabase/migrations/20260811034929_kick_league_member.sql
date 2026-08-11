-- Creator-only kick: members can only DELETE themselves via RLS.
-- SECURITY DEFINER bypasses that so the league creator can remove others.

CREATE OR REPLACE FUNCTION public.kick_league_member(_league_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  creator uuid;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Member required';
  END IF;

  IF _user_id = caller THEN
    RAISE EXCEPTION 'Cannot kick yourself; leave the league instead';
  END IF;

  SELECT l.created_by INTO creator
  FROM public.leagues l
  WHERE l.id = _league_id;

  IF creator IS NULL THEN
    RAISE EXCEPTION 'League not found';
  END IF;

  IF creator <> caller THEN
    RAISE EXCEPTION 'Only the league creator can kick members';
  END IF;

  DELETE FROM public.league_members
  WHERE league_id = _league_id
    AND user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.kick_league_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kick_league_member(uuid, uuid) TO authenticated, service_role;
