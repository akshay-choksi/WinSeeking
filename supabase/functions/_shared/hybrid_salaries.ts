/** Pure hybrid salary pricing (no Deno deps — unit-testable from Node). */

/** Hybrid salary weights: market / course-win / rank / form. */
export const HYBRID_WEIGHTS = {
  market: 0.25,
  courseWin: 0.35,
  rank: 0.25,
  form: 0.15,
} as const;

/**
 * Convex power on field percentile — spreads top tiers with a mild downward slope,
 * then eases mid-pack so lineups stay buildable while longshots still cost real money.
 */
export const HYBRID_RANK_POWER = 3.85;
/** Soft power on relative composite — dampens favorite spike from raw probs. */
export const HYBRID_COMP_POWER = 0.7;
/** Blend weight for rankRatio vs compRatio (rank-driven tiers). */
export const HYBRID_RANK_BLEND = 0.7;

/** @deprecated Prefer HYBRID_RANK_POWER / HYBRID_COMP_POWER blend. */
export const HYBRID_CURVE_POWER = 1.2;

export const HYBRID_MIN_SALARY = 6900;
export const HYBRID_MAX_SALARY = 11100;
/** Flat discount applied to the top N salaries (favorites were pricing too high). */
export const HYBRID_TOP_SALARY_DISCOUNT = 500;
export const HYBRID_TOP_SALARY_DISCOUNT_COUNT = 3;

export type HybridSalaryInput = {
  dgId: string;
  decimalOdds?: number | null;
  /** Course-history + fit model win probability (0–1). */
  courseWinProb?: number | null;
  /** Baseline make-cut probability (0–1). */
  makeCutProb?: number | null;
  /** Baseline top-5 probability (0–1). */
  top5Prob?: number | null;
  owgrRank?: number | null;
  dgRank?: number | null;
};

export type HybridSalaryResult = {
  salary: number;
  impliedProb: number | null;
  decimalOdds: number | null;
  composite: number;
};

function maxNormalize(values: Map<string, number>): Map<string, number> {
  let max = 0;
  for (const v of values.values()) {
    if (v > max) max = v;
  }
  const out = new Map<string, number>();
  if (max <= 0) {
    for (const id of values.keys()) out.set(id, 0);
    return out;
  }
  for (const [id, v] of values) out.set(id, v / max);
  return out;
}

/**
 * Hybrid salaries: blend market odds, DG course-win, OWGR/DG rank, and form (make-cut/top-5).
 * Missing components renormalize remaining weights. Players with zero signals are omitted
 * (caller should fall back to a default salary).
 *
 * Maps field percentile (primary) + relative composite (secondary) into [$6.9k, $11.1k].
 * Favorites slope down through the top tier; mid-tier stays playable; longshots cost real
 * money (~floor+). Cap math (~$8.3k/roster slot) is tight but a one-stud build fits.
 */
export function computeHybridSalaries(
  players: HybridSalaryInput[],
  opts: {
    minSalary?: number;
    maxSalary?: number;
    step?: number;
    /** @deprecated Ignored — use HYBRID_RANK_POWER / HYBRID_COMP_POWER. */
    power?: number;
    rankPower?: number;
    compPower?: number;
    rankBlend?: number;
  } = {},
): Map<string, HybridSalaryResult> {
  const minSalary = opts.minSalary ?? HYBRID_MIN_SALARY;
  const maxSalary = opts.maxSalary ?? HYBRID_MAX_SALARY;
  const step = opts.step ?? 100;
  const rankPower = opts.rankPower ?? HYBRID_RANK_POWER;
  const compPower = opts.compPower ?? HYBRID_COMP_POWER;
  const rankBlend = opts.rankBlend ?? HYBRID_RANK_BLEND;

  const marketRaw = new Map<string, number>();
  const courseRaw = new Map<string, number>();
  const rankRaw = new Map<string, number>();
  const formRaw = new Map<string, number>();
  const oddsById = new Map<string, number>();

  for (const p of players) {
    if (p.decimalOdds != null && Number.isFinite(p.decimalOdds) && p.decimalOdds > 1) {
      marketRaw.set(p.dgId, 1 / p.decimalOdds);
      oddsById.set(p.dgId, p.decimalOdds);
    }
    if (p.courseWinProb != null && p.courseWinProb > 0) {
      courseRaw.set(p.dgId, p.courseWinProb);
    }
    const ranks = [p.owgrRank, p.dgRank].filter((r): r is number => r != null && r > 0);
    if (ranks.length > 0) {
      const best = Math.min(...ranks);
      rankRaw.set(p.dgId, 1 / best);
    }
    const makeCut = p.makeCutProb;
    const top5 = p.top5Prob;
    if (makeCut != null || top5 != null) {
      const mc = makeCut ?? 0;
      const t5 = top5 ?? 0;
      // Prefer make-cut when only one exists; otherwise 0.6 / 0.4 blend.
      const form =
        makeCut != null && top5 != null ? 0.6 * mc + 0.4 * t5 : makeCut != null ? mc : t5;
      if (form > 0) formRaw.set(p.dgId, form);
    }
  }

  const marketN = maxNormalize(marketRaw);
  const courseN = maxNormalize(courseRaw);
  const rankN = maxNormalize(rankRaw);
  const formN = maxNormalize(formRaw);

  const marketSum = [...marketRaw.values()].reduce((s, v) => s + v, 0) || 1;

  const composites = new Map<string, number>();
  for (const p of players) {
    const parts: { w: number; v: number }[] = [];
    if (marketN.has(p.dgId)) parts.push({ w: HYBRID_WEIGHTS.market, v: marketN.get(p.dgId)! });
    if (courseN.has(p.dgId)) parts.push({ w: HYBRID_WEIGHTS.courseWin, v: courseN.get(p.dgId)! });
    if (rankN.has(p.dgId)) parts.push({ w: HYBRID_WEIGHTS.rank, v: rankN.get(p.dgId)! });
    if (formN.has(p.dgId)) parts.push({ w: HYBRID_WEIGHTS.form, v: formN.get(p.dgId)! });
    if (parts.length === 0) continue;
    const wSum = parts.reduce((s, x) => s + x.w, 0) || 1;
    const composite = parts.reduce((s, x) => s + (x.w / wSum) * x.v, 0);
    composites.set(p.dgId, composite);
  }

  if (composites.size === 0) return new Map();

  let maxC = 0;
  for (const v of composites.values()) {
    if (v > maxC) maxC = v;
  }
  if (maxC <= 0) maxC = 1e-9;

  // Average ranks for ties (1 = best). Sorted descending by composite.
  const ranked = [...composites.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const n = ranked.length;
  const avgRankById = new Map<string, number>();
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && ranked[j][1] === ranked[i][1]) j += 1;
    // ranks i+1 .. j (1-based)
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) avgRankById.set(ranked[k][0], avgRank);
    i = j;
  }

  const out = new Map<string, HybridSalaryResult>();
  for (const [dgId, composite] of composites) {
    const avgRank = avgRankById.get(dgId) ?? n;
    const pct = n <= 1 ? 1 : (n - avgRank) / (n - 1);
    const comp = composite / maxC;
    const rankRatio = Math.pow(Math.max(0, Math.min(1, pct)), rankPower);
    const compRatio = Math.pow(Math.max(0, Math.min(1, comp)), compPower);
    const ratio = rankBlend * rankRatio + (1 - rankBlend) * compRatio;
    let salary = minSalary + (maxSalary - minSalary) * ratio;
    salary = Math.round(salary / step) * step;
    salary = Math.min(maxSalary, Math.max(minSalary, salary));

    const decimalOdds = oddsById.get(dgId) ?? null;
    const impliedProb = decimalOdds != null ? (1 / decimalOdds) / marketSum : null;

    out.set(dgId, { salary, impliedProb, decimalOdds, composite });
  }

  // Pull top favorites down so one-stud builds are more viable.
  const topIds = [...out.entries()]
    .sort((a, b) => b[1].salary - a[1].salary || a[0].localeCompare(b[0]))
    .slice(0, HYBRID_TOP_SALARY_DISCOUNT_COUNT)
    .map(([dgId]) => dgId);
  for (const dgId of topIds) {
    const row = out.get(dgId);
    if (!row) continue;
    const discounted = Math.max(
      minSalary,
      Math.round((row.salary - HYBRID_TOP_SALARY_DISCOUNT) / step) * step,
    );
    out.set(dgId, { ...row, salary: discounted });
  }

  return out;
}

/** @deprecated Prefer computeHybridSalaries — kept as market-only hybrid wrapper. */
export function oddsToSalaries(
  players: { dgId: string; decimalOdds: number }[],
  opts: { minSalary?: number; maxSalary?: number; step?: number } = {},
): Map<string, { salary: number; impliedProb: number; decimalOdds: number }> {
  const hybrid = computeHybridSalaries(
    players.map((p) => ({ dgId: p.dgId, decimalOdds: p.decimalOdds })),
    opts,
  );
  const out = new Map<string, { salary: number; impliedProb: number; decimalOdds: number }>();
  for (const [dgId, row] of hybrid) {
    out.set(dgId, {
      salary: row.salary,
      impliedProb: row.impliedProb ?? 0,
      decimalOdds: row.decimalOdds ?? players.find((p) => p.dgId === dgId)!.decimalOdds,
    });
  }
  return out;
}
