import { describe, expect, it } from "vitest";
import { prepareEnterpriseBaseline } from "./enterprise-baseline.application.js";

const request = () => ({ version: "baseline-prepare.v1", format: "json", outputFormat: "json",
  methodVersion: "baseline-method.reference.v1", cohorts: { version: "baseline-cohorts.v1", pilotTeamIds: ["pilot"], restTeamIds: ["rest"] },
  content: JSON.stringify({ version: "baseline-history.v1", environment: "synthetic_demo", sourceNamespace: "fictional.invalid",
    sourceBatchId: "batch-1", sourceRevision: "revision-1", startMonth: "2026-01", endMonthExclusive: "2026-07",
    teamIds: ["pilot", "rest"], jobs: [{ sourceJobId: "job-1", teamId: "pilot", month: "2026-03", extras: [] }],
  }),
});
describe("ENT-9A internal synthetic baseline preparation", () => {
  it("E9-30 refuses every non-synthetic deployment mode before inspecting request or batch state", () => {
    const unread = new Proxy([], { get() { throw new Error("batch state accessed"); } });
    for (const mode of ["production_billing", "pilot_no_charge", "provider_sandbox", "unknown"]) {
      expect(() => prepareEnterpriseBaseline(mode, null, unread)).toThrowError("BASELINE_REAL_HISTORY_HELD");
    }
  });
  it("E9-18 prepares replayable synthetic batches without committing caller state", () => {
    const first = prepareEnterpriseBaseline("synthetic_demo", request(), []);
    const second = prepareEnterpriseBaseline("synthetic_demo", request(), first.imported.batches);
    expect(first.imported.replayed).toBe(false);
    expect(second.imported.replayed).toBe(true);
    expect(second.imported.batch).toBe(first.imported.batch);
    expect(second.content).toBe(first.content);
    expect(JSON.parse(first.content).method).toEqual(first.report.method);
  });
  it("E9-29 internal versioned boundary refuses authority fields and unsupported formats", () => {
    for (const invalid of [{ ...request(), tenantId: "caller" }, { ...request(), actorId: "caller" },
      { ...request(), version: "baseline-prepare.v2" }, { ...request(), format: "xml" },
      { ...request(), outputFormat: "html" }, { ...request(), content: {} },
    ]) expect(() => prepareEnterpriseBaseline("synthetic_demo", invalid, [])).toThrowError("BASELINE_INVALID");
  });
  it("E9-20 computes method-bearing CSV from the same validated source and refuses unsupported methods", () => {
    const result = prepareEnterpriseBaseline("synthetic_demo", { ...request(), outputFormat: "csv" }, []);
    expect(result.content).toContain(result.report.method.text);
    expect(result.content).toContain(result.report.inputHash);
    expect(() => prepareEnterpriseBaseline("synthetic_demo", { ...request(), methodVersion: "unapproved" }, [])).toThrowError("BASELINE_METHOD_UNSUPPORTED");
  });
});
