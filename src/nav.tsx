// Single source of truth for navigation — consumed by the sidebar (desktop),
// the More hub (mobile) and the bottom tab bar.
import type { LucideIcon } from "lucide-react";
import type { Route } from "./router";
import {
  IconHome,
  IconTasks,
  IconCalendar,
  IconGrid,
  IconFeed,
  IconHash,
  IconIdea,
  IconTrend,
  IconSettings,
} from "./components/icons";

export interface NavItem {
  route: Route;
  label: string;
  Icon: LucideIcon;
  color: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { route: "dashboard", label: "Dashboard", Icon: IconHome, color: "var(--cat-sky)" },
      { route: "scheduler", label: "Scheduler", Icon: IconTasks, color: "var(--cat-pink)" },
      { route: "calendar", label: "Calendar", Icon: IconCalendar, color: "var(--cat-lavender)" },
      { route: "monthly", label: "Monthly Plan", Icon: IconGrid, color: "var(--cat-teal)" },
    ],
  },
  {
    title: "Create",
    items: [
      { route: "feed", label: "Feed Preview", Icon: IconFeed, color: "var(--cat-butter)" },
      { route: "hashtags", label: "Hashtags", Icon: IconHash, color: "var(--cat-sky)" },
      { route: "ideas", label: "Idea Bank", Icon: IconIdea, color: "var(--cat-pink)" },
      { route: "performance", label: "Performance", Icon: IconTrend, color: "var(--cat-teal)" },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  route: "settings",
  label: "Settings",
  Icon: IconSettings,
  color: "var(--muted)",
};

export const ALL_NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);

// Every route's display name, including the ones with no nav entry (More,
// Privacy) — used to label the "Coach Tour" button with the screen it'll
// actually tour, so it's obvious the tour is scoped to where you are.
export const ROUTE_LABELS: Record<Route, string> = {
  ...Object.fromEntries(ALL_NAV_ITEMS.map((i) => [i.route, i.label])),
  settings: SETTINGS_ITEM.label,
  more: "More",
  whatsnew: "What's New",
  privacy: "Privacy & source",
} as Record<Route, string>;

// The bottom tab bar (mobile) keeps the dashboard as fixed chrome, so hiding a
// section never breaks that layout — only the remaining "extra" modules are
// offered as hideable in Settings.
const CORE_ROUTES: Route[] = ["dashboard"];
export const HIDEABLE_NAV_ITEMS: NavItem[] = ALL_NAV_ITEMS.filter(
  (i) => !CORE_ROUTES.includes(i.route)
);
