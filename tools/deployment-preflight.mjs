import { readdir, readFile, lstat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export function requireLocalDatabase(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("PREFLIGHT_LOCAL_DATABASE_REQUIRED"); }
  // Literal loopback only; no DNS, host override, socket or libpq query options.
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "[::1]"].includes(url.hostname) || url.search || url.hash || !url.pathname.slice(1))
    throw new Error("PREFLIGHT_LOCAL_DATABASE_REQUIRED");
  return url.href;
}
export async function scanBuildOutput(directory, knownSecrets = []) {
  if (!directory) throw new Error("PREFLIGHT_BUILD_OUTPUT_REQUIRED");
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
    /\b(?:sk_live_|sk_test_|sk-ant-)[A-Za-z0-9_-]{16,}/u,
    /postgres(?:ql)?:\/\/[^\s/:]+:[^\s/@]+@/u,
  ];
  let count = 0;
  async function visit(path) {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error("PREFLIGHT_BUILD_SYMLINK_REFUSED");
    if (info.isDirectory()) {
      for (const name of await readdir(path)) await visit(join(path, name));
    } else if (info.isFile()) {
      const text = (await readFile(path)).toString("utf8");
      if (patterns.some(pattern => pattern.test(text)) || knownSecrets.some(secret => secret && text.includes(secret)))
        throw new Error("PREFLIGHT_BUILD_SECRET_FOUND");
      count++;
    } else throw new Error("PREFLIGHT_BUILD_FILE_REFUSED");
  }
  if (!(await lstat(resolve(directory))).isDirectory()) throw new Error("PREFLIGHT_BUILD_OUTPUT_REQUIRED");
  await visit(resolve(directory));
  if (!count) throw new Error("PREFLIGHT_BUILD_OUTPUT_EMPTY");
  return count;
}
export async function runPreflight({ databaseUrl, buildOutput, tenantA, tenantB, knownSecrets = [] }, dependencies = {}) {
  const safeUrl = requireLocalDatabase(databaseUrl); // Must precede import, pool creation and runner invocation.
  if (!tenantA || !tenantB || tenantA === tenantB) throw new Error("PREFLIGHT_TWO_FIXTURE_TENANTS_REQUIRED");
  await scanBuildOutput(buildOutput, knownSecrets);
  const run = dependencies.run ?? ((env) => {
    const result = spawnSync("pnpm", ["--filter", "@jobguard/db", "exec", "vitest", "run", "--maxWorkers=1",
      "test/deployment-preflight.integration.test.ts", "test/tenancy.integration.test.ts"],
    { cwd: fileURLToPath(new URL("../", import.meta.url)), env, stdio: "pipe", timeout: 600_000 });
    // Do not print runner errors: PostgreSQL failures can contain credentials/rows.
    if (result.error || result.status !== 0) throw new Error("PREFLIGHT_DATABASE_CHECKS_FAILED");
  });
  await run({ ...process.env, PREFLIGHT_DATABASE_URL: safeUrl, PREFLIGHT_TENANT_A: tenantA, PREFLIGHT_TENANT_B: tenantB });
  return { version: "deployment-preflight.v1", localOnly: true, passed: true };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const knownSecrets = Object.entries(process.env)
      .filter(([name, value]) => /(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY|API_KEY)$/u.test(name) && value?.length >= 8)
      .map(([, value]) => value);
    const result = await runPreflight({ databaseUrl: process.env.PREFLIGHT_DATABASE_URL,
      buildOutput: process.argv[2], tenantA: process.env.PREFLIGHT_TENANT_A, tenantB: process.env.PREFLIGHT_TENANT_B, knownSecrets });
    console.info(JSON.stringify(result));
  } catch {
    console.error("PREFLIGHT_REFUSED"); process.exitCode = 1;
  }
}
