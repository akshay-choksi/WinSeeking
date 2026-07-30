import {
  adminClient,
  corsHeaders,
  jsonResponse,
  requireUser,
} from "../_shared/datagolf.ts";
import { fetchEspnAthleteProfile, normalizePlayerName } from "../_shared/espn.ts";

const BIO_HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BIO_MISS_TTL_MS = 24 * 60 * 60 * 1000;
const WIKI_UA = "WinSeeking/1.0 (https://github.com/akshay-choksi/winseeking; fantasy golf app)";

type GolferRow = {
  id: string;
  name: string;
  country: string | null;
  is_amateur: boolean | null;
  owgr_rank: number | null;
  dg_rank: number | null;
  pga_player_num: string | null;
  espn_athlete_id: string | null;
  birth_place: string | null;
  age: number | null;
  college: string | null;
  handedness: string | null;
  bio_extract: string | null;
  bio_url: string | null;
  bio_source: string | null;
  bio_fetched_at: string | null;
  season_events: number | null;
  season_cuts: number | null;
  season_top10s: number | null;
  season_wins: number | null;
  season_earnings: string | null;
  fedex_points: number | null;
  fedex_rank: number | null;
};

type WikiSummary = {
  type?: string;
  title?: string;
  description?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
};

function isFresh(fetchedAt: string | null, source: string | null): boolean {
  if (!fetchedAt) return false;
  const ms = Date.parse(fetchedAt);
  if (!Number.isFinite(ms)) return false;
  const ttl = source === "wikipedia" ? BIO_HIT_TTL_MS : BIO_MISS_TTL_MS;
  return Date.now() - ms < ttl;
}

function looksLikeGolfer(description: string | null | undefined, extract: string | null | undefined): boolean {
  const blob = `${description ?? ""} ${extract ?? ""}`.toLowerCase();
  return (
    blob.includes("golfer") ||
    blob.includes("golf player") ||
    blob.includes("pga tour") ||
    blob.includes("lpga") ||
    blob.includes("dp world") ||
    blob.includes("european tour") ||
    blob.includes("professional golf") ||
    blob.includes("masters tournament") ||
    blob.includes("open championship")
  );
}

async function fetchWikipediaSummary(title: string): Promise<WikiSummary | null> {
  const encoded = encodeURIComponent(title.replace(/ /g, "_"));
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`, {
    headers: { "User-Agent": WIKI_UA, Accept: "application/json" },
  });
  if (!res.ok) return null;
  return (await res.json()) as WikiSummary;
}

async function opensearchTitles(query: string): Promise<string[]> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "opensearch");
  url.searchParams.set("search", query);
  url.searchParams.set("limit", "5");
  url.searchParams.set("namespace", "0");
  url.searchParams.set("format", "json");
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": WIKI_UA, Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[1])) return [];
  return data[1] as string[];
}

async function querySearchTitles(query: string): Promise<string[]> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", "5");
  url.searchParams.set("format", "json");
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": WIKI_UA, Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    query?: { search?: { title?: string }[] };
  };
  return (data.query?.search ?? [])
    .map((s) => s.title)
    .filter((t): t is string => !!t);
}

/**
 * Resolve a Wikipedia page for a golfer.
 * Important: opensearch for "Name golfer" often returns ZERO hits; try exact name first.
 */
async function findGolferWikipediaSummary(name: string): Promise<WikiSummary | null> {
  const candidates: string[] = [];
  const push = (titles: string[]) => {
    for (const t of titles) {
      if (t && !candidates.includes(t)) candidates.push(t);
    }
  };

  // 1) Direct summary for exact display name (works for most PGA stars)
  const direct = await fetchWikipediaSummary(name);
  if (
    direct &&
    direct.type !== "disambiguation" &&
    direct.extract &&
    looksLikeGolfer(direct.description, direct.extract)
  ) {
    return direct;
  }

  // 2) OpenSearch on bare name (NOT "name golfer" — that query returns empty)
  push(await opensearchTitles(name));

  // 3) Full-text search with golfer keyword (more reliable than opensearch+"golfer")
  push(await querySearchTitles(`"${name}" golfer`));
  push(await querySearchTitles(`${name} golfer`));

  for (const title of candidates.slice(0, 8)) {
    const summary = await fetchWikipediaSummary(title);
    if (!summary || summary.type === "disambiguation" || !summary.extract) continue;
    if (looksLikeGolfer(summary.description, summary.extract)) return summary;
  }
  return null;
}

function payloadFromGolfer(g: GolferRow) {
  return {
    golfer_id: g.id,
    name: g.name,
    country: g.country,
    is_amateur: g.is_amateur,
    owgr_rank: g.owgr_rank,
    dg_rank: g.dg_rank,
    pga_player_num: g.pga_player_num,
    espn_athlete_id: g.espn_athlete_id,
    birth_place: g.birth_place,
    age: g.age,
    college: g.college,
    handedness: g.handedness,
    bio_extract: g.bio_extract,
    bio_url: g.bio_url,
    bio_source: g.bio_source,
    bio_fetched_at: g.bio_fetched_at,
    season_events: g.season_events,
    season_cuts: g.season_cuts,
    season_top10s: g.season_top10s,
    season_wins: g.season_wins,
    season_earnings: g.season_earnings,
    fedex_points: g.fedex_points,
    fedex_rank: g.fedex_rank,
  };
}

const GOLFER_SELECT =
  "id, name, country, is_amateur, owgr_rank, dg_rank, pga_player_num, espn_athlete_id, birth_place, age, college, handedness, bio_extract, bio_url, bio_source, bio_fetched_at, season_events, season_cuts, season_top10s, season_wins, season_earnings, fedex_points, fedex_rank";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    await requireUser(req);
    const admin = adminClient();

    let golferId: string | null = null;
    let force = false;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.golfer_id) golferId = String(body.golfer_id);
        force = body?.force === true;
      } catch {
        // no body
      }
    }
    if (!golferId) {
      return jsonResponse({ error: "golfer_id required" }, 400);
    }

    const { data: golfer, error } = await admin
      .from("golfers")
      .select(GOLFER_SELECT)
      .eq("id", golferId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!golfer) return jsonResponse({ error: "Golfer not found" }, 404);

    let row = golfer as GolferRow;

    const statsFresh =
      row.season_events != null ||
      row.season_cuts != null ||
      row.season_wins != null ||
      row.fedex_rank != null;
    if (!force && isFresh(row.bio_fetched_at, row.bio_source) && statsFresh) {
      return jsonResponse({ ...payloadFromGolfer(row), cached: true });
    }
    // If bio is fresh but stats missing, still refresh ESPN below without re-hitting wiki when possible.
    const bioFresh = !force && isFresh(row.bio_fetched_at, row.bio_source);

    const patch: Record<string, unknown> = {};

    if (!bioFresh) {
      patch.bio_fetched_at = new Date().toISOString();
      try {
        const summary = await findGolferWikipediaSummary(row.name);
        if (summary?.extract) {
          patch.bio_extract = summary.extract.trim();
          patch.bio_url =
            summary.content_urls?.desktop?.page ??
            (summary.title
              ? `https://en.wikipedia.org/wiki/${encodeURIComponent(summary.title.replace(/ /g, "_"))}`
              : null);
          patch.bio_source = "wikipedia";
        } else {
          patch.bio_extract = null;
          patch.bio_url = null;
          patch.bio_source = "none";
        }
      } catch (err) {
        console.warn("wikipedia enrich failed:", err);
        if (!row.bio_source) {
          patch.bio_extract = null;
          patch.bio_url = null;
          patch.bio_source = "none";
        }
      }
    }

    if (row.espn_athlete_id) {
      try {
        const profile = await fetchEspnAthleteProfile(row.espn_athlete_id);
        if (profile) {
          if (profile.age != null) patch.age = profile.age;
          if (profile.birthPlace) patch.birth_place = profile.birthPlace;
          if (profile.college) patch.college = profile.college;
          if (profile.handedness) patch.handedness = profile.handedness;
          if (profile.seasonEvents != null) patch.season_events = profile.seasonEvents;
          if (profile.seasonCuts != null) patch.season_cuts = profile.seasonCuts;
          if (profile.seasonTop10s != null) patch.season_top10s = profile.seasonTop10s;
          if (profile.seasonWins != null) patch.season_wins = profile.seasonWins;
          if (profile.seasonEarnings) patch.season_earnings = profile.seasonEarnings;
          if (profile.fedexPoints != null) patch.fedex_points = profile.fedexPoints;
          if (profile.fedexRank != null) patch.fedex_rank = profile.fedexRank;
          patch.stats_fetched_at = new Date().toISOString();
        }
      } catch (err) {
        console.warn("espn profile enrich failed:", err);
      }
    }

    if (Object.keys(patch).length === 0) {
      return jsonResponse({ ...payloadFromGolfer(row), cached: true });
    }

    const { data: updated, error: updateError } = await admin
      .from("golfers")
      .update(patch)
      .eq("id", golferId)
      .select(GOLFER_SELECT)
      .single();
    if (updateError) throw new Error(updateError.message);
    row = updated as GolferRow;

    return jsonResponse({
      ...payloadFromGolfer(row),
      cached: false,
      matched_name: normalizePlayerName(row.name),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "enrich-golfer-bio failed";
    const status = message === "Unauthorized" || message === "Missing Authorization header" ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
