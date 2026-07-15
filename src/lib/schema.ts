// Single source of truth for the Google Sheet layout (spec §4).
// Row 1 of every tab is a header written by the app. Records are keyed by `id`
// (column A) — NEVER by row position. Serializers here roundtrip a domain
// object <-> a flat string[] row so the Sheets sync layer stays trivial.

import type { HashtagGroup, Highlight, Idea, MonthlyGoal, MoodBoardPin, PerfEntry, Platform, Post, Tombstone } from "./types";

export const SPREADSHEET_TITLE = "Social Planner";
export const SCHEMA_VERSION = 1;

// Tab titles match the app's own nav labels where there's a 1:1 screen (so a
// buyer who opens their Sheet sees the same names they see in the app) —
// confirmed mismatched 2026-07-15 (tabs were still named after the internal
// TS types: Posts/HashtagGroups/Ideas, not "Scheduler"/"Hashtags"/"Idea
// Bank"). Platforms/Performance/Highlights/MoodBoard/MonthlyGoals/
// Tombstones/Meta are left as-is — they either already match, or (Mood
// board/Monthly goals/Tombstones/Meta) don't correspond 1:1 to a single nav
// screen, or are internal-only and never meant to be read by a user.
// Renaming a value here on an ALREADY-CONNECTED sheet does not by itself
// rename the live tab — see sync.ts's migrateLegacyTabNames, which must
// list the OLD value here as a `from` before you change it, or an existing
// user's tab gets orphaned (ensureTabs only adds missing tabs, it doesn't
// rename existing ones).
export const TAB = {
  Meta: "Meta",
  Posts: "Scheduler",
  HashtagGroups: "Hashtags",
  Ideas: "Idea Bank",
  Platforms: "Platforms",
  Performance: "Performance",
  Highlights: "Highlights",
  MoodBoard: "MoodBoard",
  MonthlyGoals: "MonthlyGoals",
  Tombstones: "Tombstones",
} as const;

// Tabs created (headers only) alongside the per-collection sync tabs. Meta is a
// key/value tab carrying the buyer's Etsy access code across devices.
export const V2_TABS = [TAB.Meta] as const;

export const HEADERS: Record<string, string[]> = {
  [TAB.Meta]: ["key", "value"],
  [TAB.Posts]: [
    "id", "date", "time", "pillar", "format", "goal", "idea", "status",
    "hook", "caption", "cta", "hashtagGroupId", "hashtags", "platforms",
    "image", "cover", "notes", "createdAt", "updatedAt",
  ],
  [TAB.HashtagGroups]: ["id", "name", "tags", "order", "createdAt", "updatedAt"],
  [TAB.Ideas]: [
    "id", "title", "notes", "pillar", "format", "used", "createdAt", "updatedAt",
  ],
  [TAB.Platforms]: [
    "id", "name", "active", "order", "followersGoal", "engagementGoal",
    "reachGoal", "createdAt", "updatedAt",
  ],
  [TAB.Performance]: [
    "id", "platform", "month", "followers", "engagement", "reach",
    "createdAt", "updatedAt",
  ],
  [TAB.Highlights]: ["id", "date", "label", "createdAt", "updatedAt"],
  [TAB.MoodBoard]: ["id", "month", "image", "note", "order", "createdAt", "updatedAt"],
  [TAB.MonthlyGoals]: ["id", "month", "text", "done", "order", "createdAt", "updatedAt"],
  [TAB.Tombstones]: ["id", "collection", "deletedAt"],
};

// ---- primitive (de)serializers ----
const b = (v: boolean): string => (v ? "TRUE" : "FALSE");
const pb = (s: string | undefined): boolean => String(s).toUpperCase() === "TRUE";
const num = (n: number): string => String(n ?? 0);
const pn = (s: string | undefined): number => {
  const v = parseFloat(String(s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v : 0;
};
const s = (v: string | undefined): string => (v ?? "").toString();

// A post's platform list lives in ONE Sheet cell, "|"-separated, so a buyer
// scanning the sheet sees "Instagram|TikTok" instead of extra columns.
const PLATFORM_SEP = "|";
const packPlatforms = (list: string[]): string =>
  list.map((p) => p.trim()).filter(Boolean).join(PLATFORM_SEP);
const unpackPlatforms = (cell: string | undefined): string[] =>
  s(cell).split(PLATFORM_SEP).map((p) => p.trim()).filter(Boolean);

// ---- Posts ----
export function postToRow(p: Post): string[] {
  return [
    p.id, p.date, p.time, p.pillar, p.format, p.goal, p.idea, p.status,
    p.hook, p.caption, p.cta, s(p.hashtagGroupId), s(p.hashtags),
    packPlatforms(p.platforms), s(p.image), s(p.cover), s(p.notes), p.createdAt, p.updatedAt,
  ];
}
export function rowToPost(r: string[]): Post {
  return {
    id: s(r[0]), date: s(r[1]), time: s(r[2]), pillar: s(r[3]),
    format: (s(r[4]) || "post") as Post["format"],
    goal: s(r[5]), idea: s(r[6]),
    status: (s(r[7]) || "notstarted") as Post["status"],
    hook: s(r[8]), caption: s(r[9]), cta: s(r[10]),
    hashtagGroupId: s(r[11]), hashtags: s(r[12]),
    platforms: unpackPlatforms(r[13]), image: s(r[14]), cover: s(r[15]), notes: s(r[16]),
    createdAt: s(r[17]), updatedAt: s(r[18]),
  };
}

// ---- Hashtag groups ----
export function hashtagGroupToRow(g: HashtagGroup): string[] {
  return [g.id, g.name, g.tags, num(g.order), g.createdAt, g.updatedAt];
}
export function rowToHashtagGroup(r: string[]): HashtagGroup {
  return {
    id: s(r[0]), name: s(r[1]), tags: s(r[2]), order: pn(r[3]),
    createdAt: s(r[4]), updatedAt: s(r[5]),
  };
}

// ---- Ideas ----
export function ideaToRow(i: Idea): string[] {
  return [i.id, i.title, s(i.notes), s(i.pillar), i.format, b(i.used), i.createdAt, i.updatedAt];
}
export function rowToIdea(r: string[]): Idea {
  return {
    id: s(r[0]), title: s(r[1]), notes: s(r[2]), pillar: s(r[3]),
    format: (s(r[4]) || "post") as Idea["format"],
    used: pb(r[5]), createdAt: s(r[6]), updatedAt: s(r[7]),
  };
}

// ---- Platforms ----
export function platformToRow(p: Platform): string[] {
  return [
    p.id, p.name, b(p.active), num(p.order), num(p.followersGoal),
    num(p.engagementGoal), num(p.reachGoal), p.createdAt, p.updatedAt,
  ];
}
export function rowToPlatform(r: string[]): Platform {
  return {
    id: s(r[0]), name: s(r[1]), active: pb(r[2]), order: pn(r[3]),
    followersGoal: pn(r[4]), engagementGoal: pn(r[5]), reachGoal: pn(r[6]),
    createdAt: s(r[7]), updatedAt: s(r[8]),
  };
}

// ---- Performance entries ----
export function perfToRow(e: PerfEntry): string[] {
  return [
    e.id, e.platform, e.month, num(e.followers), num(e.engagement),
    num(e.reach), e.createdAt, e.updatedAt,
  ];
}
export function rowToPerf(r: string[]): PerfEntry {
  return {
    id: s(r[0]), platform: s(r[1]), month: s(r[2]), followers: pn(r[3]),
    engagement: pn(r[4]), reach: pn(r[5]), createdAt: s(r[6]), updatedAt: s(r[7]),
  };
}

// ---- Highlights ----
export function highlightToRow(h: Highlight): string[] {
  return [h.id, h.date, h.label, h.createdAt, h.updatedAt];
}
export function rowToHighlight(r: string[]): Highlight {
  return { id: s(r[0]), date: s(r[1]), label: s(r[2]), createdAt: s(r[3]), updatedAt: s(r[4]) };
}

// ---- Mood board pins ----
export function moodBoardPinToRow(m: MoodBoardPin): string[] {
  return [m.id, m.month, s(m.image), s(m.note), num(m.order), m.createdAt, m.updatedAt];
}
export function rowToMoodBoardPin(r: string[]): MoodBoardPin {
  return {
    id: s(r[0]), month: s(r[1]), image: s(r[2]), note: s(r[3]), order: pn(r[4]),
    createdAt: s(r[5]), updatedAt: s(r[6]),
  };
}

// ---- Monthly goals ----
export function monthlyGoalToRow(g: MonthlyGoal): string[] {
  return [g.id, g.month, s(g.text), b(g.done), num(g.order), g.createdAt, g.updatedAt];
}
export function rowToMonthlyGoal(r: string[]): MonthlyGoal {
  return {
    id: s(r[0]), month: s(r[1]), text: s(r[2]), done: pb(r[3]), order: pn(r[4]),
    createdAt: s(r[5]), updatedAt: s(r[6]),
  };
}

// ---- Tombstones (delete markers) ----
export function tombstoneToRow(t: Tombstone): string[] {
  return [t.id, t.collection, t.deletedAt];
}
export function rowToTombstone(r: string[]): Tombstone {
  return { id: s(r[0]), collection: s(r[1]), deletedAt: s(r[2]) };
}
