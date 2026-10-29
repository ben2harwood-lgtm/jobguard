import { expect, it } from "vitest";
import { applyInitialSuppression, runJobChecks, type JobFactSnapshot } from "./decision-checks.js";
const snapshot: JobFactSnapshot = { version: "job-fact-snapshot.v1", tenantId: "fictional", jobId: "fictional-job", revision: 1,
  unresolvedQuestions: [{ id: "question", text: "Confirm scope", commercialBlocker: false }], scopes: [] };
it("L071 changed mandatory classification cannot retain obsolete suppression", () => {
  const advisory = runJobChecks(snapshot)[0]!;
  const mandatory = runJobChecks({ ...snapshot, revision: 2, unresolvedQuestions: [{ ...snapshot.unresolvedQuestions[0]!, commercialBlocker: true }] })[0]!;
  expect(mandatory.fingerprint).not.toBe(advisory.fingerprint);
  expect(applyInitialSuppression([mandatory], { minimumAdvisoryValuePence: 999, minimumSuggestionConfidence: 1, dailyAdvisoryBudget: 0 }, {}).visible).toEqual([mandatory]);
  expect(runJobChecks({ ...snapshot, revision: 99 })).toEqual([advisory]);
});
it("L064 changed finding content retains a separate immutable revision identity", () => {
  const before = runJobChecks(snapshot)[0]!;
  const after = runJobChecks({ ...snapshot, unresolvedQuestions: [{ ...snapshot.unresolvedQuestions[0]!, text: "Confirm revised scope" }] })[0]!;
  expect(after.fingerprint).not.toBe(before.fingerprint);
  expect(before.detail).toBe("Confirm scope");
});
it("L063 completion proof comes from current persisted proof supplied in the snapshot", () => {
  const scope = { scopeItemId: "scope", proofRule: "electrical" as const, verifiedProofTypes: [], materialsIncluded: false, valuePence: 0 };
  expect(runJobChecks({ ...snapshot, unresolvedQuestions: [], scopes: [scope] })).toHaveLength(1);
  expect(runJobChecks({ ...snapshot, unresolvedQuestions: [], scopes: [{ ...scope, verifiedProofTypes: ["electrical_certificate"] }] })).toEqual([]);
});
