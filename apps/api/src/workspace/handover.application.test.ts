import { describe, expect, it } from "vitest";
import { HandoverError, handoverFailure, handoverSaveCommandV1 } from "./handover.application.js";

const id = "00000000-0000-4000-8000-000000000001";
const choice = { sections: ["done"], lineIds: [id], variationIds: [], photoIds: [], snagIds: [], certificates: [] };
describe("V2-G2 handover application", () => {
  it("accepts only the strict save command", () => {
    const body = { version: "v2-handover-save-command.v1", commandId: id, expectedVersion: 0, choice };
    expect(handoverSaveCommandV1.parse(body)).toEqual(body);
    expect(handoverSaveCommandV1.safeParse({ ...body, content: {} }).success).toBe(false);
    expect(handoverSaveCommandV1.safeParse({ ...body, choice: { ...choice, sections: ["prices"] } }).success).toBe(false);
  });
  it("maps refusals with their reasons, and leaves other errors to the job-source mapping", () => {
    expect(handoverFailure(new HandoverError("HANDOVER_LINE_REFUSED", [{ section: "certificates", line: "£40", reason: "amount" }])))
      .toEqual({ status: 409, body: { code: "HANDOVER_LINE_REFUSED", environment: "synthetic_demo",
        refused: [{ section: "certificates", line: "£40", reason: "amount" }] } });
    expect(handoverFailure(new HandoverError("HANDOVER_INVALID_COMMAND"))?.status).toBe(400);
    expect(handoverFailure(new HandoverError("HANDOVER_NOT_FOUND"))?.status).toBe(404);
    expect(handoverFailure(new Error("other"))).toBeNull();
  });
});
