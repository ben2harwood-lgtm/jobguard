import { describe, expect, it } from "vitest";
import { HandoverReleaseError, handoverAcknowledgeV1, handoverReleaseCommandV1, handoverReleaseFailure, handoverStopCommandV1 } from "./handover-release.application.js";

const id = "00000000-0000-4000-8000-000000000001";
describe("V2-G3 handover release application", () => {
  it("accepts only the strict release and acknowledge bodies", () => {
    const body = { version: "v2-handover-release-command.v1", commandId: id, handoverVersion: 1 };
    expect(handoverReleaseCommandV1.parse(body)).toEqual({ ...body, expiresInDays: 30 });
    expect(handoverReleaseCommandV1.safeParse({ ...body, expiresInDays: 91 }).success).toBe(false);
    expect(handoverReleaseCommandV1.safeParse({ ...body, recipient: "someone@example.com" }).success).toBe(false);
    expect(handoverAcknowledgeV1.safeParse({ version: "v2-handover-acknowledge.v1", token: "t", snagId: id }).success).toBe(false);
  });
  it("maps refusals; every bad link is one 404", () => {
    expect(handoverReleaseFailure(new HandoverReleaseError("HANDOVER_SITE_NOT_COMPLETE"))).toEqual({ status: 409,
      body: { code: "HANDOVER_SITE_NOT_COMPLETE", environment: "synthetic_demo" } });
    expect(handoverReleaseFailure(new HandoverReleaseError("HANDOVER_LINK_REFUSED"))?.status).toBe(404);
    expect(handoverReleaseFailure(new Error("other"))).toBeNull();
  });
  it("V2-G4 accepts only the strict stop body, with a trimmed reason of 1 to 200 characters", () => {
    const body = { version: "v2-handover-stop-command.v1", commandId: id, releaseId: id, reason: "  Sent to the wrong address  " };
    expect(handoverStopCommandV1.parse(body)).toEqual({ ...body, reason: "Sent to the wrong address" });
    for (const bad of [{ reason: " " }, { reason: "x".repeat(201) }, { releaseId: "v1" }, { recipient: "someone@example.com" }])
      expect(handoverStopCommandV1.safeParse({ ...body, ...bad }).success).toBe(false);
    expect(handoverReleaseFailure(new HandoverReleaseError("HANDOVER_LINK_ALREADY_STOPPED"))).toEqual({ status: 409,
      body: { code: "HANDOVER_LINK_ALREADY_STOPPED", environment: "synthetic_demo" } });
  });
});
