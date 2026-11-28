import { defineConfig } from "@playwright/test";

const origin = process.env.V2_TEST_ORIGIN;
const executablePath = process.env.V2_TEST_CHROMIUM;
if (!origin || new URL(origin).protocol !== "https:" || new URL(origin).hostname === "127.0.0.1") {
  throw new Error("Set V2_TEST_ORIGIN to the running launcher's private HTTPS phone origin.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "v2-c4.spec.mts",
  workers: 1,
  timeout: 360_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: origin,
    ignoreHTTPSErrors: true,
    locale: "en-GB",
    timezoneId: "Europe/London",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
    trace: "retain-on-failure",
  },
});
