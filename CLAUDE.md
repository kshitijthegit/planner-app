# Notes for Claude

- Owner: KJ (single user), primary planner. Theme: Phthalo & Coffee, with a phthalo green background, latte accent, paper Top 3 cards, and Playfair Display + Inter Tight. Tokens are in `src/styles.css`.
- Subtasks: max 2 levels, enforced in `worker/modules/tasks.ts`; each subtask has its own deadline.
- Linked calendars live at `/calendars` (per-calendar sync switches). Google sync uses `config.calendarIds`, where `[]` means everything is off.
- Project rule: don't edit the codebase unless KJ explicitly asks.
- GUI: Today page = home (Top 3, timeline, quick add, shutdown card). Calendar = day/week/month with a drag-to-time-block task tray.
- Areas → Categories (2 levels) colour every task and event. Synced events get a category per source, overridable per series.
- Calendar sync is read-only (Google + ICS). Work Outlook is out of scope for now.
- Keep everything modular: see README "Modules". Append DB migrations; never edit old ones.
- Never commit secrets. `GOOGLE_CLIENT_SECRET` and `ALLOWED_EMAIL` are Cloudflare secrets. ICS URLs live only in D1, and the API masks them.
- Before pushing: `npm run typecheck && npm test && npm run build`.
- AI layer is planned for v2.
