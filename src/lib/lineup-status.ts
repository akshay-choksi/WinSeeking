/** League-member vs lineup presence for lock reminders and DNQ board rows. */

export type MemberLineupStatus = {
  memberUserIds: string[];
  lineupUserIds: Set<string>;
  missingUserIds: string[];
  submittedCount: number;
  missingCount: number;
  memberCount: number;
  currentUserHasLineup: boolean;
};

export type MissingMemberProfile = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

/** Diff league members against who already has a lineup row for the event. */
export function computeMemberLineupStatus(
  memberUserIds: string[],
  lineupUserIds: Iterable<string>,
  currentUserId?: string | null,
): MemberLineupStatus {
  const lineupSet = new Set(lineupUserIds);
  const missingUserIds = memberUserIds.filter((id) => !lineupSet.has(id));
  return {
    memberUserIds,
    lineupUserIds: lineupSet,
    missingUserIds,
    submittedCount: memberUserIds.length - missingUserIds.length,
    missingCount: missingUserIds.length,
    memberCount: memberUserIds.length,
    currentUserHasLineup: currentUserId ? lineupSet.has(currentUserId) : false,
  };
}

type StandingBase = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  total_spent: number;
  total_points: number;
  golfer_count: number;
  league_finish: number | null;
  season_points: number;
  /** Starters with made_cut === true; omitted on synthetic DNQ rows. */
  made_cut_count?: number;
};

export type EventStandingWithDnq = StandingBase & {
  /** True when the member has no lineup row (synthetic post-lock DNQ). */
  noLineup?: boolean;
};

/**
 * After lock, append missing members as 0-pt DNQ rows at the bottom.
 * Before lock, returns standings unchanged (do not reveal who is missing by name).
 */
export function mergeEventStandingsWithMissingMembers(
  standings: StandingBase[],
  missingProfiles: MissingMemberProfile[],
  locked: boolean,
): EventStandingWithDnq[] {
  const withFlag: EventStandingWithDnq[] = standings.map((s) => ({
    ...s,
    noLineup: s.golfer_count === 0 && Number(s.total_points) === 0 && Number(s.total_spent) === 0
      ? true
      : undefined,
  }));

  if (!locked || missingProfiles.length === 0) return withFlag;

  const present = new Set(withFlag.map((s) => s.user_id));
  const extras: EventStandingWithDnq[] = missingProfiles
    .filter((m) => !present.has(m.user_id))
    .map((m) => ({
      user_id: m.user_id,
      full_name: m.full_name,
      avatar_url: m.avatar_url,
      total_spent: 0,
      total_points: 0,
      golfer_count: 0,
      league_finish: null,
      season_points: 0,
      noLineup: true,
    }));

  return [...withFlag, ...extras];
}

/** Human countdown to lineup lock, or null if no lock time / already past. */
export function formatLockCountdown(lockAt: string | null | undefined, nowMs: number = Date.now()): string | null {
  if (!lockAt) return null;
  const lockMs = new Date(lockAt).getTime();
  if (!Number.isFinite(lockMs)) return null;
  const delta = lockMs - nowMs;
  if (delta <= 0) return null;

  const totalSec = Math.floor(delta / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);

  if (days >= 2) return `${days}d ${hours}h`;
  if (days === 1) return hours > 0 ? `1d ${hours}h` : "1d";
  if (hours >= 1) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes >= 1) return `${minutes}m`;
  return "<1m";
}
