import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Merge (not duplicate) vite.config.ts's `define` block — tests need the
// same __APP_VERSION__/__LOCAL_COMMIT_SHA__ globals the app build gets, or
// any module importing lib/config.ts throws at collection time.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      setupFiles: ["./tests/setup.ts"],
    },
  })
);
