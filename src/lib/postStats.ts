// Pure post-plan math shared by Dashboard / Monthly Plan / Feed Preview.
// Keep this free of store imports so it stays unit-testable.

import type { Post } from "./types";
import { todayISO } from "./dates";

export interface PlanStats {
  total: number;
  published: number;
  scheduledToday: number;
  avgPerDay: number; // across the span of dated posts (0 when < 2 dates)
}

/** Headline numbers for the stat tiles (Total / Published / Avg per day / Today). */
export function planStats(posts: Post[], refIso = todayISO()): PlanStats {
  const dated = posts.filter((p) => p.date);
  const dates = [...new Set(dated.map((p) => p.date))].sort();
  let avg = 0;
  if (dates.length >= 2) {
    const first = dates[0];
    const last = dates[dates.length - 1];
    const span =
      (new Date(last + "T00:00:00").getTime() - new Date(first + "T00:00:00").getTime()) /
        86_400_000 +
      1;
    avg = Math.round((dated.length / span) * 100) / 100;
  } else if (dates.length === 1) {
    avg = dated.length;
  }
  return {
    total: posts.length,
    published: posts.filter((p) => p.status === "published").length,
    scheduledToday: dated.filter((p) => p.date === refIso && p.status !== "published").length,
    avgPerDay: avg,
  };
}

/** Post count per pillar (sorted desc) — the content-mix chart. */
export function countByPillar(posts: Post[]): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const p of posts) {
    const key = p.pillar || "Unassigned";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/** Post count per platform (a post on 3 platforms counts once per platform). */
export function countByPlatform(posts: Post[]): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const p of posts) {
    for (const pl of p.platforms) map.set(pl, (map.get(pl) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/** Posts within a month ("yyyy-MM"), day-keyed for the Monthly Plan grid. */
export function postsByDay(posts: Post[], monthPrefix: string): Map<string, Post[]> {
  const map = new Map<string, Post[]>();
  for (const p of posts) {
    if (!p.date.startsWith(monthPrefix)) continue;
    const list = map.get(p.date) ?? [];
    list.push(p);
    map.set(p.date, list);
  }
  for (const list of map.values()) list.sort(byTimeThenCreated);
  return map;
}

/** Feed order for a platform preview: newest first (like a real feed), only
 *  posts assigned to `platform`, only up to the cutoff date (inclusive). */
export function feedPosts(posts: Post[], platform: string, uptoIso: string): Post[] {
  return posts
    .filter((p) => p.date && p.date <= uptoIso && p.platforms.includes(platform))
    .sort((a, b) => (a.date === b.date ? cmpTime(b.time, a.time) : b.date < a.date ? -1 : 1));
}

function cmpTime(a: string, b: string): number {
  return (a || "99:99") < (b || "99:99") ? -1 : a === b ? 0 : 1;
}

function byTimeThenCreated(a: Post, b: Post): number {
  const t = cmpTime(a.time, b.time);
  return t !== 0 ? t : a.createdAt < b.createdAt ? -1 : 1;
}
