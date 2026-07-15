import { describe, it, expect } from "vitest";
import { mergeById } from "../src/lib/merge";

type Row = { id: string; updatedAt: string; v: string };
const r = (id: string, updatedAt: string, v = id): Row => ({ id, updatedAt, v });

describe("mergeById", () => {
  it("adopts remote when local is empty (fresh device relink)", () => {
    const res = mergeById<Row>([], [r("a", "1"), r("b", "1")]);
    expect(res.merged.map((x) => x.id)).toEqual(["a", "b"]);
    expect(res.localContributed).toBe(false);
  });

  it("keeps the newer copy of a conflicting row per updatedAt", () => {
    const local = [r("a", "2026-07-07T10:00:00Z", "local-new")];
    const remote = [r("a", "2026-07-07T09:00:00Z", "remote-old")];
    const res = mergeById(local, remote);
    expect(res.merged).toEqual([r("a", "2026-07-07T10:00:00Z", "local-new")]);
    expect(res.localContributed).toBe(true);
  });

  it("favors remote on an exact tie (converge toward the sheet)", () => {
    const res = mergeById([r("a", "5", "local")], [r("a", "5", "remote")]);
    expect(res.merged[0].v).toBe("remote");
    expect(res.localContributed).toBe(false);
  });

  it("unions rows that exist on only one side", () => {
    const local = [r("a", "1"), r("c", "1")];
    const remote = [r("a", "2"), r("b", "1")];
    const res = mergeById(local, remote);
    expect(res.merged.map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
    expect(res.merged.find((x) => x.id === "a")!.updatedAt).toBe("2"); // remote newer
    expect(res.localContributed).toBe(true); // c is local-only
  });

  it("is deterministic: remote order first, then local-only rows", () => {
    const local = [r("z", "1"), r("a", "9", "local")];
    const remote = [r("a", "1"), r("m", "1")];
    const res = mergeById(local, remote);
    expect(res.merged.map((x) => x.id)).toEqual(["a", "m", "z"]);
  });

  it("reports no local contribution when remote wins everything", () => {
    const local = [r("a", "1")];
    const remote = [r("a", "2"), r("b", "2")];
    expect(mergeById(local, remote).localContributed).toBe(false);
  });
});
