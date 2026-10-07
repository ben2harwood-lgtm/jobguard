import { afterEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { ContractorPartiesApplication } from "./contractor-parties.application.js";
const original = process.env.JOBGUARD_ENV;
afterEach(() => { if (original === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = original; });
const id = "11111111-1111-4111-8111-111111111111";
const principal = { version: "contractor-principal.v1", sessionId: id };
describe("CH-3b application boundary", () => {
  it("rejects production/pilot and missing sessions before accessing the database", async () => {
    const app = new ContractorPartiesApplication(new Pool());
    for (const mode of ["pilot_no_charge", "production_billing"]) {
      process.env.JOBGUARD_ENV = mode;
      await expect(app.readResident(principal, id)).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
      await expect(app.linkCustomer(principal, id, {})).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
    }
    process.env.JOBGUARD_ENV = "synthetic_demo";
    await expect(app.readResident(null, id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
  it("refuses forged role/tenant/provenance and malformed IDs before persistence", async () => {
    process.env.JOBGUARD_ENV = "synthetic_demo"; const app = new ContractorPartiesApplication(new Pool());
    for (const key of ["tenantId", "role", "isIndividual", "provenance"]) await expect(app.linkCustomer(principal, id, { version: "contractor-customer-link.v1", environment: "synthetic_demo", commandId: id, customerRevisionId: id, [key]: id })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await expect(app.readResident(principal, "bad")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

it("the shared ENT-2 refusal assertion cannot pass on success or an unrelated failure", async () => {
  const { assertContractorPartiesRequired } = await import("@jobguard/db");
  await expect(assertContractorPartiesRequired(async () => { throw new Error("CONTRACTOR_PARTIES_REQUIRED"); })).resolves.toBeUndefined();
  await expect(assertContractorPartiesRequired(async () => undefined)).rejects.toThrow("Expected CONTRACTOR_PARTIES_REQUIRED refusal");
  const unexpected = new Error("unexpected database failure");
  await expect(assertContractorPartiesRequired(async () => { throw unexpected; })).rejects.toBe(unexpected);
});
