import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", fullyParallel: true, retries: 0,
  workers: process.env.CI ? 2 : undefined,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  webServer: {
    // CI verifies the actual production build, not a separately compiled development server.
    command: process.env.CI ? "pnpm exec next start --hostname 127.0.0.1 --port 3000" : "pnpm dev",
    url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI, timeout: 120_000,
  },
  projects: [
    { name: "mobile-360", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
