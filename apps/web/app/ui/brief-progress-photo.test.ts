import { expect, it } from "vitest";
import { progressPhotoLabel } from "./brief-progress-photo";
it("labels an absent photo", () => {
  expect(progressPhotoLabel({ photoReference: null, photoState: "not_uploaded" })).toBe("No photo attached");
});
it.each([
  ["not_uploaded", "Photo not uploaded"], ["pending", "Photo upload pending"],
  ["quarantined", "Photo being checked"], ["verified", "Photo verified · file integrity checked"], ["rejected", "Photo rejected"],
] as const)("labels live %s state", (photoState, label) => {
  expect(progressPhotoLabel({ photoReference: "photo", photoState })).toBe(label);
});
