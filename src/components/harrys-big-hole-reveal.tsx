import { HarrysBigHole } from "@/components/harrys-big-hole";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MONEY_HOLE_MULTIPLIER } from "@/lib/scoring";

type HarrysBigHoleRevealProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holeNumber: number;
  roundNumber: number;
};

/** One-shot modal theater when today's money hole first appears. */
export function HarrysBigHoleReveal({
  open,
  onOpenChange,
  holeNumber,
  roundNumber,
}: HarrysBigHoleRevealProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none sm:rounded-xl [&>button]:text-navy-foreground [&>button]:hover:bg-white/10 [&>button]:hover:text-navy-foreground">
        <div className="animate-in fade-in-0 zoom-in-95 duration-500">
          <DialogHeader className="space-y-1 bg-navy px-5 pb-2 pt-5 text-center sm:text-center">
            <DialogDescription className="text-[10px] font-semibold uppercase tracking-[0.18em] text-success">
              Harry&apos;s Big Hole is live
            </DialogDescription>
            <DialogTitle className="font-display text-lg font-bold tracking-tight text-navy-foreground">
              Round {roundNumber} · Hole {holeNumber} · ×{MONEY_HOLE_MULTIPLIER}
            </DialogTitle>
          </DialogHeader>
          <HarrysBigHole
            variant="card"
            holeNumber={holeNumber}
            roundNumber={roundNumber}
            className="rounded-none"
          />
          <DialogFooter className="bg-navy px-5 pb-5 pt-3 sm:justify-center">
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
            >
              Let&apos;s go
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
