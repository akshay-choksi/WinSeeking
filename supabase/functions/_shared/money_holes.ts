/**
 * Daily money hole helpers — one random hole (1–18) per tournament round.
 * Scores on that hole earn ×3 fantasy hole points for everyone.
 */

export type MoneyHoleAdmin = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => Promise<{ data: { round_number: number; hole_number: number }[] | null; error: { message: string } | null }>;
    };
    insert: (
      rows: { tournament_id: string; round_number: number; hole_number: number }[],
    ) => Promise<{ error: { message: string } | null }>;
  };
};

/** Reveal today's round (last completed + 1), always ≥1; all 4 when completed. */
export function moneyHoleUpToRound(opts: {
  status: string;
  lastCompletedRound: number | null;
}): number {
  if (opts.status === "completed") return 4;
  const last = Math.max(0, Math.trunc(opts.lastCompletedRound ?? 0));
  return Math.min(4, Math.max(1, last + 1));
}

/** Pick random holes 1–18 for rounds 1..upToRound (idempotent). */
export async function ensureMoneyHoles(
  admin: MoneyHoleAdmin,
  tournamentId: string,
  upToRound: number,
): Promise<Map<number, number>> {
  const target = Math.min(4, Math.max(1, Math.trunc(upToRound)));
  const { data: existing, error } = await admin
    .from("tournament_money_holes")
    .select("round_number, hole_number")
    .eq("tournament_id", tournamentId);
  if (error) throw new Error(error.message);

  const map = new Map<number, number>();
  for (const row of existing ?? []) {
    map.set(Number(row.round_number), Number(row.hole_number));
  }

  const inserts: { tournament_id: string; round_number: number; hole_number: number }[] = [];
  for (let r = 1; r <= target; r++) {
    if (map.has(r)) continue;
    const hole = 1 + Math.floor(Math.random() * 18);
    inserts.push({ tournament_id: tournamentId, round_number: r, hole_number: hole });
    map.set(r, hole);
  }

  if (inserts.length > 0) {
    const { error: insertError } = await admin.from("tournament_money_holes").insert(inserts);
    if (insertError) throw new Error(insertError.message);
  }

  return map;
}
