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
  const { status, pending, connected, needsReauth, busy, tapToRetry } = useSync();
  const demo = useDemo((s) => s.demo);
  const route = useRoute();
  // Stuck sync must always have a manual escape hatch, not just the specific
  // reauth case — a plain "offline" (rate limit, blip, whatever) previously
  // had no click affordance at all, which read as "pressing it does nothing."
  const retryable = connected && !needsReauth && status === "offline";
  const clickable = needsReauth || retryable;
  const cls = needsReauth || status === "offline"
    ? "syncpill--off"
    : status === "synced" ? "syncpill--ok" : "syncpill--busy";
  const text = needsReauth
    ? "Tap to reconnect"
    : retryable
      ? "Offline · tap to retry"
      : status === "offline" && pending > 0
        ? `Offline · ${pending}`
        : !connected && status === "synced"
          ? "Saved"
          : LABEL[status];

  return (
    <header className="appbar">
      <span className="appbar__brand">
        <img src="/favicon-96x96.png" alt="" aria-hidden width={22} height={22} className="appbar__brandimg" />
        <span className="appbar__brandtext">Social Planner</span>
        {demo && !HIDE_DEMO_CHROME && <span className="brand-demo">Demo</span>}
      </span>
      <span className="appbar__spacer" />
      {/* Hidden in demo mode: the "DEMO" brand tag just to the left and the
          full-sentence DemoBanner right below already say "you're exploring
          sample data, nothing is saved" — a third, differently-worded pill
          crammed into this narrow header added nothing but visual noise
          (and previously kept showing "Saved"/"Synced" while demo mode was
          on, directly contradicting the banner right below it). */}
      {!demo && (clickable ? (
        <button
          className={`syncpill ${cls}`}
          disabled={busy}
          onClick={() => tapToRetry()}
          title={
            needsReauth
              ? "Your Google connection lapsed after being idle a while. Tap to sign in again, nothing was lost"
              : "Tap to retry syncing now"
          }
        >
          <span className="syncpill__dot" />
          {busy ? (needsReauth ? "Reconnecting…" : "Syncing…") : text}
        </button>
      ) : (
        <span
          className={`syncpill ${cls}`}
          title={connected ? "Synced to your Google Sheet" : "Stored on this device"}
        >
          <span className="syncpill__dot" />
          {text}
        </span>
      ))}
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
        aria-label="SP: Settings"
        data-tour="settings"
        onClick={() => navigate("settings")}
      >
        SP
      </button>
    </header>
  );
}
