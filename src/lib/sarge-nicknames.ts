/**
 * Nicknames coined by Sarge (@sarge4golf / Golf is Fkn Hard) for PGA Tour pros.
 *
 * Sourced from Instagram reel/post captions (logged-in scrape) + on-screen text /
 * user screenshots. Prefer `nicknames[0]` when showing one moniker.
 */
export type SargeNicknameEntry = {
  /** Canonical PGA Tour display name (as stored on golfers.name when possible) */
  player: string;
  /** Alternate real-name spellings that should resolve to this entry */
  aliases?: string[];
  nicknames: string[];
  sourceReel?: string;
  screenshotConfirmed?: boolean;
  notes?: string;
};

export const SARGE_NICKNAMES: readonly SargeNicknameEntry[] = [
  {
    player: "Ben Griffin",
    nicknames: ["B. Geezy", "Aviator Avenger", "Ben Griffey Jr.", "Golf Clark Kent"],
    sourceReel: "Db2zYOoRHoR",
  },
  {
    player: "Cameron Young",
    aliases: ["Cam Young"],
    nicknames: ["Cool Cam", "Young & Restless"],
    sourceReel: "Db2yFMJRoiw",
  },
  {
    player: "J.J. Spaun",
    aliases: ["JJ Spaun", "J.J Spaun"],
    nicknames: ["JJ Killa Spaun"],
    sourceReel: "Db2wYMjxUVh",
    screenshotConfirmed: true,
  },
  {
    player: "Russell Henley",
    nicknames: ["Hussle Henny", "Russ-Oleum", "Big Russell Henley"],
    sourceReel: "Db0adZtROU1",
    screenshotConfirmed: true,
  },
  {
    player: "Erik van Rooyen",
    aliases: ["Erik Van Rooyen"],
    nicknames: [
      "E. Van Rooo",
      "Big Erik Van Ruin Ya",
      "Da Habadashery Hero",
      "Golf Pants King",
    ],
    sourceReel: "Dbxy0-iRo_5",
    screenshotConfirmed: true,
  },
  {
    player: "Jordan Smith",
    nicknames: ["Jordam Smith & Wesson", "Jordan Smitty", "British BullDawg"],
    sourceReel: "Dbxw4PDxs2o",
    screenshotConfirmed: true,
  },
  {
    player: "Matt Wallace",
    nicknames: ['Matt "Da Wallet" Wallace', "Da Wallet", "British BullDawg"],
    sourceReel: "Dbxw4PDxs2o",
    screenshotConfirmed: true,
  },
  {
    player: "Neal Shipley",
    nicknames: [
      "Da Cruise Ship",
      "Big Neal Shipley",
      "Neal Da Cruise Shipley",
      "Rocket Shipley",
    ],
    sourceReel: "DbskHu8RPpQ",
    screenshotConfirmed: true,
  },
  {
    player: "Ben James",
    nicknames: ["Ben James Brown", "Yung Top Dawg"],
    sourceReel: "DbvZuMYRyuq",
  },
  {
    player: "Michael Thorbjornsen",
    nicknames: ["Thor Beezy", "Thor", "Da Bjorn Beast"],
    sourceReel: "Dbk03jWR6n7",
  },
  {
    player: "Garrick Higgo",
    nicknames: ["Big G. Higgo-potamus", "Golf Tarzan"],
    sourceReel: "Dbp7Hqax11u",
  },
  {
    player: "Matti Schmid",
    nicknames: ["Big Jeager Schnitzel", "Panzerkamfwagen"],
    sourceReel: "Dbf9r0xxtin",
  },
  {
    player: "Jordan Spieth",
    nicknames: ["The Golden Child", "Air Jordan Golf", "Dallas Dawg"],
    sourceReel: "Dbc_oqIR7_E",
  },
  {
    player: "Jackson Suber",
    nicknames: ["J.Suber-man", "Suberman", "Yung Golf Gunna"],
    sourceReel: "Dbagj2RxHcm",
  },
  {
    player: "Jake Knapp",
    nicknames: ["Jake Da Snake", "Jake Da Knapptime", "Knapptime"],
    sourceReel: "DbZeQ8wxZnr",
  },
  {
    player: "Jackson Koivun",
    nicknames: ["Big Wyoming", "Jackson Hole Out", "Yung Gunna"],
    sourceReel: "DbS81c2xzGw",
  },
  {
    player: "Scottie Scheffler",
    nicknames: ["2🔥Hottie", "Scottie Scheff", "Most Wanted Outlaw"],
    sourceReel: "DYhM9IWRY9m",
  },
  {
    player: "Rory McIlroy",
    nicknames: ["Rors Maclamore", "Rory Makeral'roy", "MC Hammer Maclamore"],
  },
  {
    player: "Tommy Fleetwood",
    nicknames: ["Tommy Gunz", "Tommy Fleetwood Mac"],
  },
  {
    player: "Viktor Hovland",
    nicknames: ["Victory Hoovvy", "Victory Hovvvy"],
  },
  {
    player: "Chris Gotterup",
    nicknames: ["C. Gutta Gotti", "Gutta Gotti", "C. Gutta", "Butta Baaaaby"],
  },
  {
    player: "Jason Day",
    nicknames: [
      "Big Baby Powder",
      "J. Dazzle",
      "J. Dizzle",
      "J. Drizzle",
      "Jason Drippy",
      "J. Day",
    ],
  },
  {
    player: "Matt Fitzpatrick",
    nicknames: ["Big Matti Fizz", "Matti Fitz", "Fizzle", "British Badazz"],
  },
  {
    player: "Alex Fitzpatrick",
    nicknames: ["Alex Fizz-patrick"],
  },
  {
    player: "Keith Mitchell",
    nicknames: ["Cash-mere Kieth", "Terry Cloth Kieth", "The Haberdashery Hero"],
    notes: 'Sarge often misspells Keith as "Kieth".',
  },
  {
    player: "Lucas Herbert",
    nicknames: ["Big Herb Chicken", "Big Herbie", "Big Lucas Herbert"],
  },
  {
    player: "Joel Dahmen",
    nicknames: ["The People's Champ", "J. 💎"],
  },
  {
    player: "Johnson Wagner",
    nicknames: ["Big Wagu", "Big Breakfast Wagu"],
  },
  {
    player: "Si Woo Kim",
    nicknames: ["Sea Weed Kimchi", "Big Spicy Kim-chi", "Si Woo Kim-istry"],
  },
  {
    player: "Rico Hoey",
    nicknames: ["Pretty Rico Hoey"],
  },
  {
    player: "David Lipsky",
    nicknames: ["Big Lipz-ski"],
  },
  {
    player: "Rickie Fowler",
    nicknames: ["Rickie Flair", "Rickie Moto Fowler", "OG Moto Fowler", "Moto X Rickie Flair"],
  },
  {
    player: "Shane Lowry",
    nicknames: [
      "Da Hot Laundry Lowery",
      "Big Shane Da Lucky Lowery",
      "Shane Da Lucky",
      "Ace Venture Irish Detective",
    ],
    notes: 'Sarge often spells it "Lowery".',
  },
  {
    player: "Brian Harman",
    nicknames: ["B. Harm", "Brian Harmen"],
  },
  {
    player: "Camilo Villegas",
    nicknames: ["Camo V", "Da Spidaman"],
  },
  {
    player: "Ryo Hisatsune",
    nicknames: ["Da Big Habachi", "Ryo Da' Dragon", "Ryooo Hitz", "RYO"],
  },
  {
    player: "Nicolai Højgaard",
    aliases: ["Nicolai Hojgaard"],
    nicknames: ["Big Nickel"],
  },
  {
    player: "Ryan Gerard",
    nicknames: ["Big Raleigh", "Ryan Gerrard", "RG"],
    notes: 'Sarge often spells it "Gerrard".',
  },
  {
    player: "Will Zalatoris",
    nicknames: ["Will Da Stork Zalatoris"],
  },
  {
    player: "Andrew Novak",
    nicknames: ["Walking Golf Tall", "Andrew IT Novak", "Drew It Up"],
  },
  {
    player: "Tony Finau",
    nicknames: ["Big Tony Aces", "Tony Ventura", "Big Tony Finau"],
  },
  {
    player: "Collin Morikawa",
    nicknames: ["C.Mo"],
  },
  {
    player: "Jacob Bridgeman",
    nicknames: ["J. Bridge Capone", "J. Bridgestone Capone"],
  },
  {
    player: "Aldrich Potgieter",
    nicknames: ["Big Sativa", "Big Yella Rari Raj"],
    notes: '"Yella Rari Raj" appears paired with Kurt Kitayama bounce-back days.',
  },
  {
    player: "Ludvig Åberg",
    aliases: ["Ludvig Aberg"],
    nicknames: ["Ludwig Cyborg", "Cyberg"],
  },
  {
    player: "Hideki Matsuyama",
    nicknames: ["Big Dekki Yamma Yamma", "Hadeki Yamma", "Dekki"],
  },
  {
    player: "J.T. Poston",
    aliases: ["JT Poston", "J.T Poston"],
    nicknames: ["Da Mail Man", "JT PostMan"],
  },
  {
    player: "Akshay Bhatia",
    nicknames: ["AKshay Butta"],
  },
  {
    player: "Marco Penge",
    nicknames: ["Marco No Cringe Penge"],
  },
  {
    player: "Kurt Kitayama",
    nicknames: ["K2"],
  },
  {
    player: "Denny McCarthy",
    nicknames: ["D. Mac", "Mac & Cheese"],
  },
] as const;

function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const LOOKUP = (() => {
  const map = new Map<string, SargeNicknameEntry>();
  for (const entry of SARGE_NICKNAMES) {
    map.set(normalizeName(entry.player), entry);
    for (const alias of entry.aliases ?? []) {
      map.set(normalizeName(alias), entry);
    }
  }
  return map;
})();

export function getSargeEntry(playerName: string): SargeNicknameEntry | undefined {
  return LOOKUP.get(normalizeName(playerName));
}

/** All nicknames for a player (empty if unknown). */
export function getSargeNicknames(playerName: string): string[] {
  const entry = getSargeEntry(playerName);
  return entry ? [...entry.nicknames] : [];
}

/** Primary street name, or null if none. */
export function getSargePrimaryNickname(playerName: string): string | null {
  return getSargeEntry(playerName)?.nicknames[0] ?? null;
}

/** Flat map of canonical player → primary nickname. */
export const SARGE_PRIMARY_NICKNAME: Readonly<Record<string, string>> =
  Object.fromEntries(
    SARGE_NICKNAMES.map((e) => [e.player, e.nicknames[0]!]),
  );

/** True if query matches real name or any street name. */
export function golferMatchesSearch(realName: string, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  if (realName.toLowerCase().includes(q)) return true;
  const entry = getSargeEntry(realName);
  if (!entry) return false;
  const nq = normalizeName(q);
  if (normalizeName(entry.player).includes(nq)) return true;
  return entry.nicknames.some(
    (n) => n.toLowerCase().includes(q) || normalizeName(n).includes(nq),
  );
}
