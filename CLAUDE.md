# Notes for Claude

- Owner: KJ (single user). Primary planner. Dark, minimal UI with a teal accent (`--accent: #93dcc6`); tokens are in `src/styles.css`.
- GUI: Today page = home (Top 3, timeline, quick add, shutdown card). Calendar = day/week/month with a drag-to-time-block task tray.
- Areas → Categories (2 levels) colour every task and event. Synced events get a category per source, overridable per series.
- Calendar sync is read-only (Google + ICS). Work Outlook is out of scope for now.
- Keep everything modular: see README "Modules". Append DB migrations; never edit old ones.
- Never commit secrets. `GOOGLE_CLIENT_SECRET` and `ALLOWED_EMAIL` are Cloudflare secrets. ICS URLs live only in D1, and the API masks them.
- Before pushing: `npm run typecheck && npm test && npm run build`.
- AI layer is planned for v2.
