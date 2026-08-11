import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type FinalizeResult = {
  tournamentId: string;
  name: string;
  awards: number;
  alreadyDone: boolean;
  message: string;
  awardSummary?: { league_id: string; user_id: string; finish: number; fedex: number }[];
};

type TournamentRow = {
  id: string;
  name: string;
  season_year: number;
  fedex_multiplier: number;
  status: string;
};

/**
 * Award season points for a tournament and mark it completed.
 * Idempotent: safe if already finalized or lineups already have league_finish.
 */
export async function finalizeTournament(
  admin: SupabaseClient,
  tournamentId: string,
): Promise<FinalizeResult> {
  const { data: tournament, error } = await admin
    .from("tournaments")
    .select("id, name, season_year, fedex_multiplier, status")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!tournament) throw new Error("Tournament not found");

  const t = tournament as TournamentRow;

  if (t.status === "completed") {
    return {
      tournamentId: t.id,
      name: t.name,
      awards: 0,
      alreadyDone: true,
      message: `${t.name} is already finalized.`,
    };
  }

  const { data: payouts, error: payoutError } = await admin
    .from("fedex_payout")
    .select("finish_position, points")
    .order("finish_position", { ascending: true });
  if (payoutError) throw new Error(payoutError.message);

  const payoutByFinish = new Map(
    (payouts ?? []).map((p) => [p.finish_position as number, Number(p.points)]),
  );
  const multiplier = Number(t.fedex_multiplier ?? 1);

  // Fill missing members with empty 0-pt DNQ lineups so they rank last, not invisible.
  const { data: members, error: membersError } = await admin
    .from("league_members")
    .select("league_id, user_id");
  if (membersError) throw new Error(membersError.message);

  let { data: lineups, error: lineupsError } = await admin
    .from("lineups")
    .select("id, league_id, user_id, total_points, league_finish, season_points")
    .eq("tournament_id", t.id);
  if (lineupsError) throw new Error(lineupsError.message);

  const existingKeys = new Set(
    (lineups ?? []).map((l) => `${l.league_id as string}:${l.user_id as string}`),
  );
  const dnqInserts: {
    league_id: string;
    user_id: string;
    tournament_id: string;
    total_spent: number;
    total_points: number;
    season_points: number;
  }[] = [];
  for (const m of members ?? []) {
    const leagueId = m.league_id as string;
    const userId = m.user_id as string;
    const key = `${leagueId}:${userId}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    dnqInserts.push({
      league_id: leagueId,
      user_id: userId,
      tournament_id: t.id,
      total_spent: 0,
      total_points: 0,
      season_points: 0,
    });
  }

  if (dnqInserts.length > 0) {
    const { error: insertError } = await admin.from("lineups").insert(dnqInserts);
    if (insertError) throw new Error(insertError.message);

    const refetch = await admin
      .from("lineups")
      .select("id, league_id, user_id, total_points, league_finish, season_points")
      .eq("tournament_id", t.id);
    if (refetch.error) throw new Error(refetch.error.message);
    lineups = refetch.data;
  }

  if (!lineups || lineups.length === 0) {
    await admin.from("tournaments").update({ status: "completed" }).eq("id", t.id);
    return {
      tournamentId: t.id,
      name: t.name,
      awards: 0,
      alreadyDone: false,
      message: `${t.name} marked completed (no lineups).`,
    };
  }

  const pending = lineups.filter((l) => l.league_finish == null);
  if (pending.length === 0) {
    await admin.from("tournaments").update({ status: "completed" }).eq("id", t.id);
    return {
      tournamentId: t.id,
      name: t.name,
      awards: 0,
      alreadyDone: true,
      message: `${t.name} already has season awards on all lineups.`,
    };
  }

  const lineupIds = lineups.map((l) => l.id as string);
  const withEntries = new Set<string>();
  if (lineupIds.length > 0) {
    const { data: entryRows, error: entriesError } = await admin
      .from("lineup_entries")
      .select("lineup_id")
      .in("lineup_id", lineupIds);
    if (entriesError) throw new Error(entriesError.message);
    for (const e of entryRows ?? []) {
      withEntries.add(e.lineup_id as string);
    }
  }

  const byLeague = new Map<string, typeof pending>();
  for (const l of pending) {
    const arr = byLeague.get(l.league_id) ?? [];
    arr.push(l);
    byLeague.set(l.league_id, arr);
  }

  let awards = 0;
  const awardSummary: { league_id: string; user_id: string; finish: number; fedex: number }[] = [];

  for (const [leagueId, leagueLineups] of byLeague) {
    const allForLeague = lineups.filter((l) => l.league_id === leagueId);
    // Real lineups (any picks) rank above empty DNQ rows, even at 0 fantasy points.
    const sorted = [...allForLeague].sort((a, b) => {
      const aHas = withEntries.has(a.id as string) ? 1 : 0;
      const bHas = withEntries.has(b.id as string) ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return Number(b.total_points) - Number(a.total_points);
    });

    let finish = 0;
    let lastPoints: number | null = null;
    let lastHasEntries: number | null = null;
    let index = 0;
    const finishById = new Map<string, number>();
    for (const row of sorted) {
      index += 1;
      const pts = Number(row.total_points);
      const hasEntries = withEntries.has(row.id as string) ? 1 : 0;
      // Break ties across the DNQ boundary so empty lineups don't share place with real 0-pt sets.
      if (
        lastPoints === null ||
        pts !== lastPoints ||
        lastHasEntries !== hasEntries
      ) {
        finish = index;
        lastPoints = pts;
        lastHasEntries = hasEntries;
      }
      finishById.set(row.id, finish);
    }

    for (const row of leagueLineups) {
      const place = finishById.get(row.id) ?? 0;
      const base = payoutByFinish.get(place) ?? 0;
      const fedex = base * multiplier;
      const isWin = place === 1;
      const isTop5 = place >= 1 && place <= 5;

      const { error: lineupError } = await admin
        .from("lineups")
        .update({
          league_finish: place,
          season_points: fedex,
        })
        .eq("id", row.id)
        .is("league_finish", null);
      if (lineupError) throw new Error(lineupError.message);

      const { data: existing } = await admin
        .from("season_standings")
        .select("fedex_points, events_played, wins, top5s")
        .eq("league_id", leagueId)
        .eq("user_id", row.user_id)
        .eq("season_year", t.season_year)
        .maybeSingle();

      if (existing) {
        const { error: standingsError } = await admin
          .from("season_standings")
          .update({
            fedex_points: Number(existing.fedex_points) + fedex,
            events_played: Number(existing.events_played) + 1,
            wins: Number(existing.wins ?? 0) + (isWin ? 1 : 0),
            top5s: Number(existing.top5s ?? 0) + (isTop5 ? 1 : 0),
          })
          .eq("league_id", leagueId)
          .eq("user_id", row.user_id)
          .eq("season_year", t.season_year);
        if (standingsError) throw new Error(standingsError.message);
      } else {
        const { error: insertError } = await admin.from("season_standings").insert({
          league_id: leagueId,
          user_id: row.user_id,
          season_year: t.season_year,
          fedex_points: fedex,
          events_played: 1,
          wins: isWin ? 1 : 0,
          top5s: isTop5 ? 1 : 0,
        });
        if (insertError) throw new Error(insertError.message);
      }

      awards += 1;
      awardSummary.push({
        league_id: leagueId,
        user_id: row.user_id,
        finish: place,
        fedex,
      });
    }
  }

  await admin.from("tournaments").update({ status: "completed" }).eq("id", t.id);

  return {
    tournamentId: t.id,
    name: t.name,
    awards,
    alreadyDone: false,
    message: `Finalized ${t.name}: awarded FedEx points to ${awards} lineup(s).`,
    awardSummary,
  };
}

/** Map DataGolf schedule row → completed when official. */
export function mapScheduleStatus(ev: {
  status?: string;
  winner?: string;
}): "completed" | "scheduled" | null {
  const s = (ev.status ?? "").toLowerCase().trim();
  if (s === "completed" || s === "complete" || s === "final") return "completed";
  const winner = (ev.winner ?? "").trim();
  if (winner && winner.toUpperCase() !== "TBD") return "completed";
  if (s === "upcoming" || s === "scheduled" || s === "preview") return "scheduled";
  return null;
}

/**
 * True when live in-play data (and optional schedule flag) indicate the event is over.
 */
export function detectEventFinal(
  inPlayRaw: unknown,
  players: Record<string, unknown>[],
  scheduleCompleted?: boolean,
): boolean {
  if (scheduleCompleted) return true;

  if (inPlayRaw && typeof inPlayRaw === "object") {
    const obj = inPlayRaw as Record<string, unknown>;
    for (const key of [
      "event_completed",
      "is_complete",
      "completed",
      "tournament_completed",
      "event_complete",
    ]) {
      const v = obj[key];
      if (v === true || v === 1 || v === "true" || v === "yes") return true;
    }
    const st = String(
      obj.event_status ?? obj.tournament_status ?? obj.status ?? obj.event_state ?? "",
    )
      .toLowerCase()
      .trim();
    if (["completed", "complete", "final", "official", "closed"].includes(st)) return true;
  }

  if (players.length < 20) return false;

  let stillPlaying = 0;
  let finishedWithR4 = 0;
  for (const p of players) {
    if (isEliminated(p)) continue;
    if (isFinishedPlayer(p)) {
      if (hasRoundScore(p, 4)) finishedWithR4 += 1;
      continue;
    }
    stillPlaying += 1;
  }

  // Field done: nobody left on course, and enough players posted an R4 score.
  return stillPlaying === 0 && finishedWithR4 >= 20;
}

function isEliminated(p: Record<string, unknown>): boolean {
  const pos = String(p.current_pos ?? p.position ?? p.pos ?? "").toUpperCase();
  const status = String(p.status ?? p.player_status ?? "").toUpperCase();
  return (
    pos === "CUT" ||
    pos === "WD" ||
    pos === "DQ" ||
    pos === "MDF" ||
    status.includes("CUT") ||
    status.includes("WD") ||
    status.includes("DQ")
  );
}

function isFinishedPlayer(p: Record<string, unknown>): boolean {
  const thru = String(p.thru ?? "").toUpperCase();
  if (thru === "F" || thru === "FIN" || thru === "FINISHED") return true;
  const status = String(p.status ?? p.player_status ?? "").toUpperCase();
  if (status === "F" || status.includes("FINISH")) return true;
  return false;
}

function hasRoundScore(p: Record<string, unknown>, round: number): boolean {
  const keys =
    round === 4
      ? ["R4", "r4", "round_4", "round4"]
      : [`R${round}`, `r${round}`, `round_${round}`, `round${round}`];
  for (const k of keys) {
    const v = p[k];
    if (v == null || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n > 0) return true;
  }
  return false;
}
