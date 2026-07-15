import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

// CI sets VITE_COMMIT_SHA per build, but that env var is blank in local dev —
// so `npm run dev` used to show a footer that never visibly changed no matter
// what you'd committed. Fall back to the actual local HEAD sha so the footer
// always reflects the code that's running.
const localSha = (() => {
  try {
    return execSync("git rev-parse --short=7 HEAD").toString().trim();
  } catch {
    return "";
  }
})();

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Exposes the package.json version to the client as a footer version stamp
  // (see lib/config.ts APP_VERSION) — separate from VITE_COMMIT_SHA, which is
  // an actual env var so CI can inject the deployed commit per build.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __LOCAL_COMMIT_SHA__: JSON.stringify(localSha),
  },
  // Fixed port: the Google OAuth client's Authorized JavaScript origin is
  // registered as http://localhost:5512 specifically — strictPort so a stale
  // server on this port fails loudly instead of silently drifting to another
  // port (which breaks sign-in without any obvious error).
  server: {
    port: 5512,
    strictPort: true,
  },
  preview: {
    port: 5512,
    strictPort: true,
  },
  // Note: all charts/rings/grids are hand-rolled SVG (spec §2), so recharts is
  // NOT bundled. It stays in package.json for the future Recharts-based dashboard
  // bars/lines and will be code-split when first imported.
});
