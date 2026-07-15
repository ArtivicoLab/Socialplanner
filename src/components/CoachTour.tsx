// Coach-mark tour. Each screen has its own short coach, scoped to only what's
// actually rendered there right now — no cross-screen auto-navigation. A step
// spotlights a real, existing element via a `data-tour="<key>"` attribute (see
// the various screens, TabBar, Sidebar) — never invents UI that isn't there.
// Steps whose target isn't currently in the DOM (e.g. a card that only shows
// once you have goals) are filtered out before the tour ever opens, so a page
// with nothing relevant to show just doesn't open one.
// "Seen forever" (for the one automatic first-run showing, on the Dashboard)
// persists in plain localStorage — a UI preference, not user data, so it
// deliberately does NOT ride along with the IndexedDB reset/activate flow in
// stores/bootstrap.ts.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type CSSProperties } from "react";
import { useRoute, type Route } from "../router";
import { Segmented } from "./Segmented";
import { isDemo } from "../lib/demo";
import { loadSampleIntoStores, setDemoMode } from "../stores/bootstrap";
import { suspendSync, resumeSync } from "../lib/sync";
import { useHashtagGroups, useHighlights, useIdeas, usePerformance, usePlatforms, usePosts } from "../stores/v2";

const TOUR_SEEN_KEY = "tourSeen";

interface TourStep {
  target: string; // matches a `data-tour` attribute value
  route?: Route; // screen this target lives on — omit for "dashboard"
  title: string;
  body: string;
  // Some targets only exist while the user is mid-action (e.g. the calendar
  // entry pickers appear only while typing). When a step names a `demo`, the
  // tour fires `coach:<demo>-on` while it's open so the screen can render a
  // safe, non-saving example that puts the target on screen to point at.
  demo?: string;
}

const STEPS: TourStep[] = [
  // ---------- Dashboard ----------
  {
    target: "dash-hero-actions",
    title: "Plan a post, or preview your feed",
    body: "Jump straight into planning a new post, or preview how your feed looks so far. Both one tap away.",
  },
  {
    target: "dash-hero-upnext",
    title: "Up next",
    body: "Your next few scheduled posts' photos, so you always know what's coming. Tap to open the full feed preview.",
  },
  {
    target: "stats",
    title: "Your content at a glance",
    body: "Total planned posts, how many are published, your average posts per day, and what's due today: always up to date as you plan.",
  },
  {
    target: "dash-today",
    title: "Today's posts",
    body: "Everything scheduled for today, with status and platforms. Tap a post to open it in the Scheduler.",
  },
  {
    target: "dash-quick",
    title: "Jump anywhere fast",
    body: "One tap to the Scheduler, Calendar, Feed Preview or Idea Bank. No digging through menus.",
  },
  {
    target: "dash-peek",
    title: "This week's feed, before it's live",
    body: "A quick peek at your first active platform's feed order, right on the dashboard. Tap it for the full mockup in Feed Preview.",
  },
  {
    target: "dash-pillars",
    title: "A balanced content mix",
    body: "How your plan splits across content pillars, so you can spot when one topic is taking over.",
  },
  {
    target: "dash-progress",
    title: "Publishing progress",
    body: "How much of this month's plan is already published, updating live every time you check a post off.",
  },
  {
    target: "dash-performance",
    title: "Performance, without leaving the dashboard",
    body: "Your latest follower counts per platform and how they've grown since last month.",
  },
  {
    target: "dash-platforms",
    title: "Where you're posting",
    body: "Posts per platform, so you can see if one channel is getting all your attention while others go quiet.",
  },
  {
    target: "nav-more",
    title: "Everything else lives here",
    body: "The Scheduler, Calendar, Monthly Plan, Feed Preview, Hashtags, Idea Bank and Performance are all one tap away.",
  },
  // ---------- Scheduler ----------
  {
    target: "sched-stats",
    route: "scheduler",
    title: "Your plan at a glance",
    body: "Planned posts, how many are published, your average per day, and what's due today. These update live as you work.",
  },
  {
    target: "sched-filters",
    route: "scheduler",
    title: "Filter and sort your plan",
    body: "Search, tap a status chip, or narrow by pillar, goal, format and platform to find exactly the posts you need.",
  },
  {
    target: "sched-list",
    route: "scheduler",
    title: "One row per post",
    body: "Date, time, pillar, status and platforms for every post. Tap a row to edit its hook, caption, CTA and hashtags.",
  },
  {
    target: "sched-status",
    route: "scheduler",
    title: "Update status right here",
    body: "Tap the status on any row to move a post from Not Started through to Published. No need to open the editor.",
  },
  {
    target: "sched-copy",
    route: "scheduler",
    title: "Copy-paste in one tap",
    body: "Your hook, caption, CTA and hashtags are combined into one clean text, ready to paste straight into the app you're posting on.",
  },
  {
    target: "sched-viewmore",
    route: "scheduler",
    title: "Load more as you go",
    body: "Only the first 20 posts show at once, so the page stays quick. Tap here whenever you want the next batch.",
  },
  {
    target: "sched-fab",
    route: "scheduler",
    title: "Plan a new post",
    body: "Capture the idea, pick a date, pillar and platforms: the calendar, monthly plan and feed preview update instantly.",
  },
  // ---------- Calendar ----------
  {
    target: "cal-toolbar",
    route: "calendar",
    title: "Move through time",
    body: "Step week by week with the arrows, jump to any date with the picker, and snap back with the Today button.",
  },
  {
    target: "cal-grid",
    route: "calendar",
    title: "Your 6-week view",
    body: "Every scheduled post laid out week by week, with today highlighted. Tap a day to see or add its posts, or tap a post to edit it.",
  },
  {
    target: "cal-moodboard",
    route: "calendar",
    title: "A mood board for the month",
    body: "Pin inspiration photos and notes for the month you're looking at, and tap any pin to see it full size. Great for keeping the vibe consistent before you shoot.",
  },
  {
    target: "cal-highlights",
    route: "calendar",
    title: "Mark important dates",
    body: "Launches, holidays, days off: highlight dates so your plan works around real life.",
  },
  // ---------- Monthly Plan ----------
  {
    target: "monthly-charts",
    route: "monthly",
    title: "Month progress",
    body: "Posts per platform and how much of the month's plan is already published, right beside the plan itself.",
  },
  {
    target: "monthly-grid",
    route: "monthly",
    title: "The month, visually",
    body: "Every post as a tile in its day, colored by pillar. Step months with the arrows to map out the whole year.",
  },
  // ---------- Feed Preview ----------
  {
    target: "feed-platform",
    route: "feed",
    title: "Pick a platform",
    body: "Choose a channel and a cutoff date: only posts scheduled to that platform show up, sorted like a real feed.",
  },
  {
    target: "feed-grid",
    route: "feed",
    title: "Your feed, before you post",
    body: "A grid mockup of how the feed will look, so you can keep it visually cohesive before anything goes live.",
  },
  // ---------- Hashtags ----------
  {
    target: "hash-groups",
    route: "hashtags",
    title: "Hashtag groups",
    body: "Save your best tags in named groups. Pick a group on any post and its tags are filled in automatically.",
  },
  {
    target: "hash-fab",
    route: "hashtags",
    title: "Create a group",
    body: "Group tags by campaign, pillar, niche, whatever fits your strategy.",
  },
  // ---------- Idea Bank ----------
  {
    target: "ideas-list",
    route: "ideas",
    title: "Never lose an idea",
    body: "Park every content idea here with a suggested pillar and format. Promote one to a scheduled post when its moment comes.",
  },
  {
    target: "ideas-fab",
    route: "ideas",
    title: "Capture fast",
    body: "A title is enough. Flesh it out later.",
  },
  // ---------- Performance ----------
  {
    target: "perf-platform",
    route: "performance",
    title: "One platform at a time",
    body: "Pick a channel to see its monthly followers, engagement rate and reach, and how they trend across the year.",
  },
  {
    target: "perf-charts",
    route: "performance",
    title: "Growth you can see",
    body: "Monthly bars and goal rings show whether you're on track. Log each month's numbers and the charts update instantly.",
  },
  // ---------- Settings ----------
  {
    target: "settings-demo",
    route: "settings",
    title: "Try before you commit",
    body: "Flip this to \"Demo on\" any time to explore the app full of realistic sample content, or back to \"My data\" to return to your own planner. Nothing you touch while Demo is on is ever saved to your device or your Sheet.",
  },
  {
    target: "settings-sheets",
    route: "settings",
    title: "Your Google Sheet is the real backup",
    body: "Enter your Etsy product code and tap Unlock, then Connect Google Sheets to create your spreadsheet: or tap \"Link a sheet from another device\" if you've already connected on your phone, no code needed. Once connected, use \"Open my sheet ↗\" to view the spreadsheet directly, \"Sync now\" to push changes immediately, or Disconnect to unlink (your sheet itself is never deleted).",
  },
  {
    target: "settings-help",
    route: "settings",
    title: "Get familiar, any time",
    body: "Tap the compass icon at the top of any screen to replay that screen's own quick guide, or tap \"Replay the welcome tour\" right here to see the full app introduction again from the start.",
  },
  {
    target: "settings-faq",
    route: "settings",
    title: "Stuck on something specific?",
    body: "Tap any question here to jump straight to the exact spotlight that answers it, wherever it lives, instead of stepping through a whole screen's tour to find the one tip you need.",
  },
  {
    target: "settings-tours",
    route: "settings",
    title: "Every screen's tour, in one place",
    body: "Tap any screen here to replay its full guided tour from the top, without having to open it first and find its own compass icon.",
  },
  {
    target: "settings-appearance",
    route: "settings",
    title: "Pick your look",
    body: "Auto follows your device's light or dark setting. Morning and Midnight lock in light or dark on purpose, and Gallery is an experimental art-inspired pine-green and terracotta theme. Switch any time: nothing else changes.",
  },
  {
    target: "settings-preferences",
    route: "settings",
    title: "Your name and your week",
    body: "Type your name in \"Your name\" and it shows up in the dashboard's greeting. \"Week starts on\" sets whether the Calendar and Monthly Plan grids begin each row on Sunday or Monday.",
  },
  {
    target: "settings-categories",
    route: "settings",
    title: "Color-code your content",
    body: "Tap a pillar's colored dot to open the color picker, tap its name to rename it right there, or tap the × to remove it. Type a new pillar in the box and tap Add (or press Enter) to create one.",
  },
  {
    target: "settings-goals",
    route: "settings",
    title: "Your pickable goal list",
    body: "This is the list a post's Goal field offers in the Scheduler, like Sales or Follows. Tap the × on any chip to remove one you never use, or add your own below.",
  },
  {
    target: "settings-platforms",
    route: "settings",
    title: "Manage every channel",
    body: "Use the ▲▼ chevron icons to reorder a platform, tap its name to rename it right there, flip the checkbox to switch it active or inactive without losing its history, or tap the × to delete it for good. Add a new one (up to 8) at the bottom.",
  },
  {
    target: "settings-sections",
    route: "settings",
    title: "Declutter your navigation",
    body: "Uncheck a module here to hide it from the sidebar and the More menu. Its data stays exactly where it is: this only changes what you see in navigation.",
  },
  {
    target: "settings-tabbar",
    route: "settings",
    title: "Customize your phone's bottom bar",
    body: "Tap any icon chip in the \"tap to add\" list below to pin it as a shortcut here, tap the × on a pinned row to unpin it, and press-and-hold any icon on the actual bottom bar to drag it into a new order. This only affects phones and narrow windows: your desktop sidebar always shows everything regardless.",
  },
  {
    target: "settings-yearreset",
    route: "settings",
    title: "A clean slate for a new year",
    body: "Tap \"Start a fresh year\" to choose exactly what to clear: scheduled posts, the performance log, or both. Your hashtag groups, idea bank, platforms, pillars and every other setting stay untouched, and nothing is deleted until you confirm in the sheet that opens.",
  },
  {
    target: "settings-contact",
    route: "settings",
    title: "We're one email away",
    body: "Tap \"Contact us\" to open your email app with our address and subject line already filled in: questions, bugs, feature ideas, anything at all.",
  },
  {
    target: "settings-danger",
    route: "settings",
    title: "The one irreversible button",
    body: "\"Start over (erase everything)\" wipes every post, idea, hashtag group and setting on this device for good, after one confirmation. If you're connected to Google Sheets, disconnect first in the Google Sheets card above, or you'll lose your only backup too.",
  },
  {
    target: "settings-footer",
    route: "settings",
    title: "Version, updates, and the fine print",
    body: "This version number always reflects exactly what's deployed. Tap \"Check for updates\" any time to grab the latest build, and \"Privacy & source\" links to the privacy policy and the app's own source code.",
  },
];

// A curated FAQ — the handful of things people actually get stuck on (this
// list started 2026-07-15 from a real one: "how do I change a pillar's
// color"), surfaced in Settings so a user can jump straight to the relevant
// coach spotlight instead of stepping through a whole screen's tour to find
// it. Deliberately a SUBSET of STEPS, not a duplicate of it — every entry's
// route+target must match a real STEPS entry (see the dev-time check right
// below) so the question text and the spotlight it opens can never drift
// apart, and adding a new FAQ entry can never silently point at nothing.
export interface FaqItem {
  question: string;
  route: Route;
  target: string;
}
export const FAQ_ITEMS: FaqItem[] = [
  // Confirmed missing 2026-07-15: the single most central action in the app
  // (create a post) had coach coverage but no FAQ entry pointing at it —
  // leads with it now, deliberately first in the list.
  { question: "How do I create my first post?", route: "dashboard", target: "dash-hero-actions" },
  { question: "How do I change a content pillar's color?", route: "settings", target: "settings-categories" },
  { question: "How do I connect my Google Sheet?", route: "settings", target: "settings-sheets" },
  { question: "How do I try the app without touching my real data?", route: "settings", target: "settings-demo" },
  { question: "How do I add a platform I don't see listed?", route: "settings", target: "settings-platforms" },
  { question: "How do I mark a post as published?", route: "scheduler", target: "sched-status" },
  { question: "How do I copy a post's caption to paste elsewhere?", route: "scheduler", target: "sched-copy" },
  { question: "How do I reuse the same hashtags on every post?", route: "hashtags", target: "hash-groups" },
  { question: "How do I turn an idea into a scheduled post?", route: "ideas", target: "ideas-list" },
  { question: "How do I start a new year with a clean slate?", route: "settings", target: "settings-yearreset" },
];
if (import.meta.env.DEV) {
  for (const item of FAQ_ITEMS) {
    const found = STEPS.some((s) => s.target === item.target && (s.route ?? "dashboard") === item.route);
    if (!found) {
      // eslint-disable-next-line no-console
      console.error(`FAQ_ITEMS: "${item.question}" points at ${item.route}/${item.target}, which has no matching STEPS entry.`);
    }
  }
}

/** Fired by Settings (the FAQ list, or the "All coach tours" list) —
 *  App.tsx listens, navigates to `route` first if needed, then opens
 *  CoachTour there. With `target`: jump straight to that one spotlight (an
 *  FAQ pick). Without it: the screen's full tour from the top, same as its
 *  own "Coach Tour: <Screen>" button. Mirrors the existing `coach:welcome`
 *  full-tour-replay event, generalized to any route instead of always
 *  Dashboard. */
export function openScreenTour(route: Route, target?: string): void {
  window.dispatchEvent(new CustomEvent("coach:faq", { detail: { route, target } }));
}

// Every screen that actually has a coach tour, in the order STEPS itself
// introduces them (dashboard first, then each screen banner in turn) — for
// Settings' "All coach tours" list. Derived from STEPS rather than
// hand-listed so a screen can never go stale/missing here if its tour steps
// change; labels reuse nav.tsx's ROUTE_LABELS so the wording always matches
// each screen's own "Coach Tour: <Screen>" button exactly.
export const TOUR_SCREENS: Route[] = [...new Set(STEPS.map((s) => s.route ?? "dashboard"))];

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked (private mode etc.) — don't force the tour
  }
}

function markTourSeen() {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    // ignore — worst case the tour reappears next visit
  }
}

function targetExists(key: string): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`)).some(
    (el) => el.getClientRects().length > 0
  );
}

function visibleTarget(key: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`)).find(
    (el) => el.getClientRects().length > 0
  );
}

// Steps are authored in a sensible default order, but a page can lay its
// targets out in side-by-side columns (the Dashboard's bento grid) where DOM
// order and on-screen top-to-bottom order diverge — walking DOM order there
// visibly zigzags down then up between columns instead of reading naturally.
// Sort by actual rendered position once everything's measurable, so the tour
// always proceeds top-to-bottom (then left-to-right for anything roughly
// level) regardless of how a page's layout happens to be structured, instead
// of a hand-authored order that only holds at one viewport width. "nav-more"
// is a deliberate closing/wrap-up step — it points at the whole nav rail or
// the mobile More button, not a spot in the page's own reading flow — so it
// always stays last rather than wherever it happens to sit on screen.
function sortByPosition(steps: TourStep[]): TourStep[] {
  const nav = steps.filter((s) => s.target === "nav-more");
  const rest = steps
    .filter((s) => s.target !== "nav-more")
    .map((s) => ({ step: s, rect: visibleTarget(s.target)?.getBoundingClientRect() }));
  rest.sort((a, b) => {
    if (!a.rect || !b.rect) return 0;
    return a.rect.top - b.rect.top || a.rect.left - b.rect.left;
  });
  return [...rest.map((r) => r.step), ...nav];
}

const CARD_GAP = 16;

export function CoachTour({
  onDone,
  startTarget,
}: {
  onDone: () => void;
  /** Jump straight to this target's step (an FAQ pick) instead of always
   *  starting at the top — falls back to 0 if it isn't in this page's
   *  filtered step list for any reason. */
  startTarget?: string;
}) {
  const currentRoute = useRoute();
  const [openedRoute] = useState(currentRoute);
  const [pageSteps, setPageSteps] = useState<TourStep[] | null>(null);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardTop, setCardTop] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // The tour needs something to point at. If the user isn't in demo mode, load
  // the sample data into the stores for the duration of the tour so every step
  // has a populated card to spotlight, then restore their real data on close.
  const wasDemo = useRef(isDemo());
  const [sampleOn, setSampleOn] = useState(true); // the tour starts populated
  const [dataTick, setDataTick] = useState(0); // bump to re-measure the spotlight after a toggle

  // A synchronous snapshot of the real user's data, taken before we swap in the
  // sample, so restoring is instant (no async IndexedDB read that could race a
  // StrictMode re-mount and clobber the freshly-loaded sample).
  const realSnap = useRef<{
    posts: unknown[]; hashtagGroups: unknown[]; ideas: unknown[];
    platforms: unknown[]; performance: unknown[]; highlights: unknown[];
  } | null>(null);

  function captureReal() {
    realSnap.current = {
      posts: usePosts.getState().items,
      hashtagGroups: useHashtagGroups.getState().items,
      ideas: useIdeas.getState().items,
      platforms: usePlatforms.getState().items,
      performance: usePerformance.getState().items,
      highlights: useHighlights.getState().items,
    };
  }
  function restoreReal() {
    const s = realSnap.current;
    if (!s) return;
    usePosts.getState().setAll(s.posts as never);
    useHashtagGroups.getState().setAll(s.hashtagGroups as never);
    useIdeas.getState().setAll(s.ideas as never);
    usePlatforms.getState().setAll(s.platforms as never);
    usePerformance.getState().setAll(s.performance as never);
    useHighlights.getState().setAll(s.highlights as never);
  }

  // The on-card toggle: flip between the sample data (so the tour has content)
  // and the user's own data. For someone who was already in demo, it drives the
  // real, persistent demo flag (so they can turn demo off right here); for a
  // real user it's a temporary preview that's reverted when the tour closes.
  function toggleSample(on: boolean) {
    setSampleOn(on);
    if (wasDemo.current) {
      void setDemoMode(on);
    } else if (on) {
      loadSampleIntoStores();
      suspendSync();
    } else {
      restoreReal();
      resumeSync();
    }
    requestAnimationFrame(() => setDataTick((t) => t + 1));
  }

  // Drag-to-move: once the user drags the card by its grip, it stays where they
  // put it (dragPos wins over the auto above/below-the-spotlight placement).
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });
  function onGripDown(e: RPointerEvent<HTMLDivElement>) {
    const card = cardRef.current;
    if (!card) return;
    const r = card.getBoundingClientRect();
    dragOffset.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onGripMove(e: RPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const card = cardRef.current;
    if (!card) return;
    const x = Math.max(6, Math.min(e.clientX - dragOffset.current.dx, window.innerWidth - card.offsetWidth - 6));
    const y = Math.max(6, Math.min(e.clientY - dragOffset.current.dy, window.innerHeight - card.offsetHeight - 6));
    setDragPos({ x, y });
  }
  function onGripUp(e: RPointerEvent<HTMLDivElement>) {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  // The tour is scoped to whichever screen it was opened on. If the user
  // navigates elsewhere while it's up (a nav tap, a card link), just close it
  // rather than following them — each screen's coach is its own thing now.
  useEffect(() => {
    if (currentRoute !== openedRoute) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoute]);

  // Build this page's step list once: only what's actually on screen right
  // now (e.g. no "Goals in progress" card tip if there are no goals yet).
  // Steps with a `demo` first ask the screen to render their example element
  // (via a `coach:<demo>-on` event), then we wait a frame for it to mount
  // before checking which targets exist — otherwise the demo-only target
  // would look absent and the step would be dropped.
  useLayoutEffect(() => {
    // Populate the app with sample data for the duration of the tour if the user
    // isn't already in demo — so every step has a real, filled card to point at.
    // (A real user's own data is reloaded on close; see the restore effect below.)
    const filled = !wasDemo.current;
    if (filled) { captureReal(); loadSampleIntoStores(); suspendSync(); }

    const relevant = STEPS.filter((s) => (s.route ?? "dashboard") === openedRoute);
    const demoKeys = [...new Set(relevant.map((s) => s.demo).filter(Boolean) as string[])];
    demoKeys.forEach((k) => window.dispatchEvent(new Event(`coach:${k}-on`)));

    const applySteps = (found: TourStep[]) => {
      setPageSteps(found);
      if (startTarget) {
        const idx = found.findIndex((s) => s.target === startTarget);
        if (idx >= 0) setStep(idx);
      }
    };

    let rafId = 0, cancelled = false, frames = 0, lastCount = -1;
    const measure = () => sortByPosition(relevant.filter((s) => targetExists(s.target)));
    if (filled || demoKeys.length) {
      // Wait for the just-loaded sample data (or a demo-only element) to render
      // before measuring. A fixed wait is racy: a heavier screen like Annual —
      // which has only ONE anchor — can render a frame late, dropping its single
      // step so the tour closes with nothing. So poll each frame until the found
      // set stops growing (or we give up after ~12 frames). Stopping at the
      // FIRST target found (rather than waiting for the set to stabilize) is
      // only correct for a single-step page — a multi-step page like the
      // Dashboard can have one target (e.g. nav chrome, always present) mount
      // before other, data-dependent ones finish rendering on the same pass,
      // which would otherwise silently drop the later ones for the whole tour.
      const poll = () => {
        if (cancelled) return;
        const found = measure();
        const stable = found.length === lastCount;
        lastCount = found.length;
        if ((found.length > 0 && (found.length === relevant.length || stable)) || frames >= 12) {
          applySteps(found);
          return;
        }
        frames++;
        rafId = requestAnimationFrame(poll);
      };
      rafId = requestAnimationFrame(poll);
    } else {
      applySteps(measure());
    }
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      demoKeys.forEach((k) => window.dispatchEvent(new Event(`coach:${k}-off`)));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore the real user's data when the tour closes. Demo-origin users keep
  // whatever the toggle last set (the toggle drives the persistent demo flag for
  // them), so only revert for someone who started outside demo.
  useEffect(() => () => { if (!wasDemo.current) { restoreReal(); resumeSync(); } }, []);

  useEffect(() => {
    if (pageSteps && pageSteps.length === 0) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSteps]);

  useLayoutEffect(() => {
    if (!pageSteps || pageSteps.length === 0) return;

    function findTarget() {
      const key = pageSteps![step].target;
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`)
      );
      // Mobile and desktop chrome both carry the attribute; only one is
      // actually on screen at a given width — pick whichever has real size.
      return candidates.find((el) => el.getClientRects().length > 0);
    }
    function place() {
      const visible = findTarget();
      setRect(visible ? visible.getBoundingClientRect() : null);
    }
    // Some steps target cards further down a long screen scroll (or, on
    // desktop, further down the sidebar's own nested scroll) — bring the new
    // target into view before measuring. Instant + synchronous, so there's no
    // animation to race against the scroll listener below. Tall cards (e.g.
    // Today) scroll to their top edge so the heading stays visible; smaller
    // ones center for a nicer frame.
    const target = findTarget();
    if (target) {
      const tall = target.getBoundingClientRect().height > window.innerHeight * 0.55;
      target.scrollIntoView({ block: tall ? "start" : "center", behavior: "auto" });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [step, pageSteps, dataTick]);

  // Anchor the card above or below the spotlighted element (whichever side
  // has room) so it never sits on top of the thing it's explaining — the
  // bottom tab bar targets especially, which used to sit right under the
  // fixed-bottom card. Falls back to the default bottom-sheet CSS position
  // when there's no target (or somehow no room on either side).
  useLayoutEffect(() => {
    const cardEl = cardRef.current;
    if (!cardEl || !rect) {
      setCardTop(null);
      return;
    }
    const vh = window.innerHeight;
    const cardH = cardEl.offsetHeight;
    // Work off the portion of the target actually on screen — a target
    // taller than the viewport (e.g. Today) has no true "above" or "below",
    // so comparing against the full off-screen rect would just pick
    // whichever side is relatively bigger and still overlap it.
    const visibleTop = Math.max(rect.top, 0);
    const visibleBottom = Math.min(rect.bottom, vh);
    const spaceBelow = vh - visibleBottom;
    const spaceAbove = visibleTop;
    if (spaceBelow >= cardH + CARD_GAP) {
      setCardTop(visibleBottom + CARD_GAP);
    } else if (spaceAbove >= cardH + CARD_GAP) {
      setCardTop(visibleTop - cardH - CARD_GAP);
    } else {
      // Neither side fits — pin to the bottom edge so the card stays fully
      // visible; the target's top (and its heading) is what we scrolled to,
      // so it remains visible above the card.
      setCardTop(Math.max(CARD_GAP, vh - cardH - CARD_GAP));
    }
  }, [rect, step]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    // Any completed coach — on any page — is enough to stop auto-popping
    // the first-run one; it only needs to fire once, ever.
    markTourSeen();
    onDone();
  }

  function next() {
    if (!pageSteps || step >= pageSteps.length - 1) finish();
    else setStep((s) => s + 1);
  }

  function prev() {
    setStep((s) => Math.max(0, s - 1));
  }

  if (!pageSteps || pageSteps.length === 0) return null;

  const s = pageSteps[step];
  const isLast = step === pageSteps.length - 1;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={s.title}>
      <div className="tour__scrim" style={{ background: rect ? "transparent" : undefined }} onClick={finish} />
      {rect && (
        <div
          className="tour__spot"
          style={{
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      <div
        ref={cardRef}
        className="tour__card"
        style={
          dragPos
            ? { left: dragPos.x, top: dragPos.y, right: "auto", bottom: "auto", transform: "none", transition: "none" }
            : cardTop === null
              ? undefined
              : ({ top: cardTop, bottom: "auto", transition: "top 0.25s var(--ease)" } as CSSProperties)
        }
      >
        <div
          className="tour__grip"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          title="Drag to move"
          aria-label="Drag to move"
        />
        <div className="tour__dots">
          {pageSteps.map((st, i) => (
            <span key={st.target} className={`tour__dot${i === step ? " tour__dot--on" : ""}`} />
          ))}
        </div>
        <div className="tour__title">{s.title}</div>
        <p className="tour__body">{s.body}</p>
        <div className="tour__demo">
          <Segmented
            options={[{ value: "sample", label: "Sample data" }, { value: "mine", label: "My data" }]}
            value={sampleOn ? "sample" : "mine"}
            onChange={(v) => toggleSample(v === "sample")}
          />
        </div>
        <div className="tour__actions">
          <button className="btn btn--ghost" onClick={finish}>Skip</button>
          <div className="tour__actions-right">
            {step > 0 && <button className="btn btn--ghost" onClick={prev}>Back</button>}
            <button className="btn btn--primary" onClick={next}>{isLast ? "Got it" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
