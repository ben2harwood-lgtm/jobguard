import { describe, expect, it } from "vitest";
import { HandoverReleaseError, handoverAcknowledgeV1, handoverReleaseCommandV1, handoverReleaseFailure } from "./handover-release.application.js";

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
});
