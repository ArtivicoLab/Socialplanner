import { describe, expect, it } from "vitest";
import {
  HEADERS,
  TAB,
  hashtagGroupToRow,
  highlightToRow,
  ideaToRow,
  perfToRow,
  platformToRow,
  postToRow,
  rowToHashtagGroup,
  rowToHighlight,
  rowToIdea,
  rowToPerf,
  rowToPlatform,
  rowToPost,
  rowToTombstone,
  tombstoneToRow,
} from "../src/lib/schema";
import { combinedPostText } from "../src/lib/types";
import type { HashtagGroup, Highlight, Idea, PerfEntry, Platform, Post, Tombstone } from "../src/lib/types";

const post: Post = {
  id: "p1",
  date: "2026-07-11",
  time: "09:30",
  pillar: "Promotion",
  format: "reel",
  goal: "Sales",
  idea: "Productivity tip",
  status: "scheduled",
  hook: "Struggling to stay focused?",
  caption: "Here's the 5-minute rule.",
  cta: "Save this!",
  hashtagGroupId: "g1",
  hashtags: "#extra #tags",
  platforms: ["Instagram", "TikTok"],
  image: "https://example.com/pic.jpg",
  cover: "var(--cat-pink)",
  notes: "check b-roll",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z",
};

describe("schema roundtrips", () => {
  it("post -> row -> post", () => {
    const row = postToRow(post);
    expect(row).toHaveLength(HEADERS[TAB.Posts].length);
    expect(rowToPost(row)).toEqual(post);
  });

  it("packs platforms into one |-separated cell", () => {
    const row = postToRow(post);
    expect(row[13]).toBe("Instagram|TikTok");
    // tolerate stray whitespace / empty segments coming back from the sheet
    expect(rowToPost([...row.slice(0, 13), " Instagram |  | TikTok ", ...row.slice(14)]).platforms)
      .toEqual(["Instagram", "TikTok"]);
  });

  it("defaults blank enums safely", () => {
    const p = rowToPost(["x1"]);
    expect(p.format).toBe("post");
    expect(p.status).toBe("notstarted");
    expect(p.platforms).toEqual([]);
  });

  it("hashtag group -> row -> group", () => {
    const g: HashtagGroup = {
      id: "g1", name: "Content Creation", tags: "#a #b", order: 2,
      createdAt: "c", updatedAt: "u",
    };
    expect(rowToHashtagGroup(hashtagGroupToRow(g))).toEqual(g);
  });

  it("idea -> row -> idea", () => {
    const i: Idea = {
      id: "i1", title: "Desk tour", notes: "", pillar: "Lifestyle",
      format: "video", used: true, createdAt: "c", updatedAt: "u",
    };
    expect(rowToIdea(ideaToRow(i))).toEqual(i);
  });

  it("platform -> row -> platform", () => {
    const p: Platform = {
      id: "pl1", name: "Instagram", active: true, order: 0,
      followersGoal: 5000, engagementGoal: 6, reachGoal: 20000,
      createdAt: "c", updatedAt: "u",
    };
    expect(rowToPlatform(platformToRow(p))).toEqual(p);
  });

  it("perf entry -> row -> perf entry (decimals survive)", () => {
    const e: PerfEntry = {
      id: "e1", platform: "TikTok", month: "2026-07",
      followers: 3100, engagement: 6.5, reach: 15000,
      createdAt: "c", updatedAt: "u",
    };
    expect(rowToPerf(perfToRow(e))).toEqual(e);
  });

  it("highlight -> row -> highlight", () => {
    const h: Highlight = { id: "h1", date: "2026-07-19", label: "Launch Day", createdAt: "c", updatedAt: "u" };
    expect(rowToHighlight(highlightToRow(h))).toEqual(h);
  });

  it("tombstone -> row -> tombstone", () => {
    const t: Tombstone = { id: "t1", collection: "posts", deletedAt: "2026-07-11T00:00:00.000Z" };
    expect(rowToTombstone(tombstoneToRow(t))).toEqual(t);
  });
});

describe("combinedPostText", () => {
  it("joins hook / caption / cta / tags with blank lines", () => {
    expect(combinedPostText(post, "#group #tags")).toBe(
      "Struggling to stay focused?\n\nHere's the 5-minute rule.\n\nSave this!\n\n#group #tags #extra #tags"
    );
  });

  it("skips empty sections", () => {
    expect(combinedPostText({ ...post, caption: "", cta: "", hashtags: "" }, "")).toBe(
      "Struggling to stay focused?"
    );
  });
});
