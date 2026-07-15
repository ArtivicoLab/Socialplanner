// Row-granular merge for Sheets sync (competitor-parity #21, Layer 2 foundation).
//
// The old pull() replaced local data wholesale with the sheet — fine for one
// user, but on a second device it would clobber that device's un-pushed edits.
// This merges by row id, keeping whichever copy has the newer `updatedAt`
// (last-writer-wins PER ROW, not per whole tab). Rows present on only one side
// are kept. `localContributed` tells the caller a local row survived, so it can
// mark that tab dirty and push it back to converge the sheet.
//
// Known limitation (why we still don't market simultaneous editing): there are
// no tombstones, so a row deleted on device A reappears from device B's copy.
// True concurrent editing needs delete markers — deferred. Pure + tested.
export interface MergeResult<T> {
  merged: T[];
  localContributed: boolean;
}

export function mergeById<T extends { id: string; updatedAt: string }>(
  local: T[],
  remote: T[]
): MergeResult<T> {
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const localById = new Map(local.map((r) => [r.id, r]));

  // Remote order first, then any local-only rows appended — stable and
  // deterministic (no Date/random).
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const r of remote) if (!seen.has(r.id)) { ids.push(r.id); seen.add(r.id); }
  for (const l of local) if (!seen.has(l.id)) { ids.push(l.id); seen.add(l.id); }

  let localContributed = false;
  const merged: T[] = [];
  for (const id of ids) {
    const r = remoteById.get(id);
    const l = localById.get(id);
    if (r && l) {
      // Newer wins; a tie favors remote so devices converge toward the sheet.
      if ((l.updatedAt ?? "") > (r.updatedAt ?? "")) {
        merged.push(l);
        localContributed = true;
      } else {
        merged.push(r);
      }
    } else if (r) {
      merged.push(r);
    } else if (l) {
      merged.push(l);
      localContributed = true;
    }
  }
  return { merged, localContributed };
}
