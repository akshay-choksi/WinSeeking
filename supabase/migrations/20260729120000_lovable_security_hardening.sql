-- Lovable / Supabase security advisor hardening:
-- 1) Trigger-only SECURITY DEFINER fns: leave public API surface; revoke client EXECUTE
-- 2) Re-assert PUBLIC/anon revoke on remaining DEFINER RPCs
-- 3) Avatars: public bucket without Storage listing (path URLs still work)

-- ---------------------------------------------------------------------------
-- private schema for trigger helpers (not in PostgREST exposed schemas)
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- Move trigger-only DEFINER functions out of public (OID preserved → triggers keep working)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'add_league_creator_as_member'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'ALTER FUNCTION public.add_league_creator_as_member() SET SCHEMA private';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'enforce_lineup_lock'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'ALTER FUNCTION public.enforce_lineup_lock() SET SCHEMA private';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'ALTER FUNCTION public.handle_new_user() SET SCHEMA private';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('private.add_league_creator_as_member()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION private.add_league_creator_as_member() FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('private.enforce_lineup_lock()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION private.enforce_lineup_lock() FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('private.handle_new_user()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Remaining public SECURITY DEFINER: strip PUBLIC/anon; grant only what clients need
-- ---------------------------------------------------------------------------

-- RLS helper (must stay DEFINER to avoid league_members policy recursion)
REVOKE ALL ON FUNCTION public.is_league_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_league_member(uuid, uuid) TO authenticated, service_role;

-- Admin helper used only inside RLS / service_role — not a client RPC
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;

-- Prefer profiles.is_admin SELECT for clients; keep RPC for service_role only
REVOKE ALL ON FUNCTION public.am_i_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.am_i_admin() TO service_role;

REVOKE ALL ON FUNCTION public.join_league_by_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_league_by_invite(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_result_sync(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_result_sync(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Avatars: allow public URL reads via bucket.public=true, but no list/select for all
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Avatars: public read" ON storage.objects;

DROP POLICY IF EXISTS "Avatars: own select" ON storage.objects;
CREATE POLICY "Avatars: own select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
