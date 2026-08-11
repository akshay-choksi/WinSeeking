import { useCallback, useEffect, useState } from "react";
import { Flame } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { SurfacePanel } from "@/components/surface-panel";
import { StatusBadge } from "@/components/status-badge";
import { GolferAvatar } from "@/components/golfer-avatar";
import { GolferName } from "@/components/golfer-name";
import { HarrysBigHole, type HarrysBigHoleRound } from "@/components/harrys-big-hole";
import { cn } from "@/lib/utils";

export type HighlightGolfer = {
  golfer_id: string;
  name: string;
  pga_player_num: string | null;
  fantasy_points: number;
  position: number | null;
  total_to_par: number | null;
  status: string | null;
  onYourLineup: boolean;
  pickCount: number;
  lineupCount: number;
};

type EventHighlightsCarouselProps = {
  moneyHole: { hole_number: number; round_number: number } | null;
  moneyHoleHistory?: HarrysBigHoleRound[];
  topScorers: HighlightGolfer[];
  tournamentStatus?: string | null;
  formatPos: (pos: number | null, status: string | null) => string;
  formatToPar: (n: number | null) => string;
};

/** Swipeable panel: Harry's Big Hole + fantasy points leaders. */
export function EventHighlightsCarousel({
  moneyHole,
  moneyHoleHistory = [],
  topScorers,
  tournamentStatus,
  formatPos,
  formatToPar,
}: EventHighlightsCarouselProps) {
  const showHarry = moneyHole != null;
  const showLeaders = topScorers.length > 0;
  const slideCount = (showHarry ? 1 : 0) + (showLeaders ? 1 : 0);

  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);

  const onSelect = useCallback((carousel: CarouselApi) => {
    if (!carousel) return;
    setIndex(carousel.selectedScrollSnap());
  }, []);

  useEffect(() => {
    if (!api) return;
    onSelect(api);
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api, onSelect]);

  if (slideCount === 0) return null;

  const harryIsActive = showHarry && index === 0;
  const title = harryIsActive
    ? "Harry's Big Hole"
    : showHarry
      ? "Fantasy Points Leaders"
      : "Fantasy Points Leaders";
  const icon = harryIsActive ? (
    <span className="font-mono text-sm font-bold text-primary">×3</span>
  ) : (
    <Flame className="h-5 w-5" />
  );

  const leadersMeta =
    tournamentStatus === "in_progress" ? (
      <StatusBadge tone="live">Live</StatusBadge>
    ) : tournamentStatus === "completed" ? (
      "Final"
    ) : (
      "Field"
    );

  const leadersBody = (
    <div className="grid gap-0 sm:grid-cols-3 sm:divide-x">
      {topScorers.map((g, i) => (
        <div
          key={g.golfer_id}
          className={cn(
            "flex items-center gap-3 px-4 py-3 sm:px-5",
            i === 0 && "bg-brand-muted/35 sm:rounded-none",
          )}
        >
          <div
            className={cn(
              "grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-xs font-bold",
              i === 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {i + 1}
          </div>
          <GolferAvatar name={g.name} pgaPlayerNum={g.pga_player_num} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium leading-tight">
              <GolferName name={g.name} />
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatPos(g.position, g.status)} · {formatToPar(g.total_to_par)}
              {g.onYourLineup ? " · Your pick" : ""}
              {!g.onYourLineup && g.lineupCount > 1 && g.pickCount > 0
                ? ` · ${g.pickCount}/${g.lineupCount} own`
                : ""}
            </p>
          </div>
          <div className="shrink-0 text-right font-mono text-lg font-semibold tabular-nums text-success">
            {g.fantasy_points.toFixed(1)}
          </div>
        </div>
      ))}
    </div>
  );

  if (slideCount === 1) {
    return (
      <SurfacePanel
        icon={showHarry ? icon : <Flame className="h-5 w-5" />}
        title={showHarry ? "Harry's Big Hole" : "Fantasy Points Leaders"}
        meta={showHarry ? `Round ${moneyHole!.round_number}` : leadersMeta}
        bodyClassName={showHarry ? "p-0" : undefined}
      >
        {showHarry ? (
          <HarrysBigHole
            holeNumber={moneyHole!.hole_number}
            roundNumber={moneyHole!.round_number}
            history={moneyHoleHistory}
            className="rounded-none"
          />
        ) : (
          leadersBody
        )}
      </SurfacePanel>
    );
  }

  return (
    <SurfacePanel
      icon={icon}
      title={title}
      meta={
        <div className="flex items-center gap-2">
          {!harryIsActive ? leadersMeta : <span className="text-muted-foreground">Round {moneyHole!.round_number}</span>}
        </div>
      }
      bodyClassName="p-0"
    >
      <Carousel
        setApi={setApi}
        opts={{ align: "start", loop: true }}
        className="w-full"
      >
        <CarouselContent className="-ml-0">
          <CarouselItem className="pl-0">
            <HarrysBigHole
              holeNumber={moneyHole!.hole_number}
              roundNumber={moneyHole!.round_number}
              history={moneyHoleHistory}
              className="rounded-none"
            />
          </CarouselItem>
          <CarouselItem className="pl-0">
            {leadersBody}
          </CarouselItem>
        </CarouselContent>

        <div className="flex items-center justify-center gap-3 border-t border-border/70 px-3 py-2.5">
          <CarouselPrevious
            className="static h-8 w-8 translate-x-0 translate-y-0 border-border bg-card shadow-none"
          />
          <div className="flex items-center gap-1.5">
            {Array.from({ length: slideCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                aria-current={index === i}
                onClick={() => api?.scrollTo(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === i ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/35 hover:bg-muted-foreground/55",
                )}
              />
            ))}
          </div>
          <CarouselNext
            className="static h-8 w-8 translate-x-0 translate-y-0 border-border bg-card shadow-none"
          />
        </div>
      </Carousel>
    </SurfacePanel>
  );
}
