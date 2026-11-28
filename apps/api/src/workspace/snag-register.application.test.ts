import { describe, expect, it } from "vitest";
import { SnagError } from "@jobguard/core";
import { SnagRegisterError, snagAgreedCommandV1, snagOwnerCommandV1, snagRegisterEventCommandV1 } from "@jobguard/db";
import { snagRegisterFailure } from "./snag-register.application.js";

const id = "10000000-0000-4000-8000-000000000001";
describe("V2-G1 snag register contracts", () => {
  it("parses the three commands strictly", () => {
    expect(snagOwnerCommandV1.safeParse({ version: "v2-snag-owner-command.v1", commandId: id, snagId: id, crewId: null }).success).toBe(true);
    expect(snagRegisterEventCommandV1.safeParse({ version: "v2-snag-event-command.v1", commandId: id, snagId: id, action: "mark_checked",
      person: { kind: "crew", crewId: id } }).success).toBe(true);
    expect(snagRegisterEventCommandV1.safeParse({ version: "v2-snag-event-command.v1", commandId: id, snagId: id, action: "mark_checked",
      person: { kind: "crew" } }).success).toBe(false);
    expect(snagAgreedCommandV1.safeParse({ version: "v2-snag-agreed-command.v1", commandId: id, snagId: id, agreed: true, note: "" }).success).toBe(false);
    expect(snagAgreedCommandV1.safeParse({ version: "v2-snag-agreed-command.v1", commandId: id, snagId: id, agreed: false, note: null }).success).toBe(true);
    expect(snagOwnerCommandV1.safeParse({ version: "v2-snag-owner-command.v1", commandId: id, snagId: id, crewId: null, extra: 1 }).success).toBe(false);
  });
  it("maps register refusals, then main's, and leaves the rest to the job-source mapping", () => {
    expect(snagRegisterFailure(new SnagRegisterError("V2_SNAG_CHECKER_IS_FIXER"))).toEqual({ status: 409,
      body: { code: "V2_SNAG_CHECKER_IS_FIXER", environment: "synthetic_demo" } });
    expect(snagRegisterFailure(new SnagRegisterError("V2_SNAG_INVALID_COMMAND"))?.status).toBe(400);
    expect(snagRegisterFailure(new SnagRegisterError("V2_SNAG_NOT_FOUND"))?.status).toBe(404);
    expect(snagRegisterFailure(new SnagError("SNAG_TRANSITION_REFUSED"))?.status).toBe(409);
    expect(snagRegisterFailure(new Error("other"))).toBeNull();
  });
});
