import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { useAppUpdate } from "./lib/appUpdate";
import "./styles/base.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Dev self-heal: a service worker left registered by an earlier production or
// `vite preview` session on this same origin (localhost:5508) keeps serving
// its cached, cache-first assets — so `npm run dev` edits silently never show
// up no matter how many times the server restarts. In dev, tear any such
// worker + its caches down so the dev server is always the source of truth.
if (!import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  }).catch(() => {});
  if (window.caches) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
  }
}

// Register the service worker (PWA) in production builds only.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  // A waiting worker means a newer deployed build is ready. Surface it to the
  // UI (UpdatePrompt) with an `apply` that tells it to take over; the reload
  // below fires once it does. Only prompt when there's already a controller,
  // so the very first install (nothing to replace) doesn't nag.
  const promptUpdate = (worker: ServiceWorker) => {
    useAppUpdate.getState().markReady(() => worker.postMessage({ type: "SKIP_WAITING" }));
  };

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) promptUpdate(nw);
        });
      });
      // Installed PWAs can sit open (or backgrounded) for days without ever
      // re-fetching sw.js, so a deploy never gets noticed on its own — check
      // every time the app comes back to the foreground.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void reg.update();
      });
    }).catch(() => {});
  });

  // The new worker took control (after the user tapped Refresh): reload once to
  // run the fresh build instead of the old JS still in memory.
  let reloadedForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadedForUpdate) return;
    reloadedForUpdate = true;
    window.location.reload();
  });
}
