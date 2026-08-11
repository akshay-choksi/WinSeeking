import { AudioLines } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useStreetNamesPref } from "@/hooks/use-street-names-pref";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";

type NicknameDeSargeToggleProps = {
  id: string;
  className?: string;
  /** Compact row for draft search; fuller card for profile. */
  density?: "compact" | "comfortable";
};

/** Clickable preference control for Sarge nicknames on golfer names. */
export function NicknameDeSargeToggle({
  id,
  className,
  density = "compact",
}: NicknameDeSargeToggleProps) {
  const [enabled, setEnabled] = useStreetNamesPref();
  const comfortable = density === "comfortable";

  return (
    <label
      htmlFor={id}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-xl border text-left transition-colors",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        comfortable ? "gap-4 p-4 sm:p-5" : "p-3",
        enabled
          ? "border-primary/30 bg-brand-muted/50"
          : "border-border bg-muted/40 hover:border-border hover:bg-card",
        className,
      )}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-lg transition-colors",
          comfortable ? "h-11 w-11" : "h-9 w-9",
          enabled
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        <AudioLines className={comfortable ? "h-5 w-5" : "h-4 w-4"} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={cn(
              "font-semibold tracking-tight text-foreground",
              comfortable ? "text-base" : "text-sm",
            )}
          >
            Nickname de Sarge
          </span>
          <StatusBadge tone={enabled ? "open" : "muted"} className="px-2 py-0 text-[10px]">
            {enabled ? "On" : "Off"}
          </StatusBadge>
        </span>
        <span
          className={cn(
            "mt-0.5 block text-muted-foreground",
            comfortable ? "text-sm" : "text-xs",
          )}
        >
          Tap to swap tour names for Sarge nicknames
        </span>
      </span>

      <Switch
        id={id}
        checked={enabled}
        onCheckedChange={setEnabled}
        aria-label="Nickname de Sarge"
        className={cn("shrink-0", comfortable && "scale-110")}
      />
    </label>
  );
}
