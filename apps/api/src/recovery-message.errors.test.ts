import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { recoveryMessageFailure } from "./recovery-message.errors.js";

describe("recovery message failure mapping", () => {
  it.each([
    ["UNAUTHENTICATED", 401], ["FORBIDDEN", 403], ["SYNTHETIC_MODE_REQUIRED", 400],
    ["RECOVERY_MESSAGE_FORBIDDEN", 403], ["RECOVERY_MESSAGE_NOT_FOUND", 404],
    ["RECOVERY_MESSAGE_CHANGED", 409], ["RECOVERY_MESSAGE_EXPIRED", 409], ["RECOVERY_MESSAGE_STALE_REVISION", 409], ["RECOVERY_MESSAGE_COMMAND_CONFLICT", 409],
    ["RECOVERY_MESSAGE_EXISTING_EFFECT", 409], ["RECOVERY_MESSAGE_NOT_APPROVED", 409], ["RECOVERY_MESSAGE_REVOKED", 409], ["RECOVERY_MESSAGE_BLOCKED", 409],
    ["RECOVERY_MESSAGE_ALREADY_DELIVERED", 409], ["RECOVERY_MESSAGE_RECONCILE_REQUIRED", 409], ["RECOVERY_MESSAGE_NOT_RECONCILABLE", 409],
    ["RECOVERY_MESSAGE_NOT_REVOCABLE", 409], ["RECOVERY_MESSAGE_NOT_ADVANCEABLE", 409], ["RECOVERY_MESSAGE_EXECUTION_PENDING", 409],
    ["RECOVERY_MESSAGE_SOURCES_REQUIRED", 409], ["RECOVERY_MESSAGE_ATTACHMENT_APPROVAL_REQUIRED", 409], ["RECOVERY_MESSAGE_CASE_NOT_ELIGIBLE", 409],
    ["RECOVERY_MESSAGE_CONTENT_INVALID", 409], ["RECOVERY_MESSAGE_DELIVERY_INTERRUPTED", 409],
  ])("keeps the typed code %s as HTTP %i", (code, status) => {
    expect(recoveryMessageFailure(Object.assign(new Error(code), { code }))).toEqual({ status, code });
    expect(recoveryMessageFailure(new Error(code))).toEqual({ status, code });
  });
  it("maps malformed commands (schema or JSON) to a fixed INVALID_COMMAND 400 without their text", () => {
    expect(recoveryMessageFailure(new ZodError([]))).toEqual({ status: 400, code: "INVALID_COMMAND" });
    expect(recoveryMessageFailure(new SyntaxError("Unexpected token } in JSON at position 41"))).toEqual({ status: 400, code: "INVALID_COMMAND" });
  });
  it.each([
    new Error("connect ECONNREFUSED 10.0.0.5:5432"), Object.assign(new Error("permission denied for table recovery_message"), { code: "42501" }),
    new Error("RECOVERY_MESSAGE_SOMETHING_NEW"), new Error('relation "app.recovery_message" does not exist'), "a thrown string", undefined,
  ])("maps anything unrecognised, including an unlisted typed-looking code, to a fixed INTERNAL_ERROR 500", error => {
    expect(recoveryMessageFailure(error)).toEqual({ status: 500, code: "INTERNAL_ERROR" });
  });
});
