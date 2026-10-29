import { afterEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";

// ENT-6 RED review (#361): retry/reconcile must answer with the stripped projection, never any batch's CSV bytes.
const SECRET_CSV = "version,client_contract_id\nfictional-csv-bytes-never-returned";
vi.mock("@jobguard/db", async original => ({
  ...(await original<typeof import("@jobguard/db")>()),
  contractorSessionContext: async () => ({ tenantId: "11111111-1111-4111-8111-111111111111" }),
  ContractorBillingRepository: class {
    async read() {
      return { version: "contractor-billing-projection.v1", invoices: [], quarantine: [], deliveries: [], clientContractIds: [], reconciliation: {},
        exports: [{ id: "batch-1", artifact: { lines: [{}], totalNet: { pence: 100, currency: "GBP" } }, jsonHash: "j", csvHash: "c", csv: SECRET_CSV }] };
    }
  },
  ContractorBillingDelivery: class { async execute() {} async reconcile() {} },
}));
const { BillingApplication } = await import("./billing.application.js");
afterEach(() => { vi.unstubAllEnvs(); });

it("E6-25 advance-delivery returns no export CSV for either action (download stays the only CSV route)", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const app = new BillingApplication({} as Pool);
  for (const action of ["execute", "reconcile"] as const) {
    const result = await app.advance("22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333",
      { version: "billing-advance-delivery.v1", outboxActionId: "44444444-4444-4444-8444-444444444444", action });
    const body = JSON.stringify(result);
    expect(body).not.toContain(SECRET_CSV);
    expect(body).not.toContain("\"csv\"");
    expect(result.exports).toEqual([{ id: "batch-1", jsonHash: "j", csvHash: "c", lines: [{}], totalNet: { pence: 100, currency: "GBP" } }]);
  }
});
