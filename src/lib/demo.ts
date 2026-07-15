// Demo mode: a plain localStorage toggle (like tourSeen) that decides whether
// the app shows the built-in full-year sample data or the user's own real data.
// It is deliberately a DEVICE flag, not user data — it never rides along to the
// Google Sheet or IndexedDB, so demo content can't contaminate a real account.
//
// Backed by a tiny zustand store so the brand ("Life Planner (demo)") and the
// Settings toggle re-render the moment it flips, while `isDemo()` stays callable
// outside React (bootstrap, sync) via getState().
//
// Default: ON for a fresh visitor (so the app looks alive before buying), then
// flipped OFF automatically the moment they connect their Google Sheet (see
// sync.connect) — a logged-in user should see their own blank planner.
import { create } from "zustand";

// TEMP (screenshots): when true, the "(demo)" brand suffix and the demo banner
// are hidden so the populated sample app can be captured clean. Sample DATA
// still shows. Flip back to false when done.
export const HIDE_DEMO_CHROME = false;

const DEMO_KEY = "demoMode";

function readFlag(): boolean {
  try {
    const v = localStorage.getItem(DEMO_KEY);
    if (v === null) return true; // never set = brand-new visitor = show the demo
    return v === "1";
  } catch {
    return false; // storage blocked (private mode etc.) — treat as a real, empty app
  }
}

function writeFlag(on: boolean): void {
  try {
    localStorage.setItem(DEMO_KEY, on ? "1" : "0");
  } catch {
    // ignore — worst case the flag doesn't persist across reloads
  }
}

interface DemoState {
  demo: boolean;
  setFlag: (on: boolean) => void;
}

export const useDemo = create<DemoState>((set) => ({
  demo: readFlag(),
  setFlag: (on) => {
    writeFlag(on);
    set({ demo: on });
  },
}));

export function isDemo(): boolean {
  return useDemo.getState().demo;
}

export function setDemoFlag(on: boolean): void {
  useDemo.getState().setFlag(on);
}
