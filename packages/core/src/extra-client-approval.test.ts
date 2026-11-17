import { expect, it } from "vitest";
import { fictionalClientAttributionV1, individualSendConstraint, replaceApprovalRequestConstraint, stopUnusedAuthorityConstraint } from "./extra-client-approval.js";
const send = () => ({ version: "extra-send-constraint.v1", requestId: "request-1", recipient: "client@fictional.invalid", packHash: "a".repeat(64), revisionId: "revision-1", expiresAt: "2026-10-13T12:00:00Z", now: "2026-10-13T11:00:00Z", approval: { status: "approved", requestId: "request-1", recipient: "client@fictional.invalid", packHash: "a".repeat(64), revisionId: "revision-1", expiresAt: "2026-10-13T12:00:00Z" }, cancelled: false });
it("BEN-Q10 each send requires approval, links expire and replaced requests are cancelled", () => {
  expect(individualSendConstraint(send())).toBe(true);
  const precise = { ...send(), expiresAt: "2026-10-13T12:00:00.000500Z", now: "2026-10-13T12:00:00.000499Z", approval: { ...send().approval, expiresAt: "2026-10-13T12:00:00.000500Z" } };
  expect(individualSendConstraint(precise)).toBe(true);
  expect(individualSendConstraint({ ...precise, now: precise.expiresAt })).toBe(false);
  for (const change of [{ requestId: "request-2" }, { recipient: "other@fictional.invalid" }, { packHash: "b".repeat(64) }, { revisionId: "revision-2" }, { expiresAt: "2026-10-13T13:00:00Z" }, { approval: null }, { now: "2026-10-13T12:00:00Z" }, { cancelled: true }]) expect(individualSendConstraint({ ...send(), ...change })).toBe(false);
  for (const status of ["dismissed", "rejected", "revoked"]) expect(individualSendConstraint({ ...send(), approval: { ...send().approval, status } })).toBe(false);
  expect(() => individualSendConstraint({ ...send(), expiresAt: undefined })).toThrow();
  expect(() => individualSendConstraint({ ...send(), recipient: "client@example.com" })).toThrow();
  const replaced = replaceApprovalRequestConstraint({ version: "extra-request-replacement.v1", previousId: "request-1", replacementId: "request-2" });
  expect(replaced).toEqual({ previousId: "request-1", replacementId: "request-2", previousCancelled: true });
  expect(individualSendConstraint({ ...send(), cancelled: replaced.previousCancelled })).toBe(false);
  expect(() => replaceApprovalRequestConstraint({ version: "extra-request-replacement.v1", previousId: "request-1", replacementId: "request-1" })).toThrow();
});
it("BEN-Q13 fictional client role records the actual tester", () => {
  const input = { version: "fictional-client-attribution.v1", fictionalRoleName: "Fictional client surveyor", actualTesterReference: "tester-42" };
  expect(fictionalClientAttributionV1.parse(input)).toEqual(input);
  for (const bad of [{ ...input, actualTesterReference: "" }, { ...input, fictionalRoleName: "" }, { ...input, actorMembershipId: "owner" }, { version: input.version, fictionalRoleName: input.fictionalRoleName }]) expect(fictionalClientAttributionV1.safeParse(bad).success).toBe(false);
});
it("BEN-Q14 history survives while future actions and unused authority stop", () => {
  const input = { version: "extra-authority-loss.v1", historyReferences: ["approval-1", "approval-2"], permissions: [{ id: "unused", used: false }, { id: "used", used: true }] };
  const result = stopUnusedAuthorityConstraint(input);
  expect(result.historyReferences).toEqual(input.historyReferences);
  expect(result.futureActionAllowed).toBe(false);
  expect(result.cancelledUnusedIds).toEqual(["unused"]);
  expect(result.usedIds).toEqual(["used"]);
  expect(input.permissions[0]!.used).toBe(false);
  expect(() => stopUnusedAuthorityConstraint({ ...input, historicalReadAllowed: true })).toThrow();
});
