import { describe, it, expect } from "vitest";
import {
  upsertTombstone,
  mergeTombstones,
  applyTombstones,
  pruneTombstones,
} from "../src/lib/tombstones";
import type { Tombstone } from "../src/lib/types";

const tomb = (id: string, deletedAt: string, collection = "transactions"): Tombstone => ({ id, collection, deletedAt });
const row = (id: string, updatedAt: string) => ({ id, updatedAt });

describe("upsertTombstone", () => {
  it("keeps the newest deletedAt for an id", () => {
    const list = [tomb("a", "2026-01-01")];
    expect(upsertTombstone(list, tomb("a", "2026-02-01"))[0].deletedAt).toBe("2026-02-01");
    expect(upsertTombstone(list, tomb("a", "2025-12-01"))[0].deletedAt).toBe("2026-01-01");
  });
});

describe("mergeTombstones", () => {
  it("unions by id, newest wins", () => {
    const { merged } = mergeTombstones([tomb("a", "2"), tomb("b", "1")], [tomb("a", "1"), tomb("c", "1")]);
    expect(merged.map((t) => t.id).sort()).toEqual(["a", "b", "c"]);
    expect(merged.find((t) => t.id === "a")!.deletedAt).toBe("2"); // local newer
  });
  it("flags a local-only or newer-local contribution", () => {
    expect(mergeTombstones([tomb("z", "1")], []).localContributed).toBe(true);
    expect(mergeTombstones([tomb("a", "1")], [tomb("a", "2")]).localContributed).toBe(false);
  });
});

describe("applyTombstones", () => {
  it("drops a deleted row", () => {
    const rows = [row("a", "2026-01-01"), row("b", "2026-01-01")];
    const out = applyTombstones(rows, [tomb("a", "2026-02-01")]);
    expect(out.map((r) => r.id)).toEqual(["b"]);
  });
  it("keeps a row edited after the delete (un-delete)", () => {
    const rows = [row("a", "2026-03-01")];
    const out = applyTombstones(rows, [tomb("a", "2026-02-01")]);
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });
  it("is a no-op with no tombstones", () => {
    const rows = [row("a", "1")];
    expect(applyTombstones(rows, [])).toBe(rows);
  });
});

describe("pruneTombstones", () => {
  it("drops entries older than the cutoff", () => {
    const list = [tomb("old", "2026-01-01"), tomb("new", "2026-06-01")];
    expect(pruneTombstones(list, "2026-03-01").map((t) => t.id)).toEqual(["new"]);
  });
});
