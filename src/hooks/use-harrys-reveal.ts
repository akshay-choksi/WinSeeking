import { useCallback, useEffect, useState } from "react";
import { hasSeenHarrysReveal, markHarrysRevealSeen } from "@/lib/harrys-reveal";

/**
 * One-shot Harry's Big Hole reveal: open when hole is present and not yet seen
 * for this user+tournament+round in localStorage.
 */
export function useHarrysReveal(opts: {
  userId: string | undefined | null;
  tournamentId: string | undefined | null;
  round: number | null;
  holePresent: boolean;
}): { open: boolean; onOpenChange: (next: boolean) => void } {
  const { userId, tournamentId, round, holePresent } = opts;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId || !tournamentId || round == null || !holePresent) {
      setOpen(false);
      return;
    }
    setOpen(!hasSeenHarrysReveal(userId, tournamentId, round));
  }, [userId, tournamentId, round, holePresent]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (!next && userId && tournamentId && round != null) {
        markHarrysRevealSeen(userId, tournamentId, round);
      }
      setOpen(next);
    },
    [userId, tournamentId, round],
  );

  return { open, onOpenChange };
}
