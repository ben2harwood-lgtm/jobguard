import { defineConfig } from "@playwright/test";

const origin = process.env.V2_TEST_ORIGIN;
const executablePath = process.env.V2_TEST_CHROMIUM;
if (!origin) {
  throw new Error("Set V2_TEST_ORIGIN to the running V2 launcher's web or HTTPS phone origin.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "v2-g7.spec.mts",
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
