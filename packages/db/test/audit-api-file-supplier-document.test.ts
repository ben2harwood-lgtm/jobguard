import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupplierDocumentApplication } from "../../../apps/api/src/supplier-document.application.js";
import { PracticeAccess } from "../../../apps/api/src/practice-access.js";
import { SupplierDocumentRepository } from "../src/supplier-document-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const tenant = randomUUID(), job = randomUUID(), documentId = randomUUID(), context = testTenantContext(tenant);
const correction = (quantity = "1.1", unitPricePence = 100, netPence = 110) => ({
  version: "supplier-fact-correction.v1" as const, documentId, commandId: randomUUID(),
  documentType: "invoice" as const, quantity, unitPricePence, netPence, expectedRevision: 0,
});

/** Scripted existing invoice/delivery responses exercise real application/repository code.
 * SQL recordings prove submitted parameters and absence of writes, not PostgreSQL storage or RLS. */
class RecordedSql {
  calls: Array<{ sql: string; values: unknown[] }> = [];
  query = async (sql: string, values: unknown[] = []) => {
    this.calls.push({ sql, values });
    const rows = (items: unknown[]) => ({ rows: items, rowCount: items.length });
    if (sql.includes("INSERT INTO app.watchdog_command_identity")) return rows([{ command_id: values[1] }]);
    if (sql.includes("FROM app.supplier_fact_proposal")) return rows([{ id: randomUUID(), document_type: "invoice", quantity_decimal: "10.000000", unit_price_pence: "2500", net_pence: "25000", issues: [] }]);
    if (sql.includes("SELECT count(*) n FROM app.supplier_fact_revision")) return rows([{ n: "0" }]);
    if (sql.includes("FROM app.goods_receipt")) return rows([{ revision: 1, ordered_quantity: "10.000000", order_draft_id: randomUUID(), document_id: documentId }]);
    if (sql.includes("AS tenant_id")) return rows([{ tenant_id: tenant }]);
    if (sql.includes("clock_timestamp() AS occurred_at")) return rows([{ occurred_at: new Date() }]);
    if (sql.includes("UNION ALL") || sql.includes("SELECT payload_hash,revision,job_id")) return rows([]);
    if (/^(BEGIN|COMMIT|ROLLBACK|SELECT set_config|SELECT app\.|SELECT pg_advisory_xact_lock|INSERT INTO)/u.test(sql) || sql.includes("app.lock_audit_head()")) return rows([]);
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  pool() { return { connect: async () => ({ query: this.query, release() {} }) } as unknown as Pool; }
  inserts(table: string) { return this.calls.filter(call => call.sql.includes(`INSERT INTO app.${table}`)); }
}
const application = (db: RecordedSql) => {
  vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({ context } as never);
  return new SupplierDocumentApplication(db.pool());
};
afterEach(() => vi.restoreAllMocks());

describe("night audit supplier document regressions (scripted SQL)", () => {
  it("confirms decimal quantities using exact arithmetic", async () => {
    const db = new RecordedSql();
    await expect(application(db).confirm(job, correction())).resolves.toEqual({ revision: 1, replayed: false });
    expect(db.inserts("supplier_fact_revision")[0]!.values.slice(8, 11)).toEqual(["1.1", 100, 110]);
    expect(db.inserts("audit_event")).toHaveLength(1);
    expect(db.inserts("watchdog_command_result")).toHaveLength(1);
  });

  it.each(["confirmation", "accepted receipt", "rejected receipt"])("rejects quantities beyond supported precision without writes: %s", async kind => {
    const db = new RecordedSql(), app = application(db);
    const result = kind === "confirmation" ? app.confirm(job, correction("1.0000001", 10000000, 10000001))
      : app.receipt(job, { version: "goods-receipt.v1", commandId: randomUUID(),
        accepted: kind === "accepted receipt" ? "1.1234567" : "1", rejected: kind === "rejected receipt" ? "1.1234567" : "0", expectedRevision: 1 });
    await expect(result).rejects.toMatchObject({ name: "ZodError", issues: [{ code: "invalid_string" }] });
    for (const table of ["supplier_fact_revision", "goods_receipt", "audit_event", "watchdog_command_identity", "watchdog_command_result"]) expect(db.inserts(table)).toHaveLength(0);
  });

  it.each(["confirmation", "receipt"])("repository also rejects excessive precision for direct callers: %s", async kind => {
    const db = new RecordedSql(), repo = new SupplierDocumentRepository(db.pool());
    const result = kind === "confirmation" ? repo.confirm(context, job, correction("1.0000001", 10000000, 10000001))
      : repo.appendReceipt(context, job, { accepted: "1.1234567", rejected: "0", expectedRevision: 1 });
    await expect(result).rejects.toMatchObject({ name: "ZodError" });
    expect(db.calls).toHaveLength(0);
  });

  it.each([["1.000001", 1000000, 1000001], ["0.000001", 1000000, 1], ["01.10", 100, 110]])("keeps supported exact quantities: %s", async (quantity, price, net) => {
    const db = new RecordedSql();
    await expect(application(db).confirm(job, correction(quantity as string, price as number, net as number))).resolves.toMatchObject({ revision: 1 });
  });

  it.each([["1.1", 100, 111], ["0.5", 1, 0]])("still rejects mismatched or fractional-penny totals: %s", async (quantity, price, net) => {
    const db = new RecordedSql();
    await expect(application(db).confirm(job, correction(quantity as string, price as number, net as number))).rejects.toThrow("ARITHMETIC_MISMATCH");
    expect(db.inserts("supplier_fact_revision")).toHaveLength(0);
    expect(db.inserts("audit_event")).toHaveLength(0);
  });
});
