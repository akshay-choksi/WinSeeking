import { StatusBadge } from "@/components/status-badge";
import type { OwnershipRoast } from "@/lib/ownership";
import { cn } from "@/lib/utils";

type OwnershipRoastChipsProps = {
  roasts: OwnershipRoast[];
  className?: string;
};

function toneFor(kind: OwnershipRoast["kind"]): "open" | "muted" | "locked" {
  if (kind === "unique") return "open";
  if (kind === "chalk-stack") return "locked";
  return "muted";
}

/** Post-lock punchy ownership callouts for the Event tab / recap. */
export function OwnershipRoastChips({ roasts, className }: OwnershipRoastChipsProps) {
  if (roasts.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="list" aria-label="Ownership callouts">
      {roasts.map((roast) => {
        const key =
          roast.kind === "chalk-stack"
            ? `chalk-${roast.userId}`
            : `${roast.kind}-${roast.golferId}`;
        return (
          <div key={key} role="listitem">
            <StatusBadge tone={toneFor(roast.kind)} className="max-w-full whitespace-normal text-left">
              {roast.text}
            </StatusBadge>
          </div>
        );
      })}
    </div>
  );
}
