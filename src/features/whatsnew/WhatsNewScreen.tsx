// "What's New" — a Tesla-style release-notes screen. A dated card per deployed
// version, with categorized highlights. Visiting the screen marks the latest
// release as seen (clears the update banner + nav badge). A "Check for updates"
// button reuses the service-worker update flow so the user can pull the newest
// build on demand.
import { useEffect, useState } from "react";
import "../../styles/features/whatsnew.css";
import { CHANGELOG, CHANGE_KIND_LABEL, LATEST, markChangelogSeen, type ChangeKind } from "../../lib/changelog";
import { APP_VERSION, BUILD_SHA } from "../../lib/config";
import { useAppUpdate } from "../../lib/appUpdate";
import { HelpTip } from "../../components/HelpTip";
import { IconCheck, IconRepeat, IconSpark, IconWrench } from "../../components/icons";

const KIND_ICON: Record<ChangeKind, typeof IconCheck> = {
  new: IconSpark,
  improved: IconRepeat,
  fixed: IconWrench,
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function WhatsNewScreen() {
  const ready = useAppUpdate((s) => s.ready);
  const apply = useAppUpdate((s) => s.apply);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState("");

  // Reaching this screen means the user has seen the latest notes.
  useEffect(() => {
    markChangelogSeen();
  }, []);

  async function checkForUpdates() {
    if (ready) {
      apply(); // a build is already waiting — activate it (page reloads)
      return;
    }
    setChecking(true);
    setStatus("");
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update();
        // Give a freshly-found worker a beat to reach the "waiting" state.
        await new Promise((r) => setTimeout(r, 1200));
        setStatus(
          useAppUpdate.getState().ready
            ? "An update is ready. Tap Update now to install it."
            : "You're on the latest version."
        );
      } else {
        setStatus("You're on the latest version.");
      }
    } catch {
      setStatus("Couldn't check right now. Try again in a moment.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">What's new</div>
        <h1 className="screen-head__title">
          Release notes
          <HelpTip text="Every time Social Planner updates, the highlights land here, so you always know what changed." />
        </h1>
      </div>

      {/* Current-version card + update control */}
      <div className="card wn-current">
        <div className="wn-current__meta">
          <span className="wn-current__label">You're running</span>
          <span className="wn-current__version">
            v{APP_VERSION}
            {BUILD_SHA && <span className="wn-current__sha"> · {BUILD_SHA}</span>}
          </span>
        </div>
        <button
          className={`btn ${ready ? "btn--primary" : ""}`}
          onClick={checkForUpdates}
          disabled={checking}
        >
          <IconRepeat size={15} />
          {ready ? "Update now" : checking ? "Checking…" : "Check for updates"}
        </button>
      </div>
      {status && <p className="wn-status muted">{status}</p>}

      {/* Release timeline */}
      <div className="wn-timeline">
        {CHANGELOG.map((rel) => (
          <article key={rel.version} className="card wn-release">
            <header className="wn-release__head">
              <div className="wn-release__badge">v{rel.version}</div>
              <div className="wn-release__titles">
                <h2 className="wn-release__title">
                  {rel.title}
                  {rel === LATEST && <span className="wn-release__latest">Latest</span>}
                </h2>
                <time className="wn-release__date">{formatDate(rel.date)}</time>
              </div>
            </header>
            <p className="wn-release__summary">{rel.summary}</p>
            <ul className="wn-changes">
              {rel.changes.map((c, i) => {
                const Icon = KIND_ICON[c.kind];
                return (
                  <li key={i} className={`wn-change wn-change--${c.kind}`}>
                    <span className="wn-change__ico" aria-hidden="true">
                      <Icon size={14} />
                    </span>
                    <span className="wn-change__body">
                      <span className="wn-change__tag">{CHANGE_KIND_LABEL[c.kind]}</span>
                      {c.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </>
  );
}
