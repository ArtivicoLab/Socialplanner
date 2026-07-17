// Live count of today's unpublished posts — the one number the browser-tab
// badge (components/TabNotifier.tsx) shows. Built on planStats' own
// `scheduledToday` instead of a separate filter here, so this can never drift
// from the same number already shown in the Dashboard's "Today" stat tile —
// see TrackerA's lib/dueToday.ts for the sibling app's version of this same
// lesson (a duplicated "what counts as due" filter fell out of sync there).
import { useEffect, useMemo, useState } from "react";
import { usePosts } from "../stores/v2";
import { planStats } from "./postStats";
import { todayISO } from "./dates";

export function useDueToday(): number {
  const posts = usePosts((s) => s.items);
  const [today, setToday] = useState(todayISO());

  useEffect(() => {
    // Same trigger point main.tsx uses to catch a stale foreground tab: recheck on visibilitychange.
    const recheck = () => setToday((prev) => (document.visibilityState === "visible" ? todayISO() : prev));
    document.addEventListener("visibilitychange", recheck);
    return () => document.removeEventListener("visibilitychange", recheck);
  }, []);

  return useMemo(() => planStats(posts, today).scheduledToday, [posts, today]);
}
