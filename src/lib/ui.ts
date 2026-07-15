// Small UI helpers shared across screens.

import type { PostFormat, PostStatus } from "./types";
import { useSettings } from "../stores/useSettings";

// The 5 default content pillars each own one of the 5 reserved swatches.
const FIXED: Record<string, string> = {
  Promotion: "var(--cat-pink)",
  Education: "var(--cat-teal)",
  Entertainment: "var(--cat-lavender)",
  Quote: "var(--cat-butter)",
  Lifestyle: "var(--cat-sky)",
};

// A separate pool for user-created pillars, distinct from the 5 tokens FIXED
// already claims — otherwise every custom pillar is guaranteed to hash onto a
// color one of the 5 defaults already uses (5 buckets, 5 defaults = 100%
// collision), making it visually indistinguishable from an existing pillar.
// Deliberately NOT --cat-cream here (confirmed live 2026-07-15): it's a true
// near-white, same as --surface in light mode, so a pillar silently
// auto-hashed onto it renders as an invisible white-on-white chip. It's
// still in PICKABLE_CATEGORY_COLORS below for a user to choose on purpose
// (they can see the swatch before picking it) — just excluded from blind
// hash-assignment.
const EXTENDED_PASTELS = [
  "var(--cat-mint)",
  "var(--cat-rose)",
  "var(--cat-gold)",
  "var(--cat-plum)",
  "var(--cat-steel)",
  "var(--cat-clay)",
  "var(--cat-cyan)",
  "var(--cat-crimson)",
  "var(--cat-charcoal)",
];

// All swatch tokens are pickable for any pillar — used by the Settings
// color-tag picker and the post editor's cover swatch.
export const PICKABLE_CATEGORY_COLORS = [
  "var(--cat-pink)", "var(--cat-teal)", "var(--cat-lavender)", "var(--cat-butter)", "var(--cat-sky)",
  "var(--cat-mint)", "var(--cat-rose)", "var(--cat-gold)", "var(--cat-plum)", "var(--cat-steel)", "var(--cat-clay)",
  "var(--cat-cyan)", "var(--cat-crimson)", "var(--cat-cream)", "var(--cat-charcoal)",
];

export function categoryColor(cat: string): string {
  const picked = useSettings.getState().categoryColors[cat];
  if (picked) return picked;
  if (FIXED[cat]) return FIXED[cat];
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0;
  return EXTENDED_PASTELS[h % EXTENDED_PASTELS.length];
}

// The text-safe color to put ON TOP OF a resolved "var(--cat-X)" swatch
// string (a pillar name, format label, etc. rendered directly on the fill,
// not on a neutral card background — that's what --cat-*-ink in tokens.css
// is for instead). Every swatch has a matching "-on" token (tokens.css) that
// resolves to white or near-black per theme, tuned per color since the
// swatches range from vivid/dark (most of light theme) to brightened/pastel
// (most of dark theme) — a single fixed --ink does NOT have reliable
// contrast against all of them. Works on any PICKABLE_CATEGORY_COLORS
// value, including a post's own `cover` override, not just a pillar's.
export function swatchTextColor(swatch: string): string {
  return swatch.replace(/\)$/, "-on)");
}

// Same, but resolved from a pillar name via categoryColor() — including a
// user's manual Settings pick, so it always tracks categoryColor()'s own
// resolution for that pillar.
export function categoryTextColor(cat: string): string {
  return swatchTextColor(categoryColor(cat));
}

// ---- Post status ----
export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  notstarted: "Not Started",
  inprogress: "In Progress",
  draft: "Draft Ready",
  scheduled: "Scheduled",
  published: "Published",
};

// Own dedicated hues so a status chip never reads as a pillar chip shown in
// the very same row (see tokens.css --src-* notes).
export const POST_STATUS_COLOR: Record<PostStatus, string> = {
  notstarted: "var(--muted)",
  inprogress: "var(--src-goal)",
  draft: "var(--src-bill)",
  scheduled: "var(--src-task)",
  published: "var(--success)",
};

export const POST_FORMAT_LABEL: Record<PostFormat, string> = {
  post: "Post",
  reel: "Reel",
  story: "Story",
  carousel: "Carousel",
  video: "Video",
};

/** Compact number for follower/reach stats: 950, 1.2K, 3.4M. */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}
