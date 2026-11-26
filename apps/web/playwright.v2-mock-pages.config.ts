import { defineConfig, devices } from "@playwright/test";

// Run once with JOBGUARD_LOCAL_V2=1 for screenshots and once without it for the demo 404.
const baseURL = "http://127.0.0.1:3108";
const enabled = process.env.JOBGUARD_LOCAL_V2 === "1";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "v2-mock-pages.spec.ts",
  workers: 1,
  use: {
    baseURL,
    locale: "en-GB",
    timezoneId: "Europe/London",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: "pnpm exec next dev --hostname 127.0.0.1 --port 3108",
    env: { JOBGUARD_ENV: "synthetic_demo" },
    url: enabled ? `${baseURL}/v2-mock-pages` : baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "mobile-360", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
