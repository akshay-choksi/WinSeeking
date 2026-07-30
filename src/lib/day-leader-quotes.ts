/** Funny-inspirational lines shown on the shared day-leader banner. */
export const DAY_LEADER_QUOTES = [
  "Fortune favors the bold — and whoever packed the hottest putter.",
  "Leaders aren't born. They're drafted under a salary cap.",
  "Today's throne is rented. Pay rent in birdies.",
  "May your rivals' drivers find every fairway bunker.",
  "First place is temporary. Bragging rights are forever (until Sunday).",
  "The leaderboard bowed. Briefly. Dramatically. Correctly.",
  "Champions rise. Everyone else refreshes live scores.",
  "Walk softly and carry a six-golfer stack.",
  "Inspiration is nice. A 30-point place bonus is nicer.",
  "They came. They putted. They led the group chat.",
  "Greatness is 1% inspiration and 99% not starting Scheffler and five chalk.",
  "The mountain was tall. Someone still summited before lunch.",
  "Let this be a lesson: vibes can be a strategy.",
  "Crown polished. Cap intact. Enemies coping.",
  "In golf and fantasy, arrogance is just confidence with a better score.",
  "The universe whispered. The leader shouted birdie.",
  "Not all heroes wear green jackets. Some just sorted by points.",
  "Keep calm and refuse to fade on Moving Day.",
  "History will remember this round. Mostly because we will bring it up.",
  "Be the chaos you wish to see in your friends' lineups.",
] as const;

function hashKey(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Same quote for every league member for a given event round. */
export function pickDayLeaderQuote(
  leagueId: string,
  tournamentId: string,
  completedRound: number,
): string {
  const key = `${leagueId}:${tournamentId}:${completedRound}`;
  const idx = hashKey(key) % DAY_LEADER_QUOTES.length;
  return DAY_LEADER_QUOTES[idx]!;
}
