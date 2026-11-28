import { defineConfig } from "@playwright/test";

// Opt-in only. No webServer, local ports, auth, provider calls or shared DB writes.
// The spec fulfills every navigation with locally rendered component markup.
if (process.env.JOBGUARD_RT10 !== "1") throw new Error("Opt in with JOBGUARD_RT10=1 after running rt10-mobile-markup.test.tsx.");
export default defineConfig({
  testDir: "./e2e", testMatch: "RT-10-mobile.spec.ts", fullyParallel: true,
  workers: 2, retries: 0, timeout: 30_000,
  outputDir: "/tmp/jobguard-rt10-49755b62/browser-results",
  reporter: [["list"], ["json", { outputFile: "/tmp/jobguard-rt10-49755b62/browser-results.json" }]],
  use: {
    baseURL: "https://sq-preview-jobguard-demo.ben2harwood.workers.dev",
    browserName: "chromium", trace: "off", deviceScaleFactor: 2, serviceWorkers: "block",
  },
});
