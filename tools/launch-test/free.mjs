import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const web = ["--filter", "@jobguard/web", "test:e2e"];
const database = ["--filter", "@jobguard/db", "exec", "vitest", "run", "--maxWorkers=1"];
const checks = {
  build: ["build"],
  browser: [...web, "--project=mobile-360", "--project=desktop",
    "DEMO-J1-core-1000.spec.ts", "DEMO-J2.spec.ts", "DEMO-J3-shadow.spec.ts",
    "TOMMY-money-gaps.spec.ts", "ENT-11b.spec.ts", "LAUNCH-TEST-JG-01.spec.ts"],
  database: [...database,
    "test/final-account-lock-invoice.integration.test.ts",
    "test/lp8b-outbox-evidence.integration.test.ts",
    "test/signed-evidence-export-store.integration.test.ts",
    "test/fee-webhook-receipt-binding.integration.test.ts",
    "test/payment-fee-standing-authority.integration.test.ts",
    "test/practice-bank-member-accounts.integration.test.ts",
    "test/simulation-fee-collection.integration.test.ts",
    "test/subscription-stripe-sandbox.integration.test.ts",
    "test/success-fee-direct-debit.integration.test.ts"],
  restore: ["test:restore"],
};
const selected = process.argv.slice(2);
const names = selected.length ? selected : Object.keys(checks);
if (names.some(name => !Object.hasOwn(checks, name))) {
  console.error("Usage: node tools/launch-test/free.mjs [build|browser|database|restore] ...");
  process.exit(2);
}
// Use only the repository's disposable synthetic provider/test fixtures.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !/OPENAI|ANTHROPIC|STRIPE|GOCARDLESS|ENABLE_REAL|(?:^|_)DATABASE_URL|SMTP|RESEND|POSTMARK/i.test(name)));
Object.assign(env, { CI: "1", JOBGUARD_ENV: "synthetic_demo", NEXT_TELEMETRY_DISABLED: "1" });
for (const name of names) {
  console.log("\n$ pnpm " + checks[name].join(" "));
  const result = spawnSync("pnpm", checks[name], { cwd: root, env, stdio: "inherit" });
  console.log(name + " exit: " + (result.status ?? result.error?.message ?? result.signal));
  if (result.status !== 0) process.exitCode = 1;
}
