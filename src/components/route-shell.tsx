/** Shared SSR/client pending shell — must stay identical across client-only routes. */
export function RouteShell() {
  return <div className="min-h-dvh bg-background" />;
}
