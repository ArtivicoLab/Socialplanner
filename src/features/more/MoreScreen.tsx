// Mobile "More" hub — a grouped grid of every module (matches the sidebar's
// groups on desktop), plus Account rows and the install-to-home-screen entry
// (moved here from the old tab-bar brand button).
import { useState } from "react";
import { navigate } from "../../router";
import { NAV } from "../../nav";
import { HelpTip } from "../../components/HelpTip";
import { BottomSheet } from "../../components/BottomSheet";
import { useSettings } from "../../stores/useSettings";
import { useInstall, type InstallPlatform } from "../../stores/useInstall";
import { hasUnseenUpdate } from "../../lib/changelog";
import { IconChevron, IconSettings, IconHeart, IconGift, IconFeed } from "../../components/icons";

// Manual "add to home screen" steps for browsers that never hand us a native
// prompt (iOS Safari never fires beforeinstallprompt) or that haven't yet.
const MANUAL_INSTALL_STEPS: Record<InstallPlatform, string> = {
  ios: "Tap the Share icon in Safari's toolbar, then choose \"Add to Home Screen\".",
  android: "Open your browser's menu (⋮) and tap \"Install app\" or \"Add to Home screen\".",
  desktop: "Look for the install icon in your browser's address bar, or open the browser menu and choose \"Install Social Planner\".",
};

const ACCOUNT = [
  { route: "whatsnew" as const, label: "What's New", Icon: IconGift },
  { route: "settings" as const, label: "Settings", Icon: IconSettings },
  { route: "privacy" as const, label: "Privacy & source", Icon: IconHeart },
];

export function MoreScreen() {
  const { hiddenRoutes } = useSettings();
  const { platform, installed, canPrompt, promptInstall } = useInstall();
  const [installNote, setInstallNote] = useState("");
  const showUpdateDot = hasUnseenUpdate();

  async function onInstall() {
    if (installed) {
      setInstallNote("Social Planner is already installed on this device.");
      return;
    }
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome !== "unavailable") return;
    }
    setInstallNote(MANUAL_INSTALL_STEPS[platform]);
  }
  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((i) => !hiddenRoutes.includes(i.route)),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">All-in-one</div>
        <h1 className="screen-head__title">
          Everything
          <HelpTip text="Every module in the app, grouped the same way as the sidebar on desktop. Tap any card to jump straight there. Hide ones you don't use in Settings." />
        </h1>
      </div>

      {groups.map((group) => (
        <div key={group.title}>
          <div className="section-title">{group.title}</div>
          <div className="hub-grid" data-tour="more-hub">
            {group.items.map(({ route, label, Icon, color }) => (
              <button key={route} className="hub-card" onClick={() => navigate(route)}>
                <span className="hub-card__ico hub-card__ico--brand" style={{ background: color }}>
                  <Icon size={22} />
                </span>
                <span className="hub-card__label">{label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="section-title">Account</div>
      <div className="card" style={{ padding: "4px 16px" }}>
        {ACCOUNT.map(({ route, label, Icon }) => (
          <button key={route} className="row spread" style={{ width: "100%" }} onClick={() => navigate(route)}>
            <span style={{ display: "inline-flex", gap: 10, alignItems: "center", fontWeight: 600 }}>
              <span className="hub-card__ico" style={{ width: 34, height: 34, background: "var(--surface-2)" }}>
                <Icon size={18} />
              </span>
              {label}
              {route === "whatsnew" && showUpdateDot && <span className="wn-dot" aria-label="new update" />}
            </span>
            <IconChevron size={18} style={{ color: "var(--muted)" }} />
          </button>
        ))}
        <button className="row spread" style={{ width: "100%" }} onClick={onInstall}>
          <span style={{ display: "inline-flex", gap: 10, alignItems: "center", fontWeight: 600 }}>
            <span className="hub-card__ico" style={{ width: 34, height: 34, background: "var(--surface-2)" }}>
              <IconFeed size={18} />
            </span>
            Install app
          </span>
          <IconChevron size={18} style={{ color: "var(--muted)" }} />
        </button>
      </div>

      <BottomSheet open={!!installNote} title="Install Social Planner" onClose={() => setInstallNote("")}>
        <p className="muted settings-sheet-note">{installNote}</p>
      </BottomSheet>
    </>
  );
}
