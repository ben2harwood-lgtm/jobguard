import { defineConfig, devices } from "@playwright/test";

// V2-SQ-B hosted acceptance: run against the exact address that will be shared, never a local server.
// JOBGUARD_HOSTED_URL=https://<alias>-jobguard-demo.<subdomain>.workers.dev pnpm test:hosted
const baseURL = process.env.JOBGUARD_HOSTED_URL;
if (!baseURL) throw new Error("Set JOBGUARD_HOSTED_URL to the exact address that will be shared.");

export default defineConfig({
  testDir: "./e2e", testMatch: ["HOSTED-preview-firm-start.spec.ts", "SPOKEN-QUOTE-REAL.spec.ts"], fullyParallel: false, workers: 1, retries: 0,
  expect: { timeout: 30_000 },
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "mobile-360", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
