import { useEffect, useState } from "react";
import { Segmented } from "../../components/Segmented";
import { BottomSheet } from "../../components/BottomSheet";
import { LockGatedButton } from "../../components/LockGatedButton";
import { HelpTip } from "../../components/HelpTip";
import { IconChevronDown, IconChevronUp, IconClose, IconCompass } from "../../components/icons";
import { FAQ_ITEMS, openScreenTour, TOUR_SCREENS } from "../../components/CoachTour";
import { useSettings } from "../../stores/useSettings";
import { useSync } from "../../stores/useSync";
import { confirmDialog } from "../../stores/useConfirm";
import { activate, resetEverything, resetForNewYear, setDemoMode } from "../../stores/bootstrap";
import { currentLockoutMs, tryUnlock } from "../../lib/access";
import { isDemo } from "../../lib/demo";
import { spreadsheetUrl } from "../../lib/google/sheets";
import { navigate } from "../../router";
import { ALL_NAV_ITEMS, HIDEABLE_NAV_ITEMS, ROUTE_LABELS } from "../../nav";
import { APP_NAME, APP_VERSION, BUILD_SHA } from "../../lib/config";
import { useAppUpdate } from "../../lib/appUpdate";
import { usePlatforms } from "../../stores/v2";
import { categoryColor, PICKABLE_CATEGORY_COLORS } from "../../lib/ui";
import "../../styles/features/settings.css";

function formatWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.ceil(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

export function SettingsScreen() {
  const {
    name, theme, weekStart, hiddenRoutes, categories, categoryColors, goals,
    tabBarRoutes, activated, accessCode, update,
  } = useSettings();
  const {
    connected, spreadsheetId, previousSpreadsheetId, hasClientId, busy, error, wrongAccount,
    connect, relink, disconnect, syncNow, useThisAccountInstead, startNewSheet,
  } = useSync();
  const platforms = usePlatforms((s) => s.items);
  const addPlatform = usePlatforms((s) => s.add);
  const updatePlatform = usePlatforms((s) => s.update);
  const removePlatform = usePlatforms((s) => s.remove);
  const updateReady = useAppUpdate((s) => s.ready);
  const applyUpdate = useAppUpdate((s) => s.apply);

  const [newCategory, setNewCategory] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newPlatform, setNewPlatform] = useState("");
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [yearResetOpen, setYearResetOpen] = useState(false);
  const [resetPosts, setResetPosts] = useState(true);
  const [resetPerf, setResetPerf] = useState(true);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [relinkOpen, setRelinkOpen] = useState(false);
  const [relinkInput, setRelinkInput] = useState("");
  const [relinkError, setRelinkError] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [demoOn, setDemoOn] = useState(isDemo());
  const [startingNewSheet, setStartingNewSheet] = useState(false);
  const [newSheetError, setNewSheetError] = useState("");

  const orderedPlatforms = [...platforms].sort((a, b) => a.order - b.order);

  useEffect(() => {
    if (activated) return;
    void currentLockoutMs().then((ms) => {
      if (ms > 0) setCodeError(`Too many attempts. Try again in ${formatWait(ms)}.`);
    });
    // Only needs to check once, on mount — activated flips this section away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleDemo(on: boolean) {
    setDemoOn(on);
    await setDemoMode(on);
    navigate("dashboard"); // let them see the app switch to demo / their real data
  }

  async function checkForUpdates() {
    if (updateReady) {
      applyUpdate(); // a new build is already waiting — let it take over
      return;
    }
    setCheckingUpdate(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } finally {
      // Reload either way: a fresh network fetch of index.html + a re-checked
      // sw.js is the only way to be sure you're not still on a stale cache —
      // if a new worker was found, main.tsx's controllerchange listener takes
      // over from here anyway.
      window.location.reload();
    }
  }

  function submitCode() {
    const code = codeInput.trim();
    if (!code) return;
    setCodeError("");
    void tryUnlock(code).then(async (result) => {
      if (!result.ok) {
        setCodeError(
          result.retryAfterMs
            ? `Too many attempts. Try again in ${formatWait(result.retryAfterMs)}.`
            : "That code doesn't look right. Check your Etsy order confirmation."
        );
        return;
      }
      const ok = await activate(code);
      if (ok) { setCodeError(""); setCodeInput(""); }
      else setCodeError("That code doesn't look right. Check your Etsy order confirmation.");
    });
  }

  async function submitRelink() {
    setRelinkError("");
    const ok = await relink(relinkInput.trim());
    if (ok) { setRelinkOpen(false); setRelinkInput(""); }
    else setRelinkError(error || "Couldn't link that sheet. Check the link and try again.");
  }

  async function handleStartNewSheet() {
    const ok = await confirmDialog({
      title: "Start a brand new sheet?",
      message:
        "This links a fresh, empty Google Sheet and pushes everything currently on this device into it. Your old sheet isn't deleted, it stays in your Drive exactly as it is, just no longer linked here.",
      confirmLabel: "Start new sheet",
      danger: true,
    });
    if (!ok) return;
    setNewSheetError("");
    setStartingNewSheet(true);
    try {
      await startNewSheet();
    } finally {
      setStartingNewSheet(false);
    }
    if (useSync.getState().error) setNewSheetError(useSync.getState().error);
  }

  // ---- Content pillars (categories) ----
  function addCategory() {
    const c = newCategory.trim();
    if (!c || categories.includes(c)) return;
    update({ categories: [...categories, c] });
    setNewCategory("");
  }

  function removeCategory(c: string) {
    const remaining = categories.filter((x) => x !== c);
    const { [c]: _removed, ...restColors } = categoryColors;
    update({ categories: remaining, categoryColors: restColors });
  }

  function renameCategory(oldName: string, next: string) {
    const n = next.trim();
    if (!n || n === oldName || categories.includes(n)) return;
    const { [oldName]: movedColor, ...restColors } = categoryColors;
    update({
      categories: categories.map((c) => (c === oldName ? n : c)),
      categoryColors: movedColor ? { ...restColors, [n]: movedColor } : restColors,
    });
  }

  function setCategoryColor(name: string, color: string) {
    update({ categoryColors: { ...categoryColors, [name]: color } });
  }

  // ---- Post goals ----
  function addGoal() {
    const g = newGoal.trim();
    if (!g || goals.includes(g)) return;
    update({ goals: [...goals, g] });
    setNewGoal("");
  }

  function removeGoal(g: string) {
    update({ goals: goals.filter((x) => x !== g) });
  }

  // ---- Platforms ----
  function addNewPlatform() {
    const n = newPlatform.trim();
    if (!n || platforms.some((p) => p.name.toLowerCase() === n.toLowerCase())) return;
    const maxOrder = platforms.reduce((a, p) => Math.max(a, p.order), -1);
    addPlatform({ name: n, active: true, order: maxOrder + 1 });
    setNewPlatform("");
  }

  function renamePlatform(id: string, next: string) {
    const n = next.trim();
    const current = platforms.find((p) => p.id === id);
    if (!current || !n || n === current.name) return;
    if (platforms.some((p) => p.id !== id && p.name.toLowerCase() === n.toLowerCase())) return;
    updatePlatform(id, { name: n });
  }

  function movePlatform(id: string, dir: -1 | 1) {
    const idx = orderedPlatforms.findIndex((p) => p.id === id);
    const other = orderedPlatforms[idx + dir];
    if (idx < 0 || !other) return;
    const me = orderedPlatforms[idx];
    updatePlatform(me.id, { order: other.order });
    updatePlatform(other.id, { order: me.order });
  }

  function deletePlatform(id: string) {
    const p = platforms.find((x) => x.id === id);
    if (!p) return;
    if (confirm(`Delete ${p.name}? Its logged performance months stay in your data but won't show until a platform with the same name exists again.`)) {
      removePlatform(id);
    }
  }

  function runYearReset() {
    void resetForNewYear({ posts: resetPosts, performance: resetPerf });
    setYearResetOpen(false);
  }

  // ---- Navigation ----
  function toggleRoute(route: string) {
    update({
      hiddenRoutes: hiddenRoutes.includes(route)
        ? hiddenRoutes.filter((r) => r !== route)
        : [...hiddenRoutes, route],
    });
  }

  function addTab(route: string) {
    if (tabBarRoutes.includes(route)) return;
    update({ tabBarRoutes: [...tabBarRoutes, route] });
  }

  function removeTab(route: string) {
    update({ tabBarRoutes: tabBarRoutes.filter((r) => r !== route) });
  }

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Make it yours</div>
        <h1 className="screen-head__title">
          Settings
          <HelpTip text="Personalize the app: your name, theme, week start, content pillars, platforms, and connect your Google Sheet so your data has a real backup." />
        </h1>
      </div>

      <div className="section-title">
        Demo mode
        <HelpTip text="Fills the whole app with a full year of realistic sample content so you can try everything before buying. It's display-only, and nothing here is saved to your device or your Google Sheet. Turn it off to use your own planner; connecting Google Sheets turns it off automatically." />
      </div>
      <div className="card" data-tour="settings-demo">
        <label className="field__label">Sample data</label>
        <Segmented
          options={[
            { value: "on", label: "Demo on" },
            { value: "off", label: "My data" },
          ]}
          value={demoOn ? "on" : "off"}
          onChange={(v) => { void toggleDemo(v === "on"); }}
        />
        <p className="muted settings-hint" style={{ marginTop: 8 }}>
          {demoOn
            ? "Showing sample data. Nothing you change here is saved."
            : "Showing your own planner."}
        </p>
      </div>

      <div className="section-title">Google Sheets</div>
      <div className="card" data-tour="settings-sheets">
        {connected ? (
          <>
            <div className="spread settings-connected-row">
              <div>
                <div className="settings-connected-label">
                  <span className="dot-8 dot-8--success" />
                  Connected
                </div>
                <div className="muted fs-13">
                  Your data lives in your own Google Drive.
                </div>
                {accessCode && (
                  <div className="muted fs-13">Unlocked with code {accessCode}</div>
                )}
              </div>
            </div>
            <a
              className="btn btn--stack"
              href={spreadsheetUrl(spreadsheetId)}
              target="_blank"
              rel="noreferrer"
            >
              Open my sheet ↗
            </a>
            <button className="btn btn--primary btn--stack" disabled={busy} onClick={() => syncNow()}>
              {busy ? "Syncing…" : "Sync now"}
            </button>
            <button className="btn btn--ghost" onClick={disconnect}>
              Disconnect
            </button>
          </>
        ) : (
          <>
            <div className="settings-card-title">Back up to Google Sheets</div>
            <p className="muted settings-hint">
              Sync your planner to a spreadsheet in your own Google Drive: open it on any
              device and keep your content plans forever.
            </p>

            {!activated && (
              <div className="field" style={{ marginBottom: 12 }}>
                <label className="field__label" htmlFor="settings-product-code">Product code</label>
                <div className="spread spread--gap8">
                  <input
                    id="settings-product-code"
                    className="input input--shrink"
                    value={codeInput}
                    placeholder="From your Etsy order"
                    onChange={(e) => { setCodeInput(e.target.value); setCodeError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && submitCode()}
                  />
                  <button className="btn btn--auto" onClick={submitCode} disabled={!codeInput.trim()}>
                    Unlock
                  </button>
                </div>
                {codeError && <p className="neg settings-error">{codeError}</p>}
              </div>
            )}

            {hasClientId ? (
              <button
                className="btn btn--primary"
                disabled={busy || !activated}
                onClick={() => connect()}
                title={!activated ? "Enter your product code above to enable" : undefined}
              >
                {busy ? "Connecting…" : "Connect Google Sheets"}
              </button>
            ) : (
              <div className="card settings-setup-note">
                <b>Setup needed.</b> Add your Google OAuth client ID to a <code>.env</code> file
                (<code>VITE_GOOGLE_CLIENT_ID=…</code>) and restart. See the README for the free
                5-minute Google Cloud setup.
              </div>
            )}
            {!activated && (
              <p className="muted settings-hint--sm">
                Enter your product code above to enable Connect, or if you've already set up
                the planner on another device, link that sheet below instead. No code needed.
              </p>
            )}

            <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={() => setRelinkOpen(true)}>
              Link a sheet from another device (skip the code)
            </button>
          </>
        )}
        {wrongAccount ? (
          <div className="card settings-setup-note" style={{ marginTop: 10 }}>
            <b>Wrong Google account.</b> The Google account you just signed in with
            doesn't have access to the sheet this device is already linked to — most
            likely your Social Planner data lives under a different Google account
            (check your Drive for a "Social Planner" spreadsheet to see which one).
            <div className="spread spread--gap8" style={{ marginTop: 10 }}>
              <button className="btn btn--auto" disabled={busy} onClick={() => connect()}>
                {busy ? "Trying…" : "Try signing in again"}
              </button>
              <button
                className="btn btn--ghost btn--auto"
                disabled={busy}
                onClick={() => useThisAccountInstead()}
              >
                Use this account, start a new sheet
              </button>
            </div>
          </div>
        ) : (
          error && (
            <p className="neg settings-error">
              {error}
            </p>
          )
        )}
        {previousSpreadsheetId && (
          <p className="muted settings-hint--sm" style={{ marginTop: 10 }}>
            Previously connected sheet still has everything on it —{" "}
            <a href={spreadsheetUrl(previousSpreadsheetId)} target="_blank" rel="noreferrer">
              open it to copy anything over ↗
            </a>
          </p>
        )}
      </div>

      <div className="section-title">
        Help &amp; guide
        <HelpTip text="How to learn the app: replay the welcome tour, or tap the compass on any screen for a quick guide to just that screen." />
      </div>
      <div className="card" data-tour="settings-help">
        <p className="muted fs-13" style={{ marginTop: 0 }}>New here? A few ways to find your feet:</p>
        <ul className="help-list">
          <li>Tap the <strong>compass</strong> at the top of any screen to replay that screen's quick guide.</li>
          <li>Plan posts in the <strong>Scheduler</strong>, park sparks in the <strong>Idea Bank</strong>, and build reusable <strong>Hashtag</strong> groups.</li>
          <li>Log each platform's numbers once a month in <strong>Performance</strong> to see what's working.</li>
          <li>Connect your <strong>Google Sheet</strong> above so your data has a real backup that's yours.</li>
        </ul>
        <button className="btn btn--ghost" onClick={() => window.dispatchEvent(new Event("coach:welcome"))}>
          Replay the welcome tour
        </button>
      </div>

      <div className="section-title">
        Frequently asked
        <HelpTip text="Tap a question to jump straight to that spotlight, wherever it lives, instead of stepping through a whole screen's tour to find it." />
      </div>
      <div className="card settings-faq" data-tour="settings-faq">
        {FAQ_ITEMS.map((item) => (
          <button
            key={item.target}
            className="settings-faq-row"
            onClick={() => openScreenTour(item.route, item.target)}
          >
            <span className="settings-faq-row__ico" aria-hidden>
              <IconCompass size={15} />
            </span>
            <span className="settings-faq-row__label">{item.question}</span>
          </button>
        ))}
      </div>

      <div className="section-title">
        All coach tours
        <HelpTip text="Every screen's own guided tour, in one place, so you can replay any of them without having to open that screen first and find its compass icon." />
      </div>
      <div className="card settings-faq settings-faq--tours" data-tour="settings-tours">
        {TOUR_SCREENS.map((r) => (
          <button
            key={r}
            className="settings-faq-row"
            onClick={() => openScreenTour(r)}
          >
            <span className="settings-faq-row__ico" aria-hidden>
              <IconCompass size={15} />
            </span>
            <span className="settings-faq-row__label">{ROUTE_LABELS[r]}</span>
          </button>
        ))}
      </div>

      <div className="section-title">Appearance</div>
      <div className="card" data-tour="settings-appearance">
        <label className="field__label">Theme</label>
        <Segmented
          options={[
            { value: "auto", label: "Auto" },
            { value: "light", label: "Morning" },
            { value: "dark", label: "Midnight" },
            { value: "gallery", label: "Gallery" },
          ]}
          value={theme}
          onChange={(v) => update({ theme: v as typeof theme })}
        />
        {theme === "gallery" && (
          <p className="muted fs-13 mt-2">
            An experimental art-inspired theme: pine green, terracotta and cream.
          </p>
        )}
      </div>

      <div className="section-title">Preferences</div>
      <div className="card" data-tour="settings-preferences">
        <div className="field">
          <label className="field__label" htmlFor="settings-name">Your name</label>
          <input
            id="settings-name"
            className="input settings-name-input"
            value={name}
            maxLength={24}
            placeholder="What should we call you?"
            onChange={(e) => update({ name: e.target.value })}
          />
        </div>
        <div className="field field--flush">
          <label className="field__label">Week starts on</label>
          <Segmented
            options={[
              { value: "0", label: "Sunday" },
              { value: "1", label: "Monday" },
            ]}
            value={String(weekStart)}
            onChange={(v) => update({ weekStart: Number(v) as 0 | 1 })}
          />
        </div>
      </div>

      <div className="section-title">
        Content pillars
        <HelpTip text="The color-coded themes your posts rotate through (Promotion, Education, …). Tap a pillar's name to rename it, or tap its dot to change its color." />
      </div>
      <div className="card" data-tour="settings-categories">
        <p className="muted settings-hint">
          Just a color and label to keep your content mix balanced.
        </p>
        {categories.length > 0 && (
          <div className="chip-wrap">
            {categories.map((c) => (
              <CategoryChip
                key={c}
                name={c}
                color={categoryColor(c)}
                onRename={(next) => renameCategory(c, next)}
                onRemove={() => removeCategory(c)}
                onPickColor={() => setColorPickerFor(c)}
              />
            ))}
          </div>
        )}
        <div className="spread spread--gap8">
          <input
            className="input input--shrink"
            value={newCategory}
            placeholder="Add a pillar"
            aria-label="Add a content pillar"
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
          />
          <button className="btn btn--auto" onClick={addCategory} disabled={!newCategory.trim()}>
            Add
          </button>
        </div>
      </div>

      <div className="section-title">
        Post goals
        <HelpTip text="The pickable goal list for a post (Sales, Follows, Likes, …). Add your own or remove the ones you never use." />
      </div>
      <div className="card" data-tour="settings-goals">
        {goals.length > 0 && (
          <div className="chip-wrap">
            {goals.map((g) => (
              <span key={g} className="chip chip--removable">
                {g}
                <button aria-label={`Remove ${g}`} onClick={() => removeGoal(g)} className="chip__remove">
                  <IconClose size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="spread spread--gap8">
          <input
            className="input input--shrink"
            value={newGoal}
            placeholder="Add a goal (e.g. Signups)"
            aria-label="Add a post goal"
            onChange={(e) => setNewGoal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGoal()}
          />
          <button className="btn btn--auto" onClick={addGoal} disabled={!newGoal.trim()}>
            Add
          </button>
        </div>
      </div>

      <div className="section-title">
        Platforms
        <HelpTip text="The channels you post to. Active platforms show up in the post editor, feed preview, and Performance. Rename, reorder, or switch off the ones you don't use: their data stays." />
      </div>
      <div className="card" data-tour="settings-platforms">
        {orderedPlatforms.map((p, i) => (
          <div key={p.id} className="set-platform-row">
            <div className="set-platform-row__reorder">
              <button
                className="set-platform-row__move"
                aria-label={`Move ${p.name} up`}
                disabled={i === 0}
                onClick={() => movePlatform(p.id, -1)}
              >
                <IconChevronUp size={14} />
              </button>
              <button
                className="set-platform-row__move"
                aria-label={`Move ${p.name} down`}
                disabled={i === orderedPlatforms.length - 1}
                onClick={() => movePlatform(p.id, 1)}
              >
                <IconChevronDown size={14} />
              </button>
            </div>
            <input
              className="input input--shrink"
              defaultValue={p.name}
              key={`${p.id}-${p.name}`}
              aria-label={`Rename ${p.name}`}
              onBlur={(e) => renamePlatform(p.id, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
            <label className="set-platform-row__active">
              <input
                type="checkbox"
                className="settings-checkbox"
                checked={p.active}
                onChange={() => updatePlatform(p.id, { active: !p.active })}
                aria-label={`${p.name} active`}
              />
            </label>
            <button className="muted" aria-label={`Delete ${p.name}`} onClick={() => deletePlatform(p.id)}>
              <IconClose size={16} />
            </button>
          </div>
        ))}
        <div className="spread spread--gap8" style={{ marginTop: 8 }}>
          <input
            className="input input--shrink"
            value={newPlatform}
            placeholder="Add a platform (e.g. Bluesky)"
            aria-label="Add a platform"
            onChange={(e) => setNewPlatform(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNewPlatform()}
          />
          <button className="btn btn--auto" onClick={addNewPlatform} disabled={!newPlatform.trim()}>
            Add
          </button>
        </div>
      </div>

      <div className="section-title">
        Customize sections
        <HelpTip text="Hide modules you don't use to declutter the sidebar and More menu. Hidden sections keep their data and stay reachable; this only affects navigation." />
      </div>
      <div className="card card--tight" data-tour="settings-sections">
        {HIDEABLE_NAV_ITEMS.map(({ route, label, Icon, color }) => {
          const hidden = hiddenRoutes.includes(route);
          return (
            <label key={route} className="row spread row--clickable">
              <span className="settings-navrow-label" style={{ opacity: hidden ? 0.5 : 1 }}>
                <span className="hub-card__ico hub-card__ico--sm hub-card__ico--brand" style={{ background: color }}>
                  <Icon size={15} />
                </span>
                {label}
              </span>
              <input
                type="checkbox"
                checked={!hidden}
                onChange={() => toggleRoute(route)}
                aria-label={`Show ${label}`}
                className="settings-checkbox"
              />
            </label>
          );
        })}
      </div>

      <div className="section-title">
        Bottom bar (phone)
        <HelpTip text="Choose which shortcuts show on the bottom bar: the row of icons along the bottom of the screen. You only see this bar on your phone, or when your browser window is narrow. On a wider screen the left sidebar shows everything instead, so this section changes nothing there. Add as many as you like and the bar scrolls sideways to fit them. More always stays put as the way to reach everything else. To reorder, press and hold an icon on the bar until it jiggles, then drag." />
      </div>
      <p className="muted settings-hint">
        You only see this bar on your phone, or when your browser window is
        narrow. On a wider screen the left sidebar shows everything instead, so
        this section changes nothing there.
      </p>
      <div className="card card--tight" data-tour="settings-tabbar">
        {tabBarRoutes.length === 0 && (
          <p className="muted settings-list-empty">
            No tabs added yet. The bottom bar will show only More.
          </p>
        )}
        {tabBarRoutes.map((route) => {
          const item = ALL_NAV_ITEMS.find((n) => n.route === route);
          if (!item) return null;
          return (
            <div key={route} className="row row--pad8">
              <span className="hub-card__ico hub-card__ico--sm hub-card__ico--brand flex-none" style={{ background: item.color }}>
                <item.Icon size={15} />
              </span>
              <div className="row__body"><div className="row__title row__title--sm">{item.label}</div></div>
              <button className="muted" aria-label={`Unpin ${item.label}`} onClick={() => removeTab(route)}>
                <IconClose size={16} />
              </button>
            </div>
          );
        })}
        {tabBarRoutes.length > 0 && (
          <p className="muted settings-pin-note">
            Tip: press and hold any icon on the bottom bar to drag it into a new order.
          </p>
        )}
      </div>
      {ALL_NAV_ITEMS.some((i) => !tabBarRoutes.includes(i.route)) && (
        <div className="card card--tight">
          <div className="muted settings-section-label">
            TAP TO ADD TO THE BOTTOM BAR
            <HelpTip text="Tap any of these to add it as a shortcut on the phone bottom bar. Add as many as you want and the bar scrolls sideways to fit." />
          </div>
          <div className="settings-chip-wrap">
            {ALL_NAV_ITEMS.filter((i) => !tabBarRoutes.includes(i.route)).map((item) => (
              <button key={item.route} className="chip" onClick={() => addTab(item.route)}>
                <item.Icon size={13} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="section-title">
        Start a fresh year
        <HelpTip text="Starting a new year of content? Clear out this year's posts and/or performance log and start clean. Your hashtag groups, idea bank, platforms, pillars, and settings all stay exactly as they are." />
      </div>
      <div className="card" data-tour="settings-yearreset">
        <p className="muted settings-hint">
          Clears this year's post history and monthly numbers so you can start
          the new year with a clean calendar. Your hashtag groups, idea bank,
          platforms, and settings stay. Nothing is deleted until you confirm.
        </p>
        <button className="btn btn--primary" onClick={() => setYearResetOpen(true)}>
          Start a fresh year
        </button>
      </div>

      <div className="section-title">Help &amp; contact</div>
      <div className="card" data-tour="settings-contact">
        <p className="muted settings-hint">
          Questions, ideas, or something not working? We'd love to hear from you.
        </p>
        <a
          className="btn btn--primary"
          href="mailto:artivicolab@gmail.com?subject=Social%20Planner"
        >
          Contact us
        </a>
      </div>

      <div className="section-title section-title--alert">Danger zone</div>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }} data-tour="settings-danger">
        {connected && (
          <div data-tour="settings-newsheet">
            <div className="settings-card-title">Start a new sheet</div>
            <p className="muted settings-hint">
              Link a brand new, empty Google Sheet instead of this one. Your current sheet
              isn't deleted, it stays in your Drive untouched, just unlinked from the app.
            </p>
            <LockGatedButton
              label="Start a new sheet"
              busyLabel="Starting…"
              busy={startingNewSheet}
              onConfirm={handleStartNewSheet}
            />
            {newSheetError && <p className="neg settings-error">{newSheetError}</p>}
          </div>
        )}
        <div>
          <div className="settings-card-title">Start over</div>
          <p className="muted settings-hint">
            Delete all planner data on this device. This cannot be undone.
          </p>
          <LockGatedButton
            label="Start over (erase everything)"
            onConfirm={async () => {
              const ok = await confirmDialog({
                title: "Delete all planner data?",
                message: "This clears everything on this device. This cannot be undone.",
                confirmLabel: "Delete everything",
                danger: true,
              });
              if (ok) void resetEverything();
            }}
          />
        </div>
      </div>

      <div className="settings-footer" data-tour="settings-footer">
        <button className="hero__name settings-footer__link" onClick={() => navigate("privacy")}>
          Privacy &amp; source
        </button>
        <p className="muted settings-hint--sm">
          {APP_NAME} · v{APP_VERSION}
          {BUILD_SHA && ` · ${BUILD_SHA}`} · your data, your device
        </p>
        <button
          className="chip settings-footer__link"
          style={{ marginTop: 10 }}
          disabled={checkingUpdate}
          onClick={checkForUpdates}
        >
          {updateReady ? "Update ready, refresh now" : checkingUpdate ? "Checking…" : "Check for updates"}
        </button>
      </div>

      <BottomSheet open={yearResetOpen} title="Start a fresh year" onClose={() => setYearResetOpen(false)}>
        <p className="muted settings-sheet-note">
          Pick what to clear. Your hashtag groups, idea bank, platforms, pillars,
          and settings stay exactly as they are. This can't be undone.
        </p>
        <label className="row row--clickable set-reset-option">
          <div className="row__body">
            <div className="row__title row__title--sm">Scheduled posts</div>
            <div className="muted fs-12">Clears the whole post history and calendar highlights.</div>
          </div>
          <input
            type="checkbox"
            className="settings-checkbox"
            checked={resetPosts}
            onChange={() => setResetPosts((v) => !v)}
            aria-label="Clear scheduled posts"
          />
        </label>
        <label className="row row--clickable set-reset-option">
          <div className="row__body">
            <div className="row__title row__title--sm">Performance log</div>
            <div className="muted fs-12">Clears every platform's monthly followers, engagement, and reach.</div>
          </div>
          <input
            type="checkbox"
            className="settings-checkbox"
            checked={resetPerf}
            onChange={() => setResetPerf((v) => !v)}
            aria-label="Clear performance log"
          />
        </label>
        <button
          className="btn btn--primary"
          disabled={!resetPosts && !resetPerf}
          onClick={runYearReset}
        >
          Clear selected and start fresh
        </button>
      </BottomSheet>

      <BottomSheet open={relinkOpen} title="Link an existing sheet" onClose={() => setRelinkOpen(false)}>
        <p className="muted settings-sheet-note">
          Paste the Google Sheets link (or just its ID) from a device where you already
          connected. We'll sign in to Google to pull your real data down and read your
          product code from that sheet automatically, so you don't need to type it again.
        </p>
        <div className="field">
          <label className="field__label" htmlFor="settings-relink">Sheet link or ID</label>
          <input
            id="settings-relink"
            className="input"
            autoFocus
            value={relinkInput}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            onChange={(e) => { setRelinkInput(e.target.value); setRelinkError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submitRelink()}
          />
        </div>
        {relinkError && <p className="neg settings-error">{relinkError}</p>}
        <button className="btn btn--primary" disabled={busy || !relinkInput.trim()} onClick={submitRelink}>
          {busy ? "Linking…" : "Link this sheet"}
        </button>
      </BottomSheet>

      <BottomSheet open={!!colorPickerFor} title={`Color for "${colorPickerFor}"`} onClose={() => setColorPickerFor(null)}>
        <div className="chip-wrap">
          {PICKABLE_CATEGORY_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className="settings-swatch"
              aria-label={`Use this color for ${colorPickerFor}`}
              style={{ background: color }}
              onClick={() => { if (colorPickerFor) setCategoryColor(colorPickerFor, color); setColorPickerFor(null); }}
            />
          ))}
        </div>
      </BottomSheet>
    </>
  );
}

function CategoryChip({
  name,
  color,
  onRename,
  onRemove,
  onPickColor,
}: {
  name: string;
  color: string;
  onRename: (next: string) => void;
  onRemove: () => void;
  onPickColor: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  function commit() {
    setEditing(false);
    if (value.trim() && value.trim() !== name) onRename(value);
    else setValue(name);
  }

  if (editing) {
    return (
      <input
        className="input settings-category-input"
        autoFocus
        value={value}
        aria-label={`Rename ${name}`}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setValue(name); setEditing(false); }
        }}
      />
    );
  }

  return (
    <span className="chip chip--removable">
      <button
        type="button"
        aria-label={`Change ${name}'s color`}
        className="settings-swatch settings-swatch--sm"
        style={{ background: color }}
        onClick={onPickColor}
      />
      <button onClick={() => { setValue(name); setEditing(true); }} className="btn--unstyled">
        {name}
      </button>
      <button aria-label={`Remove ${name}`} onClick={onRemove} className="chip__remove">
        <IconClose size={12} />
      </button>
    </span>
  );
}
