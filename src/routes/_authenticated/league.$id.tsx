import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOnLiveScoresUpdated } from "@/hooks/use-live-score-refresh";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trophy, ArrowLeft, Zap, Medal, Eye, Copy, X, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  isLineupLocked,
  pickActiveTournament,
  formatEventSeasonPtsLabel,
  currentMoneyHoleRound,
  type Tournament,
} from "@/lib/scoring";
import { pickDayLeaderQuote } from "@/lib/day-leader-quotes";
import { initialsFromName } from "@/lib/profile";
import { PageHeader } from "@/components/page-header";
import { SurfacePanel } from "@/components/surface-panel";
import { StatusBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EventHighlightsCarousel } from "@/components/event-highlights-carousel";

export const Route = createFileRoute("/_authenticated/league/$id")({
  component: LeaguePage,
});

type LeagueRow = {
  id: string;
  name: string;
  invite_code: string;
  salary_cap: number;
  max_players: number;
};

type MoneyHoleRow = {
  round_number: number;
  hole_number: number;
};

type EventStanding = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  total_spent: number;
  total_points: number;
  golfer_count: number;
  league_finish: number | null;
  season_points: number;
};

type SeasonStanding = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  fedex_points: number;
  wins: number;
  top5s: number;
};

type TopScorer = {
  golfer_id: string;
  name: string;
  pga_player_num: string | null;
  fantasy_points: number;
  position: number | null;
  total_to_par: number | null;
  status: string | null;
  onYourLineup: boolean;
  pickCount: number;
  lineupCount: number;
};

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

function PlayerLabel({
  name,
  avatarUrl,
  isYou,
}: {
  name: string;
  avatarUrl: string | null;
  isYou?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar className="h-7 w-7 border border-border/60">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback className="bg-navy text-[10px] font-semibold text-navy-foreground">
          {initialsFromName(name)}
        </AvatarFallback>
      </Avatar>
      <span>
        {name}
        {isYou ? (
          <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>
        ) : null}
      </span>
    </span>
  );
}

function LeaguePage() {
  const { id } = useParams({ from: "/_authenticated/league/$id" });
  const { user } = useAuth();
  const [league, setLeague] = useState<LeagueRow | null>(null);
  const [leagueStatus, setLeagueStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [eventStandings, setEventStandings] = useState<EventStanding[]>([]);
  const [seasonStandings, setSeasonStandings] = useState<SeasonStanding[]>([]);
  const [topScorers, setTopScorers] = useState<TopScorer[]>([]);
  const [showDayLeaderBanner, setShowDayLeaderBanner] = useState(false);
  const [moneyHoles, setMoneyHoles] = useState<MoneyHoleRow[]>([]);
  const seasonYear = useMemo(() => new Date().getFullYear(), []);

  async function loadLeague() {
    setLeagueStatus("loading");
    const { data, error } = await supabase
      .from("leagues")
      .select("id, name, invite_code, salary_cap, max_players")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      toast.error("Could not load league", { description: error.message });
      setLeague(null);
      setLeagueStatus("unavailable");
      return;
    }
    setLeague(data);
    // RLS returns null for non-members — show an explicit join path instead of a blank page.
    setLeagueStatus(data ? "ready" : "unavailable");
  }

  async function loadTournaments() {
    const { data } = await supabase
      .from("tournaments")
      .select(
        "id, dg_event_id, name, start_date, end_date, season_year, event_type, fedex_multiplier, status, lineup_lock_at, last_completed_round",
      )
      .order("start_date", { ascending: false })
      .limit(40);
    const list = (data ?? []) as Tournament[];
    setTournaments(list);
    setSelectedTournamentId((prev) => {
      if (prev && list.some((t) => t.id === prev)) return prev;
      return pickActiveTournament(list)?.id ?? list[0]?.id ?? null;
    });
  }

  async function loadEventStandings(tournamentId: string) {
    const { data: lineups } = await supabase
      .from("lineups")
      .select("id, user_id, total_spent, total_points, league_finish, season_points")
      .eq("league_id", id)
      .eq("tournament_id", tournamentId);
    if (!lineups) {
      setEventStandings([]);
      return;
    }
    const userIds = lineups.map((l) => l.user_id);
    const lineupIds = lineups.map((l) => l.id);

    const [{ data: profiles }, { data: entries }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds)
        : Promise.resolve({
            data: [] as { id: string; full_name: string | null; avatar_url: string | null }[],
          }),
      lineupIds.length
        ? supabase.from("lineup_entries").select("lineup_id").in("lineup_id", lineupIds)
        : Promise.resolve({ data: [] as { lineup_id: string }[] }),
    ]);

    const profileById = new Map(
      (profiles ?? []).map((p) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]),
    );
    const countByLineup = new Map<string, number>();
    (entries ?? []).forEach((e) => {
      countByLineup.set(e.lineup_id, (countByLineup.get(e.lineup_id) ?? 0) + 1);
    });

    const rows: EventStanding[] = lineups
      .map((l) => ({
        user_id: l.user_id,
        full_name: profileById.get(l.user_id)?.full_name ?? "Player",
        avatar_url: profileById.get(l.user_id)?.avatar_url ?? null,
        total_spent: l.total_spent,
        total_points: Number(l.total_points ?? 0),
        golfer_count: countByLineup.get(l.id) ?? 0,
        league_finish: l.league_finish ?? null,
        season_points: Number(l.season_points ?? 0),
      }))
      .sort((a, b) => {
        if (a.league_finish != null && b.league_finish != null) {
          return a.league_finish - b.league_finish || b.total_points - a.total_points;
        }
        if (a.league_finish != null) return -1;
        if (b.league_finish != null) return 1;
        return b.total_points - a.total_points || b.total_spent - a.total_spent;
      });
    setEventStandings(rows);
  }

  async function loadSeasonStandings() {
    const { data } = await supabase
      .from("season_standings")
      .select("user_id, fedex_points, wins, top5s")
      .eq("league_id", id)
      .eq("season_year", seasonYear)
      .order("fedex_points", { ascending: false });

    const rows = data ?? [];
    const userIds = rows.map((r) => r.user_id);
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds)
      : {
          data: [] as { id: string; full_name: string | null; avatar_url: string | null }[],
        };
    const profileById = new Map(
      (profiles ?? []).map((p) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]),
    );

    setSeasonStandings(
      rows.map((r) => ({
        user_id: r.user_id,
        full_name: profileById.get(r.user_id)?.full_name ?? "Player",
        avatar_url: profileById.get(r.user_id)?.avatar_url ?? null,
        fedex_points: Number(r.fedex_points ?? 0),
        wins: Number(r.wins ?? 0),
        top5s: Number(r.top5s ?? 0),
      })),
    );
  }

  async function loadMoneyHoles(tournamentId: string) {
    const { data } = await supabase
      .from("tournament_money_holes")
      .select("round_number, hole_number")
      .eq("tournament_id", tournamentId)
      .order("round_number", { ascending: true });
    setMoneyHoles(
      (data ?? []).map((r) => ({
        round_number: Number(r.round_number),
        hole_number: Number(r.hole_number),
      })),
    );
  }

  async function loadTopScorers(tournamentId: string) {
    const { data: results } = await supabase
      .from("player_results")
      .select(
        "golfer_id, fantasy_points, position, total_to_par, status, golfers(name, pga_player_num)",
      )
      .eq("tournament_id", tournamentId)
      .order("fantasy_points", { ascending: false })
      .limit(3);

    if (!results?.length) {
      setTopScorers([]);
      return;
    }

    const { data: lineups } = await supabase
      .from("lineups")
      .select("id, user_id")
      .eq("league_id", id)
      .eq("tournament_id", tournamentId);
    const lineupIds = (lineups ?? []).map((l) => l.id);
    const yourLineupId = (lineups ?? []).find((l) => l.user_id === user?.id)?.id ?? null;

    let pickCounts = new Map<string, number>();
    let yourGolferIds = new Set<string>();
    if (lineupIds.length) {
      const { data: entries } = await supabase
        .from("lineup_entries")
        .select("lineup_id, golfer_id")
        .in("lineup_id", lineupIds);
      pickCounts = new Map();
      for (const e of entries ?? []) {
        pickCounts.set(e.golfer_id, (pickCounts.get(e.golfer_id) ?? 0) + 1);
        if (yourLineupId && e.lineup_id === yourLineupId) {
          yourGolferIds.add(e.golfer_id);
        }
      }
    }

    setTopScorers(
      results.map((r) => {
        const g = r.golfers as unknown as { name: string; pga_player_num: string | null } | null;
        return {
          golfer_id: r.golfer_id,
          name: g?.name ?? "Golfer",
          pga_player_num: g?.pga_player_num ?? null,
          fantasy_points: Number(r.fantasy_points ?? 0),
          position: r.position,
          total_to_par: r.total_to_par,
          status: r.status,
          onYourLineup: yourGolferIds.has(r.golfer_id),
          pickCount: pickCounts.get(r.golfer_id) ?? 0,
          lineupCount: lineupIds.length,
        };
      }),
    );
  }

  useEffect(() => {
    loadLeague();
    loadTournaments();
    loadSeasonStandings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  useOnLiveScoresUpdated(() => {
    if (selectedTournamentId) {
      void loadEventStandings(selectedTournamentId);
      void loadTopScorers(selectedTournamentId);
      void loadMoneyHoles(selectedTournamentId);
    }
    void loadSeasonStandings();
  });

  useEffect(() => {
    if (!selectedTournamentId) {
      setEventStandings([]);
      setTopScorers([]);
      setMoneyHoles([]);
      return;
    }
    loadEventStandings(selectedTournamentId);
    loadTopScorers(selectedTournamentId);
    loadMoneyHoles(selectedTournamentId);

    let eventTimer: ReturnType<typeof setTimeout> | undefined;
    let seasonTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleEventLoad = () => {
      clearTimeout(eventTimer);
      eventTimer = setTimeout(() => {
        void loadEventStandings(selectedTournamentId);
        void loadTopScorers(selectedTournamentId);
      }, 350);
    };
    const scheduleSeasonLoad = () => {
      clearTimeout(seasonTimer);
      seasonTimer = setTimeout(() => loadSeasonStandings(), 350);
    };

    const channel = supabase
      .channel(`league-${id}-${selectedTournamentId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lineups", filter: `league_id=eq.${id}` },
        scheduleEventLoad,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lineup_entries" },
        scheduleEventLoad,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_results",
          filter: `tournament_id=eq.${selectedTournamentId}`,
        },
        scheduleEventLoad,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "season_standings", filter: `league_id=eq.${id}` },
        scheduleSeasonLoad,
      )
      .subscribe();

    return () => {
      clearTimeout(eventTimer);
      clearTimeout(seasonTimer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, selectedTournamentId, user?.id]);

  const selectedTournament = tournaments.find((t) => t.id === selectedTournamentId) ?? null;
  const rosterSize = league?.max_players ?? 6;
  const locked = selectedTournament ? isLineupLocked(selectedTournament) : false;
  const leaderPts = eventStandings[0]?.total_points;
  const yourStanding = eventStandings.find((s) => s.user_id === user?.id);
  const yourEventRank = yourStanding
    ? eventStandings.findIndex((s) => s.user_id === user?.id) + 1
    : null;
  const dayLeaderRound = selectedTournament?.last_completed_round ?? null;
  const dayLeader = eventStandings[0] ?? null;
  const dayLeaderTied =
    !!dayLeader &&
    eventStandings.length > 1 &&
    eventStandings[1]!.total_points === dayLeader.total_points;
  const dayLeaderQuote =
    dayLeaderRound != null && dayLeaderRound >= 1 && selectedTournament
      ? pickDayLeaderQuote(id, selectedTournament.id, dayLeaderRound)
      : null;
  const moneyHoleRound = selectedTournament ? currentMoneyHoleRound(selectedTournament) : null;
  const todaysMoneyHole =
    moneyHoleRound != null
      ? (moneyHoles.find((h) => h.round_number === moneyHoleRound) ?? null)
      : null;

  useEffect(() => {
    let cancelled = false;
    async function checkDayLeaderBanner() {
      if (
        !user ||
        !selectedTournament ||
        dayLeaderRound == null ||
        dayLeaderRound < 1 ||
        !dayLeader
      ) {
        if (!cancelled) setShowDayLeaderBanner(false);
        return;
      }
      const { data } = await supabase
        .from("league_day_leader_dismissals")
        .select("id")
        .eq("league_id", id)
        .eq("tournament_id", selectedTournament.id)
        .eq("user_id", user.id)
        .eq("completed_round", dayLeaderRound)
        .maybeSingle();
      if (!cancelled) setShowDayLeaderBanner(!data);
    }
    void checkDayLeaderBanner();
    return () => {
      cancelled = true;
    };
  }, [user?.id, id, selectedTournament?.id, dayLeaderRound, dayLeader?.user_id]);

  async function dismissDayLeaderBanner() {
    if (!user || !selectedTournament || dayLeaderRound == null || dayLeaderRound < 1) return;
    setShowDayLeaderBanner(false);
    const { error } = await supabase.from("league_day_leader_dismissals").upsert(
      {
        league_id: id,
        tournament_id: selectedTournament.id,
        user_id: user.id,
        completed_round: dayLeaderRound,
      },
      { onConflict: "league_id,tournament_id,user_id,completed_round" },
    );
    if (error) {
      setShowDayLeaderBanner(true);
      toast.error("Could not dismiss", { description: error.message });
    }
  }

  async function copyInvite() {
    if (!league?.invite_code) return;
    try {
      await navigator.clipboard.writeText(league.invite_code);
      toast.success("Invite code copied");
    } catch {
      toast.error("Could not copy invite code");
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All leagues
      </Link>

      {leagueStatus === "loading" && !league ? (
        <Card className="gap-0 p-6 shadow-sm">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-3 h-4 w-64" />
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </Card>
      ) : null}

      {leagueStatus === "unavailable" && !league ? (
        <Card className="gap-0 border-dashed p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-muted text-primary">
            <Trophy className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-semibold">League not available</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            You&apos;re signed in, but this league isn&apos;t on your account. Rejoin with the invite
            code from the home page.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/">
              <LogIn className="mr-2 h-4 w-4" /> Back to leagues
            </Link>
          </Button>
        </Card>
      ) : null}

      {league && (
        <>
          <PageHeader
            eyebrow="League"
            title={league.name}
            description={
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={copyInvite}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 font-mono text-xs text-foreground transition hover:border-primary/40 hover:text-primary"
                >
                  {league.invite_code}
                  <Copy className="h-3 w-3 text-muted-foreground" />
                </button>
                <StatusBadge tone="open">Cap ${league.salary_cap.toLocaleString()}</StatusBadge>
                {selectedTournament?.lineup_lock_at && (
                  <StatusBadge tone={locked ? "locked" : "live"}>
                    {locked ? "Locked" : "Open"} ·{" "}
                    {new Date(selectedTournament.lineup_lock_at).toLocaleString()}
                  </StatusBadge>
                )}
              </div>
            }
          />

          {showDayLeaderBanner && dayLeader && dayLeaderRound != null && dayLeaderQuote && (
            <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm sm:p-5">
              <button
                type="button"
                onClick={() => void dismissDayLeaderBanner()}
                className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Dismiss day leader banner"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="pr-8 text-xs font-semibold uppercase tracking-wide text-primary">
                After Round {dayLeaderRound}
              </p>
              <p className="mt-1 pr-8 text-lg font-semibold tracking-tight text-foreground">
                {dayLeader.full_name ?? "Player"}
                {dayLeaderTied ? " (tied)" : ""} leads the league
              </p>
              <p className="mt-2 max-w-2xl text-sm italic text-muted-foreground">
                “{dayLeaderQuote}”
              </p>
            </div>
          )}

          <SurfacePanel
            title={selectedTournament?.name ?? "Select an event"}
            meta={`${eventStandings.length} ${eventStandings.length === 1 ? "entry" : "entries"}`}
          >
            <div className="grid grid-cols-2">
              <div className="bg-navy px-5 py-4 text-navy-foreground">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-foreground/70">
                  Your points
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
                  {yourStanding ? yourStanding.total_points.toFixed(1) : "—"}
                </p>
                <p className="mt-1 text-xs text-navy-foreground/65">
                  {yourEventRank != null ? `#${yourEventRank} this event` : "No lineup submitted"}
                </p>
              </div>
              <div className="border-l border-primary/15 bg-brand-muted/40 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Leader
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-success">
                  {leaderPts != null ? leaderPts.toFixed(1) : "—"}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {eventStandings[0]?.full_name ?? "No lineups yet"}
                </p>
              </div>
            </div>
            {(!locked || user) && (
              <div className="border-t border-border/80 px-4 py-3">
                {locked && user ? (
                  <Button className="w-full sm:w-auto" variant="outline" asChild>
                    <Link
                      to="/league/$id/lineup/$userId"
                      params={{ id, userId: user.id }}
                      search={{ tournament: selectedTournamentId ?? undefined }}
                    >
                      <Eye className="mr-2 h-4 w-4" /> View my lineup
                    </Link>
                  </Button>
                ) : !locked ? (
                  <Button className="w-full sm:w-auto" asChild>
                    <Link
                      to="/league/$id/draft"
                      params={{ id }}
                      search={{ tournament: selectedTournamentId ?? undefined }}
                    >
                      <Zap className="mr-2 h-4 w-4" />
                      {yourStanding ? "Edit lineup" : "Set lineup"}
                    </Link>
                  </Button>
                ) : null}
              </div>
            )}
          </SurfacePanel>
        </>
      )}

      <Tabs defaultValue="event" className="gap-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-muted/70 p-1 sm:h-11 sm:w-auto sm:flex-nowrap">
          <TabsTrigger value="event" className="min-h-10 flex-1 rounded-lg px-3 sm:flex-none sm:px-4">
            Event
            <span className="ml-1 hidden sm:inline">Leaderboard</span>
          </TabsTrigger>
          <TabsTrigger value="season" className="min-h-10 flex-1 rounded-lg px-3 sm:flex-none sm:px-4">
            Season
            <span className="ml-1 hidden sm:inline">Standings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="event" className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={selectedTournamentId ?? ""}
              onValueChange={(v) => setSelectedTournamentId(v)}
            >
              <SelectTrigger className="w-full bg-card shadow-sm sm:w-[min(100%,320px)]">
                <SelectValue placeholder="Select event" />
              </SelectTrigger>
              <SelectContent>
                {tournaments.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.status === "completed"
                      ? " · Completed"
                      : t.status === "in_progress"
                        ? " · Live"
                        : t.status === "open"
                          ? " · Open"
                          : ` · ${t.status}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTournament && (
              <StatusBadge tone="muted">
                {formatEventSeasonPtsLabel(selectedTournament)}
              </StatusBadge>
            )}
          </div>

          {(todaysMoneyHole && moneyHoleRound != null) || topScorers.length > 0 ? (
            <EventHighlightsCarousel
              moneyHole={
                todaysMoneyHole && moneyHoleRound != null
                  ? {
                      hole_number: todaysMoneyHole.hole_number,
                      round_number: moneyHoleRound,
                    }
                  : null
              }
              moneyHoleHistory={moneyHoles}
              topScorers={topScorers}
              tournamentStatus={selectedTournament?.status}
              formatPos={formatPos}
              formatToPar={formatToPar}
            />
          ) : null}

          <SurfacePanel
            icon={<Trophy className="h-5 w-5" />}
            title={`${selectedTournament?.name ?? "Event"} Leaderboard`}
            meta={
              selectedTournament?.status === "completed"
                ? "Final · Click a player to view lineup"
                : locked
                  ? "Live · Click a player to view lineup"
                  : "Realtime"
            }
          >
            {eventStandings.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No lineups submitted for this event yet.
              </div>
            ) : (
              <>
                {/* Mobile stacked rows */}
                <div className="divide-y md:hidden">
                  {eventStandings.map((s, i) => {
                    const canView = locked || s.user_id === user?.id;
                    const isYou = s.user_id === user?.id;
                    const place = s.league_finish ?? i + 1;
                    const showSeasonPts =
                      selectedTournament?.status === "completed" || s.league_finish != null;
                    const row = (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className="w-7 shrink-0 text-center font-mono text-sm text-muted-foreground">
                          {place === 1 ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                              1
                            </span>
                          ) : (
                            place
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <PlayerLabel
                            name={s.full_name ?? "Player"}
                            avatarUrl={s.avatar_url}
                            isYou={isYou}
                          />
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {s.golfer_count}/{rosterSize} · ${s.total_spent.toLocaleString()}
                            {showSeasonPts ? ` · Season ${s.season_points.toFixed(1)}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0 text-right font-mono text-base font-semibold tabular-nums text-success">
                          {s.total_points.toFixed(1)}
                        </div>
                      </div>
                    );
                    return canView ? (
                      <Link
                        key={s.user_id}
                        to="/league/$id/lineup/$userId"
                        params={{ id, userId: s.user_id }}
                        search={{ tournament: selectedTournamentId ?? undefined }}
                        className="block transition hover:bg-brand-muted/30"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div key={s.user_id}>{row}</div>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-5 py-2.5 w-12">Place</th>
                        <th className="px-5 py-2.5">Player</th>
                        <th className="px-5 py-2.5">Golfers</th>
                        <th className="px-5 py-2.5 text-right">Spent</th>
                        <th className="px-5 py-2.5 text-right">Fantasy Pts</th>
                        <th className="px-5 py-2.5 text-right">Season Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventStandings.map((s, i) => {
                        const canView = locked || s.user_id === user?.id;
                        const isYou = s.user_id === user?.id;
                        const place = s.league_finish ?? i + 1;
                        const showSeasonPts =
                          selectedTournament?.status === "completed" || s.league_finish != null;
                        return (
                          <tr
                            key={s.user_id}
                            className="border-t border-border/70 transition hover:bg-brand-muted/30"
                          >
                            <td className="px-5 py-3 font-mono text-muted-foreground">
                              {place === 1 ? (
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                                  1
                                </span>
                              ) : (
                                place
                              )}
                            </td>
                            <td className="px-5 py-3 font-medium">
                              {canView ? (
                                <Link
                                  to="/league/$id/lineup/$userId"
                                  params={{ id, userId: s.user_id }}
                                  search={{ tournament: selectedTournamentId ?? undefined }}
                                  className="text-primary hover:underline"
                                >
                                  <PlayerLabel
                                    name={s.full_name ?? "Player"}
                                    avatarUrl={s.avatar_url}
                                    isYou={isYou}
                                  />
                                </Link>
                              ) : (
                                <PlayerLabel
                                  name={s.full_name ?? "Player"}
                                  avatarUrl={s.avatar_url}
                                  isYou={isYou}
                                />
                              )}
                            </td>
                            <td className="px-5 py-3 tabular-nums">
                              {s.golfer_count} / {rosterSize}
                            </td>
                            <td className="px-5 py-3 text-right font-mono tabular-nums">
                              ${s.total_spent.toLocaleString()}
                            </td>
                            <td className="px-5 py-3 text-right font-mono text-base font-semibold tabular-nums text-success">
                              {s.total_points.toFixed(1)}
                            </td>
                            <td className="px-5 py-3 text-right font-mono tabular-nums text-muted-foreground">
                              {showSeasonPts ? s.season_points.toFixed(1) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </SurfacePanel>
        </TabsContent>

        <TabsContent value="season">
          <SurfacePanel
            icon={<Medal className="h-5 w-5" />}
            title={`${seasonYear} Season Standings`}
            meta="Season Points"
          >
            {seasonStandings.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No season points yet. Finalize an event after it completes.
              </div>
            ) : (
              <>
                <div className="divide-y md:hidden">
                  {seasonStandings.map((s, i) => (
                    <div key={s.user_id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-7 shrink-0 text-center font-mono text-sm text-muted-foreground">
                        {i === 0 ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                            1
                          </span>
                        ) : (
                          i + 1
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <PlayerLabel
                          name={s.full_name ?? "Player"}
                          avatarUrl={s.avatar_url}
                          isYou={s.user_id === user?.id}
                        />
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {s.wins} win{s.wins === 1 ? "" : "s"} · {s.top5s} top 5
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-mono text-base font-semibold tabular-nums text-success">
                        {s.fedex_points.toFixed(1)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-5 py-2.5 w-12">#</th>
                        <th className="px-5 py-2.5">Player</th>
                        <th className="px-5 py-2.5 text-right">Wins</th>
                        <th className="px-5 py-2.5 text-right">Top 5</th>
                        <th className="px-5 py-2.5 text-right">Season Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seasonStandings.map((s, i) => (
                        <tr
                          key={s.user_id}
                          className="border-t border-border/70 transition hover:bg-brand-muted/30"
                        >
                          <td className="px-5 py-3 font-mono text-muted-foreground">
                            {i === 0 ? (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                                1
                              </span>
                            ) : (
                              i + 1
                            )}
                          </td>
                          <td className="px-5 py-3 font-medium">
                            <PlayerLabel
                              name={s.full_name ?? "Player"}
                              avatarUrl={s.avatar_url}
                              isYou={s.user_id === user?.id}
                            />
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums">{s.wins}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{s.top5s}</td>
                          <td className="px-5 py-3 text-right font-mono text-base font-semibold tabular-nums text-success">
                            {s.fedex_points.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </SurfacePanel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
