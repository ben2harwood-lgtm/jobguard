import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { RecoveryCaseController } from "./recovery-case.controller.js";
import { RecoveryCaseApplication } from "./recovery-case.application.js";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const job = randomUUID(), session = randomUUID(), request = { headers: { cookie: `jg_session=${session}` } };
it("PF1B-A23 A23_ExistingEligibilityTransport", async () => {
  expect(Reflect.getMetadata("path", RecoveryCaseController.prototype.eligibility)).toBe("eligibility");
  const result = { eligibilityV3CommandResult: { revision: 1 }, cases: [] };
  const call = vi.spyOn(RecoveryCaseApplication.prototype, "eligibility").mockResolvedValue(result as never);
  const body = { version: "recovery-eligibility-command.v3", fixture: "F14" };
  expect(await new RecoveryCaseController({} as Pool).eligibility(job, body, request)).toEqual(result);
  expect(call).toHaveBeenCalledWith(job, body, session);
  for (const [code, status] of [["ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE", 400], ["ELIGIBILITY_FIXTURE_MISMATCH", 400], ["ELIGIBILITY_STALE_REVISION", 409], ["unexpected database failure", 503]] as const) {
    call.mockRejectedValue(new Error(code));
    const error = await new RecoveryCaseController({} as Pool).eligibility(job, body, request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException); expect((error as HttpException).getStatus()).toBe(status);
    expect((error as HttpException).getResponse()).toMatchObject({ code: status === 503 ? "RECOVERY_COMMAND_OUTCOME_UNKNOWN" : code });
  }
});
it("PF1B-A17 A17_SyntheticOnly", async () => {
  for (const mode of ["production", "pilot_no_charge", "unconfigured"]) {
    vi.stubEnv("JOBGUARD_ENV", mode);
    const error = await new RecoveryCaseController({} as Pool).eligibility(job, {}, request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException); expect((error as HttpException).getStatus()).toBe(403);
    expect((error as HttpException).getResponse()).toMatchObject({ code: "ELIGIBILITY_REVIEWER_FORBIDDEN" });
  }
});
