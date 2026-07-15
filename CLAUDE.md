# CLAUDE.md — Social Planner

Guidance for any AI agent (or human) working in this repo. Read this first.

## Git — never auto-commit or push
Do not run `git commit`, `git push`, or `git add` toward a commit unless the
user explicitly asks for it **in that same turn**. This repo is routinely
edited by more than one agent session at once — an unprompted commit can
silently sweep up and push another session's in-progress, unreviewed changes
together with yours. GitHub Pages deploys straight from `main` (see
`.github/workflows/deploy.yml`), so an unwanted commit can also mean an
unwanted production deploy. Build, typecheck, and test freely; leave the
working tree uncommitted for the user to review and push themselves. Being
asked to commit once does not carry over to later turns — ask again each time.

**CONFIRMED, 2026-07-15: a push landing mid-agent-edit shipped a broken
build — exactly the risk above, materialized.** An agent was mid-way through
a multi-step rename in `src/lib/access.ts` (`BASE_LOCK_MS` →
`FIRST_LOCK_MS`/`HOUR_MS`) — one edit had already renamed the constant
declarations, a second edit (renaming the function body that used it) hadn't
landed yet. A commit+push happened in that exact narrow window, shipping a
file that was internally inconsistent. GitHub Actions' `build` job caught it
immediately and correctly (`tsc -b` failing with `Cannot find name
'BASE_LOCK_MS'`, `deploy` never even ran) — the CI pipeline did exactly its
job here, this was not a pipeline bug, and without a typecheck step this
class of mistake would have shipped silently broken JS instead of failing
loudly with an exact file/line. **The fix was never to debug `deploy.yml` or
Pages settings** (see "Deploy" below — a DIFFERENT failure mode that can look
similar from a "run failed" email alone) — it was to notice the on-disk
working tree already had the finished, consistent edit (`git status` still
showed the file as "modified" against the broken commit), re-verify it
locally (`tsc --noEmit` + `npm run build` + tests, all clean), and commit+push
that as a new commit superseding the broken one. **General rule: if a deploy
fails on a build/typecheck error right after a multi-step edit was in
progress, check the current working tree against the broken commit before
assuming the logic itself is wrong** — the fix might just be "finish
committing what's already correct on disk," not a code change. Also: run
`tsc --noEmit` immediately before `git commit`, not just after finishing an
edit — it's the cheapest way to catch an accidentally-mid-edit snapshot
before it ships, rather than waiting for CI to catch it several minutes
later. Same underlying risk applies to TrackerA and TrackerB — same fix if it
recurs there.

## Deploy — GitHub Pages needs a one-time manual enable
`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every
push to `main`. A **brand-new repo's very first run still fails** even though
the build job is completely fine — the deploy job errors `Failed to create
deployment (status: 404)... Ensure GitHub Pages has been enabled`. This isn't
a workflow bug, and the file's own built-in deploy retry (the "Wait before
retry" step, added for GitHub's occasional transient "try again later" from
`deploy-pages`) doesn't help here — a 404 because Pages isn't enabled yet
isn't transient, it fails the retry identically. GitHub Pages has to be
switched on once, by hand, in the repo's own Settings before
`actions/deploy-pages` has anywhere to deploy TO: a fresh repo has Pages off
by default, and nothing in the workflow file can flip that setting for
itself — it's repo-level, not CI-level. **Fix (one-time, per repo):**
Settings → Pages → Source → **GitHub Actions** (not "Deploy from a branch").
Confirmed 2026-07-15: once that's set, the exact same workflow file succeeds
on the next push with zero code or YAML changes. If this 404 is the only
error shown, don't go debugging `deploy.yml` itself — it means "Pages isn't
enabled yet," nothing more. (A same-run "Node.js 20 is deprecated... forced
to run on Node.js 24" warning from `actions/setup-node` is unrelated noise,
not a failure cause — safe to ignore.)

## Version control — always keep the version number real and visible
The app must always show a version number that actually reflects what's
deployed — no hardcoded placeholder strings, ever (a past bug had the Settings
footer hardcoded to a static `"v1.0"` that never changed).
- Version comes from `src/lib/config.ts`: `APP_VERSION` (from `package.json`'s
  `version` field, baked in via `__APP_VERSION__` in `vite.config.ts`) and
  `BUILD_SHA` (CI's `VITE_COMMIT_SHA` when set, else the local git HEAD via
  `__LOCAL_COMMIT_SHA__` in `vite.config.ts`).
- It's displayed in three places, all must stay wired to the real values:
  Settings screen footer, desktop `Sidebar.tsx` footer, and `PrivacyScreen.tsx`.
  If you add another place the version could show, pull from `config.ts` —
  never hardcode a version string anywhere.
- `.github/workflows/deploy.yml` auto-bumps the patch version to that run's
  `$GITHUB_RUN_NUMBER` before building (ephemeral, not committed back) — don't
  remove that step.
- `main.tsx` actively checks the service worker for updates on
  `visibilitychange` and auto-reloads on `controllerchange`. Keep this if you
  touch `sw.js` or the SW registration. Settings has a manual "Check for
  updates" button — keep it working.

## What this is
A **static, phone-first PWA** — a **"Social Media Planner"** for content
creators sold on Etsy (reference: HeyMorning "the ultimate Social Media
Planner" spreadsheet). It is the *interface*; the user's own **Google Sheet is
the database**. Runs fully offline on-device (IndexedDB) and optionally syncs
to Google Sheets.

This is a **content-only** app, built on the same chassis as TrackerA
(Life Planner) and TrackerB (Ultimate Budget). **Modules:** Dashboard, Content
Scheduler (the heart — posts with pillar/format/goal/status/hook/caption/CTA/
hashtags/platforms), Content Calendar (6-week grid + highlight dates), Monthly
Plan (12-month visual), Feed Preview by platform, Hashtag Manager, Content
Idea Bank, Performance Tracker (per-platform monthly followers/engagement/
reach vs goals), Settings.

## THE DATABASE IS THE USER'S GOOGLE SHEET — nothing else (must connect)
This is the product, not a nice-to-have. There is **no backend and no other
database**. The user's **Google Sheet is the single source of truth**;
IndexedDB is only an **offline cache** in front of it. Any persisted field
must roundtrip through `schema.ts` to a Sheet column, or it does not really
exist.

To actually connect (owner-only step — needs a real Google OAuth **Web**
client ID from Google Cloud Console; an AI agent cannot mint one):
1. Create the OAuth client, add authorized origins (`http://localhost:5512`
   for dev), copy the client ID.
2. `cp .env.example .env` and set `VITE_GOOGLE_CLIENT_ID=…`.
3. Ensure `LOCAL_MODE = false` in `config.ts`, restart dev/build.
4. In-app: Settings → Connect Google → sync creates the sheet + pushes local
   data.
Check the ACTUAL connection state in code (`isConnected()` in `lib/sync.ts`
reads the stored spreadsheet id) before claiming the app is connected or not.

**Product principles (do not violate):**
1. No backend of ours — static hosting only. No server code.
2. User data lives in the user's Google Drive via Sheets API (`drive.file`
   scope only).
3. Offline-first: everything works from the IndexedDB cache; sync when online.
4. Phone-first, designed at 390px — **but dashboard-first**, so desktop
   (≥900px, sidebar layout) must also look great.
5. Friendly, low-anxiety creator UX: progress rings, low-friction capture,
   gentle language (never shame a missed posting day), no notification
   firehose.
6. **Zero friction for buyers:** opens straight to the Dashboard (no
   onboarding gate); demo mode auto-shows memory-only sample data on first
   visit so it looks alive (see `lib/demo.ts` + `stores/bootstrap.ts` — the
   sample NEVER touches IndexedDB or the Sheet).

## Access-code gate — soft by design, now throttled (know the real ceiling)
`src/lib/access.ts`'s Etsy product-code check (`isValidAccessCode`) is a plain
array comparison against a list baked into the client bundle at build time
from `VITE_ACCESS_CODES` — there's no backend to check it against (see "no
backend of ours" above), so it was never real license enforcement, only a
soft gate to keep casual visitors on demo data and point genuine buyers at
Connect. **Flagged 2026-07-15: it had zero brute-force protection** —
`isValidAccessCode()` is a synchronous local function with no network
round-trip, so anyone with devtools open could call it directly, unlimited
times, instantly. Added `tryUnlock()` (same file) as an honest, not
bulletproof, speed bump: an escalating lockout after wrong guesses made
through the real UI — attempts 1-5 free (real buyers mistype), attempt 6 a
flat 30s, then attempt 7 on a much harder exponential wall in HOURS (1h, 2h,
4h, 8h, 16h...) capped at 24h so a genuine buyer isn't locked out for good —
persisted to BOTH `localStorage` and IndexedDB's `kv` store (`db.ts`) so a
plain refresh, or clearing just one of the two, doesn't hand back a free
reset — whichever storage shows the more restrictive state wins, and both are
re-synced to match on every check. `SettingsScreen.tsx`'s product-code form
now goes through `tryUnlock()`, never `isValidAccessCode()` directly.
**This does not, and architecturally cannot, make the codes brute-force-proof
from a static site.** Two ceilings, both inherent to "no backend," not bugs
to "fix" later: (1) the valid codes still ship in the client bundle in plain
text — anyone can read `ACCESS_CODES` straight out of the built JS with zero
guessing, which undersells "brute force" as the real risk; hashing them at
build time would stop that specific read but not a script that calls
`tryUnlock()`/`isValidAccessCode()` directly from the console, bypassing the
UI (and therefore the localStorage/IndexedDB lockout) entirely. (2) Any
client-only lockout is inherently clearable by clearing all site data or
opening a private window — there's no server to own the rate limit against.
If real license enforcement ever matters more than it does today, that needs
an actual backend endpoint to check codes against, which is a deliberate
architecture change, not a patch to this file — don't reach for it without
discussing the trade-off first, since it contradicts the static-hosting-only
principle above. Ported identically to TrackerA and TrackerB the same day —
see their own CLAUDE.md for their (identical logic, different localStorage
key prefix) copies.

## Owner preferences (learned — honor these)
- **Audience is ~99% women** — design for her. Theme is a clean white/black
  chrome carrying ONE deliberate brand accent: the TikTok/YouTube red-pink
  family, with a deep TikTok cyan-teal as `--accent-2` (secondary highlight,
  chart/duotone contrast — a callback to TikTok's cyan+red "glitch" mark, see
  the tabbar create button's split-color halves). Backgrounds/surfaces are
  true white/near-black, not warm tan. This is deliberate: TrackerC plans
  content FOR these platforms, so the palette should read as theirs, not as
  an unrelated invented aesthetic — confirmed 2026-07-15 after a same-session
  detour into a "nail polish"-themed retheme ("Milky Nude") was tried, shipped,
  and then explicitly reverted by the owner for exactly this reason (see
  `tokens.css`'s top comment, which is the palette's source of truth). Elegant
  and airy, not girly-pink. There's also a 4th, explicitly opt-in theme,
  "Gallery" (`data-theme="gallery"`, picked in Settings → Appearance) — an
  experimental art-inspired dark theme (deep pine green, burnt terracotta,
  cream) built from a reference oil painting. It's additive, off by default,
  and wasn't part of the revert — the TikTok/YouTube palette above is the
  real default product theme.
- **No decorative or hard-to-read fonts.** Inter/system sans everywhere.
- **No emojis in the UI.** Icons only (lucide-react via
  `src/components/icons.tsx`). The Etsy spreadsheet uses emoji statuses — we
  deliberately use colored status chips instead.
- **No em/en dashes as sentence connectors in UI copy** — use colons or
  periods instead.
- **Charts must be CSS/JS, not SVG and not a chart library.** Rings/donuts use
  CSS `conic-gradient`; bars/columns are flex divs. See
  `src/components/{ProgressRing,Charts}.tsx`. (recharts is in package.json but
  intentionally NOT imported — do not add it.)
- **Every chart must have a stock-chart-style hover readout** via the shared
  `ChartTip` (`Charts.tsx`) — crosshair + tracking dot on lines, value bubble
  on bars/donuts. Native `title` tooltips are NOT acceptable. Never ship a
  chart whose numbers can't be read on hover; pass a `formatValue`.
- **Never use the native `window.confirm()`/`window.alert()`.** They render as the
  browser's raw unstyled system popup — on an installed PWA that looks like the app
  is broken, and it can't be themed for dark mode or match the rest of the UI. This
  is a live bug here today (`confirm()`/`window.confirm()` in SettingsScreen,
  CalendarScreen, PostSheet, HashtagsScreen) — same root cause caught in TrackerA.
  Build a `confirmDialog({ title, message, confirmLabel?, danger? })` helper (a
  zustand store returning a `Promise<boolean>`) rendered through the existing
  `BottomSheet` via a `ConfirmHost` mounted once in `App.tsx` — same call shape as
  `confirm()`, just `await` it. For non-blocking confirmations, use a toast, not
  `alert()`.

## Tech stack (fixed — do not substitute)
- Vite + React 18 + TypeScript, SPA, hash router (no react-router), static files.
- Hand-written CSS with design tokens (`src/styles/tokens.css`); base styles in
  `base.css`, per-feature styles in `src/styles/features/*.css` (imported by
  their screen component). No Tailwind, no UI kit.
- **Zustand** for state (one store per domain). **date-fns** via
  `src/lib/dates.ts` only. **idb** for IndexedDB. **lucide-react** for icons.
- Google: raw REST + Google Identity Services (no gapi client).
- Vitest for pure logic (schema, merge, tombstones, postStats).

## Architecture map
```
src/
  lib/
    types.ts        domain types: Post, HashtagGroup, Idea, Platform,
                    PerfEntry, Highlight, Settings + combinedPostText()
    schema.ts       SINGLE SOURCE OF TRUTH for Sheet tabs/columns + row
                    (de)serializers (platform list packs into one "|" cell)
    dates.ts        ALL date math (plain ISO yyyy-mm-dd; times are "HH:mm")
    postStats.ts    pure plan math: planStats, countByPillar/Platform,
                    postsByDay, feedPosts
    db.ts           IndexedDB (one store per collection) + demo write-gate
    sync.ts         Sheets pull/push (dirty-tab tracking, tombstones, merge)
    merge.ts / tombstones.ts / syncDirty.ts   cross-device merge machinery
    google/         auth.ts (GIS, drive.file), sheets.ts (REST wrapper)
    ui.ts           pillar colors, post status/format labels+colors, compact()
    sample.ts       deterministic memory-only demo seed (see bootstrap)
    demo.ts         localStorage demo flag + zustand mirror
    config.ts       APP_NAME/DB_NAME/DB_VERSION/APP_VERSION/BUILD_SHA
  stores/           v2.ts (usePosts/useHashtagGroups/useIdeas/usePlatforms/
                    usePerformance/useHighlights via crud.ts factory),
                    useSettings, useSync, useInstall, bootstrap.ts
  components/       Charts, ProgressRing, BottomSheet, Chip, Segmented,
                    Checkbox, EmptyState, CountUp, TabBar, Sidebar, Header,
                    CoachTour, DemoBanner, UpdatePrompt, icons.tsx
  features/<module>/ one folder per screen (dashboard, scheduler, calendar,
                    monthly, feed, hashtags, ideas, performance, more,
                    privacy, settings)
  nav.tsx           SINGLE nav config consumed by Sidebar + More hub + TabBar
  router.ts         tiny hash router (Route union lists every route)
  App.tsx           shell: Sidebar (desktop) + Header + <main> + TabBar
tests/              schema / merge / tombstones (+ any new pure-logic tests)
```

## Google Sheet as database
- `schema.ts` defines every tab + column order. Row 1 is an app-written header.
- Tabs: Posts, HashtagGroups, Ideas, Platforms, Performance, Highlights,
  Tombstones, Meta (key/value; carries the Etsy access code, and — as of
  2026-07-15 — `name`/`weekStart`/`categories`/`categoryColors`/`goals`,
  gated by a `settingsUpdatedAt` key so pull() can last-write-wins them the
  same way every row-based tab already merges by `updatedAt`; see
  `lib/sync.ts`'s `pushSettingsMeta`/`applySettingsMeta`. Everything else in
  `Settings` — theme, hiddenRoutes, tabBarRoutes, onboarding flags — stays
  local-device-only on purpose, not synced).
- Records keyed by `id` (col A, nanoid) — NEVER by row position. Tolerate
  extra user columns, reordered/blank rows.
- Sync: pull = batchGet all tabs → row-granular merge by `updatedAt` +
  tombstone deletes → IndexedDB + stores. Push = per-collection dirty full-tab
  overwrite, debounced 2s after any mutation. `connect()` creates the sheet +
  pushes local data on first link. Demo data can never push (guarded).
- **FIXED 2026-07-15 (was: confirmed 2026-07-13, not fixed):** `disconnect()`
  (`sync.ts`) used to do `localStorage.removeItem(LS_ID)`, deleting the remembered
  spreadsheet id outright — the next `connect()` found no "existing" id and created a
  BRAND NEW spreadsheet instead of relinking (confirmed on TrackerA via Cloud Console API
  metrics showing 4 `CreateSpreadsheet` calls from one test account's repeated
  disconnect/reconnect, scattering that account's data across several sheets). Fixed by
  porting TrackerA's pattern verbatim: `disconnect()` now only sets a separate opt-OUT flag
  (`LS_DISCONNECTED`, its ABSENCE means connected) via a new `markDisconnected()`; `LS_ID`
  is never removed. `connect()`/`relink()` clear the flag via `setSpreadsheetId()`.
- **FIXED 2026-07-15 (was: confirmed 2026-07-13, not fixed):** `authedFetch` in
  `src/lib/google/sheets.ts` used to fall back to an INTERACTIVE (popup) Google token
  request whenever a silent refresh failed, with no regard for whether the call was inside
  a real user click or a background timer — the debounced background push could try to pop
  a Google sign-in with no user gesture behind it, browsers block that silently, and the
  Promise hung forever with no error. Fixed by threading a required `allowInteractive`
  param (no default — every caller must decide) through `authedFetch`/`createSpreadsheet`/
  `getMeta`/`ensureTabs`/`batchGet`/`writeTab`, all the way up through `sync.ts`'s
  `pushAll`/`pull`/`readMetaTab`/`writeMetaKey`/`syncAccessCode`/`connect`/`relink`, and
  `useSync.ts`'s `syncNow`. The debounced flush (`scheduleFlush`) and the `online` event
  listener both now explicitly pass `false`; `connect()`/`relink()`/Settings' "Sync now"
  pass `true`. A background call that hits a dead silent refresh now throws a typed
  `ReauthRequiredError` (new, exported from `sheets.ts`/re-exported from `sync.ts`) instead
  of hanging — **no UI for this yet** (no "tap to reconnect" affordance built), so a
  background reauth failure currently just surfaces as `status: "offline"` with no
  recovery path besides the existing "Sync now" button retrying with a fresh interactive
  token. Building the reauth UI (banner, needsReauth state) is still open — see the
  "missing entire subsystem" item further down.
- **FIXED 2026-07-15 (was: confirmed missing 2026-07-13):** neither `authedFetch`'s raw
  `fetch()` call nor `requestToken()` in `auth.ts` had any timeout — a dropped connection,
  unresponsive server, or a silent GIS callback that never fires (real, happens under
  strict third-party cookie blocking) could hang the sync pill on "Syncing…" forever with
  nothing to catch it. Fixed by porting TrackerA's `AbortController`/`FETCH_TIMEOUT_MS`
  (20s, in `sheets.ts`) and `SILENT_TOKEN_TIMEOUT_MS`/`INTERACTIVE_TOKEN_TIMEOUT_MS`
  (10s/100s, in `auth.ts` — 100s not TrackerA's original 45s: a real TrackerA attempt
  legitimately ran past 45s while carefully reading Google's "unverified app" warning and
  still completed successfully, so 45s was tightened to punish exactly the careful
  behavior that warning asks for).
- **ADDED 2026-07-15 — "start a new sheet" + wrong-account recovery, ported from TrackerA
  (the only one of the three trackers that had this; TrackerB doesn't either).** Before this,
  an already-connected user had no way to abandon their current sheet and link a fresh one
  except by accident via a permission error, and a `SheetPermissionDeniedError` from
  `connect()` (the signed-in Google account doesn't own the remembered sheet — wrong account
  picked, or a genuine switch) surfaced as a raw, un-actionable error string with no recovery
  path. `connect()`'s error handling already propagated `SheetPermissionDeniedError` distinctly
  from `SheetNotFoundError` (see below) — only the UI/state layer on top was missing. Added,
  matching TrackerA's shape exactly: `LS_PREVIOUS_ID` (`sp.previousSpreadsheetId`),
  `abandonRememberedSheet()`/`getPreviousSpreadsheetId()`, and `createNewSheet()` in
  `sync.ts` — the latter gets a fresh token and creates the new sheet FIRST, only abandoning
  the old one once the new one is confirmed reachable (same ordering TrackerA's own doc
  comment explains: abandoning first, then failing to create the new one, would leave a user
  silently disconnected from everything). `useSync.ts` gained `wrongAccount`/
  `previousSpreadsheetId` state and `useThisAccountInstead()`/`startNewSheet()` actions.
  `SettingsScreen.tsx` gained a wrong-account recovery card (in place of the raw error string),
  a "previously connected sheet" link when one was abandoned, and a "Start a new sheet" button
  in the Danger Zone (via `confirmDialog`, not `window.confirm()` — see Owner preferences).
  Deliberately did NOT port TrackerA's `LockGatedButton` two-latch friction UI for this button —
  a single `confirmDialog` matches the friction level TrackerC's own "Start over" danger button
  already uses; that's a separate UI-polish feature, not part of this ask. **Also found and
  fixed while auditing this — a rule worth stating explicitly since it wasn't written down
  anywhere in this file before:** the spreadsheet the app creates should always be titled
  exactly the app's own brand name, no suffix — a generic title like
  "Social Planner Data (app-managed)" (what `SPREADSHEET_TITLE` in `schema.ts` actually was)
  reads as a mismatch to a buyer who expects to find a file called exactly what the app is
  called in their Drive. TrackerA had the identical bug and already fixed it to just
  `"Life Planner"`; TrackerC's is now just `"Social Planner"`. **TrackerB has this exact same
  title-mismatch bug too (`"Budget Planner Data (app-managed)"`), not yet fixed there** —
  flagged, not fixed, since it wasn't part of what was asked this time.
- **STILL OPEN, not yet fixed:** `auth.ts` uses one shared `let state` token slot for
  BOTH Sheets and Calendar scopes — requesting one would silently evict the other. Lower
  urgency than it sounds right now: **TrackerC doesn't actually request `SCOPE_CALENDAR`
  anywhere** (it's declared in `auth.ts` but unused elsewhere in the codebase — no Calendar
  feature is wired up), so this can't currently fire in practice. Port TrackerA's
  scope-keyed `tokenCache: Map<string, TokenState>` before ever wiring up a Calendar
  feature here, not necessarily before that.
- **STILL OPEN, not yet fixed:** the token cache (`let state` in `auth.ts`) is ONLY ever
  in-memory, never persisted to `sessionStorage`. A page reload for any reason (a new
  deploy's service-worker auto-update, a manual refresh, a backgrounded tab getting
  reclaimed) wipes a token that might still have had real time left, forcing a fresh
  sign-in from zero every time — reads as "the connection keeps dying" when it's actually
  the RELOAD discarding a still-valid token, not real expiry (confirmed in TrackerA
  2026-07-13). Port TrackerA's `sessionStorage`-backed persistence
  (`persistToken`/`getCached`/`forgetPersistedToken` in `auth.ts`) — this one's independent
  of the shared-token-slot item above and worth doing regardless of Calendar.
- **RE-VERIFIED 2026-07-15, found LESS SEVERE here than the equivalent TrackerA bug —
  don't blindly port TrackerA's exact fix:** `connect()`'s reconnect-to-an-existing-sheet
  branch calls `pull()` with no push first, same shape as a REAL DATA LOSS bug fixed on
  TrackerA (2026-07-13: `pull()` there unconditionally REPLACED local IndexedDB, so a
  stale reconnect could silently overwrite everything typed while disconnected). TrackerC's
  `pull()` is architecturally different: it does a **row-granular merge by `updatedAt`**
  against CURRENT local state (`mergeById` in `lib/merge.ts`), not a blind replace — a local
  row that's un-pushed still exists in `useX.getState().items` at merge time, wins if it's
  newer, and gets re-marked dirty for the next flush (`if (localContributed) markDirty(...)`
  in the `merge` helper). This already protects against the same class of loss via a
  different mechanism than push-first. Left as-is rather than adding a push-before-pull
  step that isn't clearly needed — but this reasoning hasn't been stress-tested against a
  real two-device conflict scenario, so treat "probably fine" as a hypothesis worth
  revisiting if a real data-loss report ever comes in here, not a closed case.
- **KNOWN LIVE BUG, confirmed 2026-07-14 (dirty-tracking doesn't survive a reload):**
  `DirtyTabs` (`src/lib/syncDirty.ts`) tracks which tabs still need pushing purely in
  memory (`private set = new Set<string>()`), never persisted anywhere. `useSync.ts`'s
  initial `status` (`navigator.onLine ? "synced" : "offline"`) is a blind guess that never
  checks whether anything is actually still pending. A reload at any point before a push
  completes (a manual refresh, or the app's own service-worker auto-update reload) silently
  drops the pending-push flag — the edit stays safe in IndexedDB, but nothing ever retries
  pushing it to the Sheet, while the freshly reloaded page confidently shows "Synced" for
  data that never reached it. Confirmed as real, reported data loss on TrackerA: "when i
  refresh the page it says synced in the left panel but its not synced at all since new
  entry are not sent to the sheet." Fix (already applied in TrackerA, port the same
  pattern): mirror `DirtyTabs`'s set into `localStorage` on every add/clear, hydrate from it
  on construction instead of starting empty, and have `useSync.ts`'s boot path check
  `dirty.size > 0 && isConnected()` to set the initial status accurately and kick a push
  instead of defaulting to "synced." TrackerC's `DirtyTabs` is a well-isolated, already-
  tested class — this is likely the single easiest of these newer bugs to port cleanly.
  See TrackerA's `src/lib/sync.ts` (`LS_DIRTY_TABS`/`loadDirtyTabs`/`persistDirtyTabs`/
  `hasPendingPush`) and `src/stores/useSync.ts`'s boot-time resume effect.
- **KNOWN LIVE BUG, confirmed 2026-07-14 (sync pill contradicts demo mode):** both
  `Header.tsx` and `Sidebar.tsx` destructure `demo` from `useDemo` (already used for the
  "DEMO" brand tag) but never reference it in the sync pill itself — the pill unconditionally
  renders `"Saved"`/`STATUS_LABEL[status]`/`"Saved on device"` even while demo mode is on,
  directly contradicting `DemoBanner`'s own "Nothing here is saved" shown right above it.
  Confirmed live on TrackerA: "i also see saved on device in the demo mode what is going
  on." Fix (already applied in TrackerA, port the same pattern): hide the sync pill entirely
  whenever `demo` is true (`{!demo && (...)}` around the whole pill block in both files) —
  the "DEMO" tag and `DemoBanner` already say it, so a third, differently-worded claim added
  nothing but noise (and on a phone-width header, the longer text visibly wrapped/broke). Do
  NOT just swap in different demo-aware text — TrackerA tried that first and it still read
  as redundant clutter on a narrow screen; hiding the pill outright is the actual fix.
- **MISSING ENTIRE SUBSYSTEM, confirmed 2026-07-14: TrackerC has no reauth/retry
  infrastructure at all, not just an isolated bug.** Unlike the fixes above (each a
  self-contained patch to something that already exists), TrackerC is missing the whole
  concept TrackerA built up over many iterations to handle a lapsed Google token gracefully:
  - No `ReauthRequiredError` type anywhere, and no `needsReauth` state in `useSync.ts` — a
    failed silent token refresh just falls through to `authedFetch`'s interactive-popup
    fallback (the bug documented above) instead of failing fast with a typed error.
  - No retry-with-backoff on push failure at all — `scheduleFlush()` is a single `setTimeout`
    → one `pushAll()` attempt → `.catch(() => onState("offline"))`, nothing retries a
    transient failure (rate limit, a blip) and nothing needs to special-case a reauth
    failure since the concept doesn't exist to retry in the first place.
  - No token-warming / proactive health check whatsoever — zero matches for
    `keepTokenWarm`/`TOKEN_REFRESH_MARGIN`/`tokenTimeLeftMs`, no `setInterval` or
    `visibilitychange` listener in `auth.ts`. This is a bigger gap than TrackerA ever had
    (TrackerA was missing only the boot-time immediate check; TrackerC has none of it).
  - The sync pill is a plain, non-interactive `<span>` in both `Header.tsx` and
    `Sidebar.tsx` — no click handler, nothing for a user to tap even if `needsReauth` did
    exist.
  - No persistent "you need to reconnect" indicator of any kind — `DemoBanner.tsx` already
    establishes the exact right pattern (a slim, always-visible bar with its own action
    button, gated on a store flag, mounted globally in `App.tsx`) to clone for this.
  Porting this properly means building the whole chain, not four independent patches: (1)
  add `ReauthRequiredError` + `allowInteractive` threading (ties into the bug already
  documented above), (2) add `needsReauth` to `useSync.ts` + retry-with-backoff in the push
  flow that returns immediately (no reschedule) on `ReauthRequiredError` specifically, (3)
  add a click handler to the sync pill requesting ONLY `SCOPE_SHEETS` interactively-first
  (TrackerC already has separate `SCOPE_SHEETS`/`SCOPE_CALENDAR` constants in `auth.ts`, so
  scope-narrowing is straightforward — never request the combined scope outside genuine
  first-connect, it triggers Google's heavier "unverified app" consent screen every time),
  (4) add token-warming (interval + visibilitychange + one immediate call at boot), (5)
  clone `ReconnectBanner.tsx` from `DemoBanner.tsx`'s shape. See TrackerA's `src/lib/sync.ts`,
  `src/lib/google/auth.ts`, `src/stores/useSync.ts`, and `src/components/ReconnectBanner.tsx`
  for the full reference implementation — this is genuinely the biggest remaining piece of
  sync work across all three apps, not a quick port.
- **MORE CONFIRMED-LIVE BUGS, from TrackerA's 2026-07-14 full-app QA pass — verified present
  in this repo's current code. TrackerC's `sync.ts` is architecturally simpler/older than
  TrackerA's (no per-tab `dirtyTabs`/`pushInFlight` system found here — consistent with the
  "MISSING ENTIRE SUBSYSTEM" note above), so a couple of these need adapting to this repo's
  shape rather than a verbatim line-for-line port; noted per bullet.**
  - `tabValues()` (`sync.ts:92`) builds what gets pushed from THIS tab/window's in-memory
    Zustand state, not from IndexedDB — confirmed same pattern as TrackerA's pre-fix code. Two
    tabs/windows open on one device (installed PWA icon + a leftover browser tab is normal for
    a no-login-gate app) each hydrate independently and never learn about a sibling's edits;
    whichever pushes LAST clear+overwrites the Sheet tab with its own stale snapshot, silently
    erasing rows a sibling already got onto the Sheet. Fix (already applied in TrackerA, port
    the same underlying idea here): make the push-builder read straight from IndexedDB
    (`db.all(collection)`) instead of the store — IndexedDB is genuinely shared across
    tabs/windows on the same origin. See TrackerA's `src/lib/sync.ts`'s `tabValues()`.
  - `CoachTour.tsx` (confirmed, lines ~235-289) swaps a real (non-demo) user's live stores for
    fake sample data via `loadSampleIntoStores()` without ever flipping `isDemo()` true, so a
    pending/retrying push firing while the tour is open can write sample rows over the real
    Sheet with no dirty flag left to ever self-correct. Fix (already applied in TrackerA): a
    separate, purely in-memory `syncSuspended` flag (`suspendSync()`/`resumeSync()` in
    `sync.ts`), checked alongside `isDemo()` in the push function(s), set/cleared by
    `CoachTour.tsx` at every point it swaps/restores data (including its unmount cleanup —
    React guarantees that always runs). See TrackerA's `src/lib/sync.ts` +
    `src/components/CoachTour.tsx`.
  - Any boot-time "resume a pending push" logic that lives at a store module's own top-level
    scope (rather than being explicitly called AFTER hydration finishes) races ahead of
    `bootstrap()`'s async IndexedDB reads. This repo doesn't appear to have this specific logic
    yet (no `dirtyTabs`/`hasPendingPush` system found) — worth keeping in mind if/when that
    subsystem gets ported per the note above: whatever resumes a pending push must be called
    explicitly at the END of `bootstrap.ts`'s hydration, never at a store module's own
    top-level/import time. See TrackerA's `src/stores/useSync.ts`'s `resumePendingPush()` +
    `src/stores/bootstrap.ts`'s `runBootstrap()` for the reference shape.
  - **RESOLVED 2026-07-15 — checked and it was live here too:** `relink()` did NOT leave demo
    mode before pulling, same bug as TrackerA's pre-fix code. A brand-new device defaults to
    demo mode ON, exactly `relink()`'s target scenario ("a brand-new browser has no remembered
    id"), so the real Sheet data it pulled down showed in the stores for that session only,
    never actually persisted to IndexedDB (gated off while demo mode is on — see `db.ts`'s
    `demoMode` flag), and silently reverted to the in-memory sample on the next reload — while
    the app still reported "Connected" the whole time. Fixed by mirroring `connect()`'s
    existing guard exactly: `relink()` now checks `isDemo()` and calls `setDemoMode(false)`
    before `pull()`. Found while auditing the whole Google-connection surface against TrackerA
    at the user's request, alongside adding `startNewSheet()`/wrong-account handling (see the
    "Google Sheet as database" section's own note on those, added the same day).
- **CONFIRMED PRESENT HERE, same 2026-07-14 QA pass, non-sync bugs:**
  - `src/components/CountUp.tsx:26` and `src/components/ProgressRing.tsx` (confirmed both)
    hardcode animating FROM `0` on every value change, not just initial mount — any small
    update visibly snaps the counter/ring back toward empty before re-animating up, and
    `ProgressRing` is used on nearly every screen with a progress indicator. Fix (already
    applied in TrackerA): track the currently-displayed value in a `ref` and animate FROM that
    ref TO the new target, only seeding it with `0` on initial mount. See TrackerA's
    `src/components/CountUp.tsx`/`ProgressRing.tsx`.
  - `src/components/BottomSheet.tsx:24` (`if (e.key === "Escape") onClose();`, confirmed) binds
    Escape per-instance with no stack awareness — a nested confirm dialog opened on top of an
    already-open edit sheet fires BOTH sheets' `onClose` on one Escape press, silently
    discarding an unsaved edit underneath, and unconditionally unlocks body scroll even while
    the outer sheet is still open. Fix (already applied in TrackerA): a module-level stack of
    open-sheet ids; only the topmost sheet's Escape handler acts, body scroll only unlocks once
    the stack is fully empty. See TrackerA's `src/components/BottomSheet.tsx`.
  - `src/stores/useInstall.ts:16` (`/iphone|ipad|ipod/i.test(ua)`, confirmed) — iPadOS 13+
    Safari's default user agent reports as desktop macOS (no "ipad" substring), so a real iPad
    falls through to wrong, non-functional desktop install guidance. Fix (already applied in
    TrackerA): also check `navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1`
    and classify that case as iOS too.

## Data flow for a mutation
store action → update in-memory state → `db.put(...)` (IndexedDB, no-op in
demo) → `useSync.touch(collection)` → if connected, debounced `pushAll()`;
else flash "Saved".

## Conventions
- Match the surrounding code's style. New screens:
  `features/<name>/<Name>Screen.tsx`, add the `Route` to `router.ts`, an entry
  to `nav.tsx`, a case in `App.tsx`, and a `src/styles/features/<name>.css`
  imported by the screen component.
- New persisted collection: add to `types.ts`, `schema.ts` (TAB + headers +
  serializers), `db.ts` (object store + `ALL_COLLECTIONS`, bump `DB_VERSION`),
  a store in `v2.ts`, `bootstrap.ts` (load + sample), and `sync.ts`
  (COLLECTION_TO_TAB + tabValues + pull).
- Icons: import from `components/icons.tsx`. Pillar colors via
  `categoryColor()`; post status colors via `POST_STATUS_COLOR`.
- Coach tour steps live in `components/CoachTour.tsx` and target
  `data-tour="…"` attributes on real elements.
- **`.btn--stack` (`base.css`) is `margin-bottom: 10px` — put it on the button ABOVE the gap
  you want, never on the button below.** It creates space AFTER itself, not before. Putting
  it on the second/lower button (e.g. a "Delete" button under "Save changes") does nothing
  visible — the two buttons end up touching with no gap (confirmed in TrackerA
  2026-07-13). When stacking two full-width buttons in a `BottomSheet`, the class goes on
  the FIRST button.

## Commands
```
npm install
npm run dev        # dev server (this project runs on port 5512)
npm test           # vitest — keep green before finishing a phase
npm run build      # static output in dist/; gzip budget ≤ 250KB
npx tsc --noEmit   # typecheck (must be clean)
```

## Quality gates before calling a phase done
1. `npm test` green. 2. `tsc --noEmit` clean. 3. `npm run build` succeeds,
initial JS ≤ 250KB gz. 4. No emojis in UI, no SVG/library charts, every chart
hover-readable.

## Status / roadmap
See `TODO.md`. Google Sheets sync code is ported but the app is **not
connected yet** — no `VITE_GOOGLE_CLIENT_ID` `.env`. Connecting is the
top-priority open task once screens are done.
