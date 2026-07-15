// Tiny hash router — Social Planner's content-only route set.
import { useEffect, useState } from "react";

export type Route =
  | "dashboard"
  | "scheduler"
  | "calendar"
  | "monthly"
  | "feed"
  | "hashtags"
  | "ideas"
  | "performance"
  | "whatsnew"
  | "more"
  | "privacy"
  | "settings";

const ROUTES: Route[] = [
  "dashboard",
  "scheduler",
  "calendar",
  "monthly",
  "feed",
  "hashtags",
  "ideas",
  "performance",
  "whatsnew",
  "more",
  "privacy",
  "settings",
];

export function currentRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  const r = h.split("?")[0] as Route;
  return ROUTES.includes(r) ? r : "dashboard";
}

export function navigate(route: Route, query?: Record<string, string>) {
  const q = query
    ? "?" + new URLSearchParams(query).toString()
    : "";
  window.location.hash = `#/${route}${q}`;
}

export function routeQuery(): URLSearchParams {
  const h = window.location.hash;
  const qi = h.indexOf("?");
  return new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : "");
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute());
  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) navigate("dashboard");
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}
