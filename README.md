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
