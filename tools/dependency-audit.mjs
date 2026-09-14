import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const AUDIT_ARGS = Object.freeze(["audit", "--json", "--audit-level=low", "--ignore-registry-errors=false", "--ignore-unfixable=false"]);
const severities = ["info", "low", "moderate", "high", "critical"];

export function assessAudit(result) {
  if (result.error || result.signal || !Number.isInteger(result.status)) return { code: 2, message: "Dependency scan did not complete. This is not a clean scan." };
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { return { code: 2, message: "Dependency scan returned invalid JSON. This is not a clean scan." }; }
  const counts = report?.metadata?.vulnerabilities;
  if (report.error || !counts || severities.some((severity) => !Number.isSafeInteger(counts[severity]) || counts[severity] < 0)) {
    return { code: 2, message: "Dependency scan returned an error or incomplete vulnerability counts. This is not a clean scan.", report };
  }
  const total = severities.reduce((sum, severity) => sum + counts[severity], 0);
  if (total) return { code: 1, message: `Dependency scan found ${total} advisory findings (${severities.map((s) => `${s}: ${counts[s]}`).join(", ")}). No exceptions were added.`, report };
  if (result.status !== 0) return { code: 2, message: `Dependency scan exited ${result.status}; zero reported findings are not accepted as a successful scan.`, report };
  return { code: 0, message: "Dependency scan completed: no known vulnerabilities reported by the registry for this lockfile.", report };
}

export function runAudit({ runner = spawnSync, cwd = process.cwd() } = {}) {
  return assessAudit(runner(process.platform === "win32" ? "pnpm.cmd" : "pnpm", AUDIT_ARGS, {
    cwd, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runAudit();
  if (result.report) console.log(JSON.stringify(result.report, null, 2));
  console.log(result.message);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Dependency vulnerability scan\n\n${result.message}\n\nScope: production, development and optional dependencies. Registry lookup failures fail the job. This is a vulnerability scan, not a licence/provenance review.\n`);
  process.exitCode = result.code;
}
