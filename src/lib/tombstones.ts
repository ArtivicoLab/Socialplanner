// Delete markers (competitor-parity #21, Layer 2). Row-granular merge alone
// resurrects deletions: a row deleted on device A is re-added when A pulls B's
// copy (union). A tombstone records "id X was deleted at time T"; the merge then
// drops X unless it was EDITED after T (a newer edit un-deletes it). Tombstones
// themselves sync (their own Sheet tab) and merge across devices.
//
// Stored in the existing `kv` IndexedDB store + one Sheet tab — no new object
// store, no DB_VERSION bump. Kept in memory so sync can read them synchronously.
// Pure helpers are tested in tests/tombstones.test.ts.
import { getKV, setKV } from "./db";
import { nowIso } from "./id";
import { isDemo } from "./demo";
import { addDaysISO, todayISO } from "./dates";
import type { Tombstone } from "./types";

const KV_KEY = "tombstones";
// Drop tombstones older than this — by then every device has long since synced
// the deletion, so keeping them would just bloat the tab forever.
const TTL_DAYS = 120;

let list: Tombstone[] = [];

export function getTombstones(): Tombstone[] {
  return list;
}

export function setTombstones(next: Tombstone[]): void {
  list = next;
  void setKV(KV_KEY, list);
}

export async function loadTombstones(): Promise<void> {
  list = (await getKV<Tombstone[]>(KV_KEY)) ?? [];
}

/** Record a delete. No-op in demo (sample deletes must never persist/sync). */
export function recordTombstone(collection: string, id: string): void {
  if (isDemo() || !id) return;
  const t: Tombstone = { id, collection, deletedAt: nowIso() };
  setTombstones(upsertTombstone(list, t));
}

// ---- pure helpers ----

/** Add/replace a tombstone by id, keeping the newest deletedAt. */
export function upsertTombstone(list: Tombstone[], t: Tombstone): Tombstone[] {
  const out = list.filter((x) => x.id !== t.id);
  const existing = list.find((x) => x.id === t.id);
  out.push(existing && existing.deletedAt > t.deletedAt ? existing : t);
  return out;
}

/** Union two tombstone lists by id, keeping the newest deletedAt for each.
    `localContributed` = a local tombstone was newer/only-local (push it back). */
export function mergeTombstones(
  local: Tombstone[],
  remote: Tombstone[]
): { merged: Tombstone[]; localContributed: boolean } {
  const byId = new Map<string, Tombstone>();
  for (const r of remote) byId.set(r.id, r);
  let localContributed = false;
  for (const l of local) {
    const r = byId.get(l.id);
    if (!r) {
      byId.set(l.id, l);
      localContributed = true;
    } else if (l.deletedAt > r.deletedAt) {
      byId.set(l.id, l);
      localContributed = true;
    }
  }
  return { merged: [...byId.values()], localContributed };
}

/** Remove rows that a tombstone deleted, unless the row was edited afterwards
    (row.updatedAt > tombstone.deletedAt un-deletes it). */
export function applyTombstones<T extends { id: string; updatedAt: string }>(
  rows: T[],
  tombstones: Tombstone[]
): T[] {
  if (tombstones.length === 0) return rows;
  const dead = new Map(tombstones.map((t) => [t.id, t.deletedAt]));
  return rows.filter((r) => {
    const deletedAt = dead.get(r.id);
    if (deletedAt === undefined) return true;
    return (r.updatedAt ?? "") > deletedAt; // newer edit wins → keep
  });
}

/** Drop tombstones past their TTL so the tab doesn't grow without bound. */
export function pruneTombstones(list: Tombstone[], cutoffISO: string): Tombstone[] {
  return list.filter((t) => t.deletedAt >= cutoffISO);
}

/** The date TTL_DAYS before today — anything older is safe to forget. */
export function tombstoneCutoff(): string {
  return addDaysISO(todayISO(), -TTL_DAYS);
}
