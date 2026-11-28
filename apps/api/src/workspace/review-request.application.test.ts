import { describe, expect, it } from "vitest";
import { ReviewRequestError, reviewRequestFailure, reviewRequestSendV1, reviewRequestSwitchV1 } from "./review-request.application.js";

const id = "00000000-0000-4000-8000-000000000001";
describe("V2-G8 review request application", () => {
  it("accepts only the strict switch and send bodies; the builder never names the address", () => {
    const body = { version: "v2-review-request-switch.v1", commandId: id, enabled: true };
    expect(reviewRequestSwitchV1.parse(body)).toEqual(body);
    for (const bad of [{ enabled: "yes" }, { recipient: "someone@example.com" }, { commandId: "v1" }])
      expect(reviewRequestSwitchV1.safeParse({ ...body, ...bad }).success).toBe(false);
    expect(reviewRequestSendV1.safeParse({ version: "v2-review-request-send.v1", commandId: id }).success).toBe(true);
    expect(reviewRequestSendV1.safeParse({ version: "v2-review-request-send.v1", commandId: id, recipient: "someone@example.com" }).success).toBe(false);
  });
  it("maps refusals with the reason it was not due", () => {
    expect(reviewRequestFailure(new ReviewRequestError("REVIEW_REQUEST_NOT_DUE", "unpaid_invoice"))).toEqual({ status: 409,
      body: { code: "REVIEW_REQUEST_NOT_DUE", state: "unpaid_invoice", environment: "synthetic_demo" } });
    expect(reviewRequestFailure(new ReviewRequestError("REVIEW_REQUEST_NOT_FOUND"))?.status).toBe(404);
    expect(reviewRequestFailure(new Error("other"))).toBeNull();
  });
});
