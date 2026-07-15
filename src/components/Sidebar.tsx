// Desktop "studio rail" (shown ≥900px) — a dark chrome panel in BOTH themes,
// like TikTok/YouTube Studio: brand up top, a solid Create button, monochrome
// nav that lights up hot-pink when active, coach + sync + version pinned low.
import { navigate, type Route } from "../router";
import { NAV, SETTINGS_ITEM, ROUTE_LABELS } from "../nav";
import { IconCompass, IconHeart, IconPlus } from "./icons";
import { useSync } from "../stores/useSync";
import { useSettings } from "../stores/useSettings";
import { HIDE_DEMO_CHROME, useDemo } from "../lib/demo";
import { APP_VERSION, BUILD_SHA } from "../lib/config";

const STATUS_LABEL: Record<string, string> = {
  synced: "Synced",
  syncing: "Syncing…",
  offline: "Offline",
};

export function Sidebar({ active, onCoachTour }: { active: Route; onCoachTour: () => void }) {
  const { status, connected } = useSync();
  const { hiddenRoutes } = useSettings();
  const demo = useDemo((s) => s.demo);
  const dot =
    status === "synced" ? "var(--success)" : status === "offline" ? "var(--warn)" : "var(--accent)";

  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((i) => !hiddenRoutes.includes(i.route)),
  })).filter((group) => group.items.length > 0);

  return (
    <aside className="sidebar" data-tour="nav-more">
      <div className="sidebar__brand">
        <img src="/favicon-96x96.png" alt="" aria-hidden width={26} height={26} />
        <span className="sidebar__brandtext">Social Planner</span>
        {demo && !HIDE_DEMO_CHROME && <span className="brand-demo">demo</span>}
      </div>

      <button
        className="sidebar__create"
        onClick={() => navigate("scheduler", { new: "1" })}
      >
        <IconPlus size={17} />
        Create
      </button>

      <div className="sidebar__scroll">
        {groups.map((group) => (
          <div key={group.title} className="sidebar__group">
            <div className="sidebar__grouptitle">{group.title}</div>
            {group.items.map(({ route, label, Icon, color }) => (
              <button
                key={route}
                className={`sidebar__item${active === route ? " sidebar__item--on" : ""}`}
                data-tour={`nav-${route}`}
                onClick={() => navigate(route)}
              >
                <span className="sidebar__ico sidebar__ico--brand" style={{ background: color }}>
                  <Icon size={17} />
                </span>
                {label}
              </button>
            ))}
          </div>
        ))}
        <div className="sidebar__group">
          <button
            className={`sidebar__item${active === "settings" ? " sidebar__item--on" : ""}`}
            data-tour="settings"
            onClick={() => navigate("settings")}
          >
            <span className="sidebar__ico" style={{ background: "var(--surface-2)" }}>
              <SETTINGS_ITEM.Icon size={17} />
            </span>
            Settings
          </button>
          <button
            className={`sidebar__item${active === "privacy" ? " sidebar__item--on" : ""}`}
            onClick={() => navigate("privacy")}
          >
            <span className="sidebar__ico" style={{ background: "var(--surface-2)" }}>
              <IconHeart size={17} />
            </span>
            Privacy &amp; source
          </button>
        </div>
      </div>

      <button className="sidebar__item sidebar__coachbtn" onClick={onCoachTour}>
        <span className="sidebar__ico" style={{ background: "var(--surface-2)" }}>
          <IconCompass size={17} />
        </span>
        Coach Tour: {ROUTE_LABELS[active]}
      </button>

      <div className="sidebar__foot">
        <span className="syncpill">
          <span className="syncpill__dot" style={{ background: dot }} />
          {connected ? STATUS_LABEL[status] : "Saved on device"}
        </span>
        <span className="sidebar__version">
          v{APP_VERSION}
          {BUILD_SHA && ` · ${BUILD_SHA}`}
        </span>
      </div>
    </aside>
  );
}
