import { expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { EnterpriseFeeRepository } from "./enterprise-fee-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";

const id = "11111111-1111-4111-8111-111111111111";
const context = verifiedTenantContextForQueuedJob(id);
const command = { version: "enterprise-fee-simulate-invoice.v1", commandId: id, statementId: id, authorizationId: id };
function fixture(totalDeltaPence = 1500, failure?: string) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("ef_post_statement") && failure) throw new Error(failure);
    return { rows: [{ result: sql.includes("ef_read_statement")
      ? { id, revision: 2, contentHash: "a".repeat(64), totalDeltaPence }
      : { statementId: id, replayed: false } }] };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { repo: new EnterpriseFeeRepository({ connect } as unknown as Pool), query, connect, release };
}
it("projects the exact stored approved delta with stable identity, without contacting a provider", async () => {
  const network = vi.spyOn(globalThis, "fetch");
  try {
    for (const amount of [1500, 806, 0, -1500]) {
      const { repo, query, release } = fixture(amount);
      const invoice = await repo.simulateInvoice(context, id, command, "synthetic_demo");
      expect(invoice).toEqual({ version: "enterprise-fee-simulated-invoice.v1", mode: "synthetic_demo",
        label: "Simulated invoice — no payment due", invoiceId: id, statementId: id, statementRevision: 2,
        contentHash: "a".repeat(64), authorizationId: id, totalPence: amount, currency: "GBP" });
      expect(Object.isFrozen(invoice)).toBe(true);
      expect(await repo.simulateInvoice(context, id, command, "synthetic_demo")).toEqual(invoice);
      expect(query.mock.calls.map(([sql]) => sql)).toEqual(Array(2).fill([
        "BEGIN", "SELECT set_config('app.tenant_id', $1, true)", "SELECT app.ef_post_statement($1,$2,$3,$4) result",
        "SELECT app.ef_read_statement($1,$2) result", "COMMIT",
      ]).flat());
      expect(query).toHaveBeenCalledWith("SELECT app.ef_post_statement($1,$2,$3,$4) result", [id, id, id, id]);
      expect(release).toHaveBeenCalledTimes(2);
      expect(invoice).not.toHaveProperty("paid");
    }
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});
it("refuses live, pilot, unknown modes and forged client amounts before opening a transaction", async () => {
  const { repo, connect } = fixture();
  for (const mode of ["production_billing", "pilot_no_charge", "production", undefined]) {
    await expect(repo.simulateInvoice(context, id, command, mode)).rejects.toMatchObject({
      code: mode === "production_billing" ? "SYNTHETIC_REFERENCE_FORBIDDEN" : "FEE_GATE_CLOSED",
    });
  }
  for (const extra of [{ totalPence: 1 }, { tenantId: id }, { paid: true }, { mode: "synthetic_demo" }]) {
    await expect(repo.simulateInvoice(context, id, { ...command, ...extra }, "synthetic_demo")).rejects.toMatchObject({ code: "INVALID_FEE_INPUT" });
  }
  expect(connect).not.toHaveBeenCalled();
});
it("propagates persisted authorization and actual database gate refusals, rolling back without an invoice", async () => {
  for (const failure of ["FEE_GATE_CLOSED", "STATEMENT_AUTHORITY_INVALID", "EXTRA_FORBIDDEN", "STALE_FACTS", "OUTCOME_UNKNOWN"]) {
    const { repo, query, release } = fixture(1500, failure);
    await expect(repo.simulateInvoice(context, id, command, "synthetic_demo")).rejects.toMatchObject({ code: failure });
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query.mock.calls.some(([sql]) => sql.includes("ef_read_statement") || sql === "COMMIT")).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  }
});

it("rolls posting back if reading the invoice's immutable source fails", async () => {
  const { repo, query, release } = fixture();
  const original = query.getMockImplementation()!;
  query.mockImplementation(async sql => {
    if (sql.includes("ef_read_statement")) throw new Error("read connection lost");
    return original(sql);
  });
  await expect(repo.simulateInvoice(context, id, command, "synthetic_demo")).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
  expect(query).toHaveBeenCalledWith("ROLLBACK");
  expect(query).not.toHaveBeenCalledWith("COMMIT");
  expect(release).toHaveBeenCalledOnce();
});
