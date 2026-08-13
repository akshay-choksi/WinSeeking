import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useLiveScoreRefresh, useOnLiveScoresUpdated } from "@/hooks/use-live-score-refresh";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Lock, RefreshCw } from "lucide-react";
import { GolferAvatar } from "@/components/golfer-avatar";
import { GolferInfoButton } from "@/components/golfer-info";
import { GolferName } from "@/components/golfer-name";
import { NicknameDeSargeToggle } from "@/components/nickname-de-sarge-toggle";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  bonusBreakdownLines,
  breakdownFantasyPoints,
  currentMoneyHoleRound,
  formatAmericanOdds,
  isLineupLocked,
  MONEY_HOLE_MULTIPLIER,
  parseBonusBreakdown,
  pickActiveTournament,
  type BonusBreakdown,
  type Tournament,
} from "@/lib/scoring";
import { initialsFromName } from "@/lib/profile";
import { computeOwnershipStats, ownershipKind } from "@/lib/ownership";
import { HarrysBigHole } from "@/components/harrys-big-hole";
import { HarrysBigHoleReveal } from "@/components/harrys-big-hole-reveal";
import { useHarrysReveal } from "@/hooks/use-harrys-reveal";

export const Route = createFileRoute("/_authenticated/league/$id_/lineup/$userId")({
  validateSearch: (search: Record<string, unknown>) => ({
    tournament: typeof search.tournament === "string" ? search.tournament : undefined,
  }),
  component: LineupViewerPage,
});

type GolferRow = {
  golfer_id: string;
  name: string;
  salary: number;
  decimal_odds: number | null;
  pga_player_num: string | null;
  owgr_rank: number | null;
  dg_rank: number | null;
  country: string | null;
  is_amateur: boolean | null;
  model_win_prob: number | null;
  model_make_cut_prob: number | null;
  model_top5_prob: number | null;
  bio_extract: string | null;
  bio_url: string | null;
  bio_source: string | null;
  bio_fetched_at: string | null;
  birth_place: string | null;
  age: number | null;
  college: string | null;
  handedness: string | null;
  season_events: number | null;
  season_cuts: number | null;
  season_top10s: number | null;
  season_wins: number | null;
  season_earnings: string | null;
  fedex_points: number | null;
  fedex_rank: number | null;
  position: number | null;
  total_to_par: number | null;
  fantasy_points: number;
  made_cut: boolean;
  status: string | null;
  birdies: number;
  eagles: number;
  pars: number;
  bogeys: number;
  double_bogeys: number;
  double_eagles: number;
  bonus_points: number;
  bonus_breakdown: BonusBreakdown | null;
  money_hole_points: number;
  pickCount: number;
  lineupCount: number;
};

function OwnershipBadge({ pickCount, lineupCount }: { pickCount: number; lineupCount: number }) {
  const kind = ownershipKind(pickCount, lineupCount);
  if (!kind) return null;
  const fraction = `${pickCount}/${lineupCount}`;
  if (kind === "unique") {
    return <StatusBadge tone="open">Unique · {fraction}</StatusBadge>;
  }
  if (kind === "everyone") {
    return <StatusBadge tone="muted">Everyone · {fraction}</StatusBadge>;
  }
  return <StatusBadge tone="muted">{fraction}</StatusBadge>;
}

function formatToPar(n: number | null): string {
  if (n == null) return "—";
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

function formatPos(pos: number | null, status: string | null): string {
  if (status && /cut|wd|dq/i.test(status)) return status.toUpperCase();
  if (pos == null) return "—";
  return `T${pos}`;
}

function formatOwgr(rank: number | null | undefined): string {
  if (rank == null || !Number.isFinite(rank)) return "OWGR —";
  return `OWGR ${rank}`;
}

function formatPts(n: number): string {
  if (n === 0) return "0";
  const rounded = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return n > 0 ? `+${rounded}` : rounded;
}

function toGolferInfo(r: GolferRow) {
  return {
    id: r.golfer_id,
    name: r.name,
    pga_player_num: r.pga_player_num,
    owgr_rank: r.owgr_rank,
    dg_rank: r.dg_rank,
    country: r.country,
    is_amateur: r.is_amateur,
    salary: r.salary,
    decimal_odds: r.decimal_odds,
    model_win_prob: r.model_win_prob,
    model_make_cut_prob: r.model_make_cut_prob,
    model_top5_prob: r.model_top5_prob,
    birth_place: r.birth_place,
    age: r.age,
    college: r.college,
    handedness: r.handedness,
    bio_extract: r.bio_extract,
    bio_url: r.bio_url,
    bio_source: r.bio_source,
    bio_fetched_at: r.bio_fetched_at,
    season_events: r.season_events,
    season_cuts: r.season_cuts,
    season_top10s: r.season_top10s,
    season_wins: r.season_wins,
    season_earnings: r.season_earnings,
    fedex_points: r.fedex_points,
    fedex_rank: r.fedex_rank,
  };
}

/** Display count + points for hole/place breakdown cells. */
function StatPts({ count, pts }: { count?: number; pts: number }) {
  return (
    <span className="inline-flex flex-col items-end gap-0.5 leading-tight">
      {count != null ? <span className="font-mono text-foreground">{count}</span> : null}
      <span className={`font-mono text-xs ${pts < 0 ? "text-destructive" : "text-success"}`}>
        {formatPts(pts)}
      </span>
    </span>
  );
}

function BonusBreakdownBody({
  pts,
  breakdown,
}: {
  pts: number;
  breakdown: BonusBreakdown | null;
}) {
  const lines = bonusBreakdownLines(breakdown);
  if (lines.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {pts > 0
          ? "Bonus details will appear after the next score refresh."
          : "No streak or achievement bonuses yet."}
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {lines.map((line) => (
        <li key={line.label} className="flex items-center justify-between gap-4 text-xs">
          <span className="text-foreground">{line.label}</span>
          <span className="font-mono font-medium text-success">{formatPts(line.pts)}</span>
        </li>
      ))}
    </ul>
  );
}

function BonusPts({ pts, breakdown }: { pts: number; breakdown: BonusBreakdown | null }) {
  const lines = bonusBreakdownLines(breakdown);
  const interactive = pts > 0 || lines.length > 0;
  if (!interactive) return <StatPts pts={pts} />;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex rounded-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Bonus points breakdown"
        >
          <span className="underline decoration-dotted decoration-primary/50 underline-offset-2">
            <StatPts pts={pts} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Bonus breakdown
        </div>
        <BonusBreakdownBody pts={pts} breakdown={breakdown} />
      </PopoverContent>
    </Popover>
  );
}

function LineupViewerPage() {
  const { id: leagueId, userId } = Route.useParams();
  const { tournament: tournamentQuery } = Route.useSearch();
  const { user, loading: authLoading } = useAuth();
  const viewerIdRef = useRef<string | null>(null);
  const loadGenRef = useRef(0);
  viewerIdRef.current = user?.id ?? null;

  const [leagueName, setLeagueName] = useState("");
  const [ownerName, setOwnerName] = useState("Player");
  const [ownerAvatarUrl, setOwnerAvatarUrl] = useState<string | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [moneyHole, setMoneyHole] = useState<{ round: number; hole: number } | null>(null);
  const [rows, setRows] = useState<GolferRow[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [lineupTotal, setLineupTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const isOwn = Boolean(user?.id && user.id === userId);
  const locked = tournament ? isLineupLocked(tournament) : false;
  const { open: harrysRevealOpen, onOpenChange: onHarrysRevealOpenChange } = useHarrysReveal({
    userId: user?.id,
    tournamentId: tournament?.id,
    round: moneyHole?.round ?? null,
    holePresent: moneyHole != null,
  });
  const { refresh: refreshScores, refreshing } = useLiveScoreRefresh({
    leagueId,
    tournamentId: tournament?.id ?? tournamentQuery ?? null,
  });

  useOnLiveScoresUpdated((detail) => {
    if (detail?.lastSyncedAt) setLastSyncedAt(detail.lastSyncedAt);
    void load();
  });

  async function load() {
    const gen = ++loadGenRef.current;
    setLoading(true);
    setForbidden(false);

    const { data: league } = await supabase
      .from("leagues")
      .select("name")
      .eq("id", leagueId)
      .maybeSingle();
    if (gen !== loadGenRef.current) return;
    setLeagueName(league?.name ?? "League");

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    if (gen !== loadGenRef.current) return;
    setOwnerName(profile?.full_name ?? "Player");
    setOwnerAvatarUrl(profile?.avatar_url ?? null);

    let active: Tournament | null = null;
    if (tournamentQuery) {
      const { data } = await supabase
        .from("tournaments")
        .select(
          "id, dg_event_id, name, start_date, end_date, season_year, event_type, fedex_multiplier, status, lineup_lock_at, last_completed_round",
        )
        .eq("id", tournamentQuery)
        .maybeSingle();
      active = (data as Tournament | null) ?? null;
    } else {
      const { data: tournaments } = await supabase
        .from("tournaments")
        .select(
          "id, dg_event_id, name, start_date, end_date, season_year, event_type, fedex_multiplier, status, lineup_lock_at, last_completed_round",
        )
        .in("status", ["open", "in_progress", "completed", "scheduled"])
        .order("start_date", { ascending: false })
        .limit(40);
      const list = (tournaments ?? []) as Tournament[];
      active =
        (tournamentQuery ? list.find((t) => t.id === tournamentQuery) : null) ??
        pickActiveTournament(list);
    }
    if (gen !== loadGenRef.current) return;
    setTournament(active);

    if (!active) {
      setRows([]);
      setMoneyHole(null);
      setLoading(false);
      return;
    }

    {
      const round = currentMoneyHoleRound(active);
      const { data: mh } = await supabase
        .from("tournament_money_holes")
        .select("hole_number")
        .eq("tournament_id", active.id)
        .eq("round_number", round)
        .maybeSingle();
      if (gen !== loadGenRef.current) return;
      setMoneyHole(
        mh?.hole_number != null
          ? { round, hole: Number(mh.hole_number) }
          : null,
      );
    }

    const { data: syncState } = await supabase
      .from("result_sync_state")
      .select("last_completed_at")
      .eq("tournament_id", active.id)
      .maybeSingle();
    if (gen !== loadGenRef.current) return;
    setLastSyncedAt(syncState?.last_completed_at ?? null);

    // Wait for auth — `user == null` must not be treated as "viewing someone else"
    // or a stale in-flight load can flash/stick the lock screen on your own lineup.
    const viewerId = viewerIdRef.current;
    if (!viewerId) {
      setLoading(true);
      return;
    }
    const viewingOthers = viewerId !== userId;
    if (viewingOthers && !isLineupLocked(active)) {
      setForbidden(true);
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: lineup } = await supabase
      .from("lineups")
      .select("id, total_spent, total_points")
      .eq("league_id", leagueId)
      .eq("user_id", userId)
      .eq("tournament_id", active.id)
      .maybeSingle();
    if (gen !== loadGenRef.current) return;

    if (!lineup) {
      setRows([]);
      setTotalSpent(0);
      setLineupTotal(0);
      setLoading(false);
      return;
    }

    setTotalSpent(lineup.total_spent);
    setLineupTotal(Number(lineup.total_points ?? 0));

    const { data: entries } = await supabase
      .from("lineup_entries")
      .select(
        "golfer_id, golfers(id, name, pga_player_num, owgr_rank, dg_rank, country, is_amateur, bio_extract, bio_url, bio_source, bio_fetched_at, birth_place, age, college, handedness, season_events, season_cuts, season_top10s, season_wins, season_earnings, fedex_points, fedex_rank)",
      )
      .eq("lineup_id", lineup.id);

    const golferIds = (entries ?? []).map((e) => e.golfer_id);
    const lockedNow = isLineupLocked(active);

    const [{ data: prices }, { data: results }, ownership] = await Promise.all([
      golferIds.length
        ? supabase
            .from("player_prices")
            .select(
              "golfer_id, salary, decimal_odds, model_win_prob, model_make_cut_prob, model_top5_prob",
            )
            .eq("tournament_id", active.id)
            .in("golfer_id", golferIds)
        : Promise.resolve({
            data: [] as {
              golfer_id: string;
              salary: number;
              decimal_odds: number | null;
              model_win_prob: number | null;
              model_make_cut_prob: number | null;
              model_top5_prob: number | null;
            }[],
          }),
      golferIds.length
        ? supabase
            .from("player_results")
            .select(
              "golfer_id, position, total_to_par, fantasy_points, made_cut, status, birdies, eagles, pars, bogeys, double_bogeys, double_eagles, bonus_points, bonus_breakdown, money_hole_points",
            )
            .eq("tournament_id", active.id)
            .in("golfer_id", golferIds)
        : Promise.resolve({
            data: [] as {
              golfer_id: string;
              position: number | null;
              total_to_par: number | null;
              fantasy_points: number;
              made_cut: boolean;
              status: string | null;
              birdies: number;
              eagles: number;
              pars: number;
              bogeys: number;
              double_bogeys: number;
              double_eagles: number;
              bonus_points: number;
              bonus_breakdown: unknown;
              money_hole_points: number;
            }[],
          }),
      lockedNow
        ? (async () => {
            const { data: leagueLineups } = await supabase
              .from("lineups")
              .select("id, user_id")
              .eq("league_id", leagueId)
              .eq("tournament_id", active.id);
            const lineupIds = (leagueLineups ?? []).map((l) => l.id);
            if (lineupIds.length === 0) {
              return computeOwnershipStats([], []);
            }
            const { data: leagueEntries } = await supabase
              .from("lineup_entries")
              .select("lineup_id, golfer_id")
              .in("lineup_id", lineupIds);
            return computeOwnershipStats(leagueLineups ?? [], leagueEntries ?? []);
          })()
        : Promise.resolve(computeOwnershipStats([], [])),
    ]);
    if (gen !== loadGenRef.current) return;

    const priceById = new Map((prices ?? []).map((p) => [p.golfer_id, p]));
    const resultById = new Map((results ?? []).map((r) => [r.golfer_id, r]));
    const { lineupCount, pickCounts } = ownership;

    const next: GolferRow[] = (entries ?? []).map((e) => {
      const g = e.golfers as unknown as {
        id: string;
        name: string;
        pga_player_num: string | null;
        owgr_rank: number | null;
        dg_rank: number | null;
        country: string | null;
        is_amateur: boolean | null;
        bio_extract: string | null;
        bio_url: string | null;
        bio_source: string | null;
        bio_fetched_at: string | null;
        birth_place: string | null;
        age: number | null;
        college: string | null;
        handedness: string | null;
        season_events: number | null;
        season_cuts: number | null;
        season_top10s: number | null;
        season_wins: number | null;
        season_earnings: string | null;
        fedex_points: number | null;
        fedex_rank: number | null;
      } | null;
      const price = priceById.get(e.golfer_id);
      const res = resultById.get(e.golfer_id);
      return {
        golfer_id: e.golfer_id,
        name: g?.name ?? "Golfer",
        salary: price?.salary ?? 0,
        decimal_odds: price?.decimal_odds ?? null,
        pga_player_num: g?.pga_player_num ?? null,
        owgr_rank: g?.owgr_rank ?? null,
        dg_rank: g?.dg_rank ?? null,
        country: g?.country ?? null,
        is_amateur: g?.is_amateur ?? null,
        model_win_prob: price?.model_win_prob ?? null,
        model_make_cut_prob: price?.model_make_cut_prob ?? null,
        model_top5_prob: price?.model_top5_prob ?? null,
        bio_extract: g?.bio_extract ?? null,
        bio_url: g?.bio_url ?? null,
        bio_source: g?.bio_source ?? null,
        bio_fetched_at: g?.bio_fetched_at ?? null,
        birth_place: g?.birth_place ?? null,
        age: g?.age ?? null,
        college: g?.college ?? null,
        handedness: g?.handedness ?? null,
        season_events: g?.season_events ?? null,
        season_cuts: g?.season_cuts ?? null,
        season_top10s: g?.season_top10s ?? null,
        season_wins: g?.season_wins ?? null,
        season_earnings: g?.season_earnings ?? null,
        fedex_points: g?.fedex_points ?? null,
        fedex_rank: g?.fedex_rank ?? null,
        position: res?.position ?? null,
        total_to_par: res?.total_to_par ?? null,
        fantasy_points: Number(res?.fantasy_points ?? 0),
        made_cut: res?.made_cut ?? false,
        status: res?.status ?? null,
        birdies: Number(res?.birdies ?? 0),
        eagles: Number(res?.eagles ?? 0),
        pars: Number(res?.pars ?? 0),
        bogeys: Number(res?.bogeys ?? 0),
        double_bogeys: Number(res?.double_bogeys ?? 0),
        double_eagles: Number(res?.double_eagles ?? 0),
        bonus_points: Number(res?.bonus_points ?? 0),
        bonus_breakdown: parseBonusBreakdown(res?.bonus_breakdown),
        money_hole_points: Number(res?.money_hole_points ?? 0),
        pickCount: pickCounts.get(e.golfer_id) ?? 0,
        lineupCount,
      };
    });

    // Sort by fantasy points desc for live feel
    next.sort((a, b) => b.fantasy_points - a.fantasy_points);
    setRows(next);

    const liveSum = next.reduce((s, r) => s + r.fantasy_points, 0);
    setLineupTotal(liveSum || Number(lineup.total_points ?? 0));
    setLoading(false);
  }

  async function refreshLiveScores() {
    if (!tournament || refreshing) return;
    const result = await refreshScores("manual");
    if (result.lastSyncedAt) setLastSyncedAt(result.lastSyncedAt);
    await load();
  }

  useEffect(() => {
    if (authLoading) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, userId, tournamentQuery, user?.id, authLoading]);

  useEffect(() => {
    if (!tournament) return;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleLoad = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (viewerIdRef.current) void load();
      }, 350);
    };
    const channel = supabase
      .channel(`lineup-view-${leagueId}-${userId}-${tournament.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_results",
          filter: `tournament_id=eq.${tournament.id}`,
        },
        scheduleLoad,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lineups", filter: `league_id=eq.${leagueId}` },
        scheduleLoad,
      )
      .subscribe();
    return () => {
      clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, userId, tournament?.id]);

  const subtitle = useMemo(() => {
    if (!tournament) return "";
    const lockLabel = tournament.lineup_lock_at
      ? new Date(tournament.lineup_lock_at).toLocaleString()
      : null;
    return locked
      ? `Locked${lockLabel ? ` · ${lockLabel}` : ""} · Live points`
      : "Unlocked · Your lineup preview";
  }, [tournament, locked]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading lineup…</div>;
  }

  if (forbidden) {
    return (
      <div className="space-y-4">
        <Link
          to="/league/$id"
          params={{ id: leagueId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to league
        </Link>
        <div className="rounded-lg border bg-card p-8 text-center">
          <Lock className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-bold">Lineups still open</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Other members&apos; lineups stay hidden until lock (first tee). You can always open yours
            from &quot;View my lineup&quot; or your name marked you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link
        to="/league/$id"
        params={{ id: leagueId }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {leagueName}
      </Link>

      {moneyHole ? (
        <HarrysBigHoleReveal
          open={harrysRevealOpen}
          onOpenChange={onHarrysRevealOpenChange}
          holeNumber={moneyHole.hole}
          roundNumber={moneyHole.round}
        />
      ) : null}

      <div className="rounded-lg bg-navy px-5 py-5 text-navy-foreground shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Avatar className="mt-0.5 h-12 w-12 border border-white/20">
              {ownerAvatarUrl ? <AvatarImage src={ownerAvatarUrl} alt="" /> : null}
              <AvatarFallback className="bg-white/10 text-sm font-semibold text-navy-foreground">
                {initialsFromName(ownerName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-success">
                {isOwn ? "Your lineup" : "Member lineup"}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">{ownerName}</h1>
              <p className="mt-1 text-sm text-navy-foreground/75">{tournament?.name ?? "No event"}</p>
              <p className="mt-1 text-xs text-navy-foreground/55">{subtitle}</p>
              {moneyHole ? (
                <div className="mt-3">
                  <HarrysBigHole
                    variant="compact"
                    holeNumber={moneyHole.hole}
                    roundNumber={moneyHole.round}
                  />
                </div>
              ) : null}
            </div>
          </div>
          {(tournament?.status === "in_progress" || tournament?.status === "completed") ? (
            <div className="text-right">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={refreshLiveScores}
                disabled={refreshing}
                className="border-white/20 bg-white/10 text-navy-foreground hover:bg-white/20 hover:text-navy-foreground"
              >
                <RefreshCw className={refreshing ? "animate-spin" : ""} />
                {refreshing
                  ? "Refreshing…"
                  : tournament?.status === "completed"
                    ? "Refresh scores"
                    : "Refresh live scores"}
              </Button>
              <p className="mt-1.5 text-[11px] text-navy-foreground/55">
                {lastSyncedAt
                  ? `Updated ${new Date(lastSyncedAt).toLocaleTimeString()}`
                  : "Pull down to refresh · or tap"}
              </p>
            </div>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:max-w-md">
          <StatCard
            label="Lineup points"
            value={lineupTotal.toFixed(1)}
            tone="navy"
            className="border-white/10 bg-white/5 shadow-none"
          />
          <StatCard
            label="Spent"
            value={`$${totalSpent.toLocaleString()}`}
            tone="navy"
            className="border-white/10 bg-white/5 shadow-none"
          />
        </div>
      </div>

      <NicknameDeSargeToggle id="lineup-nickname-de-sarge" />

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No lineup submitted for this event.
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="divide-y md:hidden">
              {rows.map((r) => {
                const bd = breakdownFantasyPoints({
                  position: r.position,
                  doubleEagles: r.double_eagles,
                  eagles: r.eagles,
                  birdies: r.birdies,
                  pars: r.pars,
                  bogeys: r.bogeys,
                  doubleBogeys: r.double_bogeys,
                  bonusPoints: r.bonus_points,
                  moneyHolePoints: r.money_hole_points,
                });
                const pts = r.fantasy_points || bd.total;
                const eagleCount = bd.eagleCount + bd.doubleEagleCount;
                const eaglePts = bd.eaglePts + bd.doubleEaglePts;
                return (
                  <div key={r.golfer_id} className="space-y-3 p-4">
                    <div className="flex items-start gap-3">
                      <GolferAvatar name={r.name} pgaPlayerNum={r.pga_player_num} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <GolferName
                            name={r.name}
                            className="font-medium text-foreground"
                            showRealNameHint
                          />
                          <GolferInfoButton golfer={toGolferInfo(r)} />
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">
                            {formatAmericanOdds(r.decimal_odds)} · {formatOwgr(r.owgr_rank)}
                          </span>
                          <OwnershipBadge pickCount={r.pickCount} lineupCount={r.lineupCount} />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-lg font-bold text-success">
                          {pts.toFixed(1)}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          pts
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-muted/50 px-2 py-2">
                        <div className="text-[10px] uppercase text-muted-foreground">Pos</div>
                        <div className="font-mono font-semibold text-foreground">
                          {formatPos(r.position, r.status)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-2 py-2">
                        <div className="text-[10px] uppercase text-muted-foreground">Score</div>
                        <div className="font-mono font-semibold text-foreground">
                          {formatToPar(r.total_to_par)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-2 py-2">
                        <div className="text-[10px] uppercase text-muted-foreground">Place</div>
                        <div className="font-mono font-semibold text-success">
                          {formatPts(bd.finish)}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-x-2 gap-y-2 text-xs sm:grid-cols-7">
                      <MobileStat label="Birdies" count={bd.birdieCount} pts={bd.birdiePts} />
                      <MobileStat label="Eagles" count={eagleCount} pts={eaglePts} />
                      <MobileStat label="Pars" count={bd.parCount} pts={bd.parPts} />
                      <MobileStat label="Bogeys" count={bd.bogeyCount} pts={bd.bogeyPts} />
                      <MobileStat label="Dbl+" count={bd.doubleBogeyCount} pts={bd.doubleBogeyPts} />
                      <MobileBonusStat pts={bd.bonusPoints} breakdown={r.bonus_breakdown} />
                      <MobileStat label="Money" pts={bd.moneyHolePoints} />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between bg-muted/50 px-4 py-3">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Total</span>
                <span className="font-mono text-lg font-bold text-success">
                  {lineupTotal.toFixed(1)}
                </span>
              </div>
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Golfer</th>
                    <th className="px-3 py-2 text-right">Pos</th>
                    <th className="px-3 py-2 text-right">Score</th>
                    <th className="px-3 py-2 text-right">Place</th>
                    <th className="px-3 py-2 text-right">Birdies</th>
                    <th className="px-3 py-2 text-right">Eagles</th>
                    <th className="px-3 py-2 text-right">Pars</th>
                    <th className="px-3 py-2 text-right">Bogeys</th>
                    <th className="px-3 py-2 text-right">Dbl+</th>
                    <th className="px-3 py-2 text-right">Bonus</th>
                    <th className="px-3 py-2 text-right">Money</th>
                    <th className="px-4 py-2 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const bd = breakdownFantasyPoints({
                      position: r.position,
                      doubleEagles: r.double_eagles,
                      eagles: r.eagles,
                      birdies: r.birdies,
                      pars: r.pars,
                      bogeys: r.bogeys,
                      doubleBogeys: r.double_bogeys,
                      bonusPoints: r.bonus_points,
                      moneyHolePoints: r.money_hole_points,
                    });
                    const pts = r.fantasy_points || bd.total;
                    const eagleCount = bd.eagleCount + bd.doubleEagleCount;
                    const eaglePts = bd.eaglePts + bd.doubleEaglePts;
                    return (
                      <tr key={r.golfer_id} className="border-t">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <GolferAvatar name={r.name} pgaPlayerNum={r.pga_player_num} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <GolferName
                                  name={r.name}
                                  className="font-medium text-foreground"
                                  showRealNameHint
                                />
                                <GolferInfoButton golfer={toGolferInfo(r)} />
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">
                                  {formatAmericanOdds(r.decimal_odds)} · {formatOwgr(r.owgr_rank)}
                                </span>
                                <OwnershipBadge pickCount={r.pickCount} lineupCount={r.lineupCount} />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                          {formatPos(r.position, r.status)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                          {formatToPar(r.total_to_par)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <StatPts pts={bd.finish} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <StatPts count={bd.birdieCount} pts={bd.birdiePts} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <StatPts count={eagleCount} pts={eaglePts} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <StatPts count={bd.parCount} pts={bd.parPts} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <StatPts count={bd.bogeyCount} pts={bd.bogeyPts} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <StatPts count={bd.doubleBogeyCount} pts={bd.doubleBogeyPts} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <BonusPts pts={bd.bonusPoints} breakdown={r.bonus_breakdown} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <StatPts pts={bd.moneyHolePoints} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-success">
                          {pts.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/50">
                    <td
                      colSpan={11}
                      className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground"
                    >
                      Total
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-lg font-bold text-success">
                      {lineupTotal.toFixed(1)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">
              Each column shows count (when applicable) and points earned. DK Classic: Eagle +8 ·
              Birdie +3 · Par +0.5 · Bogey −0.5 · Double+ −1 · Place live (1st +30 … 50th +1). Money
              is the extra from the {MONEY_HOLE_MULTIPLIER}× money hole. Tap Bonus for streak /
              bogey-free / HIO breakdown.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function MobileStat({
  label,
  count,
  pts,
}: {
  label: string;
  count?: number;
  pts: number;
}) {
  return (
    <div className="rounded-md border border-border px-2 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {count != null ? <div className="font-mono text-foreground">{count}</div> : null}
      <div className={`font-mono text-[11px] ${pts < 0 ? "text-destructive" : "text-success"}`}>
        {formatPts(pts)}
      </div>
    </div>
  );
}

function MobileBonusStat({
  pts,
  breakdown,
}: {
  pts: number;
  breakdown: BonusBreakdown | null;
}) {
  const lines = bonusBreakdownLines(breakdown);
  const interactive = pts > 0 || lines.length > 0;
  if (!interactive) {
    return <MobileStat label="Bonus" pts={pts} />;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full rounded-md border border-border px-2 py-1.5 text-center outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Bonus points breakdown"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground underline decoration-dotted underline-offset-2">
            Bonus
          </div>
          <div className={`font-mono text-[11px] ${pts < 0 ? "text-destructive" : "text-success"}`}>
            {formatPts(pts)}
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56 p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Bonus breakdown
        </div>
        <BonusBreakdownBody pts={pts} breakdown={breakdown} />
      </PopoverContent>
    </Popover>
  );
}
