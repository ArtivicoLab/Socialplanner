// Domain types — mirror the Google Sheet schema (see schema.ts).
// Social Planner is content-only: scheduled posts, hashtag groups, a content
// idea bank, per-platform monthly performance, the platform list itself, and
// calendar highlight dates.

// Retained as lightweight shared vocabularies (e.g. category swatch helpers in
// lib/ui.ts) even though the task-centric screens that once drove them are gone.
export type Priority = "VeryLow" | "Low" | "Medium" | "High" | "VeryHigh";
export type Status =
  | "NotStarted"
  | "InProgress"
  | "OnHold"
  | "Pending"
  | "Delayed"
  | "Completed"
  | "Cancelled";

// ---- Posts (the Content Scheduler — the heart of the app) ----
export type PostFormat = "post" | "reel" | "story" | "carousel" | "video";

export type PostStatus =
  | "notstarted"
  | "inprogress"
  | "draft" // draft ready
  | "scheduled"
  | "published";

export const POST_STATUSES: PostStatus[] = [
  "notstarted",
  "inprogress",
  "draft",
  "scheduled",
  "published",
];

export const POST_FORMATS: PostFormat[] = ["post", "reel", "story", "carousel", "video"];

export interface Post {
  id: string;
  date: string; // ISO yyyy-mm-dd ("" = unscheduled / idea parked in the scheduler)
  time: string; // "HH:mm" 24h ("" = no time picked)
  pillar: string; // content pillar (Promotion / Education / …) — colored like a category
  format: PostFormat;
  goal: string; // Sales / Follows / Likes / Views / Saves … free text
  idea: string; // short working title ("Productivity tip")
  status: PostStatus;
  hook: string; // scroll-stopper first line
  caption: string; // main body text
  cta: string; // call to action line
  hashtagGroupId: string; // link into HashtagGroups ("" = none)
  hashtags: string; // extra manual tags, space-separated ("#a #b")
  platforms: string[]; // platform names this post goes to (up to 8)
  image: string; // image URL for the feed-preview / calendar tile, exactly like
  // Google Sheets' =IMAGE(url) — one text cell, syncs everywhere ("" = none).
  cover: string; // fallback swatch token when there's no image ("" = auto by pillar)
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** The copy-paste text for a post: hook, caption, CTA and hashtags (group tags
 *  + manual extras) smartly combined into one clean block. */
export function combinedPostText(p: Post, groupTags: string): string {
  const tagLine = [groupTags.trim(), p.hashtags.trim()].filter(Boolean).join(" ");
  return [p.hook.trim(), p.caption.trim(), p.cta.trim(), tagLine]
    .filter(Boolean)
    .join("\n\n");
}

// ---- Hashtag groups (create once, reuse everywhere) ----
export interface HashtagGroup {
  id: string;
  name: string; // "Content Creation", "Small Business / Entrepreneurs" …
  tags: string; // space-separated "#contentcreator #createcontent …"
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ---- Content idea bank ----
export interface Idea {
  id: string;
  title: string;
  notes: string;
  pillar: string; // suggested pillar ("" = none yet)
  format: PostFormat;
  used: boolean; // turned into a scheduled post
  createdAt: string;
  updatedAt: string;
}

// ---- Platforms (the up-to-8 channels + their monthly goals) ----
export interface Platform {
  id: string;
  name: string; // "Instagram", "TikTok" …
  active: boolean; // shown in pickers / feed preview
  order: number;
  followersGoal: number; // monthly goals (0 = no goal)
  engagementGoal: number; // % — engagement rate goal
  reachGoal: number;
  createdAt: string;
  updatedAt: string;
}

// ---- Performance (per platform per month) ----
export interface PerfEntry {
  id: string;
  platform: string; // platform name (matches Platform.name)
  month: string; // "yyyy-MM"
  followers: number;
  engagement: number; // % engagement rate
  reach: number;
  createdAt: string;
  updatedAt: string;
}

// ---- Calendar highlight dates (Pay Day / Launch Day / Travel …) ----
export interface Highlight {
  id: string;
  date: string; // ISO yyyy-mm-dd
  label: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Mood board (pinned inspiration images, one board per calendar month) ----
export interface MoodBoardPin {
  id: string;
  month: string; // "yyyy-MM" — which month's board this pin belongs to
  image: string; // image URL, exactly like Post.image ("" = local device photo instead)
  note: string; // optional short caption ("" = none)
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ---- Monthly goals (a short checklist of objectives, one list per month) ----
export interface MonthlyGoal {
  id: string;
  month: string; // "yyyy-MM"
  text: string; // "Boost Instagram engagement by 15%"
  done: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ---- Tombstones (delete markers so removals survive cross-device merges) ----
export interface Tombstone {
  id: string; // the deleted row's id
  collection: string; // which store it belonged to
  deletedAt: string; // ISO timestamp of the delete
}

export interface Settings {
  name: string; // what to call the user in greetings ("" = not set yet)
  weekStart: 0 | 1; // 0 = Sunday, 1 = Monday
  theme: "auto" | "light" | "dark" | "gallery";
  categories: string[]; // user-editable content pillars (add/rename/remove)
  categoryColors: Record<string, string>; // pillar name -> chosen swatch token; falls back to the auto-assigned color if unset
  goals: string[]; // the pickable post-goal list (Sales / Follows / …)
  hiddenRoutes: string[]; // nav sections the user has hidden (still reachable by URL)
  tabBarRoutes: string[]; // pinned routes shown in the mobile bottom bar, in order ("more" is always appended, never stored here)
  accessCode: string; // Etsy purchase code the buyer entered ("" = not activated)
  activated: boolean; // true once a valid accessCode was entered — unlocks Google Sheets connect
  hideAtsHint?: boolean;
  tourDone?: boolean;
  // ISO timestamp, bumped whenever a Sheet-synced field changes (name,
  // weekStart, categories, categoryColors, goals — see sync.ts's
  // pushSettingsMeta/pullSettingsMeta) — lets pull() apply last-write-wins
  // the same way every other collection already does, instead of a synced
  // Settings field always losing to whichever device pulls last.
  updatedAt: string;
}

// Default content pillars — the 5 FIXED swatches in lib/ui.ts map onto these.
export const DEFAULT_CATEGORIES = [
  "Promotion",
  "Education",
  "Entertainment",
  "Quote",
  "Lifestyle",
];

export const DEFAULT_GOALS = ["Sales", "Follows", "Likes", "Views", "Saves", "Shares"];

// The 8 platforms seeded for a new user (all editable / renameable).
export const DEFAULT_PLATFORMS = [
  "Instagram",
  "Facebook",
  "TikTok",
  "Pinterest",
  "YouTube",
  "LinkedIn",
  "Threads",
  "Twitter / X",
];
