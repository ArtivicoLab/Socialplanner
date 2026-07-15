// Release notes shown on the "What's New" screen (Tesla-style: every deployed
// version gets a dated card of highlights). Newest entry MUST be first — the
// top entry's `version` is what the app compares against to decide whether to
// surface the "you just updated" banner and the unseen badge.
//
// When you ship a release worth announcing, prepend a new entry here. Keep it
// human: what the creator can now do, not the commit list.

export type ChangeKind = "new" | "improved" | "fixed";

export interface ChangeLine {
  kind: ChangeKind;
  text: string;
}

export interface Release {
  version: string; // matches package.json's major.minor (patch is the CI build number)
  date: string; // ISO yyyy-mm-dd of the release
  title: string; // short headline for the card
  summary: string; // one-line "what this update is about"
  changes: ChangeLine[];
}

export const CHANGELOG: Release[] = [
  {
    version: "1.0",
    date: "2026-07-12",
    title: "Social Planner is here",
    summary: "Plan every post once and watch it flow into your calendar, feed preview, and monthly plan.",
    changes: [
      { kind: "new", text: "Content Scheduler: plan posts with a pillar, format, goal, status, hook, caption, CTA, hashtags, an image link, and up to 8 platforms." },
      { kind: "new", text: "One-tap copy that combines your hook, caption, CTA, and hashtags into one clean block, ready to paste." },
      { kind: "new", text: "Content Calendar: a rolling 6-week view with today highlighted and your own highlight dates (Pay Day, Launch Day, and more)." },
      { kind: "new", text: "Monthly Plan: a visual month-by-month layout with post distribution per platform and a publishing progress ring." },
      { kind: "new", text: "Feed Preview: paste an image link on each post and see your real photo grid per platform before you post, sorted like a live feed." },
      { kind: "new", text: "Hashtag Manager: save your best tags in groups and auto-fill them on any post." },
      { kind: "new", text: "Idea Bank: park every content idea and promote it to a scheduled post when its moment comes." },
      { kind: "new", text: "Performance Tracker: log monthly followers, engagement, and reach per platform against your goals." },
      { kind: "new", text: "Works fully offline, installs like an app, and syncs to a spreadsheet in your own Google Drive." },
    ],
  },
];

export const LATEST = CHANGELOG[0];

const LS_SEEN = "changelogSeenVersion";

export function changelogSeenVersion(): string {
  try {
    return localStorage.getItem(LS_SEEN) ?? "";
  } catch {
    return "";
  }
}

export function markChangelogSeen(version: string = LATEST.version): void {
  try {
    localStorage.setItem(LS_SEEN, version);
  } catch {
    // storage blocked — worst case the banner reappears next visit
  }
}

/**
 * A returning user is on a newer release than the one they last acknowledged.
 * Brand-new visitors are seeded to the latest version on first boot (see
 * stores/bootstrap.ts) so they don't get a "you just updated" banner for a
 * version they never actually ran before.
 */
export function hasUnseenUpdate(): boolean {
  const seen = changelogSeenVersion();
  return seen !== "" && seen !== LATEST.version;
}

/** First boot only: remember the current version silently so first-timers see
 *  no update banner, while every later deploy does surface one. */
export function seedChangelogSeenIfFirstRun(): void {
  if (changelogSeenVersion() === "") markChangelogSeen();
}

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
};
