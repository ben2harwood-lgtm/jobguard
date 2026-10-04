import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { RecoveryCaseApplication } from "./recovery-case.application.js";
import { RecoveryCaseController } from "./recovery-case.controller.js";

afterEach(() => vi.restoreAllMocks());
it.each(["ELIGIBILITY_STALE_REVISION", "ELIGIBILITY_REVIEW_REQUIRED"])("maps %s to the re-review conflict", async code => {
 vi.spyOn(RecoveryCaseApplication.prototype, "eligibility").mockRejectedValue(new Error(code));
 const controller = new RecoveryCaseController({} as Pool);
 try {
  await controller.eligibility(randomUUID(), {}, { headers: { cookie: `jg_session=${randomUUID()}` } });
  expect.fail("Expected rejection");
 } catch (error) {
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(409);
  expect((error as HttpException).getResponse()).toEqual({ code, message: "Review the changed evidence before approving" });
 }
});
it("passes only the session cookie to the shared application boundary", async () => {
 const execute = vi.spyOn(RecoveryCaseApplication.prototype, "eligibility").mockResolvedValue({ version: "recovery-case-workbench.v1", environment: "synthetic_demo", realExternalActions: 0, cases: [] });
 const session = randomUUID(), job = randomUUID(), body = { action: "review" };
 await new RecoveryCaseController({} as Pool).eligibility(job, body, { headers: { cookie: `unrelated=value; jg_session=${session}` } });
 expect(execute).toHaveBeenCalledWith(job, body, session);
});
