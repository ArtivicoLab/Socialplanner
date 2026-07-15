import { create } from "zustand";
import { getKV, setKV } from "../lib/db";
import { DEFAULT_CATEGORIES, DEFAULT_GOALS, type Settings } from "../lib/types";

const KEY = "settings";
const DEFAULTS: Settings = {
  name: "",
  weekStart: 0,
  theme: "auto",
  categories: [...DEFAULT_CATEGORIES],
  categoryColors: {},
  goals: [...DEFAULT_GOALS],
  hiddenRoutes: [],
  tabBarRoutes: ["dashboard", "scheduler", "calendar", "feed"],
  accessCode: "",
  activated: false,
  hideAtsHint: false,
  tourDone: false,
  updatedAt: "",
};

// The Settings fields that round-trip through the Sheet's Meta tab (see
// sync.ts's pushSettingsMeta/pullSettingsMeta) — a local edit to any of
// these bumps `updatedAt` and schedules a push. Only `theme` (a display
// preference, not content) and accessCode/activated/onboarding flags (each
// with their own separate handling) stay local-device-only — hiddenRoutes/
// tabBarRoutes were originally left out too as "just UI layout," but
// confirmed live 2026-07-15 that's wrong: a user who customizes which
// modules show, or curates their phone's bottom bar, expects that to follow
// them to a new device same as their pillars and goals do.
const SYNCED_KEYS: (keyof Settings)[] = [
  "name", "weekStart", "categories", "categoryColors", "goals", "hiddenRoutes", "tabBarRoutes",
];

interface SettingsState extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => void;
}

function applyTheme(theme: Settings["theme"]) {
  document.documentElement.setAttribute("data-theme", theme);
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  load: async () => {
    const stored = (await getKV<Settings>(KEY)) ?? {};
    const merged = { ...DEFAULTS, ...stored };
    applyTheme(merged.theme);
    set({ ...merged, loaded: true });
  },
  update: (patch) => {
    const prev = pickSettings(get());
    const touchesSynced = SYNCED_KEYS.some((k) => k in patch);
    const updatedAt = touchesSynced ? new Date().toISOString() : prev.updatedAt;
    const next = { ...prev, ...patch, updatedAt };
    if (patch.theme) applyTheme(patch.theme);
    set({ ...patch, updatedAt });
    void setKV(KEY, next);
    if (touchesSynced) {
      // Dynamic import: useSync -> lib/sync -> stores/useSettings would
      // otherwise be a require cycle at module-eval time.
      void import("../stores/useSync").then(({ useSync }) => useSync.getState().touchSettings());
    }
  },
}));

/** Applied by the sync layer (sync.ts's pullSettingsMeta) when the Sheet's
 *  Meta tab has a newer name/weekStart/categories/categoryColors/goals than
 *  this device — bypasses `update()` on purpose: `update()` always stamps
 *  `updatedAt` to "now" and schedules a push, which would immediately push
 *  the value straight back up and mask genuine cross-device merges. */
export function applyRemoteSettings(patch: Partial<Settings> & { updatedAt: string }): void {
  const prev = pickSettings(useSettings.getState());
  const next = { ...prev, ...patch };
  if (patch.theme) applyTheme(patch.theme);
  useSettings.setState(patch);
  void setKV(KEY, next);
}

function pickSettings(s: Settings): Settings {
  return {
    name: s.name,
    weekStart: s.weekStart,
    theme: s.theme,
    categories: s.categories,
    categoryColors: s.categoryColors,
    goals: s.goals,
    hiddenRoutes: s.hiddenRoutes,
    tabBarRoutes: s.tabBarRoutes,
    accessCode: s.accessCode,
    activated: s.activated,
    hideAtsHint: s.hideAtsHint,
    tourDone: s.tourDone,
    updatedAt: s.updatedAt,
  };
}
