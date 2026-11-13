import { describe, expect, it } from "vitest";
import { runJobChecks, type JobFactSnapshot, type ProofRule } from "./decision-checks.js";

const snapshot = (proofRule: ProofRule, verifiedProofTypes: string[] = []): JobFactSnapshot => ({
 version: "job-fact-snapshot.v1", tenantId: "fictional-tenant", jobId: "fictional-job", revision: 1, unresolvedQuestions: [],
 scopes: [{ scopeItemId: "scope", proofRule, verifiedProofTypes, materialsIncluded: true, valuePence: 20000 }],
});
describe("completion-photo practice proof rule", () => {
 it("requires a completion photo rather than accepting a certificate", () => {
  const findings = runJobChecks(snapshot("completion_photo", ["electrical_certificate"]));
  expect(findings.filter(f => f.kind === "required_proof").map(f => f.subjectRef)).toEqual(["scope:completion_photo"]);
  expect(findings.find(f => f.kind === "required_proof")?.classification).toBe("mandatory");
  expect(runJobChecks(snapshot("completion_photo", ["completion_photo"])).filter(f => f.kind === "required_proof")).toEqual([]);
 });
 it.each([
  ["electrical", ["electrical_certificate"]], ["plastering", ["pre_cover_photo", "completion_photo"]],
  ["groundwork", ["excavation_photo", "completion_photo"]],
 ] as const)("preserves %s proof and unrelated materials findings", (rule, required) => {
  expect(runJobChecks(snapshot(rule)).filter(f => f.kind === "required_proof").map(f => f.subjectRef).sort()).toEqual(required.map(r => `scope:${r}`).sort());
  expect(runJobChecks(snapshot(rule, [...required])).map(f => f.kind)).toEqual(["materials_bill_review"]);
 });
});
