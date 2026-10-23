import { describe, expect, it } from "vitest";
import { demoCatalogue } from "./small-builder-demo-scenarios.js";
import { acceptanceTraceV1, demoProductReportV1, validateDemoProductReport } from "./small-builder-demo-trace.js";
// @ts-expect-error Test-only JSON asset; core does not enable resolveJsonModule.
import cases from "../../../docs/fixtures/small-builder-demo-trace-cases.json";

const scope = { tenantId: "tenant-1", jobId: "job-1", sessionId: "session-1", runId: "run-1", environment: "synthetic_demo" as const };
const digest = "a".repeat(64);
function specimen(family = "core-1000", project = "mobile-360") {
  return {
    version: "small-builder-demo-product-report.v1", catalogueVersion: demoCatalogue.version,
    scope, family, project, phase: "prelock", executableMap: "blocked",
    rows: demoCatalogue.steps.filter(step => step.family === family).map(step => ({
      stepId: step.id, state: "blocked", reason: "Required producer binding held", metrics: [],
    })),
    sources: [], commands: [],
  };
}
function withMetric() {
  return { ...specimen(), phase: "postlock", sources: [{
    id: "source-1", scope, kind: "domain", subjectId: "invoice-1", revision: "1", sha256: digest,
    values: [{ key: "net", value: { kind: "amount", pence: 110000, currency: "GBP" } }],
  }], rows: specimen().rows.map((row, i) => i ? row : { ...row, metrics: [{
    id: "net", value: { kind: "amount", pence: 110000, currency: "GBP" }, evidence: [{ sourceId: "source-1", key: "net" }],
  }] }) };
}
function mutate(name: string): unknown {
  const r = JSON.parse(JSON.stringify(withMetric()));
  switch (name) {
    case "missing-row": r.rows.pop(); break;
    case "held-observed": r.rows[0].state = "observed"; delete r.rows[0].reason; break;
    case "missing-source": r.sources = []; break;
    case "command-conflict": r.commands = ["a", "b"].map(c => ({ id: "cmd-1", scope, inputSha256: c.repeat(64), resultSourceIds: ["source-1"] })); break;
    case "source-scope": r.sources[0].scope.runId = "other-run"; break;
    case "amount-mismatch": r.rows[0].metrics[0].value.pence++; break;
    case "public-pass": r.claudeApproval = "PASS"; break;
    case "prelock-final-check": r.phase = "prelock"; r.sources[0].kind = "final_check"; break;
    case "fixture-zero": r.rows[0].metrics[0] = { id: "external-actions", value: { kind: "count", count: 0 }, evidence: [{ sourceId: "source-1", key: "net" }] }; break;
    default: throw new Error(name);
  }
  return r;
}
describe("DEMO-P2 pure preparation", () => {
  it.each(cases.cases as { mutation: string; issue: string; id: string }[])("$id rejects $mutation", ({ mutation, issue }: { mutation: string; issue: string }) => {
    expect(validateDemoProductReport(mutate(mutation)).issues.map(i => i.code)).toContain(issue);
  });
  it("covers each catalogue family and both projects as blocked, never passed", () => {
    for (const family of new Set(demoCatalogue.steps.map(s => s.family))) {
      for (const project of ["mobile-360", "desktop"]) {
        expect(validateDemoProductReport(specimen(family, project))).toEqual({
          structurallyComplete: true, evidenceTrust: "unverified", executableMap: "blocked", journey: "not_established", issues: [],
        });
      }
    }
  });
  it("is deterministic and leaves caller data unchanged", () => {
    const r = withMetric(); const before = JSON.stringify(r);
    expect(validateDemoProductReport(r)).toEqual(validateDemoProductReport(r));
    expect(JSON.stringify(r)).toBe(before);
    expect(validateDemoProductReport(r).structurallyComplete).toBe(true);
  });
  it.each(["tenantId", "jobId", "sessionId", "runId", "environment"])("rejects changed source %s", field => {
    const r = JSON.parse(JSON.stringify(withMetric())); r.sources[0].scope[field] = "other";
    expect(validateDemoProductReport(r).structurallyComplete).toBe(false);
  });
  it.each([NaN, Infinity, 1.1, Number.MAX_SAFE_INTEGER, 1_000_000_000_001])("rejects invalid pence %s", pence => {
    const r = withMetric(); r.sources[0]!.values[0]!.value.pence = pence;
    expect(demoProductReportV1.safeParse(r).success).toBe(false);
  });
  it("rejects conflicting count/status evidence and duplicate source IDs", () => {
    const r = JSON.parse(JSON.stringify(withMetric()));
    r.sources.push(r.sources[0]);
    expect(validateDemoProductReport(r).issues.map(i => i.code)).toContain("duplicate_identity");
    for (const value of [{ kind: "count", count: 1 }, { kind: "status", status: "pending" }]) {
      r.rows[0].metrics[0].value = value;
      expect(validateDemoProductReport(r).issues.map(i => i.code)).toContain("source_value");
    }
  });
  it("requires adapter and sentinel zero evidence; trust remains unverified", () => {
    const r = JSON.parse(JSON.stringify(withMetric()));
    r.sources = ["adapter", "sentinel"].map(kind => ({ ...r.sources[0], id: kind, kind, values: [{ key: "attempts", value: { kind: "count", count: 0 } }] }));
    r.rows[0].metrics = [{ id: "external-actions", value: { kind: "count", count: 0 }, evidence: r.sources.map((s: { id: string }) => ({ sourceId: s.id, key: "attempts" })) }];
    expect(validateDemoProductReport(r).structurallyComplete).toBe(true);
    r.sources.pop(); r.rows[0].metrics[0].evidence.pop();
    expect(validateDemoProductReport(r).issues.map(i => i.code)).toContain("external_actions_evidence");
  });
  it("does not accept schema-complete external artifacts as verified verdicts", () => {
    const trace = { version: "small-builder-demo-acceptance-trace.v1", scope, reportSha256: digest, artifacts: [{
      kind: "claude", locator: "https://evidence.invalid/PASS.md", sha256: digest, commit: "b".repeat(40), provenance: "unverified",
    }] };
    expect(acceptanceTraceV1.parse(trace).artifacts[0]!.provenance).toBe("unverified");
    for (const claim of ["PASS", "approved", "observed"]) {
      expect(acceptanceTraceV1.safeParse({ ...trace, verdict: claim }).success).toBe(false);
      expect(acceptanceTraceV1.safeParse({ ...trace, artifacts: [{ ...trace.artifacts[0], provenance: claim }] }).success).toBe(false);
    }
    expect(demoProductReportV1.safeParse({ ...specimen(), acceptance: trace }).success).toBe(false);
  });
  it("distinguishes not-run and blocked; rejects fake states, omitted reason and unknown fields", () => {
    const r = JSON.parse(JSON.stringify(specimen())); r.rows[0].state = "not_run";
    expect(validateDemoProductReport(r).structurallyComplete).toBe(true);
    for (const state of ["PASS", "complete", "unknown"]) {
      r.rows[0].state = state; expect(validateDemoProductReport(r).structurallyComplete).toBe(false);
    }
    r.rows[0].state = "blocked"; delete r.rows[0].reason;
    expect(validateDemoProductReport(r).structurallyComplete).toBe(false);
  });
  it("rejects duplicate/foreign catalogue rows and fabricated completed maps", () => {
    const r = specimen();
    r.rows.push(r.rows[0]!);
    expect(validateDemoProductReport(r).issues.map(i => i.code)).toContain("catalogue_coverage");
    r.rows[0] = { ...r.rows[0]!, stepId: "DR-01" };
    expect(validateDemoProductReport(r).issues.map(i => i.code)).toContain("catalogue_coverage");
    expect(validateDemoProductReport({ ...specimen(), executableMap: "complete" }).structurallyComplete).toBe(false);
  });
  it("accepts exact command replay but rejects changed result identities", () => {
    const command = { id: "cmd", scope, inputSha256: digest, resultSourceIds: ["source-1"] };
    const r = { ...withMetric(), commands: [command, command] };
    expect(validateDemoProductReport(r).structurallyComplete).toBe(true);
    r.commands[1] = { ...command, resultSourceIds: ["missing"] };
    expect(validateDemoProductReport(r).issues.map(i => i.code)).toContain("command_conflict");
    expect(validateDemoProductReport(r).issues.map(i => i.code)).toContain("source_reference");
  });
  it("refuses prelock hidden zeroes even in unreferenced sources", () => {
    const r = JSON.parse(JSON.stringify(withMetric()));
    r.phase = "prelock";
    r.sources.push({ ...r.sources[0], id: "hidden", kind: "final_check", values: [{ key: "count", value: { kind: "count", count: 0 } }] });
    expect(validateDemoProductReport(r).issues.map(i => i.code)).toContain("prelock_source");
    expect(demoProductReportV1.safeParse({ ...specimen(), hiddenSourceCount: 0 }).success).toBe(false);
  });
  it.each(["ciPass", "claudePass", "humanApproval", "observedBy"])("rejects caller %s claims at every object boundary", key => {
    const r = withMetric();
    expect(demoProductReportV1.safeParse({ ...r, [key]: true }).success).toBe(false);
    expect(demoProductReportV1.safeParse({ ...r, sources: [{ ...r.sources[0], [key]: true }] }).success).toBe(false);
    expect(demoProductReportV1.safeParse({ ...r, rows: [{ ...r.rows[0], [key]: true }] }).success).toBe(false);
  });
});
