import { defineConfig, devices } from "@playwright/test";

// Fixture-only: no sign-in, bootstrap or database. Run with V2 on, then off.
// A phone-origin run can use the existing launcher via V2_TEST_ORIGIN.
const externalOrigin = process.env.V2_TEST_ORIGIN;
if (externalOrigin && new URL(externalOrigin).protocol !== "https:") throw new Error("Phone proof requires an HTTPS V2_TEST_ORIGIN");
const baseURL = externalOrigin ?? "http://127.0.0.1:3109";
const executablePath = process.env.V2_TEST_CHROMIUM ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

// M2's isolated Next dev pattern, with a programmatic config override so the
// dev indicator is actually off without editing the shared next.config.mjs.
const command = `node --input-type=module -e "import next from 'next'; import { createServer } from 'node:http'; const app = next({ dev: true, hostname: '127.0.0.1', port: 3109, conf: { devIndicators: false } }); await app.prepare(); createServer(app.getRequestHandler()).listen(3109, '127.0.0.1');"`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "v2-mock-pages-3.spec.ts",
  workers: 1,
  retries: 0,
  use: {
    baseURL, locale: "en-GB", timezoneId: "Europe/London", ignoreHTTPSErrors: true,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  ...(!externalOrigin ? { webServer: {
    command,
    env: { JOBGUARD_ENV: "synthetic_demo", JOBGUARD_LOCAL_V2: process.env.JOBGUARD_LOCAL_V2 ?? "" },
    url: process.env.JOBGUARD_LOCAL_V2 === "1" ? `${baseURL}/v2-mock-pages-3` : baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  } } : {}),
  projects: [
    { name: "mobile-360", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
