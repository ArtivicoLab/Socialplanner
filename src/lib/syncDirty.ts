// Per-collection dirty tracking for Sheets sync. The debounced push used to
// rewrite ALL tabs on every mutation — for someone with a busy Scheduler that
// means re-uploading the whole Posts tab because one hashtag group's name
// changed. Now each mutation marks only its own tab dirty, and a flush
// rewrites just those. A full push (connect / manual "Sync now") forces all
// tabs so headers + empty tabs are still created.
//
// Persisted to localStorage (not just an in-memory Set) — added 2026-07-15
// after a real, confirmed bug: a reload before a debounced push completed
// (or after a background push failed silently, e.g. an expired token) wiped
// this in-memory state, so the NEXT load had no memory that anything was
// still unsynced. useSync.ts's initial status then defaulted to "Synced"
// purely from `navigator.onLine` being true — a lie: the edit was safe in
// IndexedDB, but it had never actually reached the Sheet, and nothing was
// left to notice or retry it. See useSync.ts's `resumePendingPush()` and
// sync.ts's `hasPendingPush()`, which read this persisted state on boot.
//
// Pure; sync.ts holds one module singleton.
const LS_DIRTY_TABS = "sp.dirtyTabs";

function loadPersisted(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_DIRTY_TABS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : []);
  } catch {
    return new Set();
  }
}

export class DirtyTabs {
  private set = loadPersisted();

  private persist(): void {
    try {
      localStorage.setItem(LS_DIRTY_TABS, JSON.stringify([...this.set]));
    } catch {
      // localStorage unavailable (private mode, quota) — in-memory Set still
      // covers this page load, just won't survive a reload.
    }
  }

  /** Mark one tab dirty. */
  markTab(tab: string): void {
    this.set.add(tab);
    this.persist();
  }

  /** Mark every tab dirty (untagged mutation → safe fallback = push everything). */
  markAll(tabs: string[]): void {
    for (const t of tabs) this.set.add(t);
    this.persist();
  }

  clear(tab: string): void {
    this.set.delete(tab);
    this.persist();
  }

  get size(): number {
    return this.set.size;
  }

  /**
   * Which tabs to push, preserving `allTabs` order. Everything when `force` is
   * set or nothing is tracked (first connect / manual sync); otherwise just the
   * dirty subset.
   */
  toPush(allTabs: string[], force = false): string[] {
    if (force || this.set.size === 0) return [...allTabs];
    return allTabs.filter((t) => this.set.has(t));
  }
}
