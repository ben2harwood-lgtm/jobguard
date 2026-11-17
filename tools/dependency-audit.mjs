import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const AUDIT_ARGS = Object.freeze(["audit", "--json", "--audit-level=low", "--ignore-registry-errors=false", "--ignore-unfixable=false"]);
const severities = ["info", "low", "moderate", "high", "critical"];
export const AUDIT_EXCEPTIONS = Object.freeze([Object.freeze({
  advisory: "GHSA-fc5q-39xc-vjpf",
  module: "picomatch",
  severity: "high",
  reason: "no patched release; dev/build tooling only; Ben 17 Nov 2026",
  expires: "2026-12-17",
})]);

function applicableException(report, counts, now) {
  const exception = AUDIT_EXCEPTIONS[0];
  if (!Number.isFinite(now.getTime()) || now.toISOString().slice(0, 10) > exception.expires) return;
  const advisories = report.advisories;
  if (!advisories || typeof advisories !== "object" || Array.isArray(advisories)) return;
  const entries = Object.values(advisories);
  // Reconcile every reported finding; missing details must never hide another vulnerability.
  if (!entries.length || severities.some((s) => counts[s] !== (s === exception.severity ? entries.length : 0))) return;
  if (!entries.every((entry) => entry?.github_advisory_id === exception.advisory &&
    entry.module_name === exception.module && entry.severity === exception.severity &&
    // pnpm's registry report uses this exact sentinel for an unfixable advisory.
    entry.patched_versions === "<0.0.0" &&
    Array.isArray(entry.findings) && entry.findings.length > 0 &&
    entry.findings.every((finding) => Array.isArray(finding?.paths) && finding.paths.length > 0 &&
      finding.paths.every((path) => typeof path === "string" &&
        path.split(">").every(Boolean) && path.split(">").at(-1) === exception.module)))) return;
  return exception;
}

export function assessAudit(result, { now = new Date() } = {}) {
  if (result.error || result.signal || !Number.isInteger(result.status)) return { code: 2, message: "Dependency scan did not complete. This is not a clean scan." };
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { return { code: 2, message: "Dependency scan returned invalid JSON. This is not a clean scan." }; }
  const counts = report?.metadata?.vulnerabilities;
  if (report?.error || !counts || severities.some((severity) => !Number.isSafeInteger(counts[severity]) || counts[severity] < 0)) {
    return { code: 2, message: "Dependency scan returned an error or incomplete vulnerability counts. This is not a clean scan.", report };
  }
  const total = severities.reduce((sum, severity) => sum + counts[severity], 0);
  if (total && (result.status === 0 || result.status === 1)) {
    const exception = applicableException(report, counts, now);
    if (exception) return { code: 0, message: `Dependency scan completed with one named exception applied: ${exception.advisory} (${exception.module}, ${exception.severity}); ${exception.reason}; expires ${exception.expires} (inclusive, UTC).`, report };
  }
  if (total) return { code: 1, message: `Dependency scan found ${total} advisory findings (${severities.map((s) => `${s}: ${counts[s]}`).join(", ")}). No exceptions were applied.`, report };
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
