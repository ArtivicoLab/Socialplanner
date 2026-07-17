// Hydrate every store from IndexedDB on boot; seed sample data on first run.

import * as db from "../lib/db";
import { buildSample, type Seed } from "../lib/sample";
import { isValidAccessCode } from "../lib/access";
import { isDemo, setDemoFlag } from "../lib/demo";
import { seedChangelogSeenIfFirstRun } from "../lib/changelog";
import { loadTombstones } from "../lib/tombstones";
import { ensureConnectedTabsUpToDate } from "../lib/sync";
import { useSettings } from "./useSettings";
import { useSync, resumePendingPush } from "./useSync";
import { useHashtagGroups, useHighlights, useIdeas, useMonthlyGoals, useMoodBoardPins, usePerformance, usePlatforms, usePosts } from "./v2";
import { useLocalImages } from "./localImages";
import { DEFAULT_PLATFORMS, type HashtagGroup, type Highlight, type Idea, type MonthlyGoal, type MoodBoardPin, type PerfEntry, type Platform, type Post } from "../lib/types";
import { newId, nowIso } from "../lib/id";

async function loadStores() {
  const [posts, groups, ideas, platforms, performance, highlights, moodBoardPins, monthlyGoals] = await Promise.all([
    db.all<Post>("posts"),
    db.all<HashtagGroup>("hashtagGroups"),
    db.all<Idea>("ideas"),
    db.all<Platform>("platforms"),
    db.all<PerfEntry>("performance"),
    db.all<Highlight>("highlights"),
    db.all<MoodBoardPin>("moodBoardPins"),
    db.all<MonthlyGoal>("monthlyGoals"),
  ]);
  usePosts.getState().setAll(posts);
  useHashtagGroups.getState().setAll(groups);
  useIdeas.getState().setAll(ideas);
  usePerformance.getState().setAll(performance);
  useHighlights.getState().setAll(highlights);
  useMoodBoardPins.getState().setAll(moodBoardPins);
  useMonthlyGoals.getState().setAll(monthlyGoals);
  usePlatforms.getState().setAll(platforms);
  // A real (non-demo) user always has the platform list to pick from — it's
  // structure, not content, so seeding it doesn't make the app look "used".
  if (platforms.length === 0) seedDefaultPlatforms();
}

// The 8 default platforms, written through the store so they persist and sync.
function seedDefaultPlatforms() {
  const ts = nowIso();
  const rows: Platform[] = DEFAULT_PLATFORMS.map((name, i) => ({
    id: newId(),
    name,
    active: i < 4, // Instagram / Facebook / TikTok / Pinterest on by default
    order: i,
    followersGoal: 0,
    engagementGoal: 0,
    reachGoal: 0,
    createdAt: ts,
    updatedAt: ts,
  }));
  usePlatforms.getState().setAll(rows);
  void db.putMany("platforms", rows);
  useSync.getState().touch("platforms");
}

// Load the full-year sample straight into the in-memory stores. Nothing is
// written to IndexedDB (db writes are gated off while demo mode is on), so the
// dummy data is purely a display layer — it can never be pushed to a Sheet or
// mistaken for real data. Every reload rebuilds a fresh, complete demo.
function loadSampleIntoStores(s: Seed = buildSample()) {
  usePosts.getState().setAll(s.posts);
  useHashtagGroups.getState().setAll(s.hashtagGroups);
  useIdeas.getState().setAll(s.ideas);
  usePlatforms.getState().setAll(s.platforms);
  usePerformance.getState().setAll(s.performance);
  useHighlights.getState().setAll(s.highlights);
  useMoodBoardPins.getState().setAll(s.moodBoardPins);
  useMonthlyGoals.getState().setAll(s.monthlyGoals);
}

// Memoize so React StrictMode's double-invoked effect (or any repeat call)
// shares ONE run.
let bootPromise: Promise<void> | null = null;

export function bootstrap(): Promise<void> {
  if (!bootPromise) bootPromise = runBootstrap();
  return bootPromise;
}

async function runBootstrap() {
  await useSettings.getState().load();
  await loadTombstones();
  // First-ever boot: silently mark the current release seen so a brand-new
  // visitor doesn't get a "you just updated" banner for a version they never
  // ran before. Later deploys then surface as real updates.
  seedChangelogSeenIfFirstRun();
  const demo = isDemo();
  db.setDbDemoMode(demo);
  if (demo) {
    loadSampleIntoStores();
  } else {
    await loadStores();
  }
  // Device-picked post photos are never part of the demo seed (writes are
  // gated off in demo mode anyway) — load whatever's really on this device.
  await useLocalImages.getState().load();

  // Fire-and-forget, deliberately not awaited: a background health check for
  // a session that was ALREADY connected before this boot (a fresh
  // connect()/relink() already does its own version of this). Never blocks
  // first render, never surfaces an error UI — see its own comment in
  // sync.ts for why silently retrying next boot is safe here.
  void ensureConnectedTabsUpToDate();

  // MUST be the last line — resumes a push a prior session left pending
  // (see useSync.ts's resumePendingPush() doc comment for why calling this
  // any earlier, before the stores above have actually hydrated, silently
  // overwrites the real Sheet with an empty snapshot).
  resumePendingPush();
}

/**
 * Flip demo mode on/off at runtime (the Settings toggle). The choice persists
 * in localStorage (see lib/demo). Turning it ON shows the full-year sample
 * without touching the user's stored data; turning it OFF reloads their real
 * (possibly empty) data from IndexedDB.
 */
export async function setDemoMode(on: boolean): Promise<void> {
  setDemoFlag(on);
  db.setDbDemoMode(on);
  if (on) {
    loadSampleIntoStores();
  } else {
    await loadStores();
  }
}

/**
 * Unlock the real (Google Sheets-connectable) app with an Etsy purchase code.
 * Soft client-side check only (see lib/access.ts). Under the memory-only demo
 * model there's nothing to wipe — the sample was never written to IndexedDB —
 * so this just leaves demo mode and shows the user's own (blank for a new
 * buyer) data. It deliberately does NOT delete anything.
 */
export async function activate(code: string): Promise<boolean> {
  if (!isValidAccessCode(code)) return false;
  setDemoFlag(false);
  db.setDbDemoMode(false);
  if (!useSettings.getState().activated) {
    await loadStores();
    useSettings.getState().update({ activated: true, accessCode: code.trim().toUpperCase() });
  }
  return true;
}

export async function resetEverything() {
  // An explicit "start fresh" is a real-app action — leave demo so writes land
  // again and the user sees their now-empty real planner, not the sample.
  setDemoFlag(false);
  db.setDbDemoMode(false);
  await db.wipeAll();
  usePosts.getState().setAll([]);
  useHashtagGroups.getState().setAll([]);
  useIdeas.getState().setAll([]);
  usePerformance.getState().setAll([]);
  useHighlights.getState().setAll([]);
  useMoodBoardPins.getState().setAll([]);
  useMonthlyGoals.getState().setAll([]);
  useLocalImages.setState({ map: {} });
  seedDefaultPlatforms();
}

export interface YearResetOptions {
  posts: boolean; // clear the scheduled-post history
  performance: boolean; // clear the monthly performance log
}

/**
 * "Reuse year after year": clear this year's content history while keeping the
 * reusable structures — hashtag groups, idea bank, platforms, and all Settings
 * (including custom pillars).
 */
export async function resetForNewYear(opts: YearResetOptions): Promise<void> {
  if (opts.posts) {
    await db.clearStore("posts");
    usePosts.getState().setAll([]);
    await db.clearStore("highlights");
    useHighlights.getState().setAll([]);
    // Mood board pins and monthly goals are month-scoped, same as posts —
    // clear with the year.
    await db.clearStore("moodBoardPins");
    useMoodBoardPins.getState().setAll([]);
    await db.clearStore("monthlyGoals");
    useMonthlyGoals.getState().setAll([]);
    // Their local device photos would otherwise become orphaned rows (this
    // also clears any mood board pins' local photos, stored in the same
    // shared blob store — see localImages.ts).
    await db.clearPostImages();
    useLocalImages.setState({ map: {} });
  }
  if (opts.performance) {
    await db.clearStore("performance");
    usePerformance.getState().setAll([]);
  }
  useSync.getState().touch();
}

export { loadStores, loadSampleIntoStores };
