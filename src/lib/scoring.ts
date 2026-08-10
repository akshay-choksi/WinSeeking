/** DraftKings Classic Golf scoring (mirrors SQL compute_fantasy_points). */
export const SCORING = {
  doubleEagle: 13,
  eagle: 8,
  birdie: 3,
  par: 0.5,
  bogey: -0.5,
  doubleBogeyOrWorse: -1,
} as const;

/** Points multiplier on the daily money hole (hole scoring only). */
export const MONEY_HOLE_MULTIPLIER = 3;

/** DK Classic streak / achievement bonus point values. */
export const BONUS_SCORING = {
  birdieStreak: 3,
  bogeyFreeRound: 3,
  holeInOne: 5,
  allFourUnder70: 5,
} as const;

/** Component counts that make up player_results.bonus_points. */
export type BonusBreakdown = {
  birdieStreaks: number;
  bogeyFreeRounds: number;
  holeInOnes: number;
  allFourUnder70: boolean;
};

export type BonusBreakdownLine = {
  label: string;
  count: number;
  pts: number;
};

/** Normalize JSON from player_results.bonus_breakdown. */
export function parseBonusBreakdown(raw: unknown): BonusBreakdown | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  // Default `{}` before the first post-migration sync — treat as missing.
  if (
    !("birdieStreaks" in o) &&
    !("bogeyFreeRounds" in o) &&
    !("holeInOnes" in o) &&
    !("allFourUnder70" in o)
  ) {
    return null;
  }
  return {
    birdieStreaks: Math.max(0, Math.trunc(Number(o.birdieStreaks) || 0)),
    bogeyFreeRounds: Math.max(0, Math.trunc(Number(o.bogeyFreeRounds) || 0)),
    holeInOnes: Math.max(0, Math.trunc(Number(o.holeInOnes) || 0)),
    allFourUnder70: Boolean(o.allFourUnder70),
  };
}

/** Non-zero bonus lines for tooltips (e.g. "Birdie streak ×2 · +6"). */
export function bonusBreakdownLines(b: BonusBreakdown | null | undefined): BonusBreakdownLine[] {
  if (!b) return [];
  const lines: BonusBreakdownLine[] = [];
  if (b.birdieStreaks > 0) {
    lines.push({
      label: b.birdieStreaks === 1 ? "Birdie streak" : `Birdie streak ×${b.birdieStreaks}`,
      count: b.birdieStreaks,
      pts: b.birdieStreaks * BONUS_SCORING.birdieStreak,
    });
  }
  if (b.bogeyFreeRounds > 0) {
    lines.push({
      label:
        b.bogeyFreeRounds === 1
          ? "Bogey-free round"
          : `Bogey-free round ×${b.bogeyFreeRounds}`,
      count: b.bogeyFreeRounds,
      pts: b.bogeyFreeRounds * BONUS_SCORING.bogeyFreeRound,
    });
  }
  if (b.holeInOnes > 0) {
    lines.push({
      label: b.holeInOnes === 1 ? "Hole-in-one" : `Hole-in-one ×${b.holeInOnes}`,
      count: b.holeInOnes,
      pts: b.holeInOnes * BONUS_SCORING.holeInOne,
    });
  }
  if (b.allFourUnder70) {
    lines.push({
      label: "All 4 rounds under 70",
      count: 1,
      pts: BONUS_SCORING.allFourUnder70,
    });
  }
  return lines;
}

/** Live place points from current leaderboard position (DK Classic). */
export function finishPoints(position: number | null, _madeCut?: boolean): number {
  if (position == null || position < 1) return 0;
  if (position === 1) return 30;
  if (position === 2) return 20;
  if (position === 3) return 18;
  if (position === 4) return 16;
  if (position === 5) return 14;
  if (position === 6) return 12;
  if (position === 7) return 10;
  if (position === 8) return 9;
  if (position === 9) return 8;
  if (position === 10) return 7;
  if (position >= 11 && position <= 15) return 6;
  if (position >= 16 && position <= 20) return 5;
  if (position >= 21 && position <= 25) return 4;
  if (position >= 26 && position <= 30) return 3;
  if (position >= 31 && position <= 40) return 2;
  if (position >= 41 && position <= 50) return 1;
  return 0;
}

export type DkScoringInput = {
  position: number | null;
  doubleEagles?: number;
  eagles?: number;
  birdies?: number;
  pars?: number;
  bogeys?: number;
  doubleBogeys?: number;
  bonusPoints?: number;
  /** Extra pts from money-hole ×3 (base already in hole tallies). */
  moneyHolePoints?: number;
  /** @deprecated Ignored — DK has no flat made-cut bonus. */
  madeCut?: boolean;
  /** @deprecated Ignored — DK has no under-par stroke bonus. */
  totalToPar?: number | null;
};

export function computeFantasyPoints(input: DkScoringInput): number {
  return breakdownFantasyPoints(input).total;
}

export type FantasyPointsBreakdown = {
  finish: number;
  holePoints: number;
  bonusPoints: number;
  moneyHolePoints: number;
  birdieCount: number;
  eagleCount: number;
  doubleEagleCount: number;
  parCount: number;
  bogeyCount: number;
  doubleBogeyCount: number;
  birdiePts: number;
  eaglePts: number;
  doubleEaglePts: number;
  parPts: number;
  bogeyPts: number;
  doubleBogeyPts: number;
  total: number;
};

/** Component breakdown matching compute_fantasy_points / SCORING. */
export function breakdownFantasyPoints(input: DkScoringInput): FantasyPointsBreakdown {
  const doubleEagles = Math.max(input.doubleEagles ?? 0, 0);
  const eagles = Math.max(input.eagles ?? 0, 0);
  const birdies = Math.max(input.birdies ?? 0, 0);
  const pars = Math.max(input.pars ?? 0, 0);
  const bogeys = Math.max(input.bogeys ?? 0, 0);
  const doubleBogeys = Math.max(input.doubleBogeys ?? 0, 0);
  const bonusPoints = Math.max(input.bonusPoints ?? 0, 0);
  const moneyHolePoints = input.moneyHolePoints ?? 0;

  const finish = finishPoints(input.position);
  const doubleEaglePts = doubleEagles * SCORING.doubleEagle;
  const eaglePts = eagles * SCORING.eagle;
  const birdiePts = birdies * SCORING.birdie;
  const parPts = pars * SCORING.par;
  const bogeyPts = bogeys * SCORING.bogey;
  const doubleBogeyPts = doubleBogeys * SCORING.doubleBogeyOrWorse;
  const holePoints =
    doubleEaglePts + eaglePts + birdiePts + parPts + bogeyPts + doubleBogeyPts;

  return {
    finish,
    holePoints,
    bonusPoints,
    moneyHolePoints,
    birdieCount: birdies,
    eagleCount: eagles,
    doubleEagleCount: doubleEagles,
    parCount: pars,
    bogeyCount: bogeys,
    doubleBogeyCount: doubleBogeys,
    birdiePts,
    eaglePts,
    doubleEaglePts,
    parPts,
    bogeyPts,
    doubleBogeyPts,
    total: finish + holePoints + bonusPoints + moneyHolePoints,
  };
}

export function formatOdds(decimalOdds: number | null | undefined): string {
  if (decimalOdds == null || !Number.isFinite(decimalOdds)) return "—";
  return decimalOdds >= 10 ? decimalOdds.toFixed(1) : decimalOdds.toFixed(2);
}

/** Convert decimal odds (e.g. 6.0) to American integer (e.g. +500). */
export function decimalToAmerican(decimalOdds: number): number | null {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return null;
  if (decimalOdds >= 2) return Math.round((decimalOdds - 1) * 100);
  return Math.round(-100 / (decimalOdds - 1));
}

/** Display American odds from stored decimal (`+500`, `-110`). */
export function formatAmericanOdds(decimalOdds: number | null | undefined): string {
  if (decimalOdds == null || !Number.isFinite(decimalOdds)) return "—";
  const american = decimalToAmerican(decimalOdds);
  if (american == null) return "—";
  return american > 0 ? `+${american}` : String(american);
}

/** PGA Tour Cloudinary headshot URL from field `player_num`. */
export function golferHeadshotUrl(pgaPlayerNum: string | null | undefined): string | null {
  if (!pgaPlayerNum) return null;
  const num = String(pgaPlayerNum).trim();
  if (!num || !/^\d+$/.test(num)) return null;
  return `https://pga-tour-res.cloudinary.com/image/upload/c_fill,g_face,w_80,h_80/headshots_${num}.png`;
}

export type TournamentStatus = "scheduled" | "open" | "in_progress" | "completed";
export type TournamentEventType = "standard" | "signature" | "major";

export type Tournament = {
  id: string;
  dg_event_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  season_year: number;
  event_type: TournamentEventType;
  fedex_multiplier: number;
  status: TournamentStatus;
  lineup_lock_at: string | null;
  last_completed_round?: number | null;
};

/** Infer major / signature from event name (mirrors edge classifyEvent). */
export function classifyEvent(name: string): TournamentEventType {
  const n = name.toLowerCase();
  if (
    n.includes("masters") ||
    n.includes("u.s. open") ||
    n.includes("us open") ||
    n.includes("open championship") ||
    n.includes("the open") ||
    n.includes("pga championship")
  ) {
    return "major";
  }
  if (
    n.includes("signature") ||
    n.includes("players championship") ||
    n.includes("the players") ||
    n.includes("sentry") ||
    n.includes("pebble beach") ||
    n.includes("genesis invitational") ||
    n.includes("arnold palmer") ||
    n.includes("memorial") ||
    n.includes("rbc heritage") ||
    n.includes("travelers")
  ) {
    return "signature";
  }
  return "standard";
}

/** Season-point multiplier: standard 1×, signature 1.5×, major 2×. */
export function multiplierForEventType(eventType: TournamentEventType): number {
  if (eventType === "major") return 2;
  if (eventType === "signature") return 1.5;
  return 1;
}

/** Display label e.g. "Major · ×2 Season Pts". */
export function formatEventSeasonPtsLabel(
  tournament: Pick<Tournament, "event_type" | "fedex_multiplier">,
): string {
  const typeLabel =
    tournament.event_type === "major"
      ? "Major"
      : tournament.event_type === "signature"
        ? "Signature"
        : "Standard";
  const m = Number(tournament.fedex_multiplier ?? multiplierForEventType(tournament.event_type));
  const mLabel = Number.isInteger(m) ? String(m) : m.toFixed(1);
  return `${typeLabel} · ×${mLabel} Season Pts`;
}

/** Lineups lock at lineup_lock_at (or when the event is completed). Status in_progress alone does not lock — Sync Odds may set that early while drafting is still open. */
export function isLineupLocked(tournament: Pick<Tournament, "lineup_lock_at" | "status">): boolean {
  if (tournament.status === "completed") return true;
  if (!tournament.lineup_lock_at) return false;
  return Date.now() >= new Date(tournament.lineup_lock_at).getTime();
}

/** Active money-hole round: next unfinished round, or 4 when the event is done. */
export function currentMoneyHoleRound(
  tournament: Pick<Tournament, "status" | "last_completed_round">,
): number {
  if (tournament.status === "completed") return 4;
  const last = Math.max(0, Math.trunc(tournament.last_completed_round ?? 0));
  return Math.min(4, Math.max(1, last + 1));
}

/** Closest event that is not completed (prefers in_progress / open, else nearest by start date). */
export function pickActiveTournament(
  list: Tournament[],
  nowMs: number = Date.now(),
): Tournament | null {
  if (!list.length) return null;

  const inProgress = list.find((t) => t.status === "in_progress");
  if (inProgress) return inProgress;
  const open = list.find((t) => t.status === "open");
  if (open) return open;

  const candidates = list.filter((t) => t.status !== "completed");
  if (!candidates.length) return null;

  const scored = candidates.map((t) => {
    const start = t.start_date
      ? new Date(`${t.start_date}T12:00:00.000Z`).getTime()
      : Number.POSITIVE_INFINITY;
    return { t, start, delta: start - nowMs };
  });

  scored.sort((a, b) => {
    // Prefer events that haven't finished their start week yet (delta >= -4 days)
    const aLive = a.delta >= -4 * 86400000;
    const bLive = b.delta >= -4 * 86400000;
    if (aLive !== bLive) return aLive ? -1 : 1;
    return Math.abs(a.delta) - Math.abs(b.delta);
  });

  return scored[0]?.t ?? null;
}
