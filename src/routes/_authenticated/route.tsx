import { ClientOnly, createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { RouteShell } from "@/components/route-shell";
import { AppHeader } from "@/components/app-header";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { useLiveScoreRefresh } from "@/hooks/use-live-score-refresh";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      // Full document navigation avoids hydrating /auth against the / shell HTML.
      throw redirect({ to: "/auth", reloadDocument: true });
    }
  },
  pendingComponent: RouteShell,
  component: () => (
    <ClientOnly fallback={<RouteShell />}>
      <AuthedLayout />
    </ClientOnly>
  ),
});

function tournamentIdFromSearch(search: unknown): string | null {
  if (search && typeof search === "object" && "tournament" in search) {
    const t = (search as { tournament?: unknown }).tournament;
    return typeof t === "string" && t ? t : null;
  }
  if (typeof search === "string") {
    try {
      return new URLSearchParams(search.startsWith("?") ? search : `?${search}`).get(
        "tournament",
      );
    } catch {
      return null;
    }
  }
  return null;
}

function AuthedLayout() {
  const search = useRouterState({ select: (s) => s.location.search });
  const tournamentId = tournamentIdFromSearch(search);
  const { refreshing, refresh } = useLiveScoreRefresh({
    onSignIn: true,
    tournamentId,
  });

  return (
    <div className="min-h-dvh bg-background">
      <AppHeader />
      <PullToRefresh
        disabled={refreshing}
        onRefresh={() => refresh("pull")}
      >
        <main className="mx-auto max-w-7xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </PullToRefresh>
    </div>
  );
}
