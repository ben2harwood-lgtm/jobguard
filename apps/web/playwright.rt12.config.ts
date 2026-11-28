import { defineConfig } from "@playwright/test";
import hostedConfig from "./playwright.hosted.config";

// Explicit opt-in: RT-12 is bound to the sq-preview origin and deployment fingerprint.
// JOBGUARD_HOSTED_URL=https://sq-preview-jobguard-demo.ben2harwood.workers.dev pnpm exec playwright test -c playwright.rt12.config.ts
export default defineConfig(hostedConfig, {
  testMatch: ["RT-12-right-place.spec.ts"],
});
