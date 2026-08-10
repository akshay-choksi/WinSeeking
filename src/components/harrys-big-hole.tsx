import { cn } from "@/lib/utils";
import { MONEY_HOLE_MULTIPLIER } from "@/lib/scoring";

export type HarrysBigHoleRound = {
  round_number: number;
  hole_number: number;
};

type HarrysBigHoleProps = {
  holeNumber: number;
  roundNumber: number;
  /** Prior / other revealed round money holes (optional history chips). */
  history?: HarrysBigHoleRound[];
  className?: string;
  /** Compact strip for navy lineup header. */
  variant?: "card" | "compact";
};

/** Infographic callout for the daily ×3 money hole — Harry's Big Hole. */
export function HarrysBigHole({
  holeNumber,
  roundNumber,
  history = [],
  className,
  variant = "card",
}: HarrysBigHoleProps) {
  if (variant === "compact") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2.5 rounded-full border border-amber-300/30 bg-amber-400/15 px-3 py-1.5 text-amber-100",
          className,
        )}
      >
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-emerald-500/40" />
          <span className="absolute inset-[3px] rounded-full bg-navy" />
          <span className="relative font-mono text-xs font-bold tabular-nums text-amber-200">
            {holeNumber}
          </span>
        </span>
        <span className="min-w-0 text-left">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/80">
            Harry&apos;s Big Hole
          </span>
          <span className="block text-xs font-semibold leading-tight">
            Hole {holeNumber} · ×{MONEY_HOLE_MULTIPLIER}
          </span>
        </span>
      </div>
    );
  }

  const rounds = history
    .slice()
    .sort((a, b) => a.round_number - b.round_number);

  return (
    <section
      aria-label={`Harry's Big Hole: hole ${holeNumber}, round ${roundNumber}`}
      className={cn(
        "relative overflow-hidden rounded-xl bg-navy text-navy-foreground",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 55% at 50% 0%, oklch(0.55 0.15 155 / 0.4), transparent 60%),
            repeating-linear-gradient(
              -18deg,
              transparent,
              transparent 10px,
              oklch(1 0 0 / 0.03) 10px,
              oklch(1 0 0 / 0.03) 11px
            )
          `,
        }}
      />

      <div className="relative flex flex-col items-center px-4 py-4 text-center sm:px-5 sm:py-5">
        {/* Cup + flag */}
        <div className="relative mb-1 flex h-16 w-16 items-center justify-center sm:h-[4.5rem] sm:w-[4.5rem]">
          <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-sm" />
          <div className="absolute inset-0 rounded-full border-2 border-emerald-400/45 bg-gradient-to-b from-emerald-600/45 to-emerald-950/85 shadow-[inset_0_6px_14px_oklch(0_0_0/0.4)]" />
          <div className="absolute inset-[9px] rounded-full bg-gradient-to-b from-stone-800 to-black shadow-[inset_0_2px_6px_oklch(0_0_0/0.85)] sm:inset-[10px]" />
          <div
            aria-hidden
            className="absolute -top-0.5 left-1/2 h-11 w-px -translate-x-1/2 bg-gradient-to-b from-amber-100 to-amber-100/30 sm:h-12"
          />
          <div
            aria-hidden
            className="absolute top-0.5 left-[calc(50%+1px)] h-0 w-0 border-y-[5px] border-l-[13px] border-y-transparent border-l-amber-400"
          />
          <span className="relative z-10 mt-4 font-mono text-2xl font-black tabular-nums tracking-tight text-white sm:text-[1.65rem]">
            {holeNumber}
          </span>
        </div>

        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
          Round {roundNumber} · Daily special
        </p>
        <h2 className="mt-0.5 font-serif text-xl font-bold tracking-tight text-white sm:text-2xl">
          Harry&apos;s Big Hole
        </h2>
        <p className="mt-1.5 max-w-xs text-xs leading-snug text-navy-foreground/70 sm:text-[13px]">
          3x points for all golfers on this one hole.
        </p>

        <div className="mt-3 flex flex-col items-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 text-navy sm:h-12 sm:w-12">
            <span className="font-mono text-lg font-black tracking-tight sm:text-xl">
              ×{MONEY_HOLE_MULTIPLIER}
            </span>
          </div>
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">
            Hole {holeNumber}
          </p>
        </div>

        {rounds.length > 1 ? (
          <div className="mt-3 flex flex-wrap justify-center gap-1">
            {rounds.map((h) => {
              const active = h.round_number === roundNumber;
              return (
                <span
                  key={h.round_number}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
                    active
                      ? "bg-emerald-400/25 font-semibold text-emerald-100"
                      : "bg-white/5 text-navy-foreground/50",
                  )}
                >
                  R{h.round_number}: #{h.hole_number}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
