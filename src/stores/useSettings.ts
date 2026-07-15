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
};

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
    const next = { ...prev, ...patch };
    if (patch.theme) applyTheme(patch.theme);
    set(patch);
    void setKV(KEY, next);
  },
}));

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
  };
}
