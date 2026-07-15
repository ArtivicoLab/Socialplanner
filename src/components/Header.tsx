import { IconCompass } from "./icons";
import { navigate, useRoute } from "../router";
import { useSync } from "../stores/useSync";
import { HIDE_DEMO_CHROME, useDemo } from "../lib/demo";
import { ROUTE_LABELS } from "../nav";

const LABEL: Record<string, string> = {
  synced: "Synced",
  syncing: "Syncing…",
  offline: "Offline",
};

export function Header({ onCoachTour }: { onCoachTour: () => void }) {
  const { status, pending, connected } = useSync();
  const demo = useDemo((s) => s.demo);
  const route = useRoute();
  const cls =
    status === "synced" ? "syncpill--ok" : status === "offline" ? "syncpill--off" : "syncpill--busy";
  const text =
    status === "offline" && pending > 0
      ? `Offline · ${pending}`
      : !connected && status === "synced"
        ? "Saved"
        : LABEL[status];

  return (
    <header className="appbar">
      <span className="appbar__brand">
        <img src="/favicon-96x96.png" alt="" aria-hidden width={22} height={22} className="appbar__brandimg" />
        <span className="appbar__brandtext">Social Planner</span>
      </span>
      <span className="appbar__spacer" />
      <span
        className={`syncpill ${cls}`}
        title={connected ? "Synced to your Google Sheet" : "Stored on this device"}
      >
        <span className="syncpill__dot" />
        {text}
      </span>
      <button
        className="btn btn--ghost appbar__tour"
        onClick={onCoachTour}
        title={`Replay the coach tour for ${ROUTE_LABELS[route]}`}
      >
        <IconCompass size={16} />
        <span>Coach Tour: {ROUTE_LABELS[route]}</span>
      </button>
      <button
        className="avatar"
        aria-label="UB: Settings"
        data-tour="settings"
        onClick={() => navigate("settings")}
      >
        UB
      </button>
    </header>
  );
}
