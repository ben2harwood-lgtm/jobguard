import { describe, expect, it } from "vitest";
import { foundationRequirements, foundationPlanRows, validateFoundationGates } from "./foundation-gates.js";

// Synthetic file reader exercises validation without asserting deployed evidence.
const read = (path: string): string | undefined => {
  if (path === "BUILD_PLAN.md") {
    const lines = Array.from({ length: 306 }, () => "");
    for (const [line, content] of Object.entries(foundationPlanRows)) lines[Number(line) - 1] = content;
    return lines.join("\n");
  }
  if (path === "docs/decisions/d04-providers-residency.md") return "**Status:** `proposed`";
  if (["fixture/evidence.md", "docs/contracts/provider-data-flow-v1.md", "docs/contracts/pilot-terms-v1.md"].includes(path)) return "fixture:evidence";
  return undefined;
};
const fixture = () => ({
  version: "foundation-gates.v1", contractorPilotEvidence: null as string | null,
  rows: foundationRequirements.map(required => ({ id: required.id as string, gate: required.gate as string,
    planLine: required.planLine as number, requirement: required.requirement as string,
    status: "blocked", evidencePaths: ["fixture/evidence.md"], blockingReason: "Fixture: no deployed evidence" as string | null,
    ownerApproval: null as unknown,
  })),
});

describe("M0-13d foundation evidence checklist", () => {
  it("validates an incomplete pack with blank approvals and neither gate met", () => {
    const raw = fixture();
    const before = structuredClone(raw);
    const pack = validateFoundationGates(raw, read);
    expect(pack.gates).toEqual({ G0: "not_met", G1: "not_met" });
    expect(pack.rows.every(row => row.ownerApproval === null)).toBe(true);
    expect(pack.contractorPilotEvidence).toBeNull();
    expect(raw).toEqual(before);
  });

  it.each(foundationRequirements)("rejects a dropped $id requirement", required => {
    const raw = fixture();
    raw.rows = raw.rows.filter(row => row.id !== required.id);
    expect(() => validateFoundationGates(raw, read)).toThrow(/Missing.*plan requirement/u);
  });

  it("rejects approved status without a real decision record", () => {
    const raw = fixture();
    raw.rows[0]!.status = "approved";
    expect(() => validateFoundationGates(raw, read)).toThrow();
  });

  it("requires existing evidence even on blocked rows", () => {
    const raw = fixture();
    raw.rows[0]!.evidencePaths.push("docs/missing-evidence.md");
    expect(() => validateFoundationGates(raw, read)).toThrow(/Missing evidence path/u);
  });

  it.each(["", " ", null])("rejects an empty blocking reason: %s", reason => {
    const raw = fixture();
    raw.rows[0]!.blockingReason = reason;
    expect(() => validateFoundationGates(raw, read)).toThrow();
  });

  it("rejects renamed, duplicate and additional rows and a stale plan", () => {
    const raw = fixture();
    raw.rows[0]!.requirement = "a weaker gate";
    expect(() => validateFoundationGates(raw, read)).toThrow(/Changed plan requirement/u);
    raw.rows[0] = structuredClone(raw.rows[1]!);
    expect(() => validateFoundationGates(raw, read)).toThrow(/Duplicate plan requirement/u);
    const extra = fixture();
    extra.rows.push({ ...extra.rows[0]!, id: "extra" });
    expect(() => validateFoundationGates(extra, read)).toThrow(/extra plan requirement/u);
    expect(() => validateFoundationGates(fixture(), file => file === "BUILD_PLAN.md" ? "changed" : read(file)))
      .toThrow(/Plan requirements changed/u);
  });

  it.each(["../outside", "/tmp/evidence", "docs/../outside", "docs\\outside"])("rejects unsafe path %s", path => {
    const raw = fixture();
    raw.rows[0]!.evidencePaths = [path];
    expect(() => validateFoundationGates(raw, read)).toThrow(/repository-relative/u);
  });

  it("rejects self-declared completion and proposed/missing/mismatched approval records", () => {
    const raw = fixture();
    const row = raw.rows.find(row => row.id === "g1-d04")!;
    row.status = "evidence_present";
    row.blockingReason = null;
    expect(() => validateFoundationGates(raw, read)).toThrow(/Owner approval required/u);
    // Fictional values attack the validator only; these are never shipped approvals.
    row.ownerApproval = { decisionRecord: "docs/decisions/d04-providers-residency.md",
      policyVersion: "provider_residency_policy_v1", approver: "fixture:owner",
      approvedAt: "2000-01-01T00:00:00Z", evidencePath: "docs/contracts/provider-data-flow-v1.md" };
    expect(() => validateFoundationGates(raw, read)).toThrow(/Real decision record/u);
    expect(() => validateFoundationGates(raw, file => file.includes("d04-") ? undefined : read(file)))
      .toThrow(/Missing evidence path/u);
    const approvedSource = "**Status:** `approved`\n**Policy version:** `provider_residency_policy_v1`\n**Dated approver evidence:** fixture:owner 2000-01-01T00:00:00Z docs/contracts/provider-data-flow-v1.md";
    const fixtureRead = (file: string) => file === "docs/decisions/d04-providers-residency.md" ? approvedSource : read(file);
    expect(validateFoundationGates(raw, fixtureRead).gates.G1).toBe("not_met");
    expect(() => validateFoundationGates(raw, file => file === "docs/decisions/d04-providers-residency.md" ? approvedSource.replace("fixture:owner", "fixture:other") : read(file)))
      .toThrow(/Real decision record/u);
  });

  it("does not treat contract text or the enterprise schema as ENT-14 evidence", () => {
    const raw = fixture();
    raw.rows.find(row => row.id === "g1-contractor-dpa")!.status = "needs_owner_approval";
    expect(() => validateFoundationGates(raw, read)).toThrow(/ENT-14 evidence absent/u);
    raw.contractorPilotEvidence = "docs/contracts/pilot-terms-v1.md";
    expect(() => validateFoundationGates(raw, read)).toThrow();
  });

  it("requires evidence for a completed row and rejects unknown activation flags", () => {
    const raw = fixture();
    const row = raw.rows.find(row => row.id === "g0-contracts")!;
    row.status = "evidence_present";
    row.blockingReason = null;
    row.evidencePaths = [];
    expect(() => validateFoundationGates(raw, read)).toThrow(/Evidence required/u);
    expect(() => validateFoundationGates({ ...fixture(), enabled: true }, read)).toThrow();
  });
});
