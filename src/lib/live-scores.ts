import { supabase } from "@/integrations/supabase/client";

export type LiveScoreRefreshResult = {
  skipped: boolean;
  cached?: boolean;
  autoFinalized?: boolean;
  message?: string;
  lastSyncedAt?: string | null;
  tournamentId?: string;
  awards?: number;
};

type RefreshOpts = {
  /** Prefer this league (member refresh requires a league). */
  leagueId?: string | null;
  /** Prefer this tournament; otherwise picks the best live/recent event. */
  tournamentId?: string | null;
  /** Signed-in user id — used to pick a membership reliably. */
  userId?: string | null;
};

/**
 * Prefer an in-progress event; otherwise the most recent open/completed one
 * so sign-in / pull-to-refresh still work right after the tournament ends.
 */
async function resolveTournamentId(preferred?: string | null): Promise<string | null> {
  if (preferred) return preferred;

  const { data: live } = await supabase
    .from("tournaments")
    .select("id")
    .eq("status", "in_progress")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (live?.id) return live.id;

  const { data: recent } = await supabase
    .from("tournaments")
    .select("id")
    .in("status", ["open", "completed"])
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return recent?.id ?? null;
}

/**
 * Pulls live fantasy results for the active / just-finished PGA event.
 */
export async function refreshLiveScores(
  opts: RefreshOpts = {},
): Promise<LiveScoreRefreshResult> {
  const tournamentId = await resolveTournamentId(opts.tournamentId);
  if (!tournamentId) {
    return { skipped: true, message: "No event available to refresh." };
  }

  let leagueId = opts.leagueId ?? null;
  if (!leagueId && opts.userId) {
    const { data: membership } = await supabase
      .from("league_members")
      .select("league_id")
      .eq("user_id", opts.userId)
      .limit(1)
      .maybeSingle();
    leagueId = membership?.league_id ?? null;
  }
  if (!leagueId) {
    const { data: membership } = await supabase
      .from("league_members")
      .select("league_id")
      .limit(1)
      .maybeSingle();
    leagueId = membership?.league_id ?? null;
  }

  const body: Record<string, string> = { tournament_id: tournamentId };
  if (leagueId) body.league_id = leagueId;

  const { data, error } = await supabase.functions.invoke("sync-results", { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));

  return {
    skipped: false,
    cached: Boolean(data?.cached),
    autoFinalized: Boolean(data?.autoFinalized),
    message: data?.message ? String(data.message) : undefined,
    lastSyncedAt: data?.lastSyncedAt ?? null,
    tournamentId,
    awards: typeof data?.awards === "number" ? data.awards : undefined,
  };
}

export const LIVE_SCORES_UPDATED_EVENT = "live-scores-updated";

export function notifyLiveScoresUpdated(detail?: LiveScoreRefreshResult) {
  window.dispatchEvent(new CustomEvent(LIVE_SCORES_UPDATED_EVENT, { detail }));
}
