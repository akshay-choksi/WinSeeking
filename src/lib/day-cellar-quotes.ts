/** Playful last-place roasts for the shared day banner. `{name}` → profile name. */
export const DAY_CELLAR_QUOTES = [
  "{name} is currently fertilizing the leaderboard.",
  "Somewhere a bunker just felt kinship with {name}.",
  "{name} came. They saw. They finished last.",
  "The group chat is praying for {name}. Quietly. Unconvincingly.",
  "{name}'s lineup is doing interpretive dance. Badly.",
  "Last place called. {name} answered on the first ring.",
  "{name} isn't chasing the cut — they're chasing dignity.",
  "May {name}'s putter find every lip-out from here on out.",
  "{name} turned fantasy golf into a support group.",
  "History will remember this round. Mostly to roast {name}.",
  "{name} is the reason 'it's a marathon' got invented.",
  "Crown optional. Cone of shame mandatory. Congrats, {name}.",
  "{name}'s stack went looking for birdies and found vibes instead.",
  "The cellar is rented. {name} is paying in double bogeys.",
  "Not all heroes wear green jackets. Some, like {name}, wear last.",
  "{name} refreshed live scores. The scores did not refresh {name}.",
  "Inspiration is nice. {name} is providing the opposite.",
  "Walk softly, {name}. Everyone can already hear the drop.",
  "{name} packed hot takes. Cold putts. Zero points momentum.",
  "Be the chaos you wish to see — {name} already is.",
] as const;

function hashKey(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Same roast for every league member for a given event round. */
export function pickDayCellarQuote(
  leagueId: string,
  tournamentId: string,
  completedRound: number,
  name: string,
): string {
  const key = `${leagueId}:${tournamentId}:${completedRound}:cellar`;
  const idx = hashKey(key) % DAY_CELLAR_QUOTES.length;
  const template = DAY_CELLAR_QUOTES[idx]!;
  return template.replaceAll("{name}", name);
}
