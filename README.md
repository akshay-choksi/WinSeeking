# WinSeeking

Salary-cap fantasy golf for friends: pick 6 golfers under a $50,000 cap, score live DraftKings Classic points, and race a season board (Signature 1.5×, Major 2×). Daily **Harry’s Big Hole** triples hole scoring on one random hole per round.

---

## Application preview

Preview stills and the walkthrough below are from the older WinHunters UI. Recapture on WinSeeking (shot list: [`docs/screenshots/README.md`](docs/screenshots/README.md)), upload in GitHub’s README editor, and paste the new Markdown under each heading.

### Product flow

```
Auth → Home (leagues) → League (event + season boards, highlights, recap)
                     ↘ Draft (salary-cap lineup)
                     ↘ Lineup viewer (live scoring + bonuses)
                     ↘ Event recap (podium, money holes, ownership)
                     ↘ Profile / How it works
Admin → Sync Odds → Sync Results (auto-finalizes when the PGA event is official)
```

### Dashboard — your leagues

League list with create / join, invite codes, and salary-cap badges.

<img width="1440" height="812" alt="Screenshot 2026-07-17 at 11 16 48 AM" src="https://github.com/user-attachments/assets/364823ad-5c49-434e-96b4-21cc2a0fe19f" />

### Event leaderboard

League home: live standings, event selector, season multipliers, and your points summary.

<img width="1383" height="755" alt="Screenshot 2026-07-17 at 11 17 06 AM" src="https://github.com/user-attachments/assets/cab6c527-fa73-48d4-bee6-095fc4e53002" />

### Live lineup scoring

Member lineup viewer: navy summary card, per-golfer breakdown, live fantasy points.

<img width="1440" height="827" alt="Screenshot 2026-07-17 at 11 17 17 AM" src="https://github.com/user-attachments/assets/30a8849f-ad09-4481-9b8b-b2d994c57759" />

### Walkthrough

https://github.com/user-attachments/assets/67b719d7-fa95-4521-9e5a-b84f4e0fc78a

---

## Stack

| Layer     | Choice |
| --------- | ------ |
| App       | React 19, TypeScript, Vite, [TanStack Start](https://tanstack.com/start) / Router / Query |
| UI        | shadcn/ui (Radix), Tailwind CSS v4 (green / navy tokens) |
| Backend   | [Supabase](https://supabase.com) — Postgres, Google Auth, RLS, Realtime, Edge Functions |
| Golf data | [DataGolf](https://datagolf.com/) (schedule, field, odds, in-play) + ESPN hole-by-hole / bios |
| Hosting   | [Lovable](https://lovable.dev) (don’t force-push rewritten history on the synced branch) |

Scoring math lives in [`src/lib/scoring.ts`](src/lib/scoring.ts) and the Edge Functions (Deno TS). Schema types are generated in [`src/integrations/supabase/types.ts`](src/integrations/supabase/types.ts).

**Supabase in brief:** Google OAuth; RLS so members see league data and lineups lock after tee; Realtime on lineups / results / standings; Edge Functions `sync-odds`, `sync-results`, `finalize-event`, `enrich-golfer-bio`; `DATAGOLF_API_KEY` as a function secret only.

**DataGolf (Scratch Plus):** schedule, field/tee times, outrights odds, pre-tournament preds + rankings (hybrid salaries), in-play scores. Headshots come from the PGA Tour Cloudinary CDN (`player_num`). ESPN supplies hole-by-hole tallies for DK bonuses and season form.

---

## Capabilities

- **Salary-cap draft** — 6 golfers under a league cap (default $50k). Hybrid salaries blend market odds with DataGolf course-win / form / rank (~$6.5k–$11k band).
- **Live DK Classic scoring** — hole points, live place bonuses, streaks / bogey-free / hole-in-one; bonus breakdown on lineup tooltips. Scores refresh on sign-in, pull-to-refresh, or from an in-progress lineup; boards update over Realtime.
- **Harry’s Big Hole** — one random hole per round at **3×** hole scoring, with a one-shot reveal and carousel on the league board.
- **Event + season boards** — live standings, day-leader / cellar banners, made-cut counts after the weekend, Signature 1.5× / Major 2× season multipliers. Auto-finalize when PGA results are official.
- **Event recap** — podium, money-hole history, and ownership callouts after the event is done.
- **League life** — invite codes, settings / kick, lock reminders, empty-lineup DNQ handling, profile (display name + avatar).
- **Player intel** — Wikipedia bios + ESPN season form in golfer popovers.
- **Nickname de Sarge** — optional tour-pro nicknames on draft, lineups, highlights, and ownership (no scoring impact).
- **Public rules** — [`/how-it-works`](src/routes/how-it-works.tsx) scoring guide. Admin **Sync Odds / Results** for DataGolf ops.

---

## Local setup

### Prerequisites

- **Node.js 22+**
- npm
- A Supabase project (this repo is typically linked to the hosted WinSeeking project)
- Optional: [Supabase CLI](https://supabase.com/docs/guides/cli) for migrations / function deploy
- Optional: DataGolf API key for odds/results sync

### 1. Install

```bash
cd winseeking
npm install
```

### 2. Environment

Create `.env` (gitignored) with your Supabase project values:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_or_publishable_key
```

Optional local-only secrets in `.env.local`:

```bash
DATAGOLF_API_KEY=your_datagolf_key
```

Never commit `.env` / `.env.local`. See [`.gitignore`](.gitignore).

### 3. Auth redirect for localhost

In Supabase Dashboard → **Authentication → URL Configuration**, add redirect URLs:

- `http://localhost:8080/**`
- `http://localhost:8080/auth`

Otherwise Google sign-in may bounce to the Lovable Site URL. Details: [`LOCAL_DEV.md`](LOCAL_DEV.md).

### 4. Run the app

```bash
npm run dev
```

Open **[http://localhost:8080](http://localhost:8080)**.

### 5. Database & functions (admins)

```bash
# Apply migrations to the linked project
supabase db push

# Set DataGolf secret + deploy sync functions
supabase secrets set DATAGOLF_API_KEY=your_key_here
supabase functions deploy sync-odds
supabase functions deploy sync-results
supabase functions deploy finalize-event
supabase functions deploy enrich-golfer-bio
```

More detail: [`supabase/FUNCTIONS.md`](supabase/FUNCTIONS.md).

### 6. Make yourself an admin

In the SQL editor (or CLI):

```sql
UPDATE public.profiles SET is_admin = true WHERE id = auth.uid();
-- or by email via auth.users join
```

Then open `/admin` → **Sync Tournament Odds**.

---

## How play works

1. **Create / join a league** (invite code, $50k / 6 golfers by default).
2. **Draft** a lineup before `lineup_lock_at` (first tee / Thursday). Over-budget adds are blocked.
3. **Event leaderboard** ranks lineup fantasy points over Realtime, with Harry’s Big Hole, day leaders, and made-cut counts.
4. **Lineup viewer** shows the live per-golfer breakdown (including DK bonuses) and lets members refresh DataGolf during an event.
5. When the PGA event is official, **Sync Results** auto-finalizes: season points from league finish × event multiplier, then the **event recap** covers podium, money holes, and ownership. Manual **Finalize Event** is a fallback.

Player-facing rules: [`/how-it-works`](src/routes/how-it-works.tsx). Scoring constants: [`src/lib/scoring.ts`](src/lib/scoring.ts).

---

## Project map

```
src/
  routes/           # TanStack file routes (league, draft, lineup, recap, admin, how-it-works)
  components/       # App chrome, shadcn/ui, Harry’s Big Hole, ownership chips
  lib/              # Scoring, ownership, nicknames, live refresh
  integrations/supabase/
supabase/
  migrations/       # Schema, RLS, triggers
  functions/        # sync-odds, sync-results, finalize-event, enrich-golfer-bio
  FUNCTIONS.md      # Ops for DataGolf + deploys
```

---

## Scripts

| Command           | Description                     |
| ----------------- | ------------------------------- |
| `npm run dev`     | Vite dev server (port **8080**) |
| `npm run build`   | Production build                |
| `npm run preview` | Preview production build        |
| `npm run lint`    | ESLint                          |
| `npm run format`  | Prettier                        |

---

## Notes

- **Hosting:** see [`HOSTING.md`](HOSTING.md) for Lovable Free-plan limits, production redirects, live refresh behavior, and Cloudflare deployment.
- **Friend beta:** follow [`FRIEND_BETA.md`](FRIEND_BETA.md) (OAuth allowlist, security migration, DataGolf ops, dry-run before invites).
- **Sync performance:** `sync-results` scores DK Classic in the Edge Function, fetches DataGolf in-play + ESPN hole-by-hole in parallel, and rolls up lineups in memory (~2–3s for a full field).
- **Demo seed:** [`supabase/seed_weekend_golfers_demo.sql`](supabase/seed_weekend_golfers_demo.sql) — **do not** re-run on shared prod during friend beta.
- Prefer not rewriting published git history on the Lovable-connected branch (no force-push / rebase of shared commits).
