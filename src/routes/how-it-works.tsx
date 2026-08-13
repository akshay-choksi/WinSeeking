import { Link, createFileRoute } from "@tanstack/react-router";
import { Flag } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SurfacePanel } from "@/components/surface-panel";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  BONUS_SCORING,
  MONEY_HOLE_MULTIPLIER,
  SCORING,
  finishPoints,
  multiplierForEventType,
} from "@/lib/scoring";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How it works — WinSeeking" },
      {
        name: "description",
        content:
          "Salary-cap fantasy golf rules: DraftKings Classic scoring, season multipliers, Harry’s Big Hole, and lineup lock.",
      },
    ],
  }),
  component: HowItWorksPage,
});

const DEFAULT_CAP = 50_000;
const DEFAULT_ROSTER = 6;

const HOLE_SCORING_ROWS = [
  { label: "Double eagle or better", pts: SCORING.doubleEagle },
  { label: "Eagle", pts: SCORING.eagle },
  { label: "Birdie", pts: SCORING.birdie },
  { label: "Par", pts: SCORING.par },
  { label: "Bogey", pts: SCORING.bogey },
  { label: "Double bogey or worse", pts: SCORING.doubleBogeyOrWorse },
] as const;

const PLACE_SCORING_ROWS = [
  { label: "1st", pts: finishPoints(1) },
  { label: "2nd", pts: finishPoints(2) },
  { label: "3rd", pts: finishPoints(3) },
  { label: "4th", pts: finishPoints(4) },
  { label: "5th", pts: finishPoints(5) },
  { label: "6th", pts: finishPoints(6) },
  { label: "7th", pts: finishPoints(7) },
  { label: "8th", pts: finishPoints(8) },
  { label: "9th", pts: finishPoints(9) },
  { label: "10th", pts: finishPoints(10) },
  { label: "11–15", pts: finishPoints(11) },
  { label: "16–20", pts: finishPoints(16) },
  { label: "21–25", pts: finishPoints(21) },
  { label: "26–30", pts: finishPoints(26) },
  { label: "31–40", pts: finishPoints(31) },
  { label: "41–50", pts: finishPoints(41) },
] as const;

const BONUS_ROWS = [
  { label: "3-birdie streak (max 1 / round)", pts: BONUS_SCORING.birdieStreak },
  { label: "Bogey-free round", pts: BONUS_SCORING.bogeyFreeRound },
  { label: "Hole-in-one", pts: BONUS_SCORING.holeInOne },
  { label: "All 4 rounds under 70", pts: BONUS_SCORING.allFourUnder70 },
] as const;

const SEASON_MULTIPLIERS = [
  { label: "Standard", mult: multiplierForEventType("standard") },
  { label: "Signature", mult: multiplierForEventType("signature") },
  { label: "Major", mult: multiplierForEventType("major") },
] as const;

function formatPts(pts: number): string {
  if (pts > 0) return `+${pts}`;
  return String(pts);
}

function formatMultiplier(m: number): string {
  const label = Number.isInteger(m) ? String(m) : m.toFixed(1);
  return `${label}×`;
}

function HowItWorksPage() {
  const moneyHoleBirdie = SCORING.birdie * MONEY_HOLE_MULTIPLIER;

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-card/85 pt-safe backdrop-blur-md supports-[backdrop-filter]:bg-card/70">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4 sm:h-16 sm:px-6">
          <Link
            to="/how-it-works"
            className="group flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground transition group-hover:brightness-110">
              <Flag className="h-[18px] w-[18px]" />
            </span>
            <span className="flex min-w-0 flex-col leading-none">
              <span className="truncate font-display text-base font-bold tracking-tight text-foreground">
                WinSeeking
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                How it works
              </span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">Home</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-10">
        <PageHeader
          eyebrow="Guide"
          title="How it works"
          description="Salary-cap fantasy golf for your crew: pick a lineup, score DraftKings Classic points live, and race a season board."
        />

        <SurfacePanel title="How to play">
          <div className="space-y-3 px-5 py-4 text-sm text-muted-foreground">
            <p>
              Join a private league with an invite code (or create one). Each PGA event, set a
              lineup of{" "}
              <span className="font-medium text-foreground">{DEFAULT_ROSTER} golfers</span> that
              stays under the salary cap — typically{" "}
              <span className="font-medium text-foreground">
                ${DEFAULT_CAP.toLocaleString()}
              </span>
              . Cap and roster size are set per league.
            </p>
            <p>
              Lock happens at the event&apos;s lock time (usually first-round tee). After that,
              lineups freeze and live fantasy points roll in. When the tournament is official,
              your league finish awards season points.
            </p>
          </div>
        </SurfacePanel>

        <SurfacePanel title="Scoring" meta="DraftKings Classic">
          <div className="space-y-6 px-5 py-4">
            <p className="text-sm text-muted-foreground">
              Each golfer earns fantasy points from hole scores, live place on the leaderboard,
              and streak / achievement bonuses. Your lineup total is the sum of your six. There
              is no flat made-cut bonus — making the cut matters because golfers keep playing
              holes.
            </p>

            <ScoreTable title="Hole scores" rows={HOLE_SCORING_ROWS} />
            <ScoreTable title="Finish (live place)" rows={PLACE_SCORING_ROWS} />
            <ScoreTable title="Bonuses" rows={BONUS_ROWS} />
          </div>
        </SurfacePanel>

        <SurfacePanel title="Season points">
          <div className="space-y-4 px-5 py-4 text-sm text-muted-foreground">
            <p>
              After an event is finalized, your place in the league standings awards season
              points from a FedEx-style payout table, then multiplied by the event type:
            </p>
            <ul className="grid gap-2 sm:grid-cols-3">
              {SEASON_MULTIPLIERS.map((row) => (
                <li
                  key={row.label}
                  className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5 text-center"
                >
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {row.label}
                  </div>
                  <div className="mt-1 font-display text-xl font-bold tabular-nums text-foreground">
                    {formatMultiplier(row.mult)}
                  </div>
                </li>
              ))}
            </ul>
            <p>
              Wins and top-5s on the season board come from league finishes (1st = win; places
              1–5 count as top 5).
            </p>
          </div>
        </SurfacePanel>

        <SurfacePanel title="Quirks" tone="navy">
          <div className="space-y-5 px-5 py-4 text-sm text-navy-foreground/80">
            <div>
              <h3 className="font-display text-base font-semibold text-navy-foreground">
                Harry&apos;s Big Hole
              </h3>
              <p className="mt-1.5">
                Each round has a money hole. Hole scoring on that hole is worth{" "}
                <span className="font-semibold text-navy-foreground">
                  {MONEY_HOLE_MULTIPLIER}×
                </span>{" "}
                — so a birdie is{" "}
                <span className="font-semibold text-navy-foreground">
                  {formatPts(moneyHoleBirdie)}
                </span>{" "}
                instead of {formatPts(SCORING.birdie)}. Bogeys hurt {MONEY_HOLE_MULTIPLIER}×
                too. The hole is set per round and shown on the league and lineup boards —
                first time it drops for a round, you get a one-shot reveal.
              </p>
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-navy-foreground">
                Nickname de Sarge
              </h3>
              <p className="mt-1.5">
                Optional toggle (profile / draft) that swaps tour names for Sarge nicknames on
                draft, lineups, highlights, and ownership callouts — pure vibes, zero scoring
                impact. Member leaderboards stay real names.
              </p>
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-navy-foreground">
                Made the weekend
              </h3>
              <p className="mt-1.5">
                After the cut is in play, the event leaderboard shows how many of your golfers made
                the weekend (X/N on the roster) — tracking only, no scoring change.
              </p>
            </div>
          </div>
        </SurfacePanel>

        <SurfacePanel title="FAQ">
          <Accordion type="multiple" className="px-5">
            <AccordionItem value="lock">
              <AccordionTrigger>When do lineups lock?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Lineups lock at the tournament&apos;s lock time (shown on the league board), or
                when the event is marked completed. An &quot;in progress&quot; status alone does
                not lock drafting — you can still edit until the clock hits lock.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="dnq">
              <AccordionTrigger>What if I miss the lock?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                No lineup by lock means DNQ: you show on the board with 0 fantasy points and
                rank last when the event is finalized. Set your six before the countdown hits
                zero.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="cut">
              <AccordionTrigger>Does making the cut give bonus points?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                No flat made-cut bonus. Golfers who make the cut keep earning hole scores (and
                bonuses) on the weekend — that&apos;s the reward.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="live">
              <AccordionTrigger>How do live scores update?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Place points recalculate from the current leaderboard on every refresh. Pull to
                refresh on the league page, or open a lineup and refresh — one sync updates
                every lineup for that tournament.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </SurfacePanel>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button asChild size="lg">
            <Link to="/auth">Sign in to play</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/">Back to leagues</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}

function ScoreTable({
  title,
  rows,
}: {
  title: string;
  rows: readonly { label: string; pts: number }[];
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">{title}</h3>
      <div className="mt-2 overflow-hidden rounded-lg border border-border/80">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.label}
                className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}
              >
                <td className="px-3 py-2 text-foreground">{row.label}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums font-medium text-foreground">
                  {formatPts(row.pts)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
