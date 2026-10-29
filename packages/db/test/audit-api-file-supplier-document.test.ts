import { fakeAuditAppend } from "./audit-protocol-fixture.js";
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
    if (sql.includes("FROM app.append_audit(")) return rows(fakeAuditAppend(values[0] as string, tenant));
    if (sql.includes("AS tenant_id")) return rows([{ tenant_id: tenant }]);
    if (sql.includes("clock_timestamp() AS occurred_at")) return rows([{ occurred_at: new Date() }]);
    if (sql.includes("UNION ALL") || sql.includes("SELECT payload_hash,revision,job_id")) return rows([]);
    if (/^(BEGIN|COMMIT|ROLLBACK|SELECT set_config|SELECT app\.|SELECT pg_advisory_xact_lock|INSERT INTO)/u.test(sql) || sql.includes("app.lock_audit_head()")) return rows([]);
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  pool() { return { connect: async () => ({ query: this.query, release() {} }) } as unknown as Pool; }
  inserts(table: string) { return this.calls.filter(call => (table === "audit_event" ? call.sql.includes("FROM app.append_audit(") : call.sql.includes(`INSERT INTO app.${table}`))); }
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

// Repair r1: additional regressions only; the original assertions above remain unchanged.
function receiptSql(ordered: string) {
  const db = new RecordedSql(), query = db.query;
  let identity: { job_id: unknown; command_type: unknown; request_hash: unknown } | undefined;
  let result: unknown;
  db.query = async (sql, values = []) => {
    if (sql.includes("INSERT INTO app.watchdog_command_identity")) {
      db.calls.push({ sql, values });
      if (identity) return { rows: [], rowCount: 0 };
      identity = { job_id: values[2], command_type: values[3], request_hash: values[4] };
      return { rows: [{ command_id: values[1] }], rowCount: 1 };
    }
    if (sql.includes("SELECT job_id,command_type,request_hash") || sql.includes("SELECT result FROM app.watchdog_command_result")) {
      db.calls.push({ sql, values });
      return { rows: sql.includes("SELECT result") ? [{ result }] : [identity], rowCount: 1 };
    }
    if (sql.includes("FROM app.goods_receipt")) {
      db.calls.push({ sql, values });
      return { rows: [{ revision: 1, ordered_quantity: ordered, order_draft_id: job, document_id: documentId }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO app.watchdog_command_result")) result = JSON.parse(values[2] as string);
    return query(sql, values);
  };
  return db;
}

describe("supplier receipt exact decimals (repair r1)", () => {
  it.each([
    ["10000000000001.000000", "10000000000000.000001", "0.000001", "10000000000000.000002", "0.999999"],
    ["99999999999999.999999", "0.000001", "99999999999999.999998", "99999999999999.999999", "99999999999999.999998"],
    ["1.000000", "0.000001", "0.000002", "0.000003", "0.999999"],
  ])("persists exact quantities and replays without another effect: %s", async (ordered, accepted, rejected, delivered, missing) => {
    const db = receiptSql(ordered), app = application(db);
    const input = { version: "goods-receipt.v1", commandId: randomUUID(), accepted, rejected, expectedRevision: 1 };
    await expect(app.receipt(job, input)).resolves.toEqual({ revision: 2 });
    expect(db.inserts("goods_receipt")[0]!.values.slice(6, 11)).toEqual([ordered, delivered, accepted, rejected, missing]);
    await expect(app.receipt(job, input)).resolves.toEqual({ revision: 2 });
    for (const table of ["goods_receipt", "audit_event", "watchdog_command_result"]) expect(db.inserts(table)).toHaveLength(1);
  });

  it("reads every receipt quantity without a floating-point conversion, retaining the established display format", async () => {
    const db = new RecordedSql(), query = db.query;
    db.query = async (sql, values = []) => {
      if (sql.includes("FROM app.goods_receipt")) return { rows: [{ revision: 2,
        ordered_quantity: "10000000000001.000000", delivered_quantity: "10000000000000.000002",
        accepted_quantity: "10000000000000.000001", rejected_quantity: "0.000001", missing_quantity: "0.999999" }], rowCount: 1 };
      if (sql.includes("SELECT count(*) n FROM app.supplier_document_intake")) return { rows: [{ n: "0" }], rowCount: 1 };
      if (sql.includes("FROM app.supplier_document") || sql.includes("FROM app.supplier_fact_proposal")) return { rows: [], rowCount: 0 };
      return query(sql, values);
    };
    await expect(new SupplierDocumentRepository(db.pool()).view(context, job)).resolves.toMatchObject({ receipt: {
      revision: 2, ordered: "10000000000001", delivered: "10000000000000.000002",
      accepted: "10000000000000.000001", rejected: "0.000001", missing: "0.999999",
    } });
  });

  it.each([
    ["100000000000000", "0"], ["0", "100000000000000.000000"],
    ["99999999999999.999999", "0.000001"], ["50000000000000", "50000000000000"],
  ])("rejects numeric(20,6) operand or sum overflow before connecting: %s + %s", async (accepted, rejected) => {
    const db = new RecordedSql();
    await expect(new SupplierDocumentRepository(db.pool()).appendReceipt(context, job, { accepted, rejected, expectedRevision: 1 }))
      .rejects.toMatchObject({ name: "ZodError" });
    expect(db.calls).toHaveLength(0);
  });
});
