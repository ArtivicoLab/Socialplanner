// Tracks whether a newer deployed build is waiting to activate. The service
// worker (main.tsx) flips this on when it finds a new version on the server, so
// the UI can show a "Refresh to update" prompt instead of leaving the user on a
// stale, cached version. `apply` tells the waiting worker to take over; the
// page reloads on the resulting controllerchange (see main.tsx).
import { create } from "zustand";

interface AppUpdateState {
  ready: boolean;
  apply: () => void;
  markReady: (apply: () => void) => void;
}

export const useAppUpdate = create<AppUpdateState>((set) => ({
  ready: false,
  apply: () => {},
  markReady: (apply) => set({ ready: true, apply }),
}));
