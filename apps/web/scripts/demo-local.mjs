// Local fictional demo stack: embedded PostgreSQL (no Docker), synthetic bootstrap,
// the practice background worker and the built web app on http://127.0.0.1:3000.
// Same setup as the e2e harness (e2e/global-setup.ts). Fictional data only.
// Run from apps/web after `pnpm turbo run build --filter=@jobguard/web...`:
//   node scripts/demo-local.mjs            (production build, next start)
//   DEMO_DEV=1 node scripts/demo-local.mjs (next dev)
// Ctrl+C stops everything and deletes the throwaway database.
import { spawn } from "node:child_process";
import setup, { E2E_RUNTIME_URL, E2E_AUTH_CODE_SECRET, E2E_WORKER_URL } from "../e2e/global-setup.ts";

const origin = process.env.DEMO_ORIGIN ?? "http://127.0.0.1:3000";
const teardown = await setup();
const web = spawn("pnpm", process.env.DEMO_DEV ? ["dev"] : ["exec", "next", "start", "--hostname", process.env.DEMO_HOST ?? "127.0.0.1", "--port", "3000"], {
  stdio: "inherit",
  env: {
    ...process.env,
    JOBGUARD_ENV: "synthetic_demo",
    IDENTITY_DATABASE_URL: "postgresql://jobguard_identity:sbox-e2e-identity@127.0.0.1:55432/jobguard_synthetic_demo",
    AUTH_ALLOWED_ORIGIN: origin,
    JOBGUARD_ALLOWED_ORIGINS: origin,
    JOBGUARD_E2E_SHUTDOWN_TOKEN: "sbox-e2e-local-pool-drain",
    DATABASE_URL: E2E_RUNTIME_URL,
    WORKER_DATABASE_URL: E2E_WORKER_URL,
    AUTH_CODE_SECRET: E2E_AUTH_CODE_SECRET,
  },
});
let stopping = false;
const stop = async () => { if (stopping) return; stopping = true; await teardown?.().catch(() => {}); web.kill("SIGTERM"); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
web.on("exit", () => void stop());
console.log(`\nJobGuard fictional demo starting on ${origin}\n`);
