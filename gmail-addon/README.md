# Planner — Gmail add-on

Adds an **Add to Planner** panel beside any email in Gmail on the web and in the Gmail Android app.
It reads only the email you have open, when you open the panel. It guesses the title, date, time and
place, then lets you check them, pick Event or Task and an area, and add it. The item's notes
link back to the email.

The add-on uses a personal **access key**. That key can only list your areas and add new events and
tasks. It can't read or change anything else.

## Setup (about 5 minutes, once)

1. **Make a key in the planner.** Go to Settings → Gmail add-on → **Make access key**, then copy it.
   It's shown only once.
2. **Create the script.** Go to https://script.google.com, signed in as the Gmail account you'll use,
   and click **New project**. Name it `Planner`.
3. **Add the files.**
   - Replace `Code.gs` with this folder's `Code.gs`.
   - Click **+ → Script**, name it `Parse`, and paste in `Parse.gs`.
   - Click ⚙ **Project Settings**, tick **Show "appsscript.json" manifest file in editor**, then go
     back to the editor and replace `appsscript.json` with this folder's copy.
   - Click 💾 **Save**.
4. **Install it.** Click **Deploy → Test deployments**. Choose **Google Workspace Add-on** if it asks,
   click **Install**, then **Done**.
5. **Connect it.** Open Gmail (refresh the page) and click the **Planner** icon in the right-hand side
   panel. Paste the key and click **Save**. It should say "Connected ✓".
   - The first time, Google shows an "unverified app" screen. That's because the script is your own.
     Click **Advanced → Go to Planner** and allow it.
6. **On Android:** open any email in the Gmail app and scroll to the bottom. The Planner add-on appears
   there, and it uses the same settings.

## Use

Open an email, then open the Planner panel. Check the details it filled in, and set the time or tick
**All day / no time**. Then click **Add to Planner**.

## Notes

- Dates are read day-first (12/11/2026 = 12 Nov). A written date ("5 December") wins over words like
  "Saturday" or "tomorrow".
- If the planner moves to a new address, such as a custom domain, update the **Planner address** in
  the add-on's settings, and the `urlFetchWhitelist` line in `appsscript.json`, then save.
- New key: making a new key in Settings stops the old one. Paste the new key into the add-on's
  settings (⋮ → Planner settings).
- Code changes: paste the new files into the same script project. The test deployment always runs the
  latest saved code.
