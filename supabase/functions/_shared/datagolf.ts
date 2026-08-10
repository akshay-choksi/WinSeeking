// Shared helpers for WinSeeking edge functions (Deno)
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export function getAnonKey(): string {
  return (
    Deno.env.get("SUPABASE_ANON_KEY") ||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
    (() => {
      throw new Error("Missing env: SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY");
    })()
  );
}

export function adminClient(): SupabaseClient {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(req: Request): Promise<{ userId: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing Authorization header");

  const userClient = createClient(getEnv("SUPABASE_URL"), getAnonKey(), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) throw new Error("Unauthorized");

  return { userId: authData.user.id };
}

export async function requireAdmin(req: Request): Promise<{ userId: string }> {
  const { userId } = await requireUser(req);
  const admin = adminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile?.is_admin) throw new Error("Admins only");

  return { userId };
}

export const DATAGOLF_BASE = "https://feeds.datagolf.com";

export async function dgFetch<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const key = getEnv("DATAGOLF_API_KEY");
  const url = new URL(`${DATAGOLF_BASE}${path}`);
  url.searchParams.set("key", key);
  url.searchParams.set("file_format", "json");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && `${v}` !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataGolf ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Infer major / signature from event name. */
export function classifyEvent(name: string): "standard" | "signature" | "major" {
  const n = name.toLowerCase();
  if (
    n.includes("masters") ||
    n.includes("u.s. open") ||
    n.includes("us open") ||
    n.includes("open championship") ||
    n.includes("the open") ||
    n.includes("pga championship")
  ) {
    return "major";
  }
  // PGA Signature events rarely include the word "signature" in the title
  if (
    n.includes("signature") ||
    n.includes("players championship") ||
    n.includes("the players") ||
    n.includes("sentry") ||
    n.includes("pebble beach") ||
    n.includes("genesis invitational") ||
    n.includes("arnold palmer") ||
    n.includes("memorial") ||
    n.includes("rbc heritage") ||
    n.includes("travelers")
  ) {
    return "signature";
  }
  return "standard";
}

/** Season-point multiplier from event type: standard 1×, signature 1.5×, major 2×. */
export function multiplierForEventType(eventType: "standard" | "signature" | "major"): number {
  if (eventType === "major") return 2;
  if (eventType === "signature") return 1.5;
  return 1;
}

export function thursdayLockAt(startDate: string | null | undefined): string | null {
  if (!startDate) return null;
  // Treat start_date as event Thursday in US Eastern approx (14:00 UTC).
  const d = new Date(`${startDate}T14:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Parse a DataGolf tee time into an ISO timestamp; returns null if unparseable. */
export function parseTeeTime(
  raw: unknown,
  fallbackDate?: string | null,
  tzOffsetSeconds?: number | null,
): string | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw > 1e12 ? raw : raw * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  // Course-local wall clock: "2026-07-23 06:45" + field tz_offset (seconds east of UTC).
  const localMatch = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (localMatch && tzOffsetSeconds != null && Number.isFinite(tzOffsetSeconds)) {
    const isoLocal =
      `${localMatch[1]}T${String(localMatch[2]).padStart(2, "0")}:` +
      `${localMatch[3]}:${String(localMatch[4] ?? "00").padStart(2, "0")}.000Z`;
    const asIfUtc = Date.parse(isoLocal);
    if (!Number.isNaN(asIfUtc)) {
      return new Date(asIfUtc - tzOffsetSeconds * 1000).toISOString();
    }
  }

  // Full ISO / datetime
  const direct = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  if (!Number.isNaN(direct.getTime()) && /[T\s-]/.test(s) && s.length >= 10) {
    return direct.toISOString();
  }

  // Time-only like "7:12" or "07:12 AM" — attach to event start date
  const timeMatch = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (timeMatch && fallbackDate) {
    let hours = Number(timeMatch[1]);
    const mins = Number(timeMatch[2]);
    const ampm = timeMatch[3]?.toUpperCase();
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    const d = new Date(
      `${fallbackDate}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00.000Z`,
    );
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  return Number.isNaN(direct.getTime()) ? null : direct.toISOString();
}

/** Collect raw tee-time strings from a field player row (DataGolf shapes vary). */
export function extractPlayerTeeTimeRaw(player: Record<string, unknown>): unknown[] {
  const out: unknown[] = [];
  const direct = player.tee_time ?? player.teetime ?? player.r1_tee_time ?? player.r1_teetime ??
    player.teeTime;
  if (direct != null) out.push(direct);

  const teetimes = player.teetimes;
  if (Array.isArray(teetimes)) {
    for (const entry of teetimes) {
      if (!entry || typeof entry !== "object") {
        if (typeof entry === "string") out.push(entry);
        continue;
      }
      const row = entry as Record<string, unknown>;
      const round = row.round_num ?? row.round;
      // Prefer round 1 for lock; if round missing, still consider.
      if (round != null && Number(round) !== 1) continue;
      if (row.teetime != null) out.push(row.teetime);
      else if (row.tee_time != null) out.push(row.tee_time);
    }
  } else if (teetimes && typeof teetimes === "object") {
    const map = teetimes as Record<string, unknown>;
    for (const [k, v] of Object.entries(map)) {
      if (/^r?1$/i.test(k) || k === "1") out.push(v);
    }
  }
  return out;
}

/**
 * Earliest round-1 tee time across the field → lineup lock.
 * Falls back to Thursday 14:00 UTC from start_date when no tees present.
 */
export function earliestTeeLockAt(
  players: Record<string, unknown>[],
  startDate?: string | null,
  tzOffsetSeconds?: number | null,
): string | null {
  let earliest: number | null = null;
  for (const p of players) {
    for (const raw of extractPlayerTeeTimeRaw(p)) {
      const iso = parseTeeTime(raw, startDate, tzOffsetSeconds);
      if (!iso) continue;
      const ms = new Date(iso).getTime();
      if (Number.isNaN(ms)) continue;
      if (earliest == null || ms < earliest) earliest = ms;
    }
  }
  if (earliest != null) return new Date(earliest).toISOString();
  return thursdayLockAt(startDate);
}

const BOOK_KEYS = [
  "bet365",
  "draftkings",
  "fanduel",
  "betmgm",
  "caesars",
  "pointsbet",
  "betonline",
  "bovada",
  "pinnacle",
  "betfair",
  "unibet",
  "williamhill",
  "datagolf",
  "dg",
] as const;

export function extractDecimalOdds(row: Record<string, unknown>): number | null {
  const values: number[] = [];
  for (const key of BOOK_KEYS) {
    const raw = row[key];
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 1) values.push(n);
  }
  // Also scan numeric fields that look like odds
  if (values.length === 0) {
    for (const [k, v] of Object.entries(row)) {
      if (["dg_id", "player_name", "name", "rank"].includes(k)) continue;
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      if (Number.isFinite(n) && n > 1 && n < 10000) values.push(n);
    }
  }
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

/** Hybrid salary weights: market / course-win / rank / form. */
export const HYBRID_WEIGHTS = {
  market: 0.4,
  courseWin: 0.35,
  rank: 0.15,
  form: 0.1,
} as const;

/**
 * Salary curve exponent on relative composite (0–1).
 * Slightly above 1 gives mild tiers: favorites cost more with small within-tier
 * stagger, without turning modest odds gaps into multi-thousand salary jumps.
 */
export const HYBRID_CURVE_POWER = 1.2;

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

function asFiniteNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw.replace(/[^\d.+-eE]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Normalize DG percent/prob fields to 0–1 (accepts 0–1 or 0–100). */
export function normalizeProb(raw: unknown): number | null {
  const n = asFiniteNumber(raw);
  if (n == null || n < 0) return null;
  if (n > 1 && n <= 100) return n / 100;
  if (n > 100) return null; // likely odds, not a probability
  return n;
}

function pickProb(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (key in row) {
      const p = normalizeProb(row[key]);
      if (p != null) return p;
    }
  }
  return null;
}

function extractDgId(row: Record<string, unknown>): string | null {
  const raw = row.dg_id ?? row.dgId ?? row.player_id;
  if (raw == null || raw === "") return null;
  return String(raw);
}

function listFromUnknown(raw: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
  }
  return [];
}

export type PreTournamentPlayer = {
  dgId: string;
  courseWinProb: number | null;
  makeCutProb: number | null;
  top5Prob: number | null;
};

/**
 * Parse `/preds/pre-tournament` into per-player course-win + baseline form signals.
 * Handles common DG shapes: `{ baseline, baseline_history_fit }`, nested `preds`, or a flat list.
 */
export function parsePreTournamentPreds(raw: unknown): Map<string, PreTournamentPlayer> {
  const out = new Map<string, PreTournamentPlayer>();

  const ensure = (dgId: string): PreTournamentPlayer => {
    let row = out.get(dgId);
    if (!row) {
      row = { dgId, courseWinProb: null, makeCutProb: null, top5Prob: null };
      out.set(dgId, row);
    }
    return row;
  };

  const applyBaseline = (rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const dgId = extractDgId(row);
      if (!dgId) continue;
      const dest = ensure(dgId);
      dest.makeCutProb =
        pickProb(row, ["make_cut", "make_cut_prob", "mc", "mc_prob", "make cut"]) ?? dest.makeCutProb;
      dest.top5Prob = pickProb(row, ["top_5", "top5", "top_5_prob", "top 5"]) ?? dest.top5Prob;
      // If only one model blob exists, also use its win as course fallback later.
      if (dest.courseWinProb == null) {
        dest.courseWinProb = pickProb(row, ["win", "win_prob", "win_probability"]);
      }
    }
  };

  const applyCourse = (rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const dgId = extractDgId(row);
      if (!dgId) continue;
      const dest = ensure(dgId);
      dest.courseWinProb =
        pickProb(row, ["win", "win_prob", "win_probability"]) ?? dest.courseWinProb;
      // Form prefers baseline; use course-model cut/top5 only as fallback.
      dest.makeCutProb =
        dest.makeCutProb ??
        pickProb(row, ["make_cut", "make_cut_prob", "mc", "mc_prob", "make cut"]);
      dest.top5Prob =
        dest.top5Prob ?? pickProb(row, ["top_5", "top5", "top_5_prob", "top 5"]);
    }
  };

  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;

  const baselineKeys = ["baseline", "baseline_model", "model_baseline"];
  const courseKeys = [
    "baseline_history_fit",
    "baseline_history",
    "history_fit",
    "course_history_fit",
    "baseline_plus_history",
    "model_history_fit",
  ];

  let foundSplit = false;
  for (const key of baselineKeys) {
    const rows = listFromUnknown(obj[key], []);
    if (rows.length > 0) {
      applyBaseline(rows);
      foundSplit = true;
    }
  }
  for (const key of courseKeys) {
    const rows = listFromUnknown(obj[key], []);
    if (rows.length > 0) {
      applyCourse(rows);
      foundSplit = true;
    }
  }

  if (!foundSplit) {
    // Nested preds object, or flat player list with optional `model` field.
    const nested = obj.preds ?? obj.predictions ?? obj.data ?? obj.players;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return parsePreTournamentPreds(nested);
    }
    const rows = listFromUnknown(raw, ["preds", "predictions", "data", "players", "field"]);
    if (rows.length === 0) return out;

    const byModel = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const model = String(row.model ?? row.model_name ?? row.pred_model ?? "unknown").toLowerCase();
      const list = byModel.get(model) ?? [];
      list.push(row);
      byModel.set(model, list);
    }

    if (byModel.size <= 1) {
      applyBaseline(rows);
      applyCourse(rows);
    } else {
      for (const [model, list] of byModel) {
        if (model.includes("history") || model.includes("course") || model.includes("fit")) {
          applyCourse(list);
        } else if (model.includes("baseline") || model === "unknown") {
          applyBaseline(list);
        } else {
          applyBaseline(list);
        }
      }
    }
  }

  return out;
}

export type DgRankingPlayer = {
  dgId: string;
  dgRank: number | null;
  owgrRank: number | null;
};

/** Parse `/preds/get-dg-rankings` into dg_id → ranks. */
export function parseDgRankings(raw: unknown): Map<string, DgRankingPlayer> {
  const out = new Map<string, DgRankingPlayer>();
  const rows = listFromUnknown(raw, ["rankings", "data", "players", "dg_rankings"]);
  for (const row of rows) {
    const dgId = extractDgId(row);
    if (!dgId) continue;
    const dgRank = asFiniteNumber(row.dg_rank ?? row.rank ?? row.datagolf_rank);
    const owgrRank = asFiniteNumber(row.owgr_rank ?? row.owgr);
    out.set(dgId, {
      dgId,
      dgRank: dgRank != null && dgRank > 0 ? Math.trunc(dgRank) : null,
      owgrRank: owgrRank != null && owgrRank > 0 ? Math.trunc(owgrRank) : null,
    });
  }
  return out;
}

export type DgPlayerListEntry = {
  dgId: string;
  country: string | null;
  isAmateur: boolean | null;
};

/** Parse `/get-player-list` into dg_id → country / amateur. */
export function parsePlayerList(raw: unknown): Map<string, DgPlayerListEntry> {
  const out = new Map<string, DgPlayerListEntry>();
  const rows = listFromUnknown(raw, ["players", "data", "player_list"]);
  for (const row of rows) {
    const dgId = extractDgId(row);
    if (!dgId) continue;
    const countryRaw = row.country ?? row.nation ?? row.nationality;
    const country =
      typeof countryRaw === "string" && countryRaw.trim()
        ? countryRaw.trim().toUpperCase()
        : null;
    const amRaw = row.amateur ?? row.is_amateur ?? row.ama;
    let isAmateur: boolean | null = null;
    if (typeof amRaw === "boolean") isAmateur = amRaw;
    else if (typeof amRaw === "string") {
      const s = amRaw.trim().toLowerCase();
      if (s === "1" || s === "true" || s === "yes" || s === "y") isAmateur = true;
      else if (s === "0" || s === "false" || s === "no" || s === "n") isAmateur = false;
    } else if (typeof amRaw === "number") {
      isAmateur = amRaw !== 0;
    }
    out.set(dgId, { dgId, country, isAmateur });
  }
  return out;
}

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
 * Maps relative composite through a mild convex curve into [$7k, $11.5k] (~$4.5k spread)
 * so top favorites are disadvantageous but playable, and stacked chalk exceeds the $50k cap.
 */
export function computeHybridSalaries(
  players: HybridSalaryInput[],
  opts: { minSalary?: number; maxSalary?: number; step?: number; power?: number } = {},
): Map<string, HybridSalaryResult> {
  const minSalary = opts.minSalary ?? 7000;
  const maxSalary = opts.maxSalary ?? 11500;
  const step = opts.step ?? 100;
  const power = opts.power ?? HYBRID_CURVE_POWER;

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

  const out = new Map<string, HybridSalaryResult>();
  for (const [dgId, composite] of composites) {
    const relative = composite / maxC;
    const ratio = Math.pow(relative, power);
    let salary = minSalary + (maxSalary - minSalary) * ratio;
    salary = Math.round(salary / step) * step;
    salary = Math.min(maxSalary, Math.max(minSalary, salary));

    const decimalOdds = oddsById.get(dgId) ?? null;
    const impliedProb = decimalOdds != null ? (1 / decimalOdds) / marketSum : null;

    out.set(dgId, { salary, impliedProb, decimalOdds, composite });
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

export function parsePosition(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  const s = String(raw).trim().toUpperCase();
  if (!s || s === "CUT" || s === "WD" || s === "DQ" || s === "MDF" || s === "-") return null;
  const cleaned = s.replace(/^T/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function parseToPar(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  const s = String(raw).trim().toUpperCase();
  if (!s || s === "E" || s === "EVEN") return 0;
  const n = Number(s.replace("+", ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** DraftKings Classic Golf hole values (mirrors SQL compute_fantasy_points). */
export const DK_HOLE = {
  doubleEagle: 13,
  eagle: 8,
  birdie: 3,
  par: 0.5,
  bogey: -0.5,
  doubleBogeyOrWorse: -1,
} as const;

/** Live place points from current leaderboard position (DK Classic). */
export function finishPoints(position: number | null): number {
  if (position == null || position < 1) return 0;
  if (position === 1) return 30;
  if (position === 2) return 20;
  if (position === 3) return 18;
  if (position === 4) return 16;
  if (position === 5) return 14;
  if (position === 6) return 12;
  if (position === 7) return 10;
  if (position === 8) return 9;
  if (position === 9) return 8;
  if (position === 10) return 7;
  if (position >= 11 && position <= 15) return 6;
  if (position >= 16 && position <= 20) return 5;
  if (position >= 21 && position <= 25) return 4;
  if (position >= 26 && position <= 30) return 3;
  if (position >= 31 && position <= 40) return 2;
  if (position >= 41 && position <= 50) return 1;
  return 0;
}

/**
 * Local fantasy scoring — DraftKings Classic Golf.
 * Keep in the Edge Function so sync-results does not pay for one RPC per golfer.
 */
export function computeFantasyPoints(input: {
  position: number | null;
  doubleEagles?: number;
  eagles?: number;
  birdies?: number;
  pars?: number;
  bogeys?: number;
  doubleBogeys?: number;
  bonusPoints?: number;
  moneyHolePoints?: number;
}): number {
  const doubleEagles = Math.max(input.doubleEagles ?? 0, 0);
  const eagles = Math.max(input.eagles ?? 0, 0);
  const birdies = Math.max(input.birdies ?? 0, 0);
  const pars = Math.max(input.pars ?? 0, 0);
  const bogeys = Math.max(input.bogeys ?? 0, 0);
  const doubleBogeys = Math.max(input.doubleBogeys ?? 0, 0);
  const bonusPoints = Math.max(input.bonusPoints ?? 0, 0);
  const moneyHolePoints = input.moneyHolePoints ?? 0;

  return (
    finishPoints(input.position) +
    doubleEagles * DK_HOLE.doubleEagle +
    eagles * DK_HOLE.eagle +
    birdies * DK_HOLE.birdie +
    pars * DK_HOLE.par +
    bogeys * DK_HOLE.bogey +
    doubleBogeys * DK_HOLE.doubleBogeyOrWorse +
    bonusPoints +
    moneyHolePoints
  );
}
