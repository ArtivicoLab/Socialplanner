import { create } from "zustand";
import { hasClientId } from "../lib/google/auth";
import * as sync from "../lib/sync";

export type SyncStatus = "synced" | "syncing" | "offline";

interface SyncState {
  status: SyncStatus;
  pending: number;
  connected: boolean;
  spreadsheetId: string;
  hasClientId: boolean;
  busy: boolean;
  error: string;

  setStatus: (s: SyncStatus) => void;
  /** Called after every mutation; debounced push to Sheets when connected.
      `collection` marks only that tab dirty so a flush rewrites just what
      changed (omit → all tabs, the safe fallback). */
  touch: (collection?: string) => void;

  connect: () => Promise<void>;
  /** Link to an existing Sheet by id/URL — the cross-device recovery path. */
  relink: (idOrUrl: string) => Promise<boolean>;
  disconnect: () => void;
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
  hasClientId,
  busy: false,
  error: "",

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

  connect: async () => {
    set({ busy: true, error: "", status: "syncing" });
    try {
      const id = await sync.connect();
      set({
        connected: true,
        spreadsheetId: id,
        busy: false,
        status: "synced",
      });
    } catch (e) {
      set({
        busy: false,
        status: get().connected ? "synced" : "offline",
        error: e instanceof Error ? e.message : "Could not connect.",
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
