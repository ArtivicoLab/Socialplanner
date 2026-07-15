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
}

let flashTimer: ReturnType<typeof setTimeout> | null = null;

export const useSync = create<SyncState>((set, get) => ({
  status: navigator.onLine ? "synced" : "offline",
  pending: 0,
  connected: sync.isConnected(),
  spreadsheetId: sync.getSpreadsheetId(),
  previousSpreadsheetId: sync.getPreviousSpreadsheetId(),
  hasClientId,
  busy: false,
  error: "",
  wrongAccount: false,

  setStatus: (status) => set({ status }),

  touch: (collection) => {
    sync.markDirty(collection);
    if (get().connected) {
      sync.scheduleFlush((s) => set({ status: s }));
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
      sync.scheduleFlush((s) => set({ status: s }));
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
    set({ connected: false, error: "" });
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
      set({ busy: false, status: "synced" });
    } catch (e) {
      set({ busy: false, status: "offline", error: e instanceof Error ? e.message : "Sync failed." });
    }
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    const st = useSync.getState();
    // false: the network reconnecting has nothing to do with a user click and
    // can fire while the tab isn't even focused — must never risk a popup.
    if (st.connected) void st.syncNow(false);
    else useSync.setState({ status: "synced", pending: 0 });
  });
  window.addEventListener("offline", () => useSync.setState({ status: "offline" }));
}
