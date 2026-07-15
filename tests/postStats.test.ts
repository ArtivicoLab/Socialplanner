import { describe, expect, it } from "vitest";
import { countByPillar, countByPlatform, feedPosts, planStats, postsByDay } from "../src/lib/postStats";
import type { Post } from "../src/lib/types";

let n = 0;
function post(patch: Partial<Post>): Post {
  return {
    id: `p${++n}`,
    date: "",
    time: "",
    pillar: "",
    format: "post",
    goal: "",
    idea: "",
    status: "notstarted",
    hook: "",
    caption: "",
    cta: "",
    hashtagGroupId: "",
    hashtags: "",
    platforms: [],
    image: "",
    cover: "",
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("planStats", () => {
  it("counts totals, published, and today's unpublished posts", () => {
    const posts = [
      post({ date: "2026-07-10", status: "published" }),
      post({ date: "2026-07-11", status: "scheduled" }),
      post({ date: "2026-07-11", status: "published" }),
      post({ date: "2026-07-12", status: "draft" }),
    ];
    const s = planStats(posts, "2026-07-11");
    expect(s.total).toBe(4);
    expect(s.published).toBe(2);
    expect(s.scheduledToday).toBe(1); // the published one today doesn't count
    // 4 posts across a 3-day span
    expect(s.avgPerDay).toBeCloseTo(4 / 3, 2);
  });

  it("handles empty and single-date plans", () => {
    expect(planStats([], "2026-07-11")).toEqual({
      total: 0, published: 0, scheduledToday: 0, avgPerDay: 0,
    });
    expect(planStats([post({ date: "2026-07-11" })], "2026-07-11").avgPerDay).toBe(1);
  });
});

describe("counters", () => {
  it("countByPillar sorts desc and buckets blanks as Unassigned", () => {
    const posts = [
      post({ pillar: "Education" }),
      post({ pillar: "Education" }),
      post({ pillar: "Promotion" }),
      post({}),
    ];
    expect(countByPillar(posts)).toEqual([
      { label: "Education", value: 2 },
      { label: "Promotion", value: 1 },
      { label: "Unassigned", value: 1 },
    ]);
  });

  it("countByPlatform counts one per platform assignment", () => {
    const posts = [
      post({ platforms: ["Instagram", "TikTok"] }),
      post({ platforms: ["Instagram"] }),
    ];
    expect(countByPlatform(posts)).toEqual([
      { label: "Instagram", value: 2 },
      { label: "TikTok", value: 1 },
    ]);
  });
});

describe("postsByDay", () => {
  it("only includes the month and sorts by time (timeless last)", () => {
    const a = post({ date: "2026-07-05", time: "18:00" });
    const b = post({ date: "2026-07-05", time: "06:00" });
    const c = post({ date: "2026-07-05", time: "" });
    const other = post({ date: "2026-06-30", time: "09:00" });
    const map = postsByDay([a, b, c, other], "2026-07");
    expect([...map.keys()]).toEqual(["2026-07-05"]);
    expect(map.get("2026-07-05")!.map((p) => p.id)).toEqual([b.id, a.id, c.id]);
  });
});

describe("feedPosts", () => {
  it("filters by platform and cutoff, newest first", () => {
    const a = post({ date: "2026-07-01", time: "09:00", platforms: ["Instagram"] });
    const b = post({ date: "2026-07-03", time: "07:00", platforms: ["Instagram"] });
    const late = post({ date: "2026-07-20", platforms: ["Instagram"] });
    const other = post({ date: "2026-07-02", platforms: ["TikTok"] });
    const undated = post({ platforms: ["Instagram"] });
    expect(feedPosts([a, b, late, other, undated], "Instagram", "2026-07-10").map((p) => p.id))
      .toEqual([b.id, a.id]);
  });

  it("orders same-day posts by time, newest first", () => {
    const early = post({ date: "2026-07-03", time: "06:00", platforms: ["Instagram"] });
    const lateP = post({ date: "2026-07-03", time: "20:00", platforms: ["Instagram"] });
    expect(feedPosts([early, lateP], "Instagram", "2026-07-10").map((p) => p.id))
      .toEqual([lateP.id, early.id]);
  });
});
