import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { assessAudit, runAudit, AUDIT_ARGS, AUDIT_EXCEPTIONS } from "./dependency-audit.mjs";

const clean = () => ({ status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } }) });
test("only a completed clean registry response passes", () => assert.equal(assessAudit(clean()).code, 0));
for (const severity of ["low", "moderate", "high", "critical"]) test(`${severity} findings fail rather than being waived`, () => {
  const result = clean(), report = JSON.parse(result.stdout); report.metadata.vulnerabilities[severity] = 1;
  assert.equal(assessAudit({ ...result, status: 1, stdout: JSON.stringify(report) }).code, 1);
});
test("registry failures do not become successful zero-finding scans", () => assert.equal(assessAudit({ ...clean(), status: 1 }).code, 2));
test("unavailable executable and timeout both fail closed", () => {
  assert.equal(assessAudit({ error: new Error("ENOENT"), status: null }).code, 2);
  assert.equal(assessAudit({ signal: "SIGTERM", status: null }).code, 2);
});
test("empty, malformed and incomplete responses fail closed", () => {
  for (const stdout of ["", "<html>registry outage</html>", "{}", '{"error":"registry error"}']) assert.equal(assessAudit({ status: 0, stdout }).code, 2);
});
test("negative or nonnumeric severity counts fail closed", () => {
  for (const value of [-1, "0", null]) { const report = JSON.parse(clean().stdout); report.metadata.vulnerabilities.high = value; assert.equal(assessAudit({ status: 0, stdout: JSON.stringify(report) }).code, 2); }
});
test("audit runner uses all dependency scopes and cannot ignore registry or unfixable errors", () => {
  let invocation;
  const result = runAudit({ runner: (...args) => { invocation = args; return clean(); } });
  assert.equal(result.code, 0); assert.deepEqual(invocation[1], AUDIT_ARGS);
  assert.ok(AUDIT_ARGS.includes("--ignore-registry-errors=false")); assert.ok(AUDIT_ARGS.includes("--ignore-unfixable=false"));
  assert.ok(!AUDIT_ARGS.includes("--prod") && !AUDIT_ARGS.includes("--dev") && !AUDIT_ARGS.includes("--no-optional"));
  assert.equal(invocation[2].timeout, 120_000);
});
test("CI really scans private repositories on pushes and PRs without continue-on-error", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const job = workflow.split("  dependency-review:\n")[1];
  assert.ok(job, "Keep the existing dependency-review check identity");
  assert.match(job, /run: node tools\/dependency-audit\.mjs/u);
  assert.match(job, /pnpm install --frozen-lockfile --ignore-scripts/u);
  assert.doesNotMatch(job, /\bif:|continue-on-error|Skip dependency|dependency-review-action/u);
  assert.doesNotMatch(workflow, /LANE_BASE_REF.*github\.base_ref/u);
});

const approvedDate = () => new Date("2026-11-17T21:30:54Z");
const picomatch = () => ({
  github_advisory_id: "GHSA-fc5q-39xc-vjpf", module_name: "picomatch", severity: "high",
  patched_versions: "<0.0.0",
  findings: [
    { version: "4.0.7", paths: [".>@nestjs/cli>picomatch", "apps/web>vite>picomatch"] },
    { version: "2.3.2", paths: [".>vitest>picomatch"] },
  ],
});
const findingsResult = (entries = [picomatch()]) => {
  const report = JSON.parse(clean().stdout);
  report.advisories = Object.fromEntries(entries.map((entry, index) => [index, entry]));
  for (const entry of entries) report.metadata.vulnerabilities[entry.severity] += 1;
  return { status: 1, stdout: JSON.stringify(report) };
};
const assessFindings = (entries, now = approvedDate()) => assessAudit(findingsResult(entries), { now });

test("allowlist contains exactly the approved, dated picomatch exception", () => {
  assert.deepEqual(AUDIT_EXCEPTIONS, [{
    advisory: "GHSA-fc5q-39xc-vjpf", module: "picomatch", severity: "high",
    reason: "no patched release; dev/build tooling only; Ben 17 Nov 2026", expires: "2026-12-17",
  }]);
  assert.ok(Object.isFrozen(AUDIT_EXCEPTIONS) && Object.isFrozen(AUDIT_EXCEPTIONS[0]));
});
test("exception applies to every picomatch path and names the exception plainly", () => {
  const result = assessFindings();
  assert.equal(result.code, 0);
  assert.match(result.message, /one named exception applied: GHSA-fc5q-39xc-vjpf \(picomatch, high\)/u);
  assert.match(result.message, /Ben 17 Nov 2026; expires 2026-12-17/u);
  assert.doesNotMatch(result.message, /no known vulnerabilities/iu);
});
test("different advisory, module or severity is never waived", () => {
  for (const change of [
    { github_advisory_id: "GHSA-other-advisory" }, { module_name: "another-module" },
    ...["info", "low", "moderate", "critical"].map((severity) => ({ severity })),
  ]) assert.equal(assessFindings([{ ...picomatch(), ...change }]).code, 1);
});
test("every affected path must end in the exact module", () => {
  for (const path of [".>vite>other", ".>picomatch>other", ".>picomatch-extra", "", null, ".>>picomatch"]) {
    const entry = picomatch();
    entry.findings[1].paths.push(path);
    assert.equal(assessFindings([entry]).code, 1);
  }
});
test("exception expires after the approved date in UTC and invalid dates fail closed", () => {
  assert.equal(assessFindings(undefined, new Date("2026-12-17T23:59:59.999Z")).code, 0);
  assert.equal(assessFindings(undefined, new Date("2026-12-18T00:00:00Z")).code, 1);
  assert.equal(assessFindings(undefined, new Date("invalid")).code, 1);
});
test("patched versions or absent patch information disable the exception", () => {
  for (const patched_versions of [">=4.0.8", "4.0.8", "*", "", null, undefined]) {
    assert.equal(assessFindings([{ ...picomatch(), patched_versions }]).code, 1);
  }
});
test("mixed findings and omitted advisory details fail closed", () => {
  assert.equal(assessFindings([picomatch(), { ...picomatch(), github_advisory_id: "GHSA-another-advisory" }]).code, 1);
  const result = findingsResult(), report = JSON.parse(result.stdout);
  report.metadata.vulnerabilities.high += 1;
  assert.equal(assessAudit({ ...result, stdout: JSON.stringify(report) }, { now: approvedDate() }).code, 1);
  for (const advisories of [undefined, {}, [], { missing: null }]) {
    report.advisories = advisories;
    report.metadata.vulnerabilities.high = 1;
    assert.equal(assessAudit({ ...result, stdout: JSON.stringify(report) }, { now: approvedDate() }).code, 1);
  }
});
test("missing or malformed affected findings cannot qualify", () => {
  for (const findings of [undefined, [], [null], [{}], [{ paths: [] }], [{ paths: "picomatch" }]]) {
    assert.equal(assessFindings([{ ...picomatch(), findings }]).code, 1);
  }
});
test("allowed-looking findings never waive scan errors", () => {
  const result = findingsResult();
  for (const change of [{ error: new Error("lookup failed") }, { signal: "SIGTERM" }, { status: null }, { status: 2 }]) {
    assert.notEqual(assessAudit({ ...result, ...change }, { now: approvedDate() }).code, 0);
  }
  const report = JSON.parse(result.stdout);
  report.error = "registry lookup failed";
  assert.equal(assessAudit({ ...result, stdout: JSON.stringify(report) }, { now: approvedDate() }).code, 2);
  delete report.error;
  delete report.metadata.vulnerabilities.low;
  assert.equal(assessAudit({ ...result, stdout: JSON.stringify(report) }, { now: approvedDate() }).code, 2);
  assert.equal(assessAudit({ status: 0, stdout: "null" }).code, 2);
});
test("CLI success and step summary both disclose the exception", () => {
  const dir = mkdtempSync(join(tmpdir(), "dependency-audit-"));
  try {
    const executable = join(dir, "pnpm"), summary = join(dir, "summary.md");
    writeFileSync(executable, `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(findingsResult().stdout)}); process.exitCode = 1;\n`);
    chmodSync(executable, 0o755);
    // Exercise the production CLI and summary writer with only the clock and registry response faked.
    const clock = join(dir, "clock.mjs");
    writeFileSync(clock, `const RealDate = Date; globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ["2026-11-17T21:30:54Z"])); } };\n`);
    const stdout = execFileSync(process.execPath, ["--import", clock, new URL("./dependency-audit.mjs", import.meta.url).pathname], {
      encoding: "utf8", env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}`, GITHUB_STEP_SUMMARY: summary },
    });
    for (const output of [stdout, readFileSync(summary, "utf8")]) {
      assert.match(output, /one named exception applied: GHSA-fc5q-39xc-vjpf \(picomatch, high\)/u);
      assert.match(output, /expires 2026-12-17/u);
      assert.doesNotMatch(output, /no known vulnerabilities/iu);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
