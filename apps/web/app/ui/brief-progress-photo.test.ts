import { expect, it } from "vitest";
import { needsNewProofPhoto, progressPhotoLabel, taskStatusLabel } from "./brief-progress-photo";
it("labels an absent photo", () => {
  expect(progressPhotoLabel({ photoReference: null, photoState: "not_uploaded" })).toBe("No photo attached");
});
it.each([
  ["not_uploaded", "Photo not uploaded"], ["pending", "Photo upload pending"],
  ["quarantined", "Photo being checked"], ["verified", "Photo verified · file integrity checked"], ["rejected", "Photo rejected"],
] as const)("labels live %s state", (photoState, label) => {
  expect(progressPhotoLabel({ photoReference: "photo", photoState })).toBe(label);
});

it.each([
  [undefined, null, false], ["open", null, false], ["blocked", "Blocked", false], ["changed", "Changed", false],
  ["done", "Done", false],
  ["done_proof_missing", "Done, but the proof photo is missing", true],
  ["done_proof_pending", "Done, proof photo still uploading or being checked", true],
  ["done_proof_rejected", "Done, but the proof photo was rejected: add another", true],
] as const)("V2-F2 task status %s", (status, label, offer) => {
  expect(taskStatusLabel(status)).toBe(label);
  expect(needsNewProofPhoto(status)).toBe(offer);
});
