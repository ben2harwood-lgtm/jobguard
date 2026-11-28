import { defineConfig } from "@playwright/test";
// Deliberately isolated from the default config, demo server and demo database.
export default defineConfig({
  testDir: ".", testMatch: "RT-09-exactly-once.spec.ts", workers: 2,
  timeout: 45_000, expect: { timeout: 5_000 },
  outputDir: "/tmp/jobguard-rt09-browser-results", reporter: "list",
  use: { actionTimeout: 10_000, baseURL: "http://127.0.0.1:3199", viewport: { width: 360, height: 800 },
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } } : {}) },
  webServer: { command: "pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3199",
    cwd: "..", url: "http://127.0.0.1:3199/classic", reuseExistingServer: false,
    env: { JOBGUARD_ENV: "synthetic_demo", NEXT_TELEMETRY_DISABLED: "1", WATCHPACK_POLLING: "1000", DATABASE_URL: "" }, timeout: 120_000 },
});
