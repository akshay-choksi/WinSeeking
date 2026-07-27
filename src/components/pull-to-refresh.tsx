import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PULL_THRESHOLD = 64;
const MAX_PULL = 120;

type PullToRefreshProps = {
  onRefresh: () => Promise<unknown>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
};

/**
 * Pull-to-refresh for window-scrolling pages (touch + trackpad overscroll).
 * Listens on document so gestures aren't missed when they start on child nodes.
 */
export function PullToRefresh({
  onRefresh,
  children,
  className,
  disabled,
}: PullToRefreshProps) {
  const startY = useRef(0);
  const pulling = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const disabledRef = useRef(!!disabled);
  const onRefreshRef = useRef(onRefresh);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  onRefreshRef.current = onRefresh;
  disabledRef.current = !!disabled;
  refreshingRef.current = refreshing;

  useEffect(() => {
    function atTop() {
      return (window.scrollY || document.documentElement.scrollTop || 0) <= 2;
    }

    async function runRefresh() {
      if (disabledRef.current || refreshingRef.current) return;
      setRefreshing(true);
      refreshingRef.current = true;
      pullRef.current = PULL_THRESHOLD;
      setPull(PULL_THRESHOLD);
      try {
        await onRefreshRef.current();
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
        pullRef.current = 0;
        setPull(0);
      }
    }

    function onTouchStart(e: TouchEvent) {
      if (disabledRef.current || refreshingRef.current) return;
      if (!atTop()) {
        pulling.current = false;
        return;
      }
      startY.current = e.touches[0]?.clientY ?? 0;
      pulling.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!pulling.current || disabledRef.current || refreshingRef.current) return;
      if (!atTop()) {
        pulling.current = false;
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const y = e.touches[0]?.clientY ?? 0;
      const delta = y - startY.current;
      if (delta <= 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const resisted = Math.min(MAX_PULL, delta * 0.5);
      pullRef.current = resisted;
      setPull(resisted);
      if (resisted > 6) e.preventDefault();
    }

    function onTouchEnd() {
      if (!pulling.current) return;
      pulling.current = false;
      if (pullRef.current >= PULL_THRESHOLD) {
        void runRefresh();
        return;
      }
      pullRef.current = 0;
      setPull(0);
    }

    // Trackpad / mouse wheel: hard swipe up at top of page.
    let wheelAccum = 0;
    let wheelReset: ReturnType<typeof setTimeout> | undefined;
    function onWheel(e: WheelEvent) {
      if (disabledRef.current || refreshingRef.current || !atTop()) {
        wheelAccum = 0;
        return;
      }
      if (e.deltaY >= 0) {
        wheelAccum = 0;
        return;
      }
      wheelAccum += -e.deltaY;
      clearTimeout(wheelReset);
      wheelReset = setTimeout(() => {
        wheelAccum = 0;
      }, 250);
      if (wheelAccum >= 120) {
        wheelAccum = 0;
        void runRefresh();
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    document.addEventListener("touchend", onTouchEnd, { capture: true });
    document.addEventListener("touchcancel", onTouchEnd, { capture: true });
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
      document.removeEventListener("wheel", onWheel);
      clearTimeout(wheelReset);
    };
  }, []);

  const progress = Math.min(1, pull / PULL_THRESHOLD);
  const showIndicator = pull > 4 || refreshing;

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-safe",
          showIndicator ? "opacity-100" : "opacity-0",
        )}
        style={{
          transform: `translateY(${Math.max(8, pull * 0.35)}px)`,
          transition: refreshing ? "none" : "opacity 120ms ease",
        }}
        aria-hidden={!showIndicator}
      >
        <div className="mt-2 flex h-9 w-9 items-center justify-center rounded-full border bg-card shadow-md">
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <span
              className="block h-4 w-4 rounded-full border-2 border-primary border-t-transparent"
              style={{
                transform: `rotate(${progress * 360}deg)`,
                opacity: 0.35 + progress * 0.65,
              }}
            />
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
