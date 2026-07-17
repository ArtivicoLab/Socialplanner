# TODO — Social Planner

## Done
- [x] Fork the TrackerB chassis (sync/merge/tombstones, PWA plumbing, tokens
      system, components, hash router, demo mode, coach tour machinery).
- [x] Identity: name "Social Planner", port 5512, DB `socialplanner` v1,
      manifest / index.html / sw cache / CNAME.
- [x] Theme: clean white/black chrome, TikTok/YouTube red-pink accent + deep
      cyan-teal secondary (retheme attempts tried and reverted 2026-07-15 —
      see tokens.css's top comment for the current, real palette). A 4th
      opt-in "Gallery" theme (art-inspired, from a reference painting) was
      added alongside it.
- [x] Domain layer: Post / HashtagGroup / Idea / Platform / PerfEntry /
      Highlight types, schema tabs + serializers, db collections, crud
      stores, bootstrap (default 8 platforms for real users), sync wiring.
- [x] Deterministic memory-only demo seed (rolling 10-week plan, 5 hashtag
      groups, idea bank, 12 months × 4 platforms performance, highlights).
- [x] Screens: Dashboard, Scheduler + Post editor, Calendar (6-week),
      Monthly Plan, Feed Preview, Hashtag Manager, Idea Bank, Performance
      Tracker, Settings, Privacy (built by parallel agents — see git diff).
- [x] Coach tour steps retargeted to the new screens.
- [x] Tests: schema roundtrip + combinedPostText, merge, tombstones.

## Top priority
- [ ] **Connect Google Sheets for real** (owner step): OAuth client id in
      `.env`, verify connect/pull/push end-to-end on localhost:5512.
- [ ] `postStats` unit tests (planStats spans, feedPosts ordering).
- [x] ~~GitHub repo + Pages deploy~~ — **done 2026-07-15**. Repo is
      `ArtivicoLab/Socialplanner`, custom domain `social.artivicolab.com` via
      `public/CNAME`. First run 404'd on the deploy step
      ("Ensure GitHub Pages has been enabled") purely because Pages wasn't
      switched on yet in repo Settings — not a workflow bug; see CLAUDE.md's
      new "Deploy" section for the one-time fix and why the retry step
      doesn't help with this particular error.
- [ ] **Fix the sync/auth bugs below before selling this app.** This is the
      same Google Sheets sync architecture TrackerA (Life Planner) shipped
      with real paying customers, then found and fixed a long, hard-won list
      of real bugs in — several caused genuine, reported data loss for a
      buyer. TrackerC forked the chassis before most of those fixes existed,
      so they're still live here. Full details + exact fix patterns are in
      this file's own `## Google Sheet as database` section above — start
      there, it names the file/line and what TrackerA's corrected version
      looks like for each one. Ask Claude to help port any of these if
      picking one back up — it did the original TrackerA fixes and this
      TrackerC audit, and already knows the reasoning behind each one and
      what's genuinely different about TrackerC's own code shape (row-
      granular merge/tombstones on pull, not TrackerA's simpler blind-replace
      pull) versus just copy-pasting.
  - [x] ~~`disconnect()` deletes the remembered spreadsheet id (`LS_ID`)~~ —
        **fixed 2026-07-15**, now uses an opt-out `LS_DISCONNECTED` flag.
  - [x] ~~`authedFetch` can pop an interactive Google sign-in from a
        background timer~~ — **fixed 2026-07-15**, `allowInteractive` now
        threaded through the whole chain, no default anywhere.
  - [x] ~~No timeout on the raw `fetch()` or on `requestToken()`~~ — **fixed
        2026-07-15**, ported TrackerA's `AbortController`/timeout pattern.
  - [ ] One shared token slot for BOTH Sheets and Calendar scopes — getting
        one evicts the other. Currently low-urgency: TrackerC doesn't
        actually request the Calendar scope anywhere yet, so this can't fire
        in practice — fix before ever wiring up a Calendar feature here.
  - [ ] Token cache is in-memory only, wiped by any reload (incl. the app's
        own auto-update reload) even when the real token still had time left.
  - [x] ~~`connect()`'s reconnect-to-existing-sheet path calls `pull()` with
        no push first~~ — **re-verified 2026-07-15, not actually the same
        bug here**: TrackerC's `pull()` already does a row-granular merge
        against current local state, which protects un-pushed edits via a
        different mechanism than push-first. See CLAUDE.md for the caveat
        (reasoned through, not battle-tested against a real conflict yet).
  - [x] ~~Settings (name, weekStart, content pillars + their colors, post
        goals, hidden nav sections, the phone bottom-bar layout) never
        reached the Sheet at all — only `accessCode` did, via the Meta tab.
        Any of these changed on one device silently never showed up after
        switching devices.~~ — **fixed 2026-07-15, in two passes**: name/
        weekStart/categories/categoryColors/goals first, then hiddenRoutes/
        tabBarRoutes right after — that first pass had assumed those two
        were "just local UI layout" and deliberately left them out, which
        turned out to be the wrong call the moment it was tested (a user who
        hides a module or curates their bottom bar expects that to follow
        them, same as pillars/goals). All 7 now round-trip through the same
        Meta key/value tab (JSON-encoded for the array/object ones), gated
        by a `Settings.updatedAt` so pull() applies last-write-wins the same
        way every row-based collection already does. Only `theme` (a display
        preference) and accessCode/activated/onboarding flags (each with
        their own separate handling) are still deliberately local-device-
        only. See `lib/sync.ts`'s `pushSettingsMeta`/`applySettingsMeta`.
        Caveat: like every other collection, this only pulls on an explicit
        connect/relink, not automatically in the background — see the
        reauth/retry item below, this app has no periodic pull yet at all.
  - [x] ~~`relink()` — never checked whether it left demo mode before
        pulling~~ — **fixed 2026-07-15**: it didn't (same bug TrackerA had
        already fixed), so a brand-new device's `relink()` pulled real data
        that only showed for that session and silently reverted to the demo
        sample on reload. Now mirrors `connect()`'s existing guard. See
        CLAUDE.md's "Google Sheet as database" section.
  - [x] ~~No way to abandon the connected sheet and start a fresh one; a
        wrong-Google-account error surfaced as a raw, un-actionable error
        string~~ — **added 2026-07-15**: ported TrackerA's `startNewSheet()` +
        wrong-account recovery (`useThisAccountInstead()`), the only one of
        the three trackers that had this — TrackerB doesn't either. See
        CLAUDE.md for the full writeup, incl. a `SPREADSHEET_TITLE` naming
        bug found the same way (fixed here; **same bug still open in
        TrackerB**, not touched).
  - [ ] `window.confirm()` still used in `CalendarScreen.tsx`, `PostSheet.tsx`,
        `HashtagsScreen.tsx`, and (found 2026-07-15, this list was
        incomplete) `SettingsScreen.tsx`'s `deletePlatform` — must be
        `confirmDialog()` instead (native popups can't be themed and look
        broken on an installed PWA). SettingsScreen's OWN danger-zone buttons
        were fixed 2026-07-15 while touching that file for the item above;
        `deletePlatform`'s is not, since it wasn't part of that change.
  - [x] ~~Dirty-tab tracking (`syncDirty.ts`) is in-memory only — a reload
        before a push completes silently drops the pending push behind a
        falsely-confident "Synced" status.~~ — **fixed 2026-07-17**:
        `DirtyTabs` now persists to `localStorage` (`sp.dirtyTabs`) on every
        mark/clear, and `resumePendingPush()` (called at the end of
        `bootstrap.ts`, after stores hydrate) resumes it on the next boot.
  - [x] ~~Sync pill shows "Saved"/"Synced" during demo mode, contradicting the
        demo banner's own "Nothing here is saved" right above it.~~ —
        **fixed 2026-07-17**: both `Header.tsx` and `Sidebar.tsx` now hide
        the pill entirely while `demo` is true, matching TrackerA.
  - [x] ~~**Biggest one — no reauth/retry UI exists at all**~~ — **fixed
        2026-07-17, ported from TrackerA in full**: `needsReauth` state,
        `tapToRetry()`, retry-with-backoff + a `pushInFlight` guard on every
        background push (`attemptPush`/`scheduleFlush` in `sync.ts`),
        proactive `keepTokenWarm()` (5-min interval + `visibilitychange` +
        one immediate check on boot), a persistent `<ReconnectBanner/>`
        (mounted in `App.tsx`, stays up until reconnected, doesn't rely on
        catching a toast at the right moment), and the sync pill in BOTH
        `Header.tsx`/`Sidebar.tsx` is now a real clickable button when
        there's something to fix. Also ported TrackerA's `sessionStorage`
        token persistence + `tokenTimeLeftMs()` (`auth.ts`) so a reload
        doesn't discard a still-valid token and trigger reauth for no
        reason. Root cause of the original report (2026-07-17, user: "when
        away and the app is not syncing... refresh it goes back green but
        that's not true... user will not know to click sync... in the
        setting the badge reads connected while it's not true"): boot
        status was a blind `navigator.onLine` guess with no memory of
        pending work, the pills were non-interactive, and Settings'
        "Connected" badge only ever checked whether a spreadsheet was
        *remembered*, never whether sync was *currently healthy* — fixed
        that too, see CLAUDE.md's writeup.
        **Found the identical "Connected" badge gap in TrackerA while
        building the reference for this fix — TrackerA's own Settings
        screen has the exact same bug (unconditionally green, ignores
        `needsReauth`), not yet fixed there.**

## Nice to have (competitor parity+)
- [ ] **Past-due posts get no treatment anywhere** — confirmed live
      2026-07-17 during a testing pass (Monthly Plan: a post dated
      yesterday, still not marked Published, looked no different from any
      other scheduled post). Root cause: `planStats()`'s `scheduledToday`
      (the Dashboard's "N due today" stat, `postStats.ts:33`) is a strict
      `p.date === refIso` equality check — a post dated any day BEFORE
      today just silently stops appearing in that stat once its date
      passes, and nothing else (Scheduler row, Calendar cell, Monthly Plan
      card) gives it different styling either. Nothing in the app ever
      flags "this was supposed to go out and didn't." Needs an actual
      design decision, not just loosening the equality check to `<=`:
      CLAUDE.md's own product principles say "gentle language, never shame
      a missed posting day," so whatever ships here should read as a calm,
      informational nudge (e.g. a distinct but soft "Past due" label next
      to the existing status chip, or rolling a count into the Dashboard
      stat) — not a harsh red-alert treatment.
- [ ] Drag posts between days on the desktop calendar.
- [ ] Duplicate-post action (repost the same content later).
- [ ] Per-platform default posting times.
- [ ] Reel/story-specific tile ratios in Feed Preview.
- [ ] Performance: engagement auto-hint (engagement = interactions/reach).
- [ ] CSV import of an existing spreadsheet plan.

## Gotchas
- Fixed dev/preview port **5512** (OAuth origin); strictPort on.
- recharts is in package.json but must NEVER be imported.
- Demo data is memory-only; `db.put` is a no-op while demo is on.
- Platform names are the join key between posts/performance and the Platforms
  tab — renaming a platform should ideally rewrite posts (not yet done).
- Bump `DB_VERSION` whenever a new object store is added.
