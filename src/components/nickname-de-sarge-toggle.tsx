import { AudioLines } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useStreetNamesPref } from "@/hooks/use-street-names-pref";
import { cn } from "@/lib/utils";

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
        "flex w-full cursor-pointer items-center gap-3 rounded-xl border text-left transition-all",
        "focus-within:ring-2 focus-within:ring-emerald-500/60 focus-within:ring-offset-2",
        comfortable ? "gap-4 p-4 sm:p-5" : "p-3",
        enabled
          ? "border-emerald-500/40 bg-gradient-to-r from-emerald-50 via-white to-slate-50 shadow-sm ring-1 ring-emerald-500/20"
          : "border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white",
        className,
      )}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-lg transition-colors",
          comfortable ? "h-11 w-11" : "h-9 w-9",
          enabled
            ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
            : "bg-slate-200/80 text-slate-500",
        )}
        aria-hidden
      >
        <AudioLines className={comfortable ? "h-5 w-5" : "h-4 w-4"} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={cn(
              "font-semibold tracking-tight",
              comfortable ? "text-base text-slate-900" : "text-sm text-slate-800",
            )}
          >
            Nickname de Sarge
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              enabled ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500",
            )}
          >
            {enabled ? "On" : "Off"}
          </span>
        </span>
        <span
          className={cn(
            "mt-0.5 block text-slate-500",
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
        className={cn(
          "shrink-0 data-[state=checked]:bg-emerald-600",
          comfortable && "scale-110",
        )}
      />
    </label>
  );
}
