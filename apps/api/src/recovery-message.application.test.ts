import { afterEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { RecoveryMessageApplication, recoveryMessageError } from "./recovery-message.application.js";
const original = process.env.JOBGUARD_ENV;
afterEach(() => { if (original === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = original; });
const id = "10000000-0000-4000-8000-000000000001";
// These assertions must reject before touching the database or choosing an adapter.
const pool = { connect: () => { throw new Error("DATABASE_MUST_NOT_BE_CALLED"); } } as unknown as Pool;
describe("recovery message application boundary", () => {
  it.each(["production", "pilot_no_charge", undefined])("refuses synthetic message requests in %s", async mode => {
    if (mode === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = mode;
    await expect(new RecoveryMessageApplication(pool).read(id, id)).rejects.toThrow("SYNTHETIC_ONLY");
  });
  it.each([undefined, "", "forged-cookie"])("requires an opaque valid session %s", async session => {
    process.env.JOBGUARD_ENV = "synthetic_demo";
    await expect(new RecoveryMessageApplication(pool).read(session, id)).rejects.toThrow("UNAUTHENTICATED");
  });
  it("rejects client-supplied tenant, mode, actor, and live-recipient overrides", async () => {
    process.env.JOBGUARD_ENV = "synthetic_demo";
    const app = new RecoveryMessageApplication(pool);
    for (const extra of [{ tenantId: id }, { environment: "production" }, { actorRef: "owner" }, { recipient: "real@example.com" }]) {
      await expect(app.command(id, id, { version: "recovery-message-preview.v1", commandId: id, expectedCaseRevision: 1, packId: id, ...extra })).rejects.toThrow();
    }
  });
  it("returns typed authorization and stale-command HTTP errors", () => {
    expect(recoveryMessageError(new Error("UNAUTHENTICATED"))).toEqual({ code: "UNAUTHENTICATED", status: 401 });
    expect(recoveryMessageError(new Error("FORBIDDEN"))).toEqual({ code: "FORBIDDEN", status: 403 });
    expect(recoveryMessageError(new Error("RECOVERY_MESSAGE_CHANGED"))).toEqual({ code: "RECOVERY_MESSAGE_CHANGED", status: 409 });
  });
});
