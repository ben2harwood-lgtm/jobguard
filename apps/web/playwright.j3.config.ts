import { defineConfig, devices } from "@playwright/test";
import { E2E_RUNTIME_URL, E2E_AUTH_CODE_SECRET } from "./.j3-e2e/global-setup";

const shutdownToken = "sbox-e2e-local-pool-drain";

export default defineConfig({
  testDir: "./.j3-e2e", globalSetup: "./.j3-e2e/global-setup.ts", fullyParallel: true, retries: 0, expect: { timeout: 10_000 },
  ...(process.env.CI ? { workers: 1, reporter: [["list"], ["html", { open: "never" }]] } : {}),
  use: { channel: "chromium", baseURL: "http://127.0.0.1:3301", trace: "retain-on-failure" },
  webServer: {
    // CI verifies the actual production build, not a separately compiled development server.
    command: `JOBGUARD_ENV=synthetic_demo IDENTITY_DATABASE_URL=postgresql://jobguard_identity:sbox-e2e-identity@127.0.0.1:55301/jobguard_synthetic_demo AUTH_ALLOWED_ORIGIN=http://127.0.0.1:3301 JOBGUARD_E2E_SHUTDOWN_TOKEN=${shutdownToken} DATABASE_URL=${E2E_RUNTIME_URL} ${process.env.CI ? "pnpm exec next start --hostname 127.0.0.1 --port 3301" : "pnpm dev"}`,
    env: { AUTH_CODE_SECRET: E2E_AUTH_CODE_SECRET },
    url: "http://127.0.0.1:3301", reuseExistingServer: !process.env.CI, timeout: 120_000,
  },
  projects: [
    { name: "mobile-360", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
