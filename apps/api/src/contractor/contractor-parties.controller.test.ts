import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { HttpException } from "@nestjs/common";
import { ContractorPartyError } from "@jobguard/core";
import { ContractorPartiesApplication, contractorPartiesHttpFailure } from "./contractor-parties.application.js";
import { ContractorPartiesController } from "./contractor-parties.controller.js";
afterEach(() => vi.restoreAllMocks());
const id = "11111111-1111-4111-8111-111111111111";
describe("contractor party transport (adapter tests, not PostgreSQL proof)", () => {
  it("uses the session principal and identical 404 body for hidden and absent residents", async () => {
    const call = vi.spyOn(ContractorPartiesApplication.prototype, "readResident").mockRejectedValue(new ContractorPartyError("NOT_FOUND"));
    const controller = new ContractorPartiesController(new Pool());
    const responses = [];
    for (const job of [id, "22222222-2222-4222-8222-222222222222"]) {
      try { await controller.read(job, `other=x; jg_session=${id}`); } catch (error) { expect(error).toBeInstanceOf(HttpException); const e = error as HttpException; responses.push([e.getStatus(), e.getResponse()]); }
    }
    expect(responses[0]).toEqual(responses[1]); expect(responses[0]).toEqual([404, { version: "contractor-parties-error.v1", code: "NOT_FOUND", recoverable: false }]);
    expect(call).toHaveBeenCalledWith({ version: "contractor-principal.v1", sessionId: id }, id);
  });
  it("maps the exact link route to the shared service and rejects cross-origin writes", async () => {
    const call = vi.spyOn(ContractorPartiesApplication.prototype, "linkCustomer").mockResolvedValue({ version: "contractor-party-result.v1", environment: "synthetic_demo", commandId: id, id, realExternalActions: 0 });
    const controller = new ContractorPartiesController(new Pool()), body = { version: "contractor-customer-link.v1", environment: "synthetic_demo", commandId: id, customerRevisionId: id };
    await controller.link(id, `jg_session=${id}`, "http://localhost:3000", body);
    expect(call).toHaveBeenCalledWith({ version: "contractor-principal.v1", sessionId: id }, id, body);
    expect(() => controller.link(id, `jg_session=${id}`, "https://foreign.invalid", body)).toThrow(HttpException); expect(call).toHaveBeenCalledTimes(1);
    expect(contractorPartiesHttpFailure(new Error("resident@example.invalid"))).toEqual({ status: 503, body: { version: "contractor-parties-error.v1", code: "DATABASE_UNAVAILABLE", recoverable: true } });
  });
});
