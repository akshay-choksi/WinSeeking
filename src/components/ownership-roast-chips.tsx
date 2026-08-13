import { GolferName } from "@/components/golfer-name";
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

function RoastLabel({ roast }: { roast: OwnershipRoast }) {
  if (roast.kind === "unique") {
    return (
      <>
        Only {roast.ownerName} took <GolferName name={roast.golferName} />
      </>
    );
  }
  if (roast.kind === "everyone") {
    return (
      <>
        Everyone locked <GolferName name={roast.golferName} />
      </>
    );
  }
  return <>{roast.text}</>;
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
              <RoastLabel roast={roast} />
            </StatusBadge>
          </div>
        );
      })}
    </div>
  );
}
