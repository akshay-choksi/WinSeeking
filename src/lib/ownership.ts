/** League ownership derived from lineups + lineup_entries. Call sites must gate on lock. */

export type OwnershipLineup = { id: string; user_id: string };
export type OwnershipEntry = { lineup_id: string; golfer_id: string };

export type OwnershipStats = {
  lineupCount: number;
  pickCounts: Map<string, number>;
  /** Distinct user_ids who picked each golfer. */
  ownersByGolfer: Map<string, string[]>;
  /** Golfer ids on each user's lineup (order preserved from entries). */
  golfersByUser: Map<string, string[]>;
};

/** Aggregate pick counts and owner maps from league lineups + entries. */
export function computeOwnershipStats(
  lineups: OwnershipLineup[],
  entries: OwnershipEntry[],
): OwnershipStats {
  const lineupCount = lineups.length;
  const userByLineup = new Map(lineups.map((l) => [l.id, l.user_id]));
  const pickCounts = new Map<string, number>();
  const ownersByGolfer = new Map<string, string[]>();
  const golfersByUser = new Map<string, string[]>();

  for (const e of entries) {
    const userId = userByLineup.get(e.lineup_id);
    if (!userId) continue;

    pickCounts.set(e.golfer_id, (pickCounts.get(e.golfer_id) ?? 0) + 1);

    const owners = ownersByGolfer.get(e.golfer_id) ?? [];
    if (!owners.includes(userId)) {
      owners.push(userId);
      ownersByGolfer.set(e.golfer_id, owners);
    }

    const golfers = golfersByUser.get(userId) ?? [];
    golfers.push(e.golfer_id);
    golfersByUser.set(userId, golfers);
  }

  return { lineupCount, pickCounts, ownersByGolfer, golfersByUser };
}

export type OwnershipKind = "unique" | "everyone" | "shared" | null;

/** Badge kind matching lineup-viewer Unique / Everyone / fraction rules. */
export function ownershipKind(pickCount: number, lineupCount: number): OwnershipKind {
  if (lineupCount < 2 || pickCount < 1) return null;
  if (pickCount === 1) return "unique";
  if (pickCount === lineupCount) return "everyone";
  return "shared";
}

export function ownershipFraction(pickCount: number, lineupCount: number): string {
  return `${pickCount}/${lineupCount}`;
}

/**
 * Consensus / chalk: everyone, or majority when 3+ lineups.
 * Used for chalk-stack roasting (not shown as a pick label).
 */
export function isChalkPick(pickCount: number, lineupCount: number): boolean {
  if (lineupCount < 2 || pickCount < 1) return false;
  if (pickCount === lineupCount) return true;
  if (lineupCount >= 3 && pickCount >= Math.ceil(lineupCount * 0.5)) return true;
  return false;
}

export type OwnershipRoast =
  | {
      kind: "unique";
      golferId: string;
      golferName: string;
      ownerUserId: string;
      ownerName: string;
      fraction: string;
      text: string;
    }
  | {
      kind: "everyone";
      golferId: string;
      golferName: string;
      fraction: string;
      text: string;
    }
  | {
      kind: "chalk-stack";
      userId: string;
      userName: string;
      chalkCount: number;
      chalkGolferIds: string[];
      chalkNames: string[];
      text: string;
    };

type RoastNames = {
  golferName: (golferId: string) => string;
  userName: (userId: string) => string;
};

/**
 * Punchy post-lock callouts: unique fades, everyone chalk, and who stacked consensus.
 * Caps unique/everyone chips so the Event tab stays scannable.
 */
export function buildOwnershipRoasts(
  stats: OwnershipStats,
  names: RoastNames,
  opts?: { maxUnique?: number; maxEveryone?: number },
): OwnershipRoast[] {
  const maxUnique = opts?.maxUnique ?? 3;
  const maxEveryone = opts?.maxEveryone ?? 2;
  const { lineupCount, pickCounts, ownersByGolfer, golfersByUser } = stats;
  if (lineupCount < 2) return [];

  const roasts: OwnershipRoast[] = [];

  const uniqueEntries = [...pickCounts.entries()]
    .filter(([, count]) => count === 1)
    .map(([golferId]) => {
      const ownerUserId = ownersByGolfer.get(golferId)?.[0];
      return ownerUserId ? { golferId, ownerUserId } : null;
    })
    .filter((row): row is { golferId: string; ownerUserId: string } => row != null)
    .slice(0, maxUnique);

  for (const row of uniqueEntries) {
    const golferName = names.golferName(row.golferId);
    const ownerName = names.userName(row.ownerUserId);
    roasts.push({
      kind: "unique",
      golferId: row.golferId,
      golferName,
      ownerUserId: row.ownerUserId,
      ownerName,
      fraction: ownershipFraction(1, lineupCount),
      text: `Only ${ownerName} took ${golferName}`,
    });
  }

  const everyoneEntries = [...pickCounts.entries()]
    .filter(([, count]) => count === lineupCount)
    .slice(0, maxEveryone);

  for (const [golferId] of everyoneEntries) {
    const golferName = names.golferName(golferId);
    roasts.push({
      kind: "everyone",
      golferId,
      golferName,
      fraction: ownershipFraction(lineupCount, lineupCount),
      text: `Everyone locked ${golferName}`,
    });
  }

  const chalkIds = new Set(
    [...pickCounts.entries()]
      .filter(([, count]) => isChalkPick(count, lineupCount))
      .map(([golferId]) => golferId),
  );

  if (chalkIds.size >= 2) {
    let bestUserId: string | null = null;
    let bestCount = 0;
    let bestGolfers: string[] = [];

    for (const [userId, golfers] of golfersByUser) {
      const chalk = [...new Set(golfers.filter((g) => chalkIds.has(g)))];
      if (chalk.length > bestCount) {
        bestCount = chalk.length;
        bestUserId = userId;
        bestGolfers = chalk;
      }
    }

    if (bestUserId && bestCount >= 2) {
      const userName = names.userName(bestUserId);
      const chalkNames = bestGolfers.map((id) => names.golferName(id));
      roasts.push({
        kind: "chalk-stack",
        userId: bestUserId,
        userName,
        chalkCount: bestCount,
        chalkGolferIds: bestGolfers,
        chalkNames,
        text: `${userName} stacked the chalk · ${bestCount} consensus picks`,
      });
    }
  }

  return roasts;
}
