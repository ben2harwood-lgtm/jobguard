import { defineConfig } from "@playwright/test";

const origin = process.env.V2_TEST_ORIGIN;
const executablePath = process.env.V2_TEST_CHROMIUM;
const url = origin ? new URL(origin) : null;
// The phone run uses the launcher's private HTTPS origin. The loopback web origin covers both widths elsewhere.
const loopback = url?.protocol === "http:" && url.hostname === "127.0.0.1";
if (!url || (!loopback && (url.protocol !== "https:" || url.hostname === "127.0.0.1"))) {
  throw new Error("Set V2_TEST_ORIGIN to the running launcher's private HTTPS phone origin or http://127.0.0.1:3400.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "v2-d5a.spec.mts",
  workers: 1,
  timeout: 360_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: origin,
    ignoreHTTPSErrors: !loopback,
    locale: "en-GB",
    timezoneId: "Europe/London",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
    trace: "retain-on-failure",
  },
});
