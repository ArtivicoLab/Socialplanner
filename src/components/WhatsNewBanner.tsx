// A one-time "you just updated" banner (Tesla shows release notes right after a
// software update). It appears when the running build is a newer version than
// the one the user last acknowledged, links to the What's New screen, and can
// be dismissed — both actions mark the current version as seen.
import { useState } from "react";
import "../styles/features/whatsnew.css";
import { hasUnseenUpdate, LATEST, markChangelogSeen } from "../lib/changelog";
import { navigate, useRoute } from "../router";
import { IconGift, IconClose } from "./icons";

export function WhatsNewBanner() {
  // The banner lives outside <main> so it never remounts on navigation — key
  // off the route so it re-reads the (localStorage-backed) seen flag whenever
  // the user moves around, including right after visiting What's New.
  const route = useRoute();
  const [dismissed, setDismissed] = useState(false);
  const show = !dismissed && route !== "whatsnew" && hasUnseenUpdate();
  if (!show) return null;

  function dismiss() {
    markChangelogSeen();
    setDismissed(true);
  }

  return (
    <div className="wn-banner" role="status">
      <span className="wn-banner__ico" aria-hidden="true">
        <IconGift size={18} />
      </span>
      <span className="wn-banner__text">
        Social Planner updated to v{LATEST.version}. See what's new.
      </span>
      <button
        className="wn-banner__cta"
        onClick={() => {
          markChangelogSeen();
          navigate("whatsnew");
        }}
      >
        What's new
      </button>
      <button className="wn-banner__close" aria-label="Dismiss" onClick={dismiss}>
        <IconClose size={16} />
      </button>
    </div>
  );
}
