import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  LIVE_SCORES_UPDATED_EVENT,
  notifyLiveScoresUpdated,
  refreshLiveScores,
  type LiveScoreRefreshResult,
} from "@/lib/live-scores";

type UseLiveScoreRefreshOpts = {
  /** Fire when the signed-in session is ready and when the tab becomes visible again. */
  onSignIn?: boolean;
  leagueId?: string | null;
  tournamentId?: string | null;
};

/**
 * Shared live-score sync for sign-in, pull-to-refresh, and manual refresh.
 */
export function useLiveScoreRefresh(opts: UseLiveScoreRefreshOpts = {}) {
  const { user, loading: authLoading } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);
  const signedInRan = useRef(false);
  const signedInToastShown = useRef(false);
  const lastRefreshAt = useRef(0);

  const refresh = useCallback(
    async (mode: "silent" | "pull" | "manual" = "manual") => {
      if (!user || inFlight.current) {
        return { skipped: true, message: "Busy" } as LiveScoreRefreshResult;
      }
      inFlight.current = true;
      setRefreshing(true);
      try {
        const result = await refreshLiveScores({
          leagueId: opts.leagueId,
          tournamentId: opts.tournamentId,
          userId: user.id,
        });

        if (result.skipped) {
          if (mode === "pull" || mode === "manual") {
            toast.message(result.message ?? "Nothing to refresh");
          }
          return result;
        }

        notifyLiveScoresUpdated(result);
        lastRefreshAt.current = Date.now();

        if (mode === "manual") {
          toast.success(result.cached ? "Scores are already current" : "Live scores refreshed", {
            description: result.message,
          });
        } else if (mode === "pull") {
          toast.success(result.cached ? "Scores are current" : "Scores updated", {
            description: result.message,
          });
        } else if (mode === "silent" && result.autoFinalized) {
          toast.success("Event finalized", { description: result.message });
        } else if (mode === "silent" && !result.cached && !signedInToastShown.current) {
          signedInToastShown.current = true;
          toast.success("Scores updated");
        }

        return result;
      } catch (err) {
        const description = err instanceof Error ? err.message : "Try again in a moment.";
        // Always surface failures — silent failures looked like "refresh doesn't work".
        toast.error("Could not refresh scores", { description });
        return { skipped: true, message: description };
      } finally {
        inFlight.current = false;
        setRefreshing(false);
      }
    },
    [user, opts.leagueId, opts.tournamentId],
  );

  useEffect(() => {
    if (!opts.onSignIn || authLoading || !user) return;
    if (signedInRan.current) return;
    signedInRan.current = true;
    void refresh("silent");
  }, [opts.onSignIn, authLoading, user?.id, refresh]);

  // Refresh when returning to the app (Safari background → foreground).
  useEffect(() => {
    if (!opts.onSignIn || !user) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshAt.current < 15_000) return;
      void refresh("silent");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [opts.onSignIn, user?.id, refresh]);

  return { refreshing, refresh };
}

/** Subscribe to ambient live-score updates (after sync writes to the DB). */
export function useOnLiveScoresUpdated(handler: (detail?: LiveScoreRefreshResult) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const onUpdate = (e: Event) => {
      handlerRef.current((e as CustomEvent<LiveScoreRefreshResult>).detail);
    };
    window.addEventListener(LIVE_SCORES_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(LIVE_SCORES_UPDATED_EVENT, onUpdate);
  }, []);
}
