// Bottom tab dock (mobile) — TikTok-style: pinned tabs flank a raised center
// "Create" button (the layered cyan/pink/ink plus), with "More" as the fixed
// escape hatch on the right. Press and hold any pinned icon to enter rearrange
// mode: icons jiggle iOS-style, a small red unpin badge appears on each, and a
// bar slides in at the TOP of the screen with a "Done" button. While in that
// mode, dragging an icon left/right swaps it past its neighbors live.
// (The install-to-home-screen entry point lives on the More screen now.)
import { useRef, useState } from "react";
import { navigate, type Route } from "../router";
import { ALL_NAV_ITEMS } from "../nav";
import { IconGrid, IconMinus, IconPlus } from "./icons";
import { useSettings } from "../stores/useSettings";

// Shorter tab-bar-only label for the dashboard; every other tab keeps its
// nav.tsx label.
const LABEL_OVERRIDE: Partial<Record<Route, string>> = { dashboard: "Overview" };

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 8;

export function TabBar({ active }: { active: Route }) {
  const { tabBarRoutes, update } = useSettings();
  const [editing, setEditing] = useState(false);
  const [dragRoute, setDragRoute] = useState<string | null>(null);

  const pressTimer = useRef<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const dragOrigin = useRef<{ route: string; x: number } | null>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const pinned = tabBarRoutes
    .map((route) => ALL_NAV_ITEMS.find((i) => i.route === route))
    .filter((i): i is (typeof ALL_NAV_ITEMS)[number] => !!i);
  const pinnedRoutes = new Set(pinned.map((i) => i.route));
  // "More" is the fixed escape hatch to everything else — always present, never
  // itself pinnable, and lit up whenever the current route isn't one of the pins.
  const moreActive = !pinnedRoutes.has(active);

  // The Create button sits dead-center: half the pins on its left, half (plus
  // More) on its right.
  const mid = Math.ceil(pinned.length / 2);
  const leftPins = pinned.slice(0, mid);
  const rightPins = pinned.slice(mid);

  function clearPressTimer() {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function onPressStart(e: React.PointerEvent) {
    if (editing) return;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearPressTimer();
    pressTimer.current = window.setTimeout(() => {
      setEditing(true);
      if (navigator.vibrate) navigator.vibrate(12);
    }, LONG_PRESS_MS);
  }

  function onPressMove(e: React.PointerEvent) {
    if (!pressStart.current) return;
    const dx = Math.abs(e.clientX - pressStart.current.x);
    const dy = Math.abs(e.clientY - pressStart.current.y);
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clearPressTimer();
  }

  function onPressEnd() {
    clearPressTimer();
    pressStart.current = null;
  }

  function unpin(route: string) {
    update({ tabBarRoutes: tabBarRoutes.filter((r) => r !== route) });
  }

  function onDragStart(route: string, e: React.PointerEvent) {
    if (!editing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOrigin.current = { route, x: e.clientX };
    setDragRoute(route);
  }

  function onDragMove(e: React.PointerEvent) {
    const origin = dragOrigin.current;
    if (!origin) return;
    const el = btnRefs.current.get(origin.route);
    const dx = e.clientX - origin.x;
    if (el) el.style.transform = `translateX(${dx}px) rotate(0deg)`;

    const i = tabBarRoutes.indexOf(origin.route);
    const dir = dx > 0 ? 1 : -1;
    const neighborRoute = tabBarRoutes[i + dir];
    if (!neighborRoute) return;
    const neighborEl = btnRefs.current.get(neighborRoute);
    if (!neighborEl) return;
    const rect = neighborEl.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const crossed = dir > 0 ? e.clientX > midpoint : e.clientX < midpoint;
    if (!crossed) return;

    const next = [...tabBarRoutes];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    update({ tabBarRoutes: next });
    dragOrigin.current = { route: origin.route, x: e.clientX };
    if (el) el.style.transform = "";
  }

  function onDragEnd() {
    if (dragOrigin.current) {
      const el = btnRefs.current.get(dragOrigin.current.route);
      if (el) el.style.transform = "";
    }
    dragOrigin.current = null;
    setDragRoute(null);
  }

  function renderPin({ route, label, Icon }: (typeof ALL_NAV_ITEMS)[number]) {
    const on = active === route;
    const dragging = dragRoute === route;
    return (
      <button
        key={route}
        ref={(el) => {
          if (el) btnRefs.current.set(route, el);
          else btnRefs.current.delete(route);
        }}
        className={`tabbar__btn${on ? " tabbar__btn--active" : ""}${editing ? " tabbar__btn--editing" : ""}${dragging ? " tabbar__btn--dragging" : ""}`}
        aria-current={on ? "page" : undefined}
        data-tour={`nav-${route}`}
        onClick={() => !editing && navigate(route)}
        onPointerDown={(e) => { onPressStart(e); onDragStart(route, e); }}
        onPointerMove={(e) => { onPressMove(e); onDragMove(e); }}
        onPointerUp={() => { onPressEnd(); onDragEnd(); }}
        onPointerCancel={() => { onPressEnd(); onDragEnd(); }}
      >
        {editing && (
          <span
            className="tabbar__unpin"
            role="button"
            aria-label={`Unpin ${label}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); unpin(route); }}
          >
            <IconMinus />
          </span>
        )}
        <span className="tabbar__iconwrap">
          <Icon />
        </span>
        <span>{LABEL_OVERRIDE[route] ?? label}</span>
      </button>
    );
  }

  return (
    <>
      {editing && (
        <div className="tabbar-editbar">
          <span className="tabbar-editbar__label">Rearranging your bar</span>
          <button className="btn btn--primary" style={{ width: "auto", padding: "8px 18px" }} onClick={() => setEditing(false)}>
            Done
          </button>
        </div>
      )}
      <nav className="tabbar" aria-label="Primary">
        {leftPins.map(renderPin)}

        {/* The TikTok-style layered Create button */}
        <button
          className="tabbar__createbtn"
          aria-label="Plan a post"
          onClick={() => !editing && navigate("scheduler", { new: "1" })}
        >
          <span className="tabbar__create">
            <span className="tabbar__create-core">
              <IconPlus size={20} strokeWidth={2.75} />
            </span>
          </span>
        </button>

        {rightPins.map(renderPin)}

        <button
          className={`tabbar__btn${moreActive ? " tabbar__btn--active" : ""}`}
          aria-current={moreActive ? "page" : undefined}
          data-tour="nav-more"
          onClick={() => navigate("more")}
        >
          <IconGrid />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
