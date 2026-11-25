import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "pilot-05c.browser.ts",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    actionTimeout: 20_000,
    ignoreHTTPSErrors: true,
    launchOptions: {
      ...(process.env.PILOT_FIXTURE_CHROMIUM ? { executablePath: process.env.PILOT_FIXTURE_CHROMIUM } : {}),
      args: ["--no-proxy-server", "--host-resolver-rules=MAP pilot-browser.invalid 127.0.0.1"],
    },
  },
});
