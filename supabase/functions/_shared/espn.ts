/**
 * Live per-player hole stats from ESPN hole-by-hole scorecards.
 * Used for DraftKings Classic-style fantasy scoring.
 * Also maps ESPN athlete ids + light profile fields for player info popovers.
 */

type EspnHole = {
  value?: number;
  displayValue?: string;
  scoreType?: { displayValue?: string };
};

type EspnRound = {
  value?: number;
  displayValue?: string;
  linescores?: EspnHole[];
};

type EspnCompetitor = {
  id?: string | number;
  athlete?: {
    id?: string | number;
    displayName?: string;
    fullName?: string;
    links?: { href?: string }[];
  };
  linescores?: EspnRound[];
};

type EspnEvent = {
  id?: string;
  name?: string;
  shortName?: string;
  competitions?: { competitors?: EspnCompetitor[] }[];
};

type EspnScoreboard = {
  events?: EspnEvent[];
};

/** Per-player hole tallies + DK bonus points derived from ESPN scorecards. */
export type DkHoleStats = {
  doubleEagles: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  /** Streak / bogey-free / HIO / all-4-under-70 bonus points. */
  bonusPoints: number;
};

const EMPTY_STATS: DkHoleStats = {
  doubleEagles: 0,
  eagles: 0,
  birdies: 0,
  pars: 0,
  bogeys: 0,
  doubleBogeys: 0,
  bonusPoints: 0,
};

export type EspnAthleteRef = {
  athleteId: string;
  displayName: string;
};

export type EspnAthleteProfile = {
  age: number | null;
  birthPlace: string | null;
  college: string | null;
  handedness: string | null;
  seasonEvents: number | null;
  seasonCuts: number | null;
  seasonTop10s: number | null;
  seasonWins: number | null;
  seasonEarnings: string | null;
  fedexPoints: number | null;
  fedexRank: number | null;
};

const ESPN_UA = "WinSeeking/1.0 (fantasy golf; contact via app)";

/** Fold accents / Nordic letters and normalize "Last, First" → "first last". */
export function normalizePlayerName(name: string): string {
  let raw = name.trim();
  if (raw.includes(",")) {
    const [last, first] = raw.split(",", 2).map((p) => p.trim());
    if (first) raw = `${first} ${last}`;
  }

  let s = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s
    .replace(/[øØ]/g, "o")
    .replace(/[æÆ]/g, "ae")
    .replace(/[åÅ]/g, "a")
    .replace(/[łŁ]/g, "l")
    .replace(/[ß]/g, "ss");
  s = s.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

function parseRelToPar(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s) return null;
  if (s === "E" || s === "EVEN") return 0;
  const n = Number(s.replace("+", ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function hasBirdieOrBetterStreak(rels: number[]): boolean {
  let streak = 0;
  for (const rel of rels) {
    if (rel <= -1) {
      streak += 1;
      if (streak >= 3) return true;
    } else {
      streak = 0;
    }
  }
  return false;
}

function statsFromCompetitor(comp: EspnCompetitor): DkHoleStats {
  let doubleEagles = 0;
  let eagles = 0;
  let birdies = 0;
  let pars = 0;
  let bogeys = 0;
  let doubleBogeys = 0;
  let holeInOnes = 0;
  let birdieStreakBonuses = 0;
  let bogeyFreeRounds = 0;
  const completedRoundStrokes: number[] = [];

  for (const round of comp.linescores ?? []) {
    const holes = round.linescores ?? [];
    const rels: number[] = [];
    let roundBogeys = 0;

    for (const hole of holes) {
      const rel = parseRelToPar(hole.scoreType?.displayValue);
      if (rel == null) continue;
      rels.push(rel);

      if (rel <= -3) doubleEagles += 1;
      else if (rel === -2) eagles += 1;
      else if (rel === -1) birdies += 1;
      else if (rel === 0) pars += 1;
      else if (rel === 1) {
        bogeys += 1;
        roundBogeys += 1;
      } else {
        doubleBogeys += 1;
        roundBogeys += 1;
      }

      const strokes = typeof hole.value === "number" ? hole.value : Number(hole.displayValue);
      if (Number.isFinite(strokes) && strokes === 1) holeInOnes += 1;
    }

    if (rels.length === 18) {
      if (hasBirdieOrBetterStreak(rels)) birdieStreakBonuses += 1;
      if (roundBogeys === 0) bogeyFreeRounds += 1;

      const roundStrokes =
        typeof round.value === "number" && Number.isFinite(round.value)
          ? round.value
          : Number(round.displayValue);
      if (Number.isFinite(roundStrokes) && roundStrokes > 0) {
        completedRoundStrokes.push(roundStrokes);
      }
    } else if (rels.length > 0 && hasBirdieOrBetterStreak(rels)) {
      // Mid-round streak still counts once the third birdie-or-better lands.
      birdieStreakBonuses += 1;
    }
  }

  const allFourUnder70 =
    completedRoundStrokes.length >= 4 &&
    completedRoundStrokes.slice(0, 4).every((s) => s < 70);

  const bonusPoints =
    birdieStreakBonuses * 3 +
    bogeyFreeRounds * 3 +
    holeInOnes * 5 +
    (allFourUnder70 ? 5 : 0);

  return {
    doubleEagles,
    eagles,
    birdies,
    pars,
    bogeys,
    doubleBogeys,
    bonusPoints,
  };
}

function eventMatchScore(event: EspnEvent, tournamentName: string): number {
  const target = normalizePlayerName(tournamentName);
  const candidates = [event.name, event.shortName]
    .filter(Boolean)
    .map((n) => normalizePlayerName(String(n)));
  let best = 0;
  for (const c of candidates) {
    if (c === target) return 100;
    if (c.includes(target) || target.includes(c)) best = Math.max(best, 80);
    const tParts = new Set(target.split(" ").filter((w) => w.length > 2));
    const cParts = new Set(c.split(" ").filter((w) => w.length > 2));
    let overlap = 0;
    for (const w of tParts) if (cParts.has(w)) overlap += 1;
    best = Math.max(best, overlap * 15);
  }
  return best;
}

function pickEvent(events: EspnEvent[], tournamentName: string): EspnEvent | null {
  if (!events.length) return null;
  let best: EspnEvent | null = null;
  let bestScore = -1;
  for (const ev of events) {
    const score = eventMatchScore(ev, tournamentName);
    if (score > bestScore) {
      bestScore = score;
      best = ev;
    }
  }
  if (bestScore <= 0) return events[0] ?? null;
  return best;
}

async function fetchEspnScoreboard(): Promise<EspnScoreboard | null> {
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard",
      { headers: { "User-Agent": ESPN_UA } },
    );
    if (!res.ok) return null;
    return (await res.json()) as EspnScoreboard;
  } catch {
    return null;
  }
}

/**
 * Fetch ESPN PGA scoreboard and build name → DK hole stats for the matching event.
 * Best-effort: returns empty map on network/parse failure.
 */
export async function fetchEspnHoleStatsMap(
  tournamentName: string,
): Promise<Map<string, DkHoleStats>> {
  const map = new Map<string, DkHoleStats>();
  const data = await fetchEspnScoreboard();
  if (!data) return map;
  const event = pickEvent(data.events ?? [], tournamentName);
  const competitors = event?.competitions?.[0]?.competitors ?? [];
  for (const comp of competitors) {
    const display = comp.athlete?.displayName;
    if (!display) continue;
    const key = normalizePlayerName(display);
    if (!key) continue;
    map.set(key, statsFromCompetitor(comp));
  }
  return map;
}

/** Name → ESPN athlete id from the PGA scoreboard (matched to tournament when possible). */
export async function fetchEspnAthleteIdMap(
  tournamentName: string,
): Promise<Map<string, EspnAthleteRef>> {
  const map = new Map<string, EspnAthleteRef>();

  // Prefer leaderboard (includes athlete.id); fall back to scoreboard competitor.id.
  const sources: EspnScoreboard[] = [];
  try {
    const lb = await fetch(
      "https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga",
      { headers: { "User-Agent": ESPN_UA } },
    );
    if (lb.ok) sources.push((await lb.json()) as EspnScoreboard);
  } catch {
    // ignore
  }
  const sb = await fetchEspnScoreboard();
  if (sb) sources.push(sb);

  for (const data of sources) {
    const event = pickEvent(data.events ?? [], tournamentName);
    const competitors = event?.competitions?.[0]?.competitors ?? [];
    for (const comp of competitors) {
      const display = comp.athlete?.displayName ?? comp.athlete?.fullName;
      if (!display) continue;
      const key = normalizePlayerName(display);
      if (!key || map.has(key)) continue;

      let athleteId: string | null =
        comp.athlete?.id != null && `${comp.athlete.id}` !== ""
          ? String(comp.athlete.id)
          : comp.id != null
            ? String(comp.id)
            : null;

      // Parse from ESPN playercard link when id missing on athlete object
      if (!athleteId && Array.isArray(comp.athlete?.links)) {
        for (const link of comp.athlete.links) {
          const href = typeof link?.href === "string" ? link.href : "";
          const m = href.match(/\/id\/(\d+)\//);
          if (m) {
            athleteId = m[1];
            break;
          }
        }
      }
      if (!athleteId) continue;
      map.set(key, { athleteId, displayName: display });
    }
  }
  return map;
}

function parseIntStat(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  const s = String(raw).replace(/[$,]/g, "").trim();
  if (!s || s === "--" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function pickPgaTourSplit(statistics: Record<string, unknown> | null | undefined): {
  events: number | null;
  cuts: number | null;
  top10s: number | null;
  wins: number | null;
  earnings: string | null;
} {
  const empty = {
    events: null as number | null,
    cuts: null as number | null,
    top10s: null as number | null,
    wins: null as number | null,
    earnings: null as string | null,
  };
  if (!statistics) return empty;
  const splits = statistics.splits;
  if (!Array.isArray(splits)) return empty;
  const pga =
    splits.find((s) => {
      const name = String((s as Record<string, unknown>).displayName ?? "").toUpperCase();
      return name.includes("PGA");
    }) ?? splits[0];
  if (!pga || typeof pga !== "object") return empty;
  const stats = (pga as Record<string, unknown>).stats;
  if (!Array.isArray(stats)) return empty;
  // labels: EVENTS, CUTS, TOP10, WINS, AVG, EARNINGS
  const earningsRaw = stats[5];
  return {
    events: parseIntStat(stats[0]),
    cuts: parseIntStat(stats[1]),
    top10s: parseIntStat(stats[2]),
    wins: parseIntStat(stats[3]),
    earnings:
      typeof earningsRaw === "string" && earningsRaw.trim() && earningsRaw !== "--"
        ? earningsRaw.trim()
        : null,
  };
}

/** Best-effort ESPN athlete profile + season form (age / birthplace / college / hand / season stats). */
export async function fetchEspnAthleteProfile(
  athleteId: string,
): Promise<EspnAthleteProfile | null> {
  const empty: EspnAthleteProfile = {
    age: null,
    birthPlace: null,
    college: null,
    handedness: null,
    seasonEvents: null,
    seasonCuts: null,
    seasonTop10s: null,
    seasonWins: null,
    seasonEarnings: null,
    fedexPoints: null,
    fedexRank: null,
  };

  let profile: EspnAthleteProfile = { ...empty };

  // Bio card
  try {
    const res = await fetch(
      `https://site.web.api.espn.com/apis/common/v3/sports/golf/pga/athletes/${athleteId}`,
      { headers: { "User-Agent": ESPN_UA } },
    );
    if (res.ok) {
      const raw = (await res.json()) as Record<string, unknown>;
      const athlete =
        (raw.athlete as Record<string, unknown> | undefined) ??
        (raw as Record<string, unknown>);

      const ageRaw = athlete.age;
      profile.age =
        typeof ageRaw === "number" && Number.isFinite(ageRaw)
          ? Math.trunc(ageRaw)
          : typeof ageRaw === "string" && Number.isFinite(Number(ageRaw))
            ? Math.trunc(Number(ageRaw))
            : null;

      const bp = athlete.birthPlace ?? athlete.birth_place;
      if (typeof bp === "string" && bp.trim()) profile.birthPlace = bp.trim();
      else if (bp && typeof bp === "object") {
        const obj = bp as Record<string, unknown>;
        const parts = [obj.city, obj.state, obj.country]
          .filter((x) => typeof x === "string" && String(x).trim())
          .map((x) => String(x).trim());
        if (parts.length) profile.birthPlace = parts.join(", ");
      }

      const collegeRaw = athlete.college ?? athlete.collegeName;
      if (typeof collegeRaw === "string" && collegeRaw.trim()) {
        profile.college = collegeRaw.trim();
      } else if (collegeRaw && typeof collegeRaw === "object") {
        const n = (collegeRaw as Record<string, unknown>).name;
        if (typeof n === "string" && n.trim()) profile.college = n.trim();
      }

      const handRaw = athlete.hand ?? athlete.bats ?? athlete.throws;
      if (typeof handRaw === "string" && handRaw.trim()) {
        const h = handRaw.trim().toUpperCase();
        if (h.startsWith("L")) profile.handedness = "L";
        else if (h.startsWith("R")) profile.handedness = "R";
        else profile.handedness = h.slice(0, 1);
      } else if (handRaw && typeof handRaw === "object") {
        const abbrev =
          (handRaw as Record<string, unknown>).abbreviation ??
          (handRaw as Record<string, unknown>).displayValue;
        if (typeof abbrev === "string" && abbrev.trim()) {
          profile.handedness = abbrev.trim().toUpperCase().slice(0, 1);
        }
      }
    }
  } catch {
    // continue
  }

  // Season overview: events / cuts / top10 / wins / earnings
  try {
    const res = await fetch(
      `https://site.web.api.espn.com/apis/common/v3/sports/golf/pga/athletes/${athleteId}/overview`,
      { headers: { "User-Agent": ESPN_UA } },
    );
    if (res.ok) {
      const raw = (await res.json()) as Record<string, unknown>;
      const split = pickPgaTourSplit(raw.statistics as Record<string, unknown> | undefined);
      profile.seasonEvents = split.events;
      profile.seasonCuts = split.cuts;
      profile.seasonTop10s = split.top10s;
      profile.seasonWins = split.wins;
      profile.seasonEarnings = split.earnings;
    }
  } catch {
    // continue
  }

  // FedEx Cup points + rank from season stats leaderboard (paginated)
  try {
    for (let page = 1; page <= 6; page += 1) {
      const url =
        `https://site.web.api.espn.com/apis/common/v3/sports/golf/pga/statistics/byathlete` +
        `?limit=100&page=${page}&sort=cupPoints:desc`;
      const res = await fetch(url, { headers: { "User-Agent": ESPN_UA } });
      if (!res.ok) break;
      const raw = (await res.json()) as {
        athletes?: {
          athlete?: { id?: string | number };
          categories?: {
            name?: string;
            labels?: string[];
            totals?: unknown[];
            values?: unknown[];
            ranks?: unknown[];
          }[];
        }[];
        pagination?: { pages?: number };
      };
      const rows = raw.athletes ?? [];
      for (const row of rows) {
        if (String(row.athlete?.id ?? "") !== String(athleteId)) continue;
        const general =
          row.categories?.find((c) => c.name === "general") ?? row.categories?.[0];
        if (!general) break;
        const labels = (general.labels ?? []).map((l) => String(l).toUpperCase());
        const cupIdx = labels.indexOf("CUPPTS");
        if (cupIdx >= 0) {
          const val = general.values?.[cupIdx] ?? general.totals?.[cupIdx];
          const rankRaw = general.ranks?.[cupIdx];
          if (typeof val === "number" && Number.isFinite(val)) profile.fedexPoints = val;
          else if (typeof val === "string") {
            const n = Number(String(val).replace(/[$,]/g, ""));
            if (Number.isFinite(n)) profile.fedexPoints = n;
          }
          if (typeof rankRaw === "number" && Number.isFinite(rankRaw)) {
            profile.fedexRank = Math.trunc(rankRaw);
          } else if (typeof rankRaw === "string") {
            const n = Number(String(rankRaw).replace(/[^\d]/g, ""));
            if (Number.isFinite(n) && n > 0) profile.fedexRank = Math.trunc(n);
          }
        }
        return profile;
      }
      const pages = raw.pagination?.pages ?? page;
      if (page >= pages) break;
    }
  } catch {
    // optional
  }

  const hasAny =
    profile.age != null ||
    profile.birthPlace ||
    profile.college ||
    profile.handedness ||
    profile.seasonEvents != null ||
    profile.seasonCuts != null ||
    profile.seasonWins != null ||
    profile.fedexRank != null;
  return hasAny ? profile : null;
}

/** Look up hole stats for a DataGolf-style player name. */
export function lookupHoleStats(
  map: Map<string, DkHoleStats>,
  playerName: string,
): DkHoleStats {
  const key = normalizePlayerName(playerName);
  return map.get(key) ?? { ...EMPTY_STATS };
}

/** @deprecated Use fetchEspnHoleStatsMap */
export async function fetchEspnBirdieMap(tournamentName: string) {
  return fetchEspnHoleStatsMap(tournamentName);
}

/** @deprecated Use lookupHoleStats */
export function lookupBirdieCounts(map: Map<string, DkHoleStats>, playerName: string) {
  const s = lookupHoleStats(map, playerName);
  return { birdies: s.birdies, eagles: s.eagles + s.doubleEagles };
}
