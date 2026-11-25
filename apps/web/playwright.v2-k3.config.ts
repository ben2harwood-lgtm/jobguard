import { defineConfig } from "@playwright/test";
const origin = process.env.V2_TEST_ORIGIN;
if (!origin) throw new Error("V2_TEST_ORIGIN must name the launcher HTTPS phone origin");
if (new URL(origin).protocol !== "https:") throw new Error("V2_TEST_ORIGIN must use HTTPS for Secure session cookies");
export default defineConfig({
  testDir: "./v2-browser", testMatch: "friday-update.browser.ts", workers: 1, retries: 0,
  use: { baseURL: origin, ignoreHTTPSErrors: true, trace: "retain-on-failure", launchOptions: process.env.V2_TEST_CHROMIUM ? { executablePath: process.env.V2_TEST_CHROMIUM } : {} },
  // The router supplies a built V2 server: no global setup, ports or database settings are changed here.
  projects: [{ name: "v2-k3", use: { viewport: { width: 360, height: 800 } } }],
});
