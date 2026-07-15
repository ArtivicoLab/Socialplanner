// Per-collection dirty tracking for Sheets sync (competitor-parity #22, scale).
// The debounced push used to rewrite ALL tabs on every mutation — at 10k+
// transactions that means re-uploading a ~1MB Transactions tab because one fund
// balance changed. Now each mutation marks only its own tab dirty, and a flush
// rewrites just those. A full push (connect / manual "Sync now") forces all
// tabs so headers + empty tabs are still created.
//
// Pure + tested (tests/syncDirty.test.ts); sync.ts holds one module singleton.
export class DirtyTabs {
  private set = new Set<string>();

  /** Mark one tab dirty. */
  markTab(tab: string): void {
    this.set.add(tab);
  }

  /** Mark every tab dirty (untagged mutation → safe fallback = push everything). */
  markAll(tabs: string[]): void {
    for (const t of tabs) this.set.add(t);
  }

  clear(tab: string): void {
    this.set.delete(tab);
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
