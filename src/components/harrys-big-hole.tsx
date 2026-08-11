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
          "inline-flex items-center gap-2.5 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-navy-foreground",
          className,
        )}
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary font-mono text-xs font-bold tabular-nums text-primary-foreground">
          {holeNumber}
        </span>
        <span className="min-w-0 text-left">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-navy-foreground/65">
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
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 65% 50% at 50% 0%, oklch(0.55 0.15 155 / 0.35), transparent 65%)
          `,
        }}
      />

      <div className="relative flex flex-col items-center px-4 py-5 text-center sm:px-5">
        <div className="mb-2 grid h-14 w-14 place-items-center rounded-full border-2 border-primary/50 bg-primary/20 sm:h-16 sm:w-16">
          <span className="font-mono text-2xl font-black tabular-nums tracking-tight text-navy-foreground sm:text-[1.65rem]">
            {holeNumber}
          </span>
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-success">
          Round {roundNumber} · Daily special
        </p>
        <h2 className="mt-0.5 font-display text-xl font-bold tracking-tight text-navy-foreground sm:text-2xl">
          Harry&apos;s Big Hole
        </h2>

        <div className="mt-3 flex flex-col items-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground sm:h-12 sm:w-12">
            <span className="font-mono text-lg font-black tracking-tight sm:text-xl">
              ×{MONEY_HOLE_MULTIPLIER}
            </span>
          </div>
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-foreground/60">
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
                      ? "bg-primary/25 font-semibold text-success"
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
