import { defineConfig } from "@playwright/test";
// Existing seeded V2 launcher only. No second server or database is started.
const baseURL = process.env.V2_TEST_ORIGIN;
if (!baseURL) throw new Error("Set V2_TEST_ORIGIN to the running seeded V2 launcher");
export default defineConfig({
  testDir: "./e2e", testMatch: "v2-chasing.spec.ts", workers: 1, retries: 0,
  use: { baseURL, trace: "retain-on-failure" },
});
