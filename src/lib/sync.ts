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
  renameTabs,
  SheetNotFoundError,
  SheetPermissionDeniedError,
  writeTab,
} from "./google/sheets";
export { ReauthRequiredError, SheetPermissionDeniedError };
import { forgetToken, requestToken, SCOPE_SHEETS, tokenTimeLeftMs } from "./google/auth";
import { isValidAccessCode } from "./access";
import { isDemo } from "./demo";
import { DirtyTabs } from "./syncDirty";
import { mergeById } from "./merge";
import {
  getTombstones, setTombstones, mergeTombstones, applyTombstones, pruneTombstones, tombstoneCutoff,
} from "./tombstones";
import { applyRemoteSettings, useSettings } from "../stores/useSettings";
import { useHashtagGroups, useHighlights, useIdeas, useMonthlyGoals, useMoodBoardPins, usePerformance, usePlatforms, usePosts } from "../stores/v2";
import type { HashtagGroup, Highlight, Idea, MonthlyGoal, MoodBoardPin, PerfEntry, Platform, Post, Settings } from "./types";

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
// Remembers whatever LS_ID was about to be abandoned (start-a-new-sheet,
// wrong-account recovery) so it's not just gone from the user's perspective —
// the sheet itself was never deleted, only unlinked, but if they don't happen
// to remember its exact name in Drive, "go look at my old data" has no
// starting point without this. Deliberately just a link/reminder, NOT a
// one-tap "switch back" — see abandonRememberedSheet()'s doc comment. Ported
// 2026-07-15 from TrackerA alongside createNewSheet()/useThisAccountInstead.
const LS_PREVIOUS_ID = "sp.previousSpreadsheetId";

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

// Old tab titles (from before TAB.Posts/HashtagGroups/Ideas were renamed to
// match the app's own nav labels, 2026-07-15) mapped to their new title —
// see schema.ts's TAB comment. Add an entry here BEFORE ever changing a TAB
// value again, or an already-connected user's tab gets silently orphaned
// (ensureTabs only adds tabs it doesn't recognize, never renames one).
const LEGACY_TAB_RENAMES = [
  { from: "Posts", to: TAB.Posts },
  { from: "HashtagGroups", to: TAB.HashtagGroups },
  { from: "Ideas", to: TAB.Ideas },
];

/** Carry an already-connected sheet's tabs forward across a TAB rename in
 *  the app itself — renames the LIVE tab (data untouched) rather than
 *  ensureTabs's "add a new blank one for a name I don't recognize", which
 *  would otherwise orphan the user's real rows under the old tab title.
 *  Must run BEFORE ensureTabs at every call site that opens an EXISTING
 *  sheet (a brand-new sheet is created straight from the current TAB values
 *  and never had an old name to migrate). Safe to call unconditionally —
 *  each pair no-ops once already renamed. */
async function migrateLegacyTabNames(id: string, allowInteractive: boolean): Promise<void> {
  await renameTabs(id, LEGACY_TAB_RENAMES, allowInteractive);
}

/**
 * Best-effort background health check for a session that was ALREADY
 * connected before this boot — not just a fresh connect()/relink() call.
 * Without this, a tab-title change (like the 2026-07-15 Posts/HashtagGroups/
 * Ideas rename) would silently break every write for anyone who was mid-
 * session or who simply never disconnects/reconnects again: `pushAll()`
 * would try to write to a tab name their real Sheet doesn't have yet, and
 * the Sheets API does NOT auto-create a tab for an unrecognized name the
 * way `ensureTabs` does — it just fails. Runs once per app boot, never
 * blocks render, and every step it calls is already itself idempotent
 * (no-ops once migrated), so silently swallowing a failure here (e.g.
 * offline on this boot) just means the next successful connected boot
 * retries it — never a data-loss risk, only a "not migrated yet" no-op. */
export async function ensureConnectedTabsUpToDate(): Promise<void> {
  if (!isConnected()) return;
  const id = getSpreadsheetId();
  try {
    await migrateLegacyTabNames(id, false);
    await ensureTabs(id, ALL_TABS, false);
  } catch {
    // best-effort — see comment above
  }
}

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
  if (force || settingsMetaDirty) await pushSettingsMeta(id, allowInteractive);
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
  const data = await batchGet(id, [...PUSH_TABS, TAB.Meta], allowInteractive);

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

  applySettingsMeta(parseMetaRows(data[TAB.Meta] ?? []));
}

async function replaceStore<T extends { id: string }>(
  store: db.Collection,
  values: T[]
) {
  await db.clearStore(store);
  if (values.length) await db.putMany(store, values);
}

// ---- Meta tab: a tiny key/value store carried inside the user's own Sheet ----
function parseMetaRows(rows: string[][]): Map<string, string> {
  return new Map(rows.slice(1).filter((r) => (r[0] ?? "").trim()).map((r) => [r[0], r[1] ?? ""]));
}
async function readMetaTab(id: string, allowInteractive: boolean): Promise<Map<string, string>> {
  const data = await batchGet(id, [TAB.Meta], allowInteractive).catch(() => ({}) as Record<string, string[][]>);
  return parseMetaRows(data[TAB.Meta] ?? []);
}

async function writeMetaKey(id: string, key: string, value: string, allowInteractive: boolean): Promise<void> {
  const map = await readMetaTab(id, allowInteractive);
  map.set(key, value);
  await writeTab(id, TAB.Meta, [["key", "value"], ...map.entries()], allowInteractive);
}

const ACCESS_CODE_META_KEY = "accessCode";
const NAME_META_KEY = "name";
const WEEK_START_META_KEY = "weekStart";
const CATEGORIES_META_KEY = "categories";
const CATEGORY_COLORS_META_KEY = "categoryColors";
const GOALS_META_KEY = "goals";
const HIDDEN_ROUTES_META_KEY = "hiddenRoutes";
const TABBAR_ROUTES_META_KEY = "tabBarRoutes";
const SETTINGS_UPDATED_META_KEY = "settingsUpdatedAt";

// Separate from the per-collection `dirty` tabs above: Settings isn't a
// row-array like Posts/Ideas/etc., it's one object, so it doesn't fit
// DirtyTabs/tabValues()'s "rebuild the whole tab from the live store" shape
// without risking a blind Meta-tab overwrite that clobbers the accessCode
// row syncAccessCode() wrote separately. This flag + push/pull pair instead
// reuses writeMetaKey/readMetaTab's read-modify-write, same as accessCode.
let settingsMetaDirty = false;
export function markSettingsDirty(): void {
  settingsMetaDirty = true;
}

/** Push name/weekStart/categories/categoryColors/goals/hiddenRoutes/
 *  tabBarRoutes into the same Meta key/value tab as accessCode — via
 *  writeMetaKey's read-modify-write, so this never wipes the accessCode row
 *  written by syncAccessCode(). */
async function pushSettingsMeta(id: string, allowInteractive: boolean): Promise<void> {
  const { name, weekStart, categories, categoryColors, goals, hiddenRoutes, tabBarRoutes, updatedAt } =
    useSettings.getState();
  const map = await readMetaTab(id, allowInteractive);
  map.set(NAME_META_KEY, name);
  map.set(WEEK_START_META_KEY, String(weekStart));
  map.set(CATEGORIES_META_KEY, JSON.stringify(categories));
  map.set(CATEGORY_COLORS_META_KEY, JSON.stringify(categoryColors));
  map.set(GOALS_META_KEY, JSON.stringify(goals));
  map.set(HIDDEN_ROUTES_META_KEY, JSON.stringify(hiddenRoutes));
  map.set(TABBAR_ROUTES_META_KEY, JSON.stringify(tabBarRoutes));
  map.set(SETTINGS_UPDATED_META_KEY, updatedAt);
  await writeTab(id, TAB.Meta, [["key", "value"], ...map.entries()], allowInteractive);
  settingsMetaDirty = false;
}

function parseJsonArray(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : undefined;
  } catch {
    return undefined;
  }
}

/** Adopt the Sheet's name/weekStart/categories/categoryColors/goals/
 *  hiddenRoutes/tabBarRoutes when they're newer than this device's —
 *  last-write-wins by `updatedAt`, same merge philosophy as every row-based
 *  collection, just applied to one object instead of per-row. Silently
 *  no-ops if the Meta tab doesn't have a newer (or any) settingsUpdatedAt
 *  yet — e.g. before this feature shipped the key never existed at all.
 *  Takes an already-fetched map (pull() folds Meta into its one batchGet
 *  call rather than a second round-trip). */
function applySettingsMeta(map: Map<string, string>): void {
  const remoteUpdatedAt = map.get(SETTINGS_UPDATED_META_KEY) ?? "";
  if (!remoteUpdatedAt || remoteUpdatedAt <= useSettings.getState().updatedAt) return;

  const patch: Partial<Settings> & { updatedAt: string } = { updatedAt: remoteUpdatedAt };
  if (map.has(NAME_META_KEY)) patch.name = map.get(NAME_META_KEY)!;
  const ws = map.get(WEEK_START_META_KEY);
  if (ws === "0" || ws === "1") patch.weekStart = Number(ws) as 0 | 1;
  const categories = parseJsonArray(map.get(CATEGORIES_META_KEY));
  if (categories?.length) patch.categories = categories;
  const goals = parseJsonArray(map.get(GOALS_META_KEY));
  if (goals) patch.goals = goals;
  // Empty is a real, valid state for both (nothing hidden / nothing pinned),
  // so — unlike categories above — don't require non-empty to apply.
  const hiddenRoutes = parseJsonArray(map.get(HIDDEN_ROUTES_META_KEY));
  if (hiddenRoutes) patch.hiddenRoutes = hiddenRoutes;
  const tabBarRoutes = parseJsonArray(map.get(TABBAR_ROUTES_META_KEY));
  if (tabBarRoutes) patch.tabBarRoutes = tabBarRoutes;
  const rawColors = map.get(CATEGORY_COLORS_META_KEY);
  if (rawColors) {
    try {
      const parsed = JSON.parse(rawColors);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        patch.categoryColors = parsed;
      }
    } catch {
      // malformed cell (e.g. hand-edited) — keep the local value
    }
  }
  applyRemoteSettings(patch);
}

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
      // Must run before ensureTabs — see migrateLegacyTabNames's own comment.
      await migrateLegacyTabNames(existing, true);
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
 * Create and link a brand new, empty spreadsheet for an ALREADY-connected
 * user who wants to abandon their current one and start fresh (Settings'
 * "Start a new sheet") — deliberately its own function, not a reuse of
 * connect(). Ported 2026-07-15 from TrackerA, where this exact ordering was
 * the fix for a confirmed bug: an earlier version called
 * abandonRememberedSheet() then connect(), which abandoned the old sheet
 * BEFORE confirming the new one actually got created — a failed/blocked
 * popup left the user silently disconnected from everything, with no clear
 * message. This version gets the token and creates the new sheet FIRST; the
 * old one is only abandoned once the new one is confirmed reachable, so a
 * failure here throws before anything about the old sheet has changed at
 * all — the user stays cleanly connected to their original sheet the whole
 * time.
 */
export async function createNewSheet(): Promise<string> {
  await requestToken(SCOPE_SHEETS, true);
  const id = await createSpreadsheet(SPREADSHEET_TITLE, ALL_TABS, true);
  // Only NOW that the new sheet genuinely exists — see this function's doc
  // comment for why abandoning the old one any earlier is exactly the bug
  // that shipped on TrackerA.
  abandonRememberedSheet();
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
  // Leaving demo BEFORE pull(): pull()'s writes to IndexedDB are gated off
  // while demo mode is on (see db.ts's demoMode flag), so without this the
  // real Sheet data pulled below would show in the stores for this session
  // only, never actually persist locally, and get silently wiped back to the
  // in-memory sample on the very next reload — while the app still reported
  // "Connected" the whole time. A brand-new browser/device defaults to demo
  // mode ON, which is exactly relink()'s own target scenario ("a brand-new
  // browser has no remembered id"), so this isn't an edge case. CLAUDE.md
  // previously documented this as already fixed (mirroring connect()'s same
  // guard below) — re-audited 2026-07-15 and the actual guard was missing
  // from the code, only connect() had it. Restored here; see CLAUDE.md for
  // the corrected note.
  if (isDemo()) {
    const { setDemoMode } = await import("../stores/bootstrap");
    await setDemoMode(false);
  }
  // Must run before ensureTabs — see migrateLegacyTabNames's own comment.
  await migrateLegacyTabNames(id, true);
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

/**
 * The explicit "yes, really use a different Google account" recovery step for
 * a SheetPermissionDeniedError, and also what createNewSheet() calls: forgets
 * the remembered sheet id so the next connect() call creates a brand-new
 * spreadsheet, instead of retrying against the one it has no access to (or,
 * for createNewSheet, instead of relinking to the one just being abandoned).
 * Never called automatically — see connect()'s catch block, which propagates
 * SheetPermissionDeniedError instead of auto-recovering from it. Stashes the
 * outgoing id as "previous" first (see LS_PREVIOUS_ID) so the app can still
 * point back to it — the sheet itself is never deleted here, only unlinked.
 */
export function abandonRememberedSheet(): void {
  const outgoing = getSpreadsheetId();
  if (outgoing) localStorage.setItem(LS_PREVIOUS_ID, outgoing);
  localStorage.removeItem(LS_ID);
}

/** The id of whatever sheet was most recently abandoned via
    abandonRememberedSheet(), if any — for a "your previous sheet is still
    here, open it" link, not for reconnecting automatically. */
export function getPreviousSpreadsheetId(): string {
  return localStorage.getItem(LS_PREVIOUS_ID) ?? "";
}

// ---- debounced flush on every mutation, with background retry on failure ----
// Local writes (IndexedDB) always succeed instantly — a mutation is never
// lost. Everything below only governs how soon (and how reliably) it also
// reaches the Sheet. Added 2026-07-15 — before this, a single failed
// background push (an expired token, a network blip) just went silent:
// nothing retried it, and a reload wiped even the memory that anything was
// still unsynced (see syncDirty.ts's persisted DirtyTabs). Ported from
// TrackerA, where this exact chain was built and hardened over many
// iterations — see that app's CLAUDE.md for the individual bugs each part
// below was written to fix.
let timer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight = false;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 120_000;
let retryDelay = RETRY_BASE_MS;

function clearRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryDelay = RETRY_BASE_MS;
}

/** Whether a prior session left work that never reached the Sheet — e.g. a
    reload landed inside the 2s debounce window before it could push, or a
    background push failed silently (an expired token) with nothing left to
    retry it. Used on boot to resume the flush instead of trusting a blind
    "Synced". */
export function hasPendingPush(): boolean {
  return isConnected() && dirty.size > 0;
}

// Exported so useSync.ts can resume a push left pending from a prior session
// (see hasPendingPush() above) on boot, reusing the same pushInFlight guard,
// retry-with-backoff, and reauth handling as every other caller instead of a
// separate ad hoc boot-time push.
export function attemptPush(
  onState: (s: "syncing" | "synced" | "offline") => void,
  onReauthRequired: () => void
): void {
  if (pushInFlight) {
    // A push is already running — don't start a second one racing it, but
    // don't just drop this either: a tab dirtied WHILE the in-flight push is
    // running isn't in its snapshot, so check back shortly after it should
    // be done rather than silently waiting for the next unrelated edit.
    retryTimer = setTimeout(() => attemptPush(onState, onReauthRequired), 3000);
    return;
  }
  if (!navigator.onLine) {
    onState("offline");
    retryTimer = setTimeout(() => attemptPush(onState, onReauthRequired), retryDelay);
    return;
  }
  onState("syncing");
  pushInFlight = true;
  // false: this is an unattended background flush, not a click — a failed
  // silent refresh must throw ReauthRequiredError fast, never try to pop a
  // Google sign-in with no user gesture behind it.
  pushAll(false)
    .then(() => {
      clearRetry();
      onState("synced");
    })
    .catch((err) => {
      onState("offline");
      if (err instanceof ReauthRequiredError) {
        // The token expired and a silent refresh failed (e.g. the tab sat
        // open for a long while) — surface it so the UI can offer a real
        // "tap to reconnect" button. Never opened a popup for this
        // ourselves; see ReauthRequiredError.
        //
        // Deliberately NOT rescheduling a retry here: a silent refresh that
        // just failed will keep failing identically every time until the
        // user actually does something, so retrying just nags on a timer
        // for no benefit. keepTokenWarm() below has this exact "don't
        // re-hammer a known failure" guard too (its own alreadyNeedsReauth
        // check) — this keeps the push retry loop consistent with that same
        // rule. The next real attempt now only comes from the user's own
        // action: a new edit (scheduleFlush already calls clearRetry() and
        // starts fresh) or tapping "reconnect" (tapToRetry() → syncNow(),
        // a separate call path).
        onReauthRequired();
        return;
      }
      // Any other failure (offline, rate limit, a blip) is genuinely
      // transient and likely to self-resolve — keep retrying with backoff.
      retryTimer = setTimeout(() => attemptPush(onState, onReauthRequired), retryDelay);
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    })
    .finally(() => {
      pushInFlight = false;
    });
}

export function scheduleFlush(
  onState: (s: "syncing" | "synced" | "offline") => void,
  onReauthRequired: () => void
): void {
  if (!isConnected()) return;
  if (!navigator.onLine) {
    onState("offline");
    return;
  }
  if (timer) clearTimeout(timer);
  clearRetry(); // a fresh edit supersedes any pending backoff retry
  onState("syncing");
  timer = setTimeout(() => attemptPush(onState, onReauthRequired), 2000);
}

// Proactively top up the Sheets token between edits instead of only ever
// checking reactively at the exact moment a save needs one — the reactive
// pattern is what makes a reconnect prompt feel like it ambushes active
// work, especially with rapid edits: the 2s debounce keeps getting pushed
// back by each new edit, so nothing gets checked until the user finally
// pauses, at which point a whole backlog fires at once. Silent-only — this
// never opens a popup itself; see useSync.ts for the interval +
// visibilitychange callers that invoke this.
const TOKEN_REFRESH_MARGIN_MS = 10 * 60_000; // top up once under 10 min of life left
export async function keepTokenWarm(
  alreadyNeedsReauth: boolean,
  onReauthRequired: () => void
): Promise<void> {
  if (isDemo() || !isConnected() || !navigator.onLine) return;
  // Already known broken and waiting on the user to click "tap to reconnect"
  // — retrying the same silent request every few minutes just re-confirms
  // the same failure with nothing new to learn from it. The reactive
  // retry-with-backoff in attemptPush already covers this state; this
  // proactive check's whole job is catching a token that's ABOUT to expire,
  // not repeatedly re-poking one that already failed.
  if (alreadyNeedsReauth) return;
  if (tokenTimeLeftMs() > TOKEN_REFRESH_MARGIN_MS) return; // still plenty of runway
  try {
    await requestToken(SCOPE_SHEETS, false); // silent only — never pop a window from a timer
  } catch {
    onReauthRequired();
  }
}
