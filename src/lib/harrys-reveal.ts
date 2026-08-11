/** localStorage one-shot for Harry's Big Hole reveal theater. */

export function harrysRevealStorageKey(
  userId: string,
  tournamentId: string,
  round: number,
): string {
  return `winseeking:harrys-reveal:${userId}:${tournamentId}:${round}`;
}

export function hasSeenHarrysReveal(
  userId: string,
  tournamentId: string,
  round: number,
): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(harrysRevealStorageKey(userId, tournamentId, round)) === "1";
  } catch {
    return true;
  }
}

export function markHarrysRevealSeen(
  userId: string,
  tournamentId: string,
  round: number,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(harrysRevealStorageKey(userId, tournamentId, round), "1");
  } catch {
    /* ignore quota / private mode */
  }
}
