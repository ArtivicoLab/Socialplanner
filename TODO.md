# TODO — Social Planner

## Done
- [x] Fork the TrackerB chassis (sync/merge/tombstones, PWA plumbing, tokens
      system, components, hash router, demo mode, coach tour machinery).
- [x] Identity: name "Social Planner", port 5512, DB `socialplanner` v1,
      manifest / index.html / sw cache / CNAME.
- [x] Theme "Cloud Studio" (light) / "Studio Night" (dark) — periwinkle
      indigo + raspberry on lilac-white paper.
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
  - [ ] `window.confirm()` still used in `CalendarScreen.tsx`, `PostSheet.tsx`,
        `HashtagsScreen.tsx` — must be `confirmDialog()` instead (native
        popups can't be themed and look broken on an installed PWA).
  - [ ] Dirty-tab tracking (`syncDirty.ts`) is in-memory only — a reload
        before a push completes silently drops the pending push behind a
        falsely-confident "Synced" status.
  - [ ] Sync pill shows "Saved"/"Synced" during demo mode, contradicting the
        demo banner's own "Nothing here is saved" right above it.
  - [ ] **Biggest one — no reauth/retry UI exists at all** (the underlying
        `ReauthRequiredError` type now exists as of 2026-07-15's timeout/
        allowInteractive fix, but nothing surfaces it): no `needsReauth`
        state, no retry-with-backoff on push failure, no proactive
        token-warming, no click handler on the sync pill, no persistent
        "reconnect" banner — a background reauth failure currently just
        shows generic "offline." TrackerA built this over many iterations;
        it needs building here, not just porting a patch. See CLAUDE.md's
        writeup for the 5-part breakdown.

## Nice to have (competitor parity+)
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
