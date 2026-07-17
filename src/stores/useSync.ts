import { create } from "zustand";
import { hasClientId } from "../lib/google/auth";
import * as sync from "../lib/sync";

export type SyncStatus = "synced" | "syncing" | "offline";

interface SyncState {
  status: SyncStatus;
  pending: number;
  connected: boolean;
  spreadsheetId: string;
  /** The most recently ABANDONED sheet's id, if any (from startNewSheet() or
      the wrongAccount recovery) — for a "your previous sheet is still here"
      link in Settings, never used to reconnect automatically. */
  previousSpreadsheetId: string;
  hasClientId: boolean;
  busy: boolean;
  error: string;
  /**
   * True when the last connect() failed because the signed-in Google account
   * doesn't own the remembered sheet (picked the wrong account, or a genuine
   * switch). Settings shows a specific "try a different account" / "start a
   * new sheet with this account" choice instead of the raw API error text.
   */
  wrongAccount: boolean;
  /**
   * True when a background sync attempt found the Google token expired and a
   * silent refresh failed — typically the tab sat closed or idle long enough
   * that the ~1hr token lapsed. Background code deliberately never opens a
   * popup to fix this itself (see ReauthRequiredError); the UI shows a
   * persistent "reconnect" banner + a clickable sync pill instead, and only
   * that click is allowed to open Google's sign-in popup. Added 2026-07-15 —
   * before this, a lapsed background token just showed generic "offline"
   * with no indication of what was actually wrong or how to fix it, and
   * `connected` alone (whether a spreadsheet is remembered) kept reading as
   * a healthy "Connected" everywhere, including Settings, even while nothing
   * had synced in a while.
   */
  needsReauth: boolean;

  setStatus: (s: SyncStatus) => void;
  /** Called after every mutation; debounced push to Sheets when connected.
      `collection` marks only that tab dirty so a flush rewrites just what
      changed (omit → all tabs, the safe fallback). */
  touch: (collection?: string) => void;
  /** Same debounced-flush/status-flash behavior as `touch`, but for the
      Settings fields that live in the Sheet's Meta tab (name, weekStart,
      categories, categoryColors, goals) — a separate action so a settings
      edit doesn't fall through `touch`'s "unknown collection" fallback and
      mark every other tab dirty too. See lib/sync.ts's markSettingsDirty. */
  touchSettings: () => void;

  connect: () => Promise<void>;
  /** Link to an existing Sheet by id/URL — the cross-device recovery path. */
  relink: (idOrUrl: string) => Promise<boolean>;
  disconnect: () => void;
  /** Recovery for wrongAccount: abandon the remembered sheet, then connect()
      again so a fresh spreadsheet is created for the currently-signed-in account. */
  useThisAccountInstead: () => Promise<void>;
  /** Deliberate "start a new sheet" from Settings — same primitive as
      useThisAccountInstead, own name/doc comment since it's a different
      feature reached from a different place, not an error recovery. */
  startNewSheet: () => Promise<void>;
  /**
   * `allowInteractive` (default true) must be passed `false` for any caller
   * that isn't a direct, current user click — e.g. the `online` browser
   * event, which fires whenever the network reconnects and can happen while
   * the tab isn't even focused. Defaulting this to "allowed" is what let a
   * Google popup appear while the window wasn't in use on TrackerA
   * (confirmed 2026-07-13); ported the fix here 2026-07-15 before this app
   * had the same bug reported live.
   */
  syncNow: (allowInteractive?: boolean) => Promise<void>;
  /**
   * What the sync pill's click calls, in Header AND Sidebar — centralized so
   * a failure (e.g. a blocked popup) surfaces right where the user clicked,
   * and so both pills agree on what "tap to fix this" actually does instead
   * of one merely navigating to Settings and hoping the user finds the real
   * button there themselves.
   */
  tapToRetry: () => Promise<void>;
}

let flashTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Flip needsReauth on. Kept as its own function (rather than inlining
 * `set({needsReauth: true})` at every call site) purely so a future need for
 * one-time-per-episode behavior (e.g. a toast fired only the first time this
 * flips, not on every retry) has somewhere to live without touching every
 * caller.
 */
function flagNeedsReauth(_get: () => SyncState, set: (p: Partial<SyncState>) => void) {
  set({ needsReauth: true });
}

export const useSync = create<SyncState>((set, get) => ({
  // "synced" here does NOT mean a push actually succeeded — it's a blind
  // guess based only on network state. If a prior session left work pending
  // (sync.hasPendingPush(), restored from localStorage — see syncDirty.ts's
  // doc comment) show "syncing" instead so the pill reflects reality; the
  // boot-time resumePendingPush() below immediately resumes that push.
  status: navigator.onLine ? (sync.hasPendingPush() ? "syncing" : "synced") : "offline",
  pending: 0,
  connected: sync.isConnected(),
  spreadsheetId: sync.getSpreadsheetId(),
  previousSpreadsheetId: sync.getPreviousSpreadsheetId(),
  hasClientId,
  busy: false,
  error: "",
  wrongAccount: false,
  needsReauth: false,

  setStatus: (status) => set({ status }),

  touch: (collection) => {
    sync.markDirty(collection);
    if (get().connected) {
      sync.scheduleFlush(
        (s) => set({ status: s }),
        () => flagNeedsReauth(get, set)
      );
      return;
    }
    // Local-only mode: flash a quick "saved".
    if (!navigator.onLine) {
      set((s) => ({ status: "offline", pending: s.pending + 1 }));
      return;
    }
    set({ status: "syncing" });
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => set({ status: "synced", pending: 0 }), 400);
  },

  touchSettings: () => {
    sync.markSettingsDirty();
    if (get().connected) {
      sync.scheduleFlush(
        (s) => set({ status: s }),
        () => flagNeedsReauth(get, set)
      );
      return;
    }
    if (!navigator.onLine) {
      set((s) => ({ status: "offline", pending: s.pending + 1 }));
      return;
    }
    set({ status: "syncing" });
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => set({ status: "synced", pending: 0 }), 400);
  },

  connect: async () => {
    set({ busy: true, error: "", wrongAccount: false, status: "syncing" });
    try {
      const id = await sync.connect();
      set({
        connected: true,
        spreadsheetId: id,
        busy: false,
        wrongAccount: false,
        needsReauth: false,
        status: "synced",
      });
    } catch (e) {
      const wrongAccount = e instanceof sync.SheetPermissionDeniedError;
      set({
        busy: false,
        wrongAccount,
        status: get().connected ? "synced" : "offline",
        error: wrongAccount
          ? "This Google account doesn't have access to your existing Social Planner sheet."
          : e instanceof Error ? e.message : "Could not connect.",
      });
    }
  },

  relink: async (idOrUrl) => {
    set({ busy: true, error: "", status: "syncing" });
    try {
      await sync.relink(idOrUrl);
      set({
        connected: true,
        spreadsheetId: sync.getSpreadsheetId(),
        busy: false,
        needsReauth: false,
        status: "synced",
      });
      return true;
    } catch (e) {
      set({
        busy: false,
        status: get().connected ? "synced" : "offline",
        error: e instanceof Error ? e.message : "Could not link that sheet.",
      });
      return false;
    }
  },

  disconnect: () => {
    sync.disconnect();
    // spreadsheetId is deliberately left in place — sync.disconnect() keeps
    // the sheet remembered so the next connect() relinks to it instead of
    // creating a new one; blanking it here would just make "Open my sheet"
    // disappear for no reason while disconnected.
    set({ connected: false, error: "", needsReauth: false });
  },

  useThisAccountInstead: async () => {
    sync.abandonRememberedSheet();
    set({ previousSpreadsheetId: sync.getPreviousSpreadsheetId() });
    await get().connect();
  },

  /**
   * Deliberate "give me a brand new sheet" for an already-connected user —
   * reached from its own Settings action, not the wrongAccount error
   * recovery flow. Calls sync.createNewSheet(), NOT connect() — see that
   * function's own doc comment for why the old sheet must not be abandoned
   * until the new one is confirmed reachable.
   */
  startNewSheet: async () => {
    set({ busy: true, error: "", status: "syncing" });
    try {
      const id = await sync.createNewSheet();
      set({
        connected: true,
        spreadsheetId: id,
        previousSpreadsheetId: sync.getPreviousSpreadsheetId(),
        busy: false,
        needsReauth: false,
        status: "synced",
      });
    } catch (e) {
      set({
        busy: false,
        status: get().connected ? "synced" : "offline",
        error: e instanceof Error ? e.message : "Could not start a new sheet.",
      });
    }
  },

  syncNow: async (allowInteractive = true) => {
    if (!get().connected) return;
    set({ busy: true, status: "syncing", error: "" });
    try {
      await sync.pushAll(allowInteractive, true); // manual sync = full push
      set({ busy: false, status: "synced", needsReauth: false });
    } catch (e) {
      const needsReauth = e instanceof sync.ReauthRequiredError;
      set({
        busy: false,
        status: "offline",
        needsReauth,
        error: e instanceof Error ? e.message : "Sync failed.",
      });
    }
  },

  // syncNow() already tries a silent refresh before ever falling back to a
  // popup (see authedFetch's chain), so calling it here for BOTH the
  // needsReauth and non-needsReauth cases is enough — no separate
  // interactive-first path needed. A still-valid-but-uncached session (e.g.
  // right after a reload) reconnects with zero popup; a genuinely lapsed one
  // escalates to the popup this click's user gesture allows. No toast store
  // exists here (unlike TrackerA) — the ReconnectBanner and the pill's own
  // inline error text next to it already surface a failure right where the
  // user is looking, so this stays a plain re-export of syncNow rather than
  // adding one just for this.
  tapToRetry: async () => {
    await get().syncNow(true);
  },
}));

/**
 * Resume any push a prior session left pending (see sync.ts's
 * hasPendingPush()/DirtyTabs persistence) instead of leaving it stuck until
 * the next unrelated edit happens to touch the same tab. Silent only
 * (allowInteractive is baked into attemptPush -> pushAll -> writeTab as
 * false) — a page load has no click behind it, same rule as every other
 * background path in this chain.
 *
 * MUST be called only after the Zustand stores have actually been hydrated
 * from IndexedDB (i.e. after bootstrap() resolves), never at this module's
 * own top-level scope. This module is imported (directly or transitively) by
 * bootstrap.ts itself, so its synchronous top-level code runs during initial
 * script evaluation — well before bootstrap()'s async IndexedDB reads even
 * start. A push resumed that early would read tabValues() off the stores'
 * still-empty defaults and clear+overwrite the real Sheet tab with nothing
 * but a header row, even though the real data was sitting untouched in
 * IndexedDB the whole time.
 */
export function resumePendingPush(): void {
  if (sync.hasPendingPush()) {
    sync.attemptPush(
      (s) => useSync.setState({ status: s }),
      () => flagNeedsReauth(useSync.getState, useSync.setState)
    );
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    const st = useSync.getState();
    // false: the network reconnecting has nothing to do with a user click and
    // can fire while the tab isn't even focused — must never risk a popup.
    // If a real reauth is needed, this fails fast (ReauthRequiredError) and
    // the sync pill shows "Tap to reconnect" for the user to click when ready.
    if (st.connected) void st.syncNow(false);
    else useSync.setState({ status: "synced", pending: 0 });
  });
  window.addEventListener("offline", () => useSync.setState({ status: "offline" }));

  // Proactively top up the Google token between edits instead of only ever
  // checking reactively at the exact moment a save needs one — see
  // sync.ts's keepTokenWarm() doc comment for why the reactive-only version
  // makes reconnecting feel like it ambushes active work.
  const warmUp = () =>
    void sync.keepTokenWarm(
      useSync.getState().needsReauth,
      () => flagNeedsReauth(useSync.getState, useSync.setState)
    );
  // Also run once immediately on boot, not just on the interval/visibility
  // triggers below — those only fire 5 minutes in, or on a hidden→visible
  // transition, neither of which covers the tab having been fully CLOSED
  // and reopened (a fresh page load starts "visible" already, so there's no
  // hidden→visible transition to catch it). Without this, reopening the app
  // after being away for a while showed no sign anything was wrong until
  // the next scheduled check, minutes later.
  warmUp();
  setInterval(warmUp, 5 * 60_000);
  // The setInterval above is NOT enough on its own: browsers throttle timers
  // in a backgrounded/minimized tab, so "left the tab open in the
  // background for a while" is exactly the case where the token can slip
  // past its refresh margin with no proactive check catching it. Also check
  // immediately whenever the tab regains focus, same pattern main.tsx
  // already uses for its own service-worker update check.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") warmUp();
  });
}
