import { useEffect, useRef, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GolferAvatar } from "@/components/golfer-avatar";
import { GolferName } from "@/components/golfer-name";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatAmericanOdds } from "@/lib/scoring";
import { formatGolferDisplayName } from "@/lib/golfer-display-name";
import { getSargePrimaryNickname } from "@/lib/sarge-nicknames";
import { useStreetNamesPref } from "@/hooks/use-street-names-pref";
import { cn } from "@/lib/utils";

export type GolferInfoData = {
  id: string;
  name: string;
  pga_player_num?: string | null;
  owgr_rank?: number | null;
  dg_rank?: number | null;
  country?: string | null;
  is_amateur?: boolean | null;
  salary?: number | null;
  decimal_odds?: number | null;
  model_win_prob?: number | null;
  model_make_cut_prob?: number | null;
  model_top5_prob?: number | null;
  birth_place?: string | null;
  age?: number | null;
  college?: string | null;
  handedness?: string | null;
  bio_extract?: string | null;
  bio_url?: string | null;
  bio_source?: string | null;
  bio_fetched_at?: string | null;
  season_events?: number | null;
  season_cuts?: number | null;
  season_top10s?: number | null;
  season_wins?: number | null;
  season_earnings?: string | null;
  fedex_points?: number | null;
  fedex_rank?: number | null;
};

function formatOwgr(rank: number | null | undefined): string {
  if (rank == null || !Number.isFinite(rank)) return "—";
  return String(rank);
}

function formatPct(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const pct = p <= 1 ? p * 100 : p;
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

function formatStat(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(n);
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

function needsEnrich(info: GolferInfoData): boolean {
  if (!info.bio_fetched_at) return true;
  // Season form comes from ESPN after athlete id is known — refresh if still empty.
  return (
    info.season_events == null &&
    info.season_cuts == null &&
    info.season_wins == null &&
    info.fedex_rank == null
  );
}

type Props = {
  golfer: GolferInfoData;
  className?: string;
};

export function GolferInfoButton({ golfer, className }: Props) {
  const [streetNames] = useStreetNamesPref();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<GolferInfoData>(golfer);
  const [maxHeightPx, setMaxHeightPx] = useState<number>(420);
  const [alignOffset, setAlignOffset] = useState(0);
  const [contentWidthPx, setContentWidthPx] = useState(22 * 16);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const SIDE_OFFSET = 6;
  const FOOTER_GAP = 16;
  const EDGE_MARGIN = 16;
  const displayName = formatGolferDisplayName(info.name, streetNames);
  const street = getSargePrimaryNickname(info.name);

  function measureLayout() {
    const trigger = triggerRef.current;
    if (!trigger) {
      setMaxHeightPx(420);
      setAlignOffset(0);
      setContentWidthPx(Math.min(22 * 16, window.innerWidth - EDGE_MARGIN * 2));
      return;
    }
    const t = trigger.getBoundingClientRect();
    const footer =
      document.querySelector<HTMLElement>("[data-draft-footer]") ??
      document.querySelector<HTMLElement>(".fixed.inset-x-0.bottom-0");
    const footerTop = footer?.getBoundingClientRect().top ?? window.innerHeight;
    // Content starts at trigger.bottom + SIDE_OFFSET; leave FOOTER_GAP above footer.
    const available = Math.floor(footerTop - t.bottom - SIDE_OFFSET - FOOTER_GAP);
    setMaxHeightPx(Math.max(160, Math.min(available, 28 * 16)));

    // Keep a near-full-width panel inside the viewport: start-align to the
    // trigger, then shift left with alignOffset if it would overflow right.
    const width = Math.min(22 * 16, window.innerWidth - EDGE_MARGIN * 2);
    let offset = 0;
    if (t.left + width > window.innerWidth - EDGE_MARGIN) {
      offset = window.innerWidth - EDGE_MARGIN - width - t.left;
    }
    if (t.left + offset < EDGE_MARGIN) {
      offset = EDGE_MARGIN - t.left;
    }
    setContentWidthPx(width);
    setAlignOffset(offset);
  }

  useEffect(() => {
    if (!open) return;
    const update = () => measureLayout();
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    setInfo((prev) => {
      if (prev.id === golfer.id && prev.bio_fetched_at && !golfer.bio_fetched_at) {
        return {
          ...golfer,
          bio_extract: prev.bio_extract,
          bio_url: prev.bio_url,
          bio_source: prev.bio_source,
          bio_fetched_at: prev.bio_fetched_at,
          birth_place: prev.birth_place ?? golfer.birth_place,
          age: prev.age ?? golfer.age,
          college: prev.college ?? golfer.college,
          handedness: prev.handedness ?? golfer.handedness,
          season_events: prev.season_events ?? golfer.season_events,
          season_cuts: prev.season_cuts ?? golfer.season_cuts,
          season_top10s: prev.season_top10s ?? golfer.season_top10s,
          season_wins: prev.season_wins ?? golfer.season_wins,
          season_earnings: prev.season_earnings ?? golfer.season_earnings,
          fedex_points: prev.fedex_points ?? golfer.fedex_points,
          fedex_rank: prev.fedex_rank ?? golfer.fedex_rank,
        };
      }
      return golfer;
    });
  }, [golfer]);

  useEffect(() => {
    if (!open) return;
    if (!needsEnrich(info)) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("enrich-golfer-bio", {
        body: { golfer_id: golfer.id },
      });
      if (cancelled) return;
      setLoading(false);
      if (error || !data || data.error) return;
      setInfo((prev) => ({
        ...prev,
        country: data.country ?? prev.country,
        is_amateur: data.is_amateur ?? prev.is_amateur,
        owgr_rank: data.owgr_rank ?? prev.owgr_rank,
        dg_rank: data.dg_rank ?? prev.dg_rank,
        birth_place: data.birth_place ?? prev.birth_place,
        age: data.age ?? prev.age,
        college: data.college ?? prev.college,
        handedness: data.handedness ?? prev.handedness,
        bio_extract: data.bio_extract ?? null,
        bio_url: data.bio_url ?? null,
        bio_source: data.bio_source ?? prev.bio_source,
        bio_fetched_at: data.bio_fetched_at ?? new Date().toISOString(),
        season_events: data.season_events ?? prev.season_events,
        season_cuts: data.season_cuts ?? prev.season_cuts,
        season_top10s: data.season_top10s ?? prev.season_top10s,
        season_wins: data.season_wins ?? prev.season_wins,
        season_earnings: data.season_earnings ?? prev.season_earnings,
        fedex_points: data.fedex_points ?? prev.fedex_points,
        fedex_rank: data.fedex_rank ?? prev.fedex_rank,
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, [open, golfer.id, info.bio_fetched_at, info.season_events, info.season_cuts, info.season_wins, info.fedex_rank]);

  const espnBits = [
    info.age != null ? `Age ${info.age}` : null,
    info.birth_place,
    info.college,
    info.handedness ? `${info.handedness}H` : null,
  ].filter(Boolean);

  const hasSeasonForm =
    info.season_events != null ||
    info.season_cuts != null ||
    info.season_top10s != null ||
    info.season_wins != null ||
    info.fedex_rank != null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) measureLayout();
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700",
            className,
          )}
          aria-label={`Info about ${displayName}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        alignOffset={alignOffset}
        avoidCollisions={false}
        sideOffset={SIDE_OFFSET}
        style={{ maxHeight: maxHeightPx, width: contentWidthPx }}
        className="z-[45] w-auto max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <GolferAvatar name={info.name} pgaPlayerNum={info.pga_player_num} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900">{displayName}</div>
            {streetNames && street && street !== info.name ? (
              <div className="text-xs text-slate-400">{info.name}</div>
            ) : null}
            <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500">
              {info.country ? <span>{info.country}</span> : null}
              {info.is_amateur ? <span>Amateur</span> : null}
              <span>OWGR {formatOwgr(info.owgr_rank)}</span>
              {info.dg_rank != null ? <span>DG #{info.dg_rank}</span> : null}
              {info.fedex_rank != null ? <span>FedEx #{info.fedex_rank}</span> : null}
            </div>
          </div>
        </div>

        <div className="space-y-1.5 rounded-md bg-slate-50 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            This event
          </div>
          {info.salary != null ? (
            <MetaLine label="Salary" value={`$${info.salary.toLocaleString()}`} />
          ) : null}
          <MetaLine label="Book win odds" value={formatAmericanOdds(info.decimal_odds ?? null)} />
          <MetaLine label="DG model win %" value={formatPct(info.model_win_prob)} />
          <MetaLine label="DG model make-cut %" value={formatPct(info.model_make_cut_prob)} />
          <MetaLine label="DG model top-5 %" value={formatPct(info.model_top5_prob)} />
          <p className="pt-1 text-[10px] leading-snug text-slate-400">
            Book odds are sportsbook prices. DG model % are DataGolf forecast probabilities for this
            tournament (not the same as betting odds).
          </p>
        </div>

        {hasSeasonForm ? (
          <div className="space-y-1.5 rounded-md bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {new Date().getUTCFullYear()} PGA season
            </div>
            <MetaLine label="Starts" value={formatStat(info.season_events)} />
            <MetaLine label="Cuts made" value={formatStat(info.season_cuts)} />
            <MetaLine label="Top 10s" value={formatStat(info.season_top10s)} />
            <MetaLine label="Wins" value={formatStat(info.season_wins)} />
            <MetaLine label="FedEx rank" value={formatStat(info.fedex_rank)} />
            {info.season_earnings ? (
              <MetaLine label="Earnings" value={info.season_earnings} />
            ) : null}
          </div>
        ) : null}

        {espnBits.length > 0 ? (
          <p className="text-xs text-slate-600">{espnBits.join(" · ")}</p>
        ) : null}

        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Biography
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Looking up Wikipedia…
            </div>
          ) : info.bio_extract ? (
            <p className="text-sm leading-snug text-slate-700">{info.bio_extract}</p>
          ) : (
            <p className="text-sm text-slate-500">No biography available.</p>
          )}
          {info.bio_url ? (
            <a
              href={info.bio_url}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs font-medium text-emerald-700 hover:underline"
            >
              Wikipedia
            </a>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
