import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HYBRID_MAX_SALARY,
  HYBRID_MIN_SALARY,
  HYBRID_TOP_SALARY_DISCOUNT,
  computeHybridSalaries,
  type HybridSalaryInput,
} from "./hybrid_salaries.ts";

/** Skewed ~70-player field: 1 mega-favorite, 3 contenders, mid pack, fat longshot tail. */
function buildSyntheticField(): HybridSalaryInput[] {
  const players: HybridSalaryInput[] = [
    {
      dgId: "fav",
      decimalOdds: 6,
      courseWinProb: 0.18,
      makeCutProb: 0.85,
      top5Prob: 0.45,
      owgrRank: 1,
      dgRank: 1,
    },
    {
      dgId: "c1",
      decimalOdds: 12,
      courseWinProb: 0.08,
      makeCutProb: 0.78,
      top5Prob: 0.28,
      owgrRank: 2,
      dgRank: 2,
    },
    {
      dgId: "c2",
      decimalOdds: 15,
      courseWinProb: 0.06,
      makeCutProb: 0.75,
      top5Prob: 0.22,
      owgrRank: 3,
      dgRank: 4,
    },
    {
      dgId: "c3",
      decimalOdds: 18,
      courseWinProb: 0.05,
      makeCutProb: 0.72,
      top5Prob: 0.18,
      owgrRank: 5,
      dgRank: 5,
    },
  ];

  for (let i = 0; i < 12; i++) {
    players.push({
      dgId: `m${i}`,
      decimalOdds: 30 + i * 5,
      courseWinProb: Math.max(0.005, 0.025 - i * 0.0015),
      makeCutProb: 0.55,
      top5Prob: 0.08,
      owgrRank: 10 + i,
      dgRank: 10 + i,
    });
  }

  for (let i = 0; i < 54; i++) {
    players.push({
      dgId: `l${i}`,
      decimalOdds: 100 + i * 20,
      courseWinProb: 0.004,
      makeCutProb: 0.35,
      top5Prob: 0.02,
      owgrRank: 50 + i,
      dgRank: 50 + i,
    });
  }

  return players;
}

describe("computeHybridSalaries curve", () => {
  it("balances scarce chalk, playable mid, and non-free longshots", () => {
    const priced = computeHybridSalaries(buildSyntheticField());
    assert.equal(priced.size, 70);

    const sorted = [...priced.entries()].sort(
      (a, b) => b[1].salary - a[1].salary || b[1].composite - a[1].composite,
    );
    const salaries = sorted.map(([, r]) => r.salary);
    const mean = salaries.reduce((s, v) => s + v, 0) / salaries.length;

    const fav = priced.get("fav")!.salary;
    const contenders = ["c1", "c2", "c3"].map((id) => priced.get(id)!.salary);
    const maxContenderGap = Math.max(...contenders.map((c) => fav - c));
    const minContenderGap = Math.min(...contenders.map((c) => fav - c));

    const strongChalk = priced.get("m0")!.salary;
    const mid = ["m4", "m7", "m11"].map((id) => priced.get(id)!.salary);
    const bottomCount = Math.floor(salaries.length / 3);
    const bottom = salaries.slice(-bottomCount);
    const bottomSpread = Math.max(...bottom) - Math.min(...bottom);
    const floor = Math.min(...bottom);

    assert.ok(fav >= HYBRID_MAX_SALARY - HYBRID_TOP_SALARY_DISCOUNT - 500, `favorite near max, got ${fav}`);
    assert.equal(Math.max(...salaries), fav);

    assert.ok(
      maxContenderGap <= 1800,
      `contender gap too large: max ${maxContenderGap} (fav=${fav}, contenders=${contenders})`,
    );
    assert.ok(minContenderGap >= 200, "need some gap between favorite and #2");
    assert.ok(
      contenders.every((c) => c >= 9300 && c <= 10600),
      `elite contenders should sit ~9.3k–10.6k after top-3 discount, got ${contenders}`,
    );
    assert.ok(
      strongChalk < contenders[2] && strongChalk >= 8800,
      `strong chalk should sit under contenders, got ${strongChalk}`,
    );

    assert.ok(
      mid.every((s) => s >= 7400 && s <= 9200),
      `mid-tier should be playable (~7.4k–9.2k), got ${mid}`,
    );
    assert.ok(mid[0] - mid[2] >= 400, `mid should taper down-field, got ${mid}`);

    assert.ok(
      bottomSpread <= 500,
      `longshot spread should be ≤$500, got ${bottomSpread}`,
    );
    assert.ok(
      floor >= HYBRID_MIN_SALARY && floor <= HYBRID_MIN_SALARY + 200,
      `longshot floor should be near ${HYBRID_MIN_SALARY}, got ${floor}`,
    );
    // Not "basically free" — floor must be a real salary cost.
    assert.ok(floor >= 6900, `longshots should cost real money, got floor ${floor}`);

    // Slightly below fair $8.3k roster average: challenging, not impossible.
    assert.ok(
      mean >= 7600 && mean <= 8200,
      `field mean should be ~7600–8200, got ${mean.toFixed(1)}`,
    );

    // Cap checks: one stud + true longshot value works; three elites + floors blow cap.
    const long = priced.get("l20")!.salary;
    const oneStud = fav + mid[2] + 4 * long;
    const twoElites = fav + contenders[0] + 4 * long;
    const threeElites = fav + contenders[0] + contenders[1] + 3 * long;
    assert.ok(oneStud <= 50000, `one-stud build should fit, got ${oneStud}`);
    assert.ok(twoElites >= 48000, `two-elite build should be tight, got ${twoElites}`);
    assert.ok(threeElites > 50000, `three-elite build should blow cap, got ${threeElites}`);
  });
});
