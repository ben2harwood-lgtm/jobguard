import { describe, expect, it } from "vitest";
import { isTaskComplete, taskProofStatus, taskProofStatuses, type LatestProgress } from "./v2-proof-status.js";

const row = (fields: Partial<LatestProgress> = {}): LatestProgress =>
  ({ kind: "done", photoReference: null, photoState: "not_uploaded", ...fields });
const proof = ["Photo of the finished splashback"];

describe("V2-F2 taskProofStatus", () => {
  it("is open with no progress", () => {
    expect(taskProofStatus(null, proof)).toBe("open");
    expect(taskProofStatus(undefined, [])).toBe("open");
  });
  it.each(["blocked", "changed"] as const)("keeps %s whatever the photo", kind => {
    expect(taskProofStatus(row({ kind, photoReference: "p", photoState: "verified" }), proof)).toBe(kind);
    expect(taskProofStatus(row({ kind }), [])).toBe(kind);
  });
  it("is done when no proof is needed, with or without a photo", () => {
    expect(taskProofStatus(row(), [])).toBe("done");
    expect(taskProofStatus(row({ photoReference: "p", photoState: "rejected" }), [])).toBe("done");
  });
  it.each([
    [null, "not_uploaded", "done_proof_missing"],
    ["p", "not_uploaded", "done_proof_missing"],
    ["p", "pending", "done_proof_pending"],
    ["p", "quarantined", "done_proof_pending"],
    ["p", "rejected", "done_proof_rejected"],
    ["p", "verified", "done"],
  ] as const)("Done with proof needed, photo %s %s, is %s", (photoReference, photoState, status) => {
    expect(taskProofStatus(row({ photoReference, photoState }), proof)).toBe(status);
  });
  it("uses the proof list it is given, so an older brief version rules an older row", () => {
    const older: string[] = [], newer = proof, latest = row();
    expect(taskProofStatus(latest, older)).toBe("done");
    expect(taskProofStatus(latest, newer)).toBe("done_proof_missing");
  });
  it("counts only done as complete", () => {
    expect(taskProofStatuses.filter(isTaskComplete)).toEqual(["done"]);
  });
});
