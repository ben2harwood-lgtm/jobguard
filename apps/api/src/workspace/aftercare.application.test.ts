import { describe, expect, it } from "vitest";
import { AftercareError, aftercareFailure, aftercareSendV1, aftercareSwitchV1 } from "./aftercare.application.js";

const id = "00000000-0000-4000-8000-000000000001";
describe("V2-G9 aftercare application", () => {
  it("accepts only the strict switch and send bodies; the builder never names the address or the month", () => {
    const body = { version: "v2-aftercare-switch.v1", commandId: id, enabled: true };
    expect(aftercareSwitchV1.parse(body)).toEqual(body);
    for (const bad of [{ enabled: "yes" }, { recipient: "someone@example.com" }, { commandId: "v1" }])
      expect(aftercareSwitchV1.safeParse({ ...body, ...bad }).success).toBe(false);
    expect(aftercareSendV1.safeParse({ version: "v2-aftercare-send.v1", commandId: id }).success).toBe(true);
    expect(aftercareSendV1.safeParse({ version: "v2-aftercare-send.v1", commandId: id, months: 6 }).success).toBe(false);
  });
  it("maps refusals with the reason it was not due", () => {
    expect(aftercareFailure(new AftercareError("AFTERCARE_NOT_DUE", "too_soon"))).toEqual({ status: 409,
      body: { code: "AFTERCARE_NOT_DUE", state: "too_soon", environment: "synthetic_demo" } });
    expect(aftercareFailure(new AftercareError("AFTERCARE_NOT_FOUND"))?.status).toBe(404);
    expect(aftercareFailure(new Error("other"))).toBeNull();
  });
});
