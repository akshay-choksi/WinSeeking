# Hosting WinHunters

## Recommended friend-beta path: Lovable

This repository is connected to Lovable. Publish from the Lovable editor and
share the resulting `lovable.app` URL.

Publishing itself is free. A published app stays live, but production usage
consumes Lovable Cloud Run credits. The Free workspace currently includes a
monthly Cloud grant; check **Plans & credit usage** because limits and grants can
change. Custom domains require a paid Lovable plan.

The hosted Supabase project and DataGolf subscription are billed separately
from Lovable.

Before sharing the URL:

1. Add `https://YOUR-HOST/**` and `https://YOUR-HOST/auth` to Supabase Auth
   redirect URLs.
2. Apply migrations with `supabase db push`.
3. Deploy Edge Functions listed in [`supabase/FUNCTIONS.md`](supabase/FUNCTIONS.md).
4. Follow [`FRIEND_BETA.md`](FRIEND_BETA.md).

## Live result refresh

League members refresh live scores on sign-in, pull-to-refresh, or from an
in-progress lineup. `sync-results` checks membership and fetches fresh DataGolf
data on each request (no artificial cooldown).

This user-triggered model replaces a cron job for the friend beta:

- no traffic means no DataGolf calls;
- one member refresh updates all lineups for the tournament;
- Supabase Realtime updates other open leaderboard and lineup views.

Admins can force a sync from `/admin`.

## Self-hosting on Cloudflare later

The production build targets Nitro's Cloudflare module preset:

```bash
npm install
npm run build
npx wrangler deploy --config .output/server/wrangler.json
```

Configure these runtime variables in Cloudflare before deploying:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Then add the Cloudflare Worker/custom-domain URL to Supabase and Google OAuth
redirect/origin allowlists. Keep DataGolf and the service-role key only in
Supabase Edge Function secrets; they are not needed by the frontend Worker.
