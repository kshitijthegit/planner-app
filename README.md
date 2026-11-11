# Planner

KJ's personal planner: calendar, tasks, reminders, morning digest and evening shutdown.
An installable PWA (Android + Windows) on Cloudflare Workers with D1 storage.

## Stack

| Part | Tech |
|---|---|
| App | React 18 + TypeScript + Vite, installable PWA (`public/manifest.webmanifest`, `public/sw.js`) |
| API + cron | One Cloudflare Worker (`worker/`) that serves `/api/*` and static assets |
| DB | Cloudflare D1 (`planner-db`). Schema migrates itself on first request (`worker/lib/schema.ts`) |
| Calendars | Google Calendar API (read-only), ICS feeds (Outlook publish link) via `ical.js` |
| Push | Web Push. VAPID keys are auto-generated and stored in D1 |
| Cron | Every 5 min: calendar sync (every 30 min), reminders, 08:00 digest, 21:30 shutdown |

## Features since v1

- Subtasks up to 2 levels deep (task → subtask → sub-subtask), each with its own deadline.
- **Linked calendars** page (`/calendars`): every Google calendar and ICS feed with its own sync switch. Switching one off removes its events.
- Phthalo & Coffee theme (Playfair Display + Inter Tight).
- Three item types:
  - **Events:** filled blocks in their area colour. All-day events turn the whole day white.
  - **Tasks:** thin blocks with a check. Untimed tasks sit at the top of the day.
  - **Goals:** unfilled blocks at the top of each day they cover, stored in the `goals` table.
- Areas are Personal (espresso), University (mocha) and Work (latte). Calendar filters are per area.
- Adding something is two steps: first pick the area, then fill in the details. Every dropdown can add a new option: area, sub-category, priority level, reminder, duration and repeat (`every:N:day|week|month`).
- The week and day views fit all 24 hours on screen, with no scrolling.
- Migration v2 wiped all calendar data once (Nov 2026). Linked calendars stayed listed, with sync switched off.

## Modules

Both sides are modular. To add a feature:

- **Backend:** add `worker/modules/<id>.ts` exporting a `BackendModule` (`register(router)`, optional `cron`), then list it in `worker/modules/index.ts`.
- **Frontend:** add `src/modules/<id>/`, then add an entry to `src/modules/registry.ts`. Mark it `toggleable: true` to get an on/off switch in Settings → Modules.
- **DB:** append a migration to `MIGRATIONS` in `worker/lib/schema.ts`. Never edit existing ones.

## Deploy (Cloudflare)

1. In Cloudflare, go to **Workers & Pages → Create → Import a repository**, pick `kshitijthegit/planner-app`, and set:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
2. In **Worker → Settings → Variables and Secrets**, add these as **Secret** type:
   - `GOOGLE_CLIENT_SECRET`: from Google Cloud → Clients → planner-web
   - `ALLOWED_EMAIL`: the only Google account allowed to sign in
3. Open https://planner-app.plannerkj.workers.dev and sign in with Google.

Every push to `main` redeploys.

## Local dev

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in secret + email
npm run build && npm run dev:worker   # http://localhost:8787 (API + built app)
npm run dev                            # optional: Vite hot reload on :5173, proxies /api
npm test && npm run typecheck
```

## Known limits

- Calendar sync is read-only, by design.
- Synced events refresh every 30 min, or on "Sync now" in Settings.
- On Android, push notifications can arrive a few minutes late when the phone is in battery saver or Doze mode.
- Workers free plan: 100k requests a day, 10 ms CPU per request. Very large ICS feeds could hit the CPU limit; if sync errors mention CPU, the $5/mo Workers Paid plan fixes it.
