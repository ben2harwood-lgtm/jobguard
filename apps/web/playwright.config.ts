import { defineConfig, devices } from "@playwright/test";
import { E2E_RUNTIME_URL } from "./e2e/global-setup";

const shutdownToken = "sbox-e2e-local-pool-drain";

export default defineConfig({
  testDir: "./e2e", globalSetup: "./e2e/global-setup.ts", fullyParallel: true, retries: 0, expect: { timeout: 10_000 },
  ...(process.env.CI ? { workers: 1 } : {}),
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  webServer: {
    // CI verifies the actual production build, not a separately compiled development server.
    command: `JOBGUARD_ENV=synthetic_demo IDENTITY_DATABASE_URL=postgresql://jobguard_identity:sbox-e2e-identity@127.0.0.1:55432/jobguard_synthetic_demo AUTH_CODE_SECRET=sbox-only-identity-hmac-secret-32-bytes AUTH_ALLOWED_ORIGIN=http://127.0.0.1:3000 JOBGUARD_E2E_SHUTDOWN_TOKEN=${shutdownToken} DATABASE_URL=${E2E_RUNTIME_URL} ${process.env.CI ? "pnpm exec next start --hostname 127.0.0.1 --port 3000" : "pnpm dev"}`,
    url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI, timeout: 120_000,
  },
  projects: [
    { name: "mobile-360", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
