import { defineConfig } from "@playwright/test";
import { v2Origin } from "../../tools/v2/test/browser-session.mjs";

// Use the existing seeded phone-mode launcher. No second server or database.
export default defineConfig({
  testDir: "./e2e", testMatch: "v2-chasing.spec.ts", workers: 1, retries: 0,
  use: {
    baseURL: v2Origin(), ignoreHTTPSErrors: true, trace: "retain-on-failure",
    ...(process.env.V2_TEST_CHROMIUM ? { launchOptions: { executablePath: process.env.V2_TEST_CHROMIUM } } : {}),
  },
});
