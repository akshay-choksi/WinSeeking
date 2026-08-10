import {
  adminClient,
  computeFantasyPoints,
  corsHeaders,
  dgFetch,
  jsonResponse,
  parsePosition,
  parseToPar,
  requireUser,
} from "../_shared/datagolf.ts";
import {
  fetchEspnAthleteIdMap,
  fetchEspnHoleStatsBundle,
  lookupHoleStats,
  normalizePlayerName,
  type DkHoleStats,
} from "../_shared/espn.ts";
import { detectEventFinal, finalizeTournament, mapScheduleStatus } from "../_shared/finalize.ts";
import { ensureMoneyHoles, moneyHoleUpToRound } from "../_shared/money_holes.ts";

type InPlayPlayer = Record<string, unknown>;

type AdminClient = ReturnType<typeof adminClient>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let tournamentId: string | null = null;

  try {
    const { userId } = await requireUser(req);
    const admin = adminClient();

    let leagueId: string | null = null;
    let force = false;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.tournament_id) tournamentId = String(body.tournament_id);
        if (body?.league_id) leagueId = String(body.league_id);
        force = body?.force === true;
      } catch {
        // no body
      }
    }

    // Resolve target tournament: explicit, else open/in_progress, else most recent open
    let tournament: {
      id: string;
      name: string;
      dg_event_id: string;
      status: string;
      season_year: number;
      start_date: string | null;
      lineup_lock_at: string | null;
      last_completed_round: number | null;
    } | null = null;

    if (tournamentId) {
      const { data, error } = await admin
        .from("tournaments")
        .select(
          "id, name, dg_event_id, status, season_year, start_date, lineup_lock_at, last_completed_round",
        )
        .eq("id", tournamentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      tournament = data;
    } else {
      const { data, error } = await admin
        .from("tournaments")
        .select(
          "id, name, dg_event_id, status, season_year, start_date, lineup_lock_at, last_completed_round",
        )
        .in("status", ["open", "in_progress"])
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      tournament = data;
    }

    if (!tournament) {
      return jsonResponse({
        message: "No open/in-progress tournament to sync.",
        resultsUpserted: 0,
      });
    }

    tournamentId = tournament.id;

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    const isAdmin = profile?.is_admin === true;

    if (!isAdmin) {
      if (!leagueId) throw new Error("League required");
      if (tournament.status !== "in_progress" && tournament.status !== "completed") {
        return jsonResponse(
          { error: "Live score refresh is available for live or just-finished events." },
          409,
        );
      }
      const { data: isMember, error: memberError } = await admin.rpc("is_league_member", {
        _league_id: leagueId,
        _user_id: userId,
      });
      if (memberError) throw new Error(memberError.message);
      if (!isMember) throw new Error("League members only");
    }

    // Block scoring until first tee / lineup lock — status may already be
    // in_progress from Sync Odds (current_round) while draft is still open.
    // Return 200 skipped (not 409) so ambient client refresh does not toast an error.
    const lockMs = tournament.lineup_lock_at
      ? new Date(tournament.lineup_lock_at).getTime()
      : tournament.start_date
        ? new Date(`${tournament.start_date}T00:00:00Z`).getTime()
        : null;
    if (tournament.status !== "completed" && lockMs != null && lockMs > Date.now()) {
      return jsonResponse({
        skipped: true,
        message: `${tournament.name} has not started yet.`,
        tournamentId: tournament.id,
        lineup_lock_at: tournament.lineup_lock_at,
        status: tournament.status,
        resultsUpserted: 0,
      });
    }

    if (
      tournament.status === "open" &&
      tournament.start_date &&
      new Date(`${tournament.start_date}T00:00:00Z`).getTime() > Date.now()
    ) {
      return jsonResponse({
        skipped: true,
        message: `${tournament.name} has not started yet.`,
        tournamentId: tournament.id,
        resultsUpserted: 0,
      });
    }

    // No artificial member cooldown — DataGolf rate limits are fine if they occur.
    // claim_result_sync still serializes overlapping starts when cooldown is 0
    // (always claims) so we always fetch fresh unless the claim RPC errors.
    const { data: claimed, error: claimError } = await admin.rpc("claim_result_sync", {
      _tournament_id: tournament.id,
      _cooldown_seconds: 0,
    });
    if (claimError) throw new Error(claimError.message);

    if (!claimed) {
      // Should be rare with cooldown 0; fall back to last known sync metadata.
      const { data: state } = await admin
        .from("result_sync_state")
        .select("last_started_at, last_completed_at, last_status")
        .eq("tournament_id", tournament.id)
        .maybeSingle();
      return jsonResponse({
        message: "Another refresh is already in progress. Showing the latest available results.",
        tournamentId: tournament.id,
        cached: true,
        lastSyncedAt: state?.last_completed_at ?? state?.last_started_at ?? null,
      });
    }

    // In-play positions/scores from DataGolf; hole tallies from ESPN scorecards.
    // Completed events: DataGolf in-play is the *current* tournament — only backfill
    // hole tallies from ESPN's dated scoreboard onto existing player_results.
    const baseUpTo = moneyHoleUpToRound({
      status: tournament.status,
      lastCompletedRound: tournament.last_completed_round,
    });
    let moneyHolesByRound = await ensureMoneyHoles(admin, tournament.id, baseUpTo);
    let { stats: holeStatsMap, maxStartedRound } = await fetchEspnHoleStatsBundle(
      tournament.name,
      {
        startDate: tournament.start_date,
        moneyHolesByRound,
      },
    );
    const neededUpTo = Math.max(baseUpTo, maxStartedRound, 1);
    const haveMax = moneyHolesByRound.size
      ? Math.max(...moneyHolesByRound.keys())
      : 0;
    if (neededUpTo > haveMax) {
      moneyHolesByRound = await ensureMoneyHoles(admin, tournament.id, neededUpTo);
      ({ stats: holeStatsMap } = await fetchEspnHoleStatsBundle(tournament.name, {
        startDate: tournament.start_date,
        moneyHolesByRound,
      }));
    }

    const isCompleted = tournament.status === "completed";
    let inPlayRaw: unknown = null;
    let players: InPlayPlayer[] = [];

    if (!isCompleted) {
      inPlayRaw = await dgFetch<unknown>("/preds/in-play", {
        tour: "pga",
        odds_format: "percent",
      });
      players = extractInPlayPlayers(inPlayRaw);
      const inPlayEventId = extractInPlayEventId(inPlayRaw);
      if (
        inPlayEventId &&
        tournament.dg_event_id &&
        String(inPlayEventId) !== String(tournament.dg_event_id)
      ) {
        // Live feed is a different event — fall back to hole-stats backfill only.
        players = [];
      }
    }

    if (players.length === 0) {
      const patched = await backfillHoleStatsFromEspn({
        admin,
        tournamentId: tournament.id,
        holeStatsMap,
      });
      await admin
        .from("result_sync_state")
        .update({
          last_completed_at: new Date().toISOString(),
          last_status: "success",
          last_error: null,
        })
        .eq("tournament_id", tournament.id);

      if (patched.updated === 0 && holeStatsMap.size === 0) {
        return jsonResponse({
          message: isCompleted
            ? `No ESPN hole cards found for ${tournament.name}.`
            : `No live in-play data for ${tournament.name}.`,
          tournamentId: tournament.id,
          resultsUpserted: 0,
        });
      }

      return jsonResponse({
        message: `Updated hole stats for ${tournament.name}: ${patched.updated} players, ${patched.lineupsUpdated} lineups.`,
        tournamentId: tournament.id,
        resultsUpserted: patched.updated,
        lineupsUpdated: patched.lineupsUpdated,
        cached: false,
        lastSyncedAt: new Date().toISOString(),
      });
    }

    // Mark in progress
    if (tournament.status === "open") {
      await admin.from("tournaments").update({ status: "in_progress" }).eq("id", tournament.id);
    }

    // Map dg_id -> golfer uuid
    const dgIds = players
      .map((p) => (p.dg_id != null ? String(p.dg_id) : null))
      .filter((id): id is string => !!id);

    const { data: golfers, error: golfersError } = await admin
      .from("golfers")
      .select("id, dg_player_id, name, espn_athlete_id")
      .in("dg_player_id", dgIds);
    if (golfersError) throw new Error(golfersError.message);

    const golferByDg = new Map(
      (golfers ?? []).map((g) => [g.dg_player_id as string, g.id as string]),
    );

    // Create any missing golfers in one batch instead of per-player round-trips.
    const missing = players.filter((p) => {
      const dgId = p.dg_id != null ? String(p.dg_id) : null;
      return !!dgId && !golferByDg.has(dgId);
    });
    if (missing.length > 0) {
      const rows = missing.map((p) => {
        const dgId = String(p.dg_id);
        return {
          dg_player_id: dgId,
          name: String(p.player_name ?? p.name ?? `Player ${dgId}`),
          is_active: true,
          salary: 0,
        };
      });
      const { data: created, error: createError } = await admin
        .from("golfers")
        .upsert(rows, { onConflict: "dg_player_id" })
        .select("id, dg_player_id");
      if (!createError && created) {
        for (const g of created) {
          if (g.dg_player_id) golferByDg.set(g.dg_player_id, g.id);
        }
      } else {
        // Partial unique index may block upsert — fall back to one lookup/insert each.
        for (const p of missing) {
          const dgId = String(p.dg_id);
          const name = String(p.player_name ?? p.name ?? `Player ${dgId}`);
          const { data: existing } = await admin
            .from("golfers")
            .select("id")
            .eq("dg_player_id", dgId)
            .maybeSingle();
          if (existing) {
            golferByDg.set(dgId, existing.id);
            continue;
          }
          const { data: inserted } = await admin
            .from("golfers")
            .insert({ dg_player_id: dgId, name, is_active: true, salary: 0 })
            .select("id")
            .single();
          if (inserted) golferByDg.set(dgId, inserted.id);
        }
      }
    }

    // Best-effort: attach ESPN athlete ids for bio enrich / profile facts
    try {
      const espnIds = await fetchEspnAthleteIdMap(tournament.name);
      if (espnIds.size > 0) {
        const { data: namedGolfers } = await admin
          .from("golfers")
          .select("id, name, espn_athlete_id")
          .in("id", [...golferByDg.values()]);
        for (const g of namedGolfers ?? []) {
          if (g.espn_athlete_id) continue;
          const key = normalizePlayerName(String(g.name ?? ""));
          const ref = espnIds.get(key);
          if (!ref) continue;
          await admin.from("golfers").update({ espn_athlete_id: ref.athleteId }).eq("id", g.id);
        }
      }
    } catch (err) {
      console.warn("espn athlete id map failed:", err);
    }

    const resultRows: {
      tournament_id: string;
      golfer_id: string;
      position: number | null;
      made_cut: boolean;
      total_to_par: number | null;
      birdies: number;
      eagles: number;
      pars: number;
      bogeys: number;
      double_bogeys: number;
      double_eagles: number;
      bonus_points: number;
      bonus_breakdown: DkHoleStats["bonusBreakdown"];
      money_hole_points: number;
      rounds: unknown;
      fantasy_points: number;
      status: string | null;
    }[] = [];

    for (const p of players) {
      const dgId = p.dg_id != null ? String(p.dg_id) : null;
      if (!dgId) continue;
      const golferId = golferByDg.get(dgId);
      if (!golferId) continue;

      const statusRaw = String(p.status ?? p.player_status ?? "").toUpperCase();
      const pos = parsePosition(p.current_pos ?? p.position ?? p.pos);
      const toPar = parseToPar(p.current_score ?? p.total ?? p.score ?? p.to_par);
      const madeCut =
        statusRaw.includes("CUT") || statusRaw === "MC"
          ? false
          : pos != null || statusRaw.includes("F") || statusRaw === "ACTIVE" || toPar != null;

      const posText = String(p.current_pos ?? p.position ?? "").toUpperCase();
      const missedCut =
        posText === "CUT" || posText === "WD" || posText === "DQ" || statusRaw.includes("CUT");
      const finalMadeCut = missedCut ? false : madeCut;

      const playerName = String(p.player_name ?? p.name ?? "");
      const holes = lookupHoleStats(holeStatsMap, playerName);
      const rounds = {
        r1: p.R1 ?? p.r1 ?? null,
        r2: p.R2 ?? p.r2 ?? null,
        r3: p.R3 ?? p.r3 ?? null,
        r4: p.R4 ?? p.r4 ?? null,
        thru: p.thru ?? null,
        today: p.today ?? null,
      };

      // DK Classic — place points from live position so they rise/fall on refresh.
      const pts = computeFantasyPoints({
        position: missedCut ? null : pos,
        doubleEagles: holes.doubleEagles,
        eagles: holes.eagles,
        birdies: holes.birdies,
        pars: holes.pars,
        bogeys: holes.bogeys,
        doubleBogeys: holes.doubleBogeys,
        bonusPoints: holes.bonusPoints,
        moneyHolePoints: holes.moneyHolePoints,
      });

      resultRows.push({
        tournament_id: tournament.id,
        golfer_id: golferId,
        position: missedCut ? null : pos,
        made_cut: finalMadeCut,
        total_to_par: toPar,
        birdies: holes.birdies,
        eagles: holes.eagles,
        pars: holes.pars,
        bogeys: holes.bogeys,
        double_bogeys: holes.doubleBogeys,
        double_eagles: holes.doubleEagles,
        bonus_points: holes.bonusPoints,
        bonus_breakdown: holes.bonusBreakdown,
        money_hole_points: holes.moneyHolePoints,
        rounds,
        fantasy_points: pts,
        status: missedCut ? posText || statusRaw || "CUT" : statusRaw || null,
      });
    }

    if (resultRows.length > 0) {
      const { error: upsertError } = await admin.from("player_results").upsert(resultRows, {
        onConflict: "tournament_id,golfer_id",
      });
      if (upsertError) throw new Error(upsertError.message);
    }

    // Roll up lineup totals from in-memory results (2 queries + parallel updates).
    const ptsByGolfer = new Map(resultRows.map((r) => [r.golfer_id, r.fantasy_points]));
    const { data: lineups, error: lineupsError } = await admin
      .from("lineups")
      .select("id")
      .eq("tournament_id", tournament.id);
    if (lineupsError) throw new Error(lineupsError.message);

    const lineupIds = (lineups ?? []).map((l) => l.id);
    const totals = new Map<string, number>(lineupIds.map((id) => [id, 0]));

    if (lineupIds.length > 0) {
      const { data: entries, error: entriesError } = await admin
        .from("lineup_entries")
        .select("lineup_id, golfer_id")
        .in("lineup_id", lineupIds);
      if (entriesError) throw new Error(entriesError.message);

      for (const e of entries ?? []) {
        totals.set(
          e.lineup_id,
          (totals.get(e.lineup_id) ?? 0) + (ptsByGolfer.get(e.golfer_id) ?? 0),
        );
      }

      await Promise.all(
        [...totals.entries()].map(([id, total]) =>
          admin.from("lineups").update({ total_points: total }).eq("id", id),
        ),
      );
    }

    const completedAt = new Date().toISOString();
    await admin
      .from("result_sync_state")
      .update({
        last_completed_at: completedAt,
        last_status: "success",
        last_error: null,
      })
      .eq("tournament_id", tournament.id);

    // Auto-finalize when the PGA event is officially over (schedule and/or in-play).
    let autoFinalized = false;
    let finalizeMessage: string | null = null;
    let awards = 0;
    if (tournament.status !== "completed" && resultRows.length > 0) {
      let scheduleCompleted = false;
      try {
        scheduleCompleted = await scheduleMarksCompleted(
          tournament.dg_event_id,
          tournament.season_year,
        );
      } catch {
        // Schedule probe is best-effort; in-play heuristics still apply.
      }
      const isFinal = detectEventFinal(inPlayRaw, players, scheduleCompleted);
      if (isFinal) {
        const finalized = await finalizeTournament(admin, tournament.id);
        autoFinalized = true;
        finalizeMessage = finalized.message;
        awards = finalized.awards;
      }
    }

    // Advance day-leader round marker (never moves backward).
    {
      const inferred = inferLastCompletedRound(resultRows.map((r) => r.rounds));
      const completedRoundToStore =
        tournament.status === "completed" || autoFinalized
          ? Math.max(inferred ?? 0, 4)
          : inferred;
      if (completedRoundToStore != null && completedRoundToStore >= 1) {
        const { data: existingT } = await admin
          .from("tournaments")
          .select("last_completed_round")
          .eq("id", tournament.id)
          .maybeSingle();
        const prev = Number(existingT?.last_completed_round ?? 0);
        if (completedRoundToStore > prev) {
          await admin
            .from("tournaments")
            .update({ last_completed_round: Math.min(4, completedRoundToStore) })
            .eq("id", tournament.id);
        }
      }
    }

    const baseMessage = `Synced results for ${tournament.name}: ${resultRows.length} players, ${lineupIds.length} lineups.`;
    return jsonResponse({
      message: finalizeMessage ? `${baseMessage} ${finalizeMessage}` : baseMessage,
      tournamentId: tournament.id,
      resultsUpserted: resultRows.length,
      lineupsUpdated: lineupIds.length,
      cached: false,
      lastSyncedAt: completedAt,
      autoFinalized,
      awards,
      finalizeMessage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync-results failed";
    if (tournamentId) {
      try {
        await adminClient()
          .from("result_sync_state")
          .update({ last_status: "error", last_error: message.slice(0, 500) })
          .eq("tournament_id", tournamentId);
      } catch {
        // Preserve the original sync failure.
      }
    }
    const status =
      message === "Unauthorized" ||
      message === "Admins only" ||
      message === "League required" ||
      message === "League members only"
        ? 403
        : 500;
    return jsonResponse({ error: message }, status);
  }
});

function extractInPlayPlayers(raw: unknown): InPlayPlayer[] {
  if (Array.isArray(raw)) return raw as InPlayPlayer[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["data", "players", "live_stats", "field"]) {
      if (Array.isArray(obj[key])) return obj[key] as InPlayPlayer[];
    }
  }
  return [];
}

function extractInPlayEventId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  for (const key of ["event_id", "dg_event_id", "eventId", "tournament_id"]) {
    if (obj[key] != null && String(obj[key]).trim()) return String(obj[key]);
  }
  for (const nestKey of ["info", "event", "meta", "tournament"]) {
    const nest = obj[nestKey];
    if (nest && typeof nest === "object") {
      const n = nest as Record<string, unknown>;
      for (const key of ["event_id", "dg_event_id", "eventId", "id"]) {
        if (n[key] != null && String(n[key]).trim()) return String(n[key]);
      }
    }
  }
  return null;
}

/** Patch hole tallies + fantasy points on existing results using ESPN scorecards. */
async function backfillHoleStatsFromEspn(opts: {
  admin: AdminClient;
  tournamentId: string;
  holeStatsMap: Map<string, DkHoleStats>;
}): Promise<{ updated: number; lineupsUpdated: number }> {
  const { admin, tournamentId, holeStatsMap } = opts;
  if (holeStatsMap.size === 0) return { updated: 0, lineupsUpdated: 0 };

  const { data: existing, error } = await admin
    .from("player_results")
    .select(
      "golfer_id, position, made_cut, total_to_par, status, rounds, golfers(name)",
    )
    .eq("tournament_id", tournamentId);
  if (error) throw new Error(error.message);
  if (!existing?.length) return { updated: 0, lineupsUpdated: 0 };

  const rows: {
    tournament_id: string;
    golfer_id: string;
    position: number | null;
    made_cut: boolean;
    total_to_par: number | null;
    birdies: number;
    eagles: number;
    pars: number;
    bogeys: number;
    double_bogeys: number;
    double_eagles: number;
    bonus_points: number;
    bonus_breakdown: DkHoleStats["bonusBreakdown"];
    money_hole_points: number;
    rounds: unknown;
    fantasy_points: number;
    status: string | null;
  }[] = [];

  for (const row of existing) {
    const g = row.golfers as unknown as { name?: string } | null;
    const name = String(g?.name ?? "");
    const key = normalizePlayerName(name);
    if (!key || !holeStatsMap.has(key)) continue;
    const holes = holeStatsMap.get(key)!;

    const pos = row.position as number | null;
    const missedCut =
      !row.made_cut ||
      String(row.status ?? "").toUpperCase().includes("CUT") ||
      String(row.status ?? "").toUpperCase() === "WD" ||
      String(row.status ?? "").toUpperCase() === "DQ";

    const pts = computeFantasyPoints({
      position: missedCut ? null : pos,
      doubleEagles: holes.doubleEagles,
      eagles: holes.eagles,
      birdies: holes.birdies,
      pars: holes.pars,
      bogeys: holes.bogeys,
      doubleBogeys: holes.doubleBogeys,
      bonusPoints: holes.bonusPoints,
      moneyHolePoints: holes.moneyHolePoints,
    });

    rows.push({
      tournament_id: tournamentId,
      golfer_id: row.golfer_id,
      position: pos,
      made_cut: Boolean(row.made_cut),
      total_to_par: row.total_to_par as number | null,
      birdies: holes.birdies,
      eagles: holes.eagles,
      pars: holes.pars,
      bogeys: holes.bogeys,
      double_bogeys: holes.doubleBogeys,
      double_eagles: holes.doubleEagles,
      bonus_points: holes.bonusPoints,
      bonus_breakdown: holes.bonusBreakdown,
      money_hole_points: holes.moneyHolePoints,
      rounds: row.rounds,
      fantasy_points: pts,
      status: (row.status as string | null) ?? null,
    });
  }

  if (rows.length === 0) return { updated: 0, lineupsUpdated: 0 };

  const { error: upsertError } = await admin.from("player_results").upsert(rows, {
    onConflict: "tournament_id,golfer_id",
  });
  if (upsertError) throw new Error(upsertError.message);

  const ptsByGolfer = new Map(rows.map((r) => [r.golfer_id, r.fantasy_points]));
  const { data: lineups, error: lineupsError } = await admin
    .from("lineups")
    .select("id")
    .eq("tournament_id", tournamentId);
  if (lineupsError) throw new Error(lineupsError.message);

  const lineupIds = (lineups ?? []).map((l) => l.id);
  let lineupsUpdated = 0;
  if (lineupIds.length > 0) {
    const { data: entries, error: entriesError } = await admin
      .from("lineup_entries")
      .select("lineup_id, golfer_id")
      .in("lineup_id", lineupIds);
    if (entriesError) throw new Error(entriesError.message);

    const totals = new Map<string, number>(lineupIds.map((id) => [id, 0]));
    for (const e of entries ?? []) {
      totals.set(e.lineup_id, (totals.get(e.lineup_id) ?? 0) + (ptsByGolfer.get(e.golfer_id) ?? 0));
    }
    await Promise.all(
      [...totals.entries()].map(([id, total]) =>
        admin.from("lineups").update({ total_points: total }).eq("id", id),
      ),
    );
    lineupsUpdated = lineupIds.length;
  }

  return { updated: rows.length, lineupsUpdated };
}

function hasRoundScore(raw: unknown): boolean {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return true;
  if (typeof raw === "string") {
    const t = raw.trim().toUpperCase();
    if (!t || t === "-" || t === "E" || t === "WD" || t === "DQ" || t === "CUT") return false;
    const n = Number(t);
    return Number.isFinite(n) && n > 0;
  }
  return false;
}

/**
 * Infer the latest fully played round from in-play round blobs.
 * Round N counts as complete when ≥40% of the field has RN, or any later round score exists.
 */
function inferLastCompletedRound(
  roundsList: { r1: unknown; r2: unknown; r3: unknown; r4: unknown; thru: unknown }[],
): number | null {
  if (roundsList.length === 0) return null;
  const n = roundsList.length;
  const threshold = Math.max(1, Math.ceil(n * 0.4));
  const counts = [0, 0, 0, 0];

  for (const rounds of roundsList) {
    if (hasRoundScore(rounds.r1)) counts[0] += 1;
    if (hasRoundScore(rounds.r2)) counts[1] += 1;
    if (hasRoundScore(rounds.r3)) counts[2] += 1;
    if (hasRoundScore(rounds.r4)) counts[3] += 1;
  }

  let last: number | null = null;
  for (let round = 1; round <= 4; round++) {
    const idx = round - 1;
    const laterHas = counts.slice(idx + 1).some((c) => c >= threshold);
    if (counts[idx] >= threshold || laterHas) last = round;
  }
  return last;
}

async function scheduleMarksCompleted(dgEventId: string, seasonYear: number): Promise<boolean> {
  if (!dgEventId) return false;
  const scheduleRaw = await dgFetch<unknown>("/get-schedule", {
    tour: "pga",
    season: seasonYear,
    upcoming_only: "no",
  });
  const events = normalizeSchedule(scheduleRaw);
  const match = events.find((e) => String(e.event_id ?? "") === String(dgEventId));
  if (!match) {
    // Fall back to name-insensitive match via event id only.
    return false;
  }
  return mapScheduleStatus(match) === "completed";
}

function normalizeSchedule(raw: unknown): { event_id?: string | number; status?: string; winner?: string }[] {
  if (Array.isArray(raw)) return raw as { event_id?: string | number; status?: string; winner?: string }[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["schedule", "events", "data"]) {
      if (Array.isArray(obj[key])) {
        return obj[key] as { event_id?: string | number; status?: string; winner?: string }[];
      }
    }
  }
  return [];
}
