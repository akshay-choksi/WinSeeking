import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Eye, Trophy } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SurfacePanel } from "@/components/surface-panel";
import { StatusBadge } from "@/components/status-badge";
import { HarrysBigHole } from "@/components/harrys-big-hole";
import { OwnershipRoastChips } from "@/components/ownership-roast-chips";
import {
  buildOwnershipRoasts,
  computeOwnershipStats,
  type OwnershipRoast,
} from "@/lib/ownership";
import {
  computeMemberLineupStatus,
  mergeEventStandingsWithMissingMembers,
  type EventStandingWithDnq,
} from "@/lib/lineup-status";
import {
  currentMoneyHoleRound,
  formatEventSeasonPtsLabel,
  isLineupLocked,
  type Tournament,
} from "@/lib/scoring";
import { initialsFromName } from "@/lib/profile";

export const Route = createFileRoute("/_authenticated/league/$id_/recap/$tournamentId")({
  component: EventRecapPage,
});

type MoneyHoleRow = { round_number: number; hole_number: number };

type PodiumRow = EventStandingWithDnq & { place: number };

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
      <Avatar className="h-8 w-8 border border-border/60">
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

function EventRecapPage() {
  const { id: leagueId, tournamentId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();

  const [leagueName, setLeagueName] = useState<string | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [standings, setStandings] = useState<EventStandingWithDnq[]>([]);
  const [moneyHoles, setMoneyHoles] = useState<MoneyHoleRow[]>([]);
  const [roasts, setRoasts] = useState<OwnershipRoast[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setUnavailable(false);

      const [{ data: league }, { data: tourney }] = await Promise.all([
        supabase.from("leagues").select("id, name").eq("id", leagueId).maybeSingle(),
        supabase
          .from("tournaments")
          .select(
            "id, dg_event_id, name, start_date, end_date, season_year, event_type, fedex_multiplier, status, lineup_lock_at, last_completed_round",
          )
          .eq("id", tournamentId)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (!league || !tourney) {
        setUnavailable(true);
        setLoading(false);
        return;
      }

      setLeagueName(league.name);
      setTournament(tourney as Tournament);

      const lockedNow = isLineupLocked(tourney as Tournament);
      if (!lockedNow) {
        setStandings([]);
        setMoneyHoles([]);
        setRoasts([]);
        setLoading(false);
        return;
      }

      const [{ data: lineups }, { data: members }, { data: holes }] = await Promise.all([
        supabase
          .from("lineups")
          .select("id, user_id, total_spent, total_points, league_finish, season_points")
          .eq("league_id", leagueId)
          .eq("tournament_id", tournamentId),
        supabase.from("league_members").select("user_id").eq("league_id", leagueId),
        supabase
          .from("tournament_money_holes")
          .select("round_number, hole_number")
          .eq("tournament_id", tournamentId)
          .order("round_number", { ascending: true }),
      ]);

      if (cancelled) return;

      setMoneyHoles(
        (holes ?? []).map((h) => ({
          round_number: Number(h.round_number),
          hole_number: Number(h.hole_number),
        })),
      );

      const memberIds = (members ?? []).map((m) => m.user_id as string);
      const lineupRows = lineups ?? [];
      const lineupIds = lineupRows.map((l) => l.id);
      const userIds = [...new Set([...lineupRows.map((l) => l.user_id), ...memberIds])];

      const [{ data: profiles }, { data: entries }] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds)
          : Promise.resolve({
              data: [] as { id: string; full_name: string | null; avatar_url: string | null }[],
            }),
        lineupIds.length
          ? supabase
              .from("lineup_entries")
              .select("lineup_id, golfer_id")
              .in("lineup_id", lineupIds)
          : Promise.resolve({ data: [] as { lineup_id: string; golfer_id: string }[] }),
      ]);

      if (cancelled) return;

      const profileById = new Map(
        (profiles ?? []).map((p) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]),
      );
      const countByLineup = new Map<string, number>();
      for (const e of entries ?? []) {
        countByLineup.set(e.lineup_id, (countByLineup.get(e.lineup_id) ?? 0) + 1);
      }

      const baseStandings = lineupRows
        .map((l) => ({
          user_id: l.user_id,
          full_name: profileById.get(l.user_id)?.full_name ?? "Player",
          avatar_url: profileById.get(l.user_id)?.avatar_url ?? null,
          total_spent: l.total_spent,
          total_points: Number(l.total_points ?? 0),
          golfer_count: countByLineup.get(l.id) ?? 0,
          league_finish: l.league_finish ?? null,
          season_points: Number(l.season_points ?? 0),
          noLineup: (countByLineup.get(l.id) ?? 0) === 0,
        }))
        .sort((a, b) => {
          if (a.noLineup !== b.noLineup) return a.noLineup ? 1 : -1;
          if (b.total_points !== a.total_points) return b.total_points - a.total_points;
          return a.total_spent - b.total_spent;
        });

      const lineupStatus = computeMemberLineupStatus(
        memberIds,
        baseStandings.map((s) => s.user_id),
        user?.id,
      );
      const merged = mergeEventStandingsWithMissingMembers(
        baseStandings,
        lineupStatus.missingUserIds.map((uid) => ({
          user_id: uid,
          full_name: profileById.get(uid)?.full_name ?? "Player",
          avatar_url: profileById.get(uid)?.avatar_url ?? null,
        })),
        true,
      );
      setStandings(merged);

      const stats = computeOwnershipStats(lineupRows, entries ?? []);
      if (stats.lineupCount >= 2 && stats.pickCounts.size > 0) {
        const golferIds = [...stats.pickCounts.keys()];
        const { data: golfers } = await supabase
          .from("golfers")
          .select("id, name")
          .in("id", golferIds);
        if (cancelled) return;
        const golferNameById = new Map((golfers ?? []).map((g) => [g.id, g.name]));
        const userNameById = new Map(
          userIds.map((uid) => [uid, profileById.get(uid)?.full_name?.trim() || "Player"]),
        );
        setRoasts(
          buildOwnershipRoasts(
            stats,
            {
              golferName: (gid) => golferNameById.get(gid) ?? "Golfer",
              userName: (uid) => userNameById.get(uid) ?? "Player",
            },
            { maxUnique: 6, maxEveryone: 4 },
          ),
        );
      } else {
        setRoasts([]);
      }

      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, leagueId, tournamentId, user?.id]);

  const locked = tournament ? isLineupLocked(tournament) : false;
  const moneyHoleRound = tournament ? currentMoneyHoleRound(tournament) : null;
  const featuredHole =
    moneyHoleRound != null
      ? (moneyHoles.find((h) => h.round_number === moneyHoleRound) ?? moneyHoles.at(-1) ?? null)
      : (moneyHoles.at(-1) ?? null);

  const podium: PodiumRow[] = useMemo(() => {
    return standings
      .filter((s) => !s.noLineup)
      .slice(0, 3)
      .map((s, i) => ({
        ...s,
        place: s.league_finish ?? i + 1,
      }));
  }, [standings]);

  const yourStanding = standings.find((s) => s.user_id === user?.id) ?? null;
  const yourPlace = yourStanding
    ? yourStanding.league_finish ??
      standings.findIndex((s) => s.user_id === user?.id) + 1
    : null;

  const lineupLinks = standings.filter((s) => !s.noLineup);

  if (unavailable) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          to="/league/$id"
          params={{ id: leagueId }}
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to league
        </Link>
        <Card className="gap-0 border-dashed p-10 text-center shadow-sm">
          <h2 className="text-lg font-semibold">Recap unavailable</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            This league or event could not be loaded.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/league/$id"
        params={{ id: leagueId }}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {leagueName ?? "League"}
      </Link>

      {loading || !tournament ? (
        <Card className="gap-0 space-y-3 p-6 shadow-sm">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-40 w-full" />
        </Card>
      ) : !locked ? (
        <>
          <PageHeader
            eyebrow="Event recap"
            title={tournament.name}
            description="Lineups are still open — recap unlocks after lock so picks stay private."
          />
          <Card className="gap-0 border-dashed p-8 text-center shadow-sm">
            <p className="text-sm text-muted-foreground">
              Come back after lock for the podium, ownership callouts, and Harry&apos;s Big Hole.
            </p>
            <Button className="mt-4" variant="outline" asChild>
              <Link to="/league/$id" params={{ id: leagueId }}>
                Back to league
              </Link>
            </Button>
          </Card>
        </>
      ) : (
        <>
          <PageHeader
            eyebrow="Event recap"
            title={tournament.name}
            description={
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <StatusBadge tone="muted">{formatEventSeasonPtsLabel(tournament)}</StatusBadge>
                {tournament.status === "completed" ? (
                  <StatusBadge tone="locked">Final</StatusBadge>
                ) : (
                  <StatusBadge tone="live">Live</StatusBadge>
                )}
              </div>
            }
          />

          <SurfacePanel icon={<Trophy className="h-5 w-5" />} title="Podium" meta="Top finishers">
            {podium.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No scored lineups for this event.
              </div>
            ) : (
              <ol className="divide-y">
                {podium.map((row) => (
                  <li key={row.user_id} className="flex items-center gap-3 px-5 py-3.5">
                    <span
                      className={
                        row.place === 1
                          ? "inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 font-mono text-sm font-bold text-primary"
                          : "inline-flex h-8 w-8 items-center justify-center font-mono text-sm text-muted-foreground"
                      }
                    >
                      {row.place}
                    </span>
                    <div className="min-w-0 flex-1">
                      <PlayerLabel
                        name={row.full_name ?? "Player"}
                        avatarUrl={row.avatar_url}
                        isYou={row.user_id === user?.id}
                      />
                    </div>
                    <span className="font-mono text-base font-semibold tabular-nums text-success">
                      {row.total_points.toFixed(1)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </SurfacePanel>

          <SurfacePanel title="Your finish" meta={leagueName ?? undefined}>
            <div className="px-5 py-5">
              {!yourStanding || yourStanding.noLineup ? (
                <p className="text-sm text-muted-foreground">
                  You didn&apos;t submit a lineup for this event · DNQ
                </p>
              ) : (
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Place
                    </p>
                    <p className="mt-1 font-display text-3xl font-bold tracking-tight">
                      #{yourPlace}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {yourStanding.golfer_count} golfers · $
                      {yourStanding.total_spent.toLocaleString()} spent
                      {yourStanding.season_points > 0
                        ? ` · ${yourStanding.season_points.toFixed(1)} season pts`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Fantasy pts
                    </p>
                    <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-success">
                      {yourStanding.total_points.toFixed(1)}
                    </p>
                  </div>
                </div>
              )}
              {user && yourStanding && !yourStanding.noLineup ? (
                <Button className="mt-4" variant="outline" size="sm" asChild>
                  <Link
                    to="/league/$id/lineup/$userId"
                    params={{ id: leagueId, userId: user.id }}
                    search={{ tournament: tournamentId }}
                  >
                    <Eye className="mr-1.5 h-4 w-4" /> View my lineup
                  </Link>
                </Button>
              ) : null}
            </div>
          </SurfacePanel>

          {featuredHole ? (
            <HarrysBigHole
              holeNumber={featuredHole.hole_number}
              roundNumber={featuredHole.round_number}
              history={moneyHoles}
            />
          ) : null}

          {roasts.length > 0 ? (
            <SurfacePanel title="Ownership highlights" meta="Post-lock only">
              <div className="px-5 py-4">
                <OwnershipRoastChips roasts={roasts} />
              </div>
            </SurfacePanel>
          ) : null}

          <SurfacePanel title="Lineups" meta={`${lineupLinks.length} entries`}>
            {lineupLinks.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No lineups yet.</div>
            ) : (
              <ul className="divide-y">
                {lineupLinks.map((s, i) => {
                  const place = s.league_finish ?? i + 1;
                  return (
                    <li key={s.user_id}>
                      <Link
                        to="/league/$id/lineup/$userId"
                        params={{ id: leagueId, userId: s.user_id }}
                        search={{ tournament: tournamentId }}
                        className="flex items-center gap-3 px-5 py-3 transition hover:bg-brand-muted/30"
                      >
                        <span className="w-6 shrink-0 text-center font-mono text-sm text-muted-foreground">
                          {place}
                        </span>
                        <div className="min-w-0 flex-1">
                          <PlayerLabel
                            name={s.full_name ?? "Player"}
                            avatarUrl={s.avatar_url}
                            isYou={s.user_id === user?.id}
                          />
                        </div>
                        <span className="font-mono text-sm font-semibold tabular-nums text-success">
                          {s.total_points.toFixed(1)}
                        </span>
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </SurfacePanel>
        </>
      )}
    </div>
  );
}
