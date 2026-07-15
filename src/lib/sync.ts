// Sync layer (spec §8). Bridges the local IndexedDB stores and the user's Google
// Sheet. Single-user: we mirror each collection to its own tab. Reads pull the
// whole sheet; writes are local-first, then a debounced full-tab push
// (last-write-wins by the device that saved most recently — safe for one user).

import * as db from "./db";
import {
  HEADERS,
  SPREADSHEET_TITLE,
  TAB,
  V2_TABS,
  hashtagGroupToRow,
  highlightToRow,
  ideaToRow,
  monthlyGoalToRow,
  moodBoardPinToRow,
  perfToRow,
  platformToRow,
  postToRow,
  tombstoneToRow,
  rowToHashtagGroup,
  rowToHighlight,
  rowToIdea,
  rowToMonthlyGoal,
  rowToMoodBoardPin,
  rowToPerf,
  rowToPlatform,
  rowToPost,
  rowToTombstone,
} from "./schema";
import {
  batchGet,
  createSpreadsheet,
  ensureTabs,
  ReauthRequiredError,
  SheetNotFoundError,
  SheetPermissionDeniedError,
  writeTab,
} from "./google/sheets";
export { ReauthRequiredError, SheetPermissionDeniedError };
import { forgetToken, requestToken, SCOPE_SHEETS } from "./google/auth";
import { isValidAccessCode } from "./access";
import { isDemo } from "./demo";
import { DirtyTabs } from "./syncDirty";
import { mergeById } from "./merge";
import {
  getTombstones, setTombstones, mergeTombstones, applyTombstones, pruneTombstones, tombstoneCutoff,
} from "./tombstones";
import { useSettings } from "../stores/useSettings";
import { useHashtagGroups, useHighlights, useIdeas, useMonthlyGoals, useMoodBoardPins, usePerformance, usePlatforms, usePosts } from "../stores/v2";
import type { HashtagGroup, Highlight, Idea, MonthlyGoal, MoodBoardPin, PerfEntry, Platform, Post } from "./types";

const LS_ID = "sp.spreadsheetId";
// Separate from LS_ID on purpose: LS_ID is kept forever once a sheet exists,
// so a later connect() always relinks to the SAME sheet. LS_DISCONNECTED is
// the only thing disconnect() sets. Ported 2026-07-15 from TrackerA, where
// disconnect() deleting LS_ID outright was a confirmed real bug: the next
// Connect click found no "existing" id and created a BRAND NEW spreadsheet
// instead of relinking, scattering one account's data across several sheets
// on repeated disconnect/reconnect (confirmed via Cloud Console API metrics
// showing 4 CreateSpreadsheet calls from one test account). TrackerC's own
// CLAUDE.md already documented this as a known, unfixed bug — this is that
// fix. Opt-OUT (absence = connected), not opt-in: an opt-in flag that only
// gets set inside connect() would silently break syncing for every
// already-connected session the moment it shipped.
const LS_DISCONNECTED = "sp.disconnected";

/** Accepts a raw spreadsheet id or a full Google Sheets URL and returns the id. */
export function extractSpreadsheetId(idOrUrl: string): string {
  const trimmed = idOrUrl.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

export function getSpreadsheetId(): string {
  return localStorage.getItem(LS_ID) ?? "";
}
export function isConnected(): boolean {
  return getSpreadsheetId().length > 0 && localStorage.getItem(LS_DISCONNECTED) !== "1";
}
function setSpreadsheetId(id: string) {
  localStorage.setItem(LS_ID, id);
  localStorage.removeItem(LS_DISCONNECTED);
}

const SYNC_TABS = [TAB.Posts, TAB.HashtagGroups, TAB.Ideas, TAB.Platforms, TAB.Performance, TAB.Highlights, TAB.MoodBoard, TAB.MonthlyGoals];
// Tombstones ride along in push/pull but aren't a "store" — handled specially.
const PUSH_TABS = [...SYNC_TABS, TAB.Tombstones];
const ALL_TABS = [...PUSH_TABS, ...V2_TABS];

// Per-collection dirty tracking: a mutation marks only its own tab, so a
// debounced flush rewrites just what changed instead of all tabs every time.
const COLLECTION_TO_TAB: Record<string, string> = {
  posts: TAB.Posts,
  hashtagGroups: TAB.HashtagGroups,
  ideas: TAB.Ideas,
  platforms: TAB.Platforms,
  performance: TAB.Performance,
  highlights: TAB.Highlights,
  moodBoardPins: TAB.MoodBoard,
  monthlyGoals: TAB.MonthlyGoals,
  tombstones: TAB.Tombstones,
};
const dirty = new DirtyTabs();

/** Flag a collection's tab dirty. An unknown/absent name marks everything —
    so any untagged mutation path still pushes fully (never silently skipped). */
export function markDirty(collection?: string): void {
  const tab = collection ? COLLECTION_TO_TAB[collection] : undefined;
  if (tab) dirty.markTab(tab);
  else dirty.markAll(PUSH_TABS);
}

// ---- push: build a full tab (header + current rows) from the live stores ----
function tabValues(tab: string): string[][] {
  const header = HEADERS[tab] ?? [];
  let rows: string[][] = [];
  switch (tab) {
    case TAB.Posts: rows = usePosts.getState().items.map(postToRow); break;
    case TAB.HashtagGroups: rows = useHashtagGroups.getState().items.map(hashtagGroupToRow); break;
    case TAB.Ideas: rows = useIdeas.getState().items.map(ideaToRow); break;
    case TAB.Platforms: rows = usePlatforms.getState().items.map(platformToRow); break;
    case TAB.Performance: rows = usePerformance.getState().items.map(perfToRow); break;
    case TAB.Highlights: rows = useHighlights.getState().items.map(highlightToRow); break;
    case TAB.MoodBoard: rows = useMoodBoardPins.getState().items.map(moodBoardPinToRow); break;
    case TAB.MonthlyGoals: rows = useMonthlyGoals.getState().items.map(monthlyGoalToRow); break;
    case TAB.Tombstones: rows = getTombstones().map(tombstoneToRow); break;
  }
  return [header, ...rows];
}

// A separate, purely in-memory (never persisted) suspend flag for the Coach
// Tour (CoachTour.tsx): it temporarily swaps every store's data for fake
// sample rows via loadSampleIntoStores() without ever flipping isDemo() true,
// so pushAll()'s isDemo() guard alone does nothing to protect a real,
// connected user — a debounced flush firing while the tour has fake data
// loaded could silently overwrite their real Sheet with sample rows, with no
// dirty flag left afterward to ever correct it. Unlike isDemo(), which is a
// durable per-account mode, this only needs to survive the current tab's
// lifetime. The tour resumes sync on every path that restores the real data,
// including its unmount cleanup, so this can't get stuck true.
let syncSuspended = false;
export function suspendSync(): void {
  syncSuspended = true;
}
export function resumeSync(): void {
  syncSuspended = false;
}

/**
 * `allowInteractive` has NO default on purpose — every caller must consciously
 * decide. Ported 2026-07-15 from TrackerA: this used to be implicit (sheets.ts
 * always tried a popup on a failed silent refresh), which is reachable from
 * the `online` browser event and the debounced flush — neither has a user
 * click behind it, and can fire while the tab isn't even focused. Pass `true`
 * only from a genuine, current click handler (Connect, Sync now); `false`
 * from anything automatic.
 */
export async function pushAll(allowInteractive: boolean, force = false): Promise<void> {
  // Hard stop: never write the in-memory sample to a real Sheet. Demo mode
  // should always be off by the time anyone is connected (connect() clears it),
  // but this guarantees the sample can never leak upward even if it isn't.
  if (isDemo() || syncSuspended) return;
  const id = getSpreadsheetId();
  if (!id) return;
  // Only the tabs that actually changed (all when forced or nothing tracked).
  // Sequential to stay well under rate limits for personal data volumes. A tab
  // is cleared from `dirty` only after its write succeeds, so a mid-flush
  // failure just retries it next time.
  const tabs = dirty.toPush(PUSH_TABS, force);
  for (const tab of tabs) {
    await writeTab(id, tab, tabValues(tab), allowInteractive);
    dirty.clear(tab);
  }
}

// ---- pull: replace local data from the sheet ----
function parseRows<T>(rows: string[][], fromRow: (r: string[]) => T): T[] {
  // rows[0] is the header written by the app; skip it. Skip blank rows (no id).
  return rows
    .slice(1)
    .filter((r) => (r[0] ?? "").trim().length > 0)
    .map(fromRow);
}

export async function pull(allowInteractive: boolean): Promise<void> {
  const id = getSpreadsheetId();
  if (!id) return;
  const data = await batchGet(id, PUSH_TABS, allowInteractive);

  // Delete markers first: union local + remote tombstones (newest per id),
  // prune expired ones, and persist. Rows are then filtered against the full
  // set so a deletion made on any device sticks after the merge below.
  const remoteTombs = parseRows(data[TAB.Tombstones] ?? [], rowToTombstone);
  const tombMerge = mergeTombstones(getTombstones(), remoteTombs);
  const tombstones = pruneTombstones(tombMerge.merged, tombstoneCutoff());
  setTombstones(tombstones);
  if (tombMerge.localContributed) markDirty("tombstones");

  // Row-granular merge (not blind replace): keep whichever copy of each row is
  // newer by `updatedAt`, so pulling the sheet on a second device doesn't clobber
  // that device's un-pushed edits, then drop anything a tombstone deleted. When a
  // local row survives, mark its tab dirty so the next flush converges the sheet.
  const merge = <T extends { id: string; updatedAt: string }>(
    collection: string,
    remoteRows: T[],
    localRows: T[]
  ): T[] => {
    const { merged, localContributed } = mergeById(localRows, remoteRows);
    if (localContributed) markDirty(collection);
    return applyTombstones(merged, tombstones);
  };

  const posts = merge("posts", parseRows<Post>(data[TAB.Posts] ?? [], rowToPost), usePosts.getState().items);
  const groups = merge("hashtagGroups", parseRows<HashtagGroup>(data[TAB.HashtagGroups] ?? [], rowToHashtagGroup), useHashtagGroups.getState().items);
  const ideas = merge("ideas", parseRows<Idea>(data[TAB.Ideas] ?? [], rowToIdea), useIdeas.getState().items);
  const platforms = merge("platforms", parseRows<Platform>(data[TAB.Platforms] ?? [], rowToPlatform), usePlatforms.getState().items);
  const performance = merge("performance", parseRows<PerfEntry>(data[TAB.Performance] ?? [], rowToPerf), usePerformance.getState().items);
  const highlights = merge("highlights", parseRows<Highlight>(data[TAB.Highlights] ?? [], rowToHighlight), useHighlights.getState().items);
  const moodBoardPins = merge("moodBoardPins", parseRows<MoodBoardPin>(data[TAB.MoodBoard] ?? [], rowToMoodBoardPin), useMoodBoardPins.getState().items);
  const monthlyGoals = merge("monthlyGoals", parseRows<MonthlyGoal>(data[TAB.MonthlyGoals] ?? [], rowToMonthlyGoal), useMonthlyGoals.getState().items);

  await Promise.all([
    replaceStore("posts", posts),
    replaceStore("hashtagGroups", groups),
    replaceStore("ideas", ideas),
    replaceStore("platforms", platforms),
    replaceStore("performance", performance),
    replaceStore("highlights", highlights),
    replaceStore("moodBoardPins", moodBoardPins),
    replaceStore("monthlyGoals", monthlyGoals),
  ]);

  usePosts.getState().setAll(posts);
  useHashtagGroups.getState().setAll(groups);
  useIdeas.getState().setAll(ideas);
  usePlatforms.getState().setAll(platforms);
  usePerformance.getState().setAll(performance);
  useHighlights.getState().setAll(highlights);
  useMoodBoardPins.getState().setAll(moodBoardPins);
  useMonthlyGoals.getState().setAll(monthlyGoals);
}

async function replaceStore<T extends { id: string }>(
  store: db.Collection,
  values: T[]
) {
  await db.clearStore(store);
  if (values.length) await db.putMany(store, values);
}

// ---- Meta tab: a tiny key/value store carried inside the user's own Sheet ----
async function readMetaTab(id: string, allowInteractive: boolean): Promise<Map<string, string>> {
  const data = await batchGet(id, [TAB.Meta], allowInteractive).catch(() => ({}) as Record<string, string[][]>);
  const rows = (data[TAB.Meta] ?? []).slice(1); // skip header
  return new Map(rows.filter((r) => (r[0] ?? "").trim()).map((r) => [r[0], r[1] ?? ""]));
}

async function writeMetaKey(id: string, key: string, value: string, allowInteractive: boolean): Promise<void> {
  const map = await readMetaTab(id, allowInteractive);
  map.set(key, value);
  await writeTab(id, TAB.Meta, [["key", "value"], ...map.entries()], allowInteractive);
}

const ACCESS_CODE_META_KEY = "accessCode";

/**
 * Keep the buyer's Etsy access code and the Sheet in sync, both directions:
 * - Already activated locally → push our code up (so a second device that
 *   later connects to this same Sheet inherits it).
 * - Not yet activated, but this Sheet already carries a code from a previous
 *   device → adopt it locally. No local wipe here — pull() already brought
 *   down the real data for this Sheet, unlike a fresh manual code entry.
 */
async function syncAccessCode(id: string, allowInteractive: boolean): Promise<void> {
  const settings = useSettings.getState();
  if (settings.activated && settings.accessCode) {
    await writeMetaKey(id, ACCESS_CODE_META_KEY, settings.accessCode, allowInteractive).catch(() => {});
    return;
  }
  const map = await readMetaTab(id, allowInteractive).catch(() => new Map<string, string>());
  const remoteCode = map.get(ACCESS_CODE_META_KEY) ?? "";
  if (remoteCode && isValidAccessCode(remoteCode)) {
    settings.update({ activated: true, accessCode: remoteCode });
  }
}

/**
 * Connect a Google account. If a sheet id is remembered we relink + pull;
 * otherwise we create a fresh app-managed spreadsheet and push local data up.
 * Returns the spreadsheet id.
 */
export async function connect(): Promise<string> {
  // Ask for an interactive token FIRST, straight off the click — every other
  // Sheets call below tries a silent refresh before falling back to a popup,
  // which works for background sync but would delay the very first popup here
  // past the click's window for the browser to treat it as user-initiated.
  await requestToken(SCOPE_SHEETS, true);

  // Leaving demo BEFORE any push/pull: setDemoMode reloads the stores from the
  // user's real (blank for a new buyer) IndexedDB, so pushAll below seeds the
  // new sheet with THAT — never the in-memory sample. Dynamic import avoids the
  // sync ⇄ bootstrap ⇄ useSync require cycle.
  if (isDemo()) {
    const { setDemoMode } = await import("../stores/bootstrap");
    await setDemoMode(false);
  }

  const existing = getSpreadsheetId();
  if (existing) {
    try {
      await ensureTabs(existing, ALL_TABS, true);
      localStorage.removeItem(LS_DISCONNECTED);
      // NOT pushing before this pull, unlike TrackerA's connect() — TrackerC's
      // pull() already does a row-granular merge by `updatedAt` against
      // current LOCAL state (see the `merge` helper above), not a blind
      // replace, so an un-pushed local edit survives being compared against a
      // stale remote snapshot and gets re-marked dirty for the next flush.
      // This is a different mechanism than TrackerA's push-before-pull fix
      // but protects against the same class of data loss.
      await pull(true);
      await syncAccessCode(existing, true);
      return existing;
    } catch (err) {
      if (err instanceof SheetNotFoundError) {
        localStorage.removeItem(LS_ID);
        // fall through to create a new one
      } else {
        // A SheetPermissionDeniedError lands here too — the signed-in account
        // isn't the one that owns the remembered sheet. Propagate the typed
        // error rather than silently auto-creating a new sheet or wiping the
        // link, so the UI can offer an explicit choice (see TrackerA's
        // SettingsScreen for the reference pattern once this UI is built).
        throw err;
      }
    }
  }
  const id = await createSpreadsheet(SPREADSHEET_TITLE, ALL_TABS, true);
  setSpreadsheetId(id);
  await pushAll(true, true); // seed the new sheet fully (all tabs + headers)
  await syncAccessCode(id, true);
  return id;
}

/**
 * Relink to a spreadsheet id (or full Sheets URL) the user pasted in — the
 * genuine cross-device path: a brand-new browser has no remembered id and no
 * local access code, so this is how it recovers both the real data AND the
 * activation state from an already-connected device's Sheet, with no re-typed
 * code and no wipe. Available even before local activation, since that's
 * exactly what it's for.
 */
export async function relink(idOrUrl: string): Promise<void> {
  const id = extractSpreadsheetId(idOrUrl);
  if (!id) throw new Error("That doesn't look like a Google Sheet link or ID.");
  await requestToken(SCOPE_SHEETS, true);
  await ensureTabs(id, ALL_TABS, true);
  setSpreadsheetId(id);
  await pull(true);
  await syncAccessCode(id, true);
}

/** The durable, synchronous half of disconnecting — must complete before any
    `await`, so a refresh mid-disconnect still leaves the device correctly
    disconnected even if a trailing best-effort step never finishes. */
export function markDisconnected(): void {
  // Deliberately keep LS_ID — see its own comment. Only mark disconnected via
  // the separate opt-out flag, so the next connect() still relinks to the
  // SAME sheet instead of creating a new one.
  localStorage.setItem(LS_DISCONNECTED, "1");
}

export function disconnect() {
  markDisconnected();
  forgetToken();
}

// ---- debounced flush on every mutation ----
let timer: ReturnType<typeof setTimeout> | null = null;
export function scheduleFlush(onState: (s: "syncing" | "synced" | "offline") => void) {
  if (!isConnected()) return;
  if (!navigator.onLine) {
    onState("offline");
    return;
  }
  if (timer) clearTimeout(timer);
  onState("syncing");
  timer = setTimeout(() => {
    // false: this is an unattended background flush, not a click — a failed
    // silent refresh must throw ReauthRequiredError fast, never try to pop a
    // Google sign-in with no user gesture behind it.
    pushAll(false)
      .then(() => onState("synced"))
      .catch(() => onState("offline"));
  }, 2000);
}
