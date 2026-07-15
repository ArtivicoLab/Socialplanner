# Social Planner

A static, phone-first PWA version of the "ultimate Social Media Planner"
spreadsheet category sold on Etsy. The app is the interface; the user's own
**Google Sheet is the database**. Runs fully offline on-device (IndexedDB) and
optionally syncs to Google Sheets (`drive.file` scope only — the app can only
touch the sheet it creates).

Built on the same chassis as its siblings: TrackerA (Life Planner) and
TrackerB (Ultimate Budget).

## Modules
- **Dashboard** — greeting, stat tiles (total / published / avg per day /
  today), today's posts, content mix charts, publishing progress, performance
  teaser.
- **Content Scheduler** — the heart. Every post: date, time, content pillar,
  format (Post/Reel/Story/Carousel/Video), goal, idea, status (Not Started /
  In Progress / Draft Ready / Scheduled / Published), hook, caption, CTA,
  hashtag group + extras, platforms (up to 8), cover swatch, notes. One-tap
  copy of the combined post text.
- **Content Calendar** — rolling 6-week grid, today highlighted, highlight
  dates (Pay Day / Launch Day…), tap through to the scheduler.
- **Monthly Plan** — 12-month visual plan: day-by-day post cards, post
  distribution per platform, published progress ring.
- **Feed Preview** — pick a platform + cutoff date, see the planned feed as a
  3-column grid mockup.
- **Hashtag Manager** — named tag groups; picking a group on a post auto-fills
  its tags; copy a whole group in one tap.
- **Idea Bank** — park content ideas with pillar + format; promote one to a
  scheduled post when its moment comes.
- **Performance Tracker** — per-platform monthly followers / engagement rate /
  reach with goals, trend charts, and YTD progress.

## Run it
```
npm install
npm run dev     # http://localhost:5512  (fixed port — matches the OAuth origin)
npm test        # vitest (pure logic)
npm run build   # static output in dist/
```

## Google Sheets sync (owner setup)
1. In Google Cloud Console create an OAuth **Web** client; add authorized
   JavaScript origins: `http://localhost:5512` and the production origin.
2. `cp .env.example .env` and set `VITE_GOOGLE_CLIENT_ID=…`.
3. In the app: Settings → Connect Google. First connect creates a spreadsheet
   named **"Social Planner Data (app-managed)"** in the user's Drive and
   pushes local data up. After that, edits sync automatically (debounced) and
   `Pull` brings changes down on another device.

## Demo mode
A fresh visitor sees memory-only sample data (a rolling 10-week content plan,
hashtag groups, 12 months of performance) so the app looks alive. Nothing from
the demo is ever written to IndexedDB or a Google Sheet. Buyers activate with
their Etsy access code in Settings, which switches to their own (blank) data.

## House rules
See `CLAUDE.md` — notably: no emojis in the UI, pure CSS/JS charts (no SVG, no
chart libraries), every chart hover-readable, version stamp always real, and
never auto-commit.
