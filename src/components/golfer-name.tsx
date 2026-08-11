import { formatGolferDisplayName } from "@/lib/golfer-display-name";
import { getSargePrimaryNickname } from "@/lib/sarge-nicknames";
import { useStreetNamesPref } from "@/hooks/use-street-names-pref";
import { cn } from "@/lib/utils";

type GolferNameProps = {
  name: string;
  className?: string;
  /** When street names are on, show the real name underneath in muted text. */
  showRealNameHint?: boolean;
};

/** Renders a golfer's street name or real name based on viewer preference. */
export function GolferName({ name, className, showRealNameHint = false }: GolferNameProps) {
  const [streetNames] = useStreetNamesPref();
  const display = formatGolferDisplayName(name, streetNames);
  const street = getSargePrimaryNickname(name);
  const showHint = showRealNameHint && streetNames && street != null && street !== name;

  if (!showHint) {
    return <span className={className}>{display}</span>;
  }

  return (
    <span className={cn("flex min-w-0 flex-col", className)}>
      <span className="truncate font-medium text-foreground">{display}</span>
      <span className="truncate text-[11px] text-muted-foreground">{name}</span>
    </span>
  );
}
