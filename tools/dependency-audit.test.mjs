import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessAudit, runAudit, AUDIT_ARGS } from "./dependency-audit.mjs";

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
