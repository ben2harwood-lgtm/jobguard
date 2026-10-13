import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { SupplierDocumentRepository } from "../src/supplier-document-repository.js";
import { SupplierMatchRepository } from "../src/supplier-match-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const tenant = randomUUID(), job = randomUUID(), context = testTenantContext(tenant);
/** Scripted SQL exercises repository decisions. It is not PostgreSQL integrity evidence. */
class SqlFixture {
  calls: Array<{ sql: string; values: any[] }> = [];
  order = { id: randomUUID(), version_id: randomUUID(), revision: 1, quantity_decimal: "10", sku: "MAT-B", unit: "each" };
  unrelated = { id: randomUUID(), version_id: randomUUID(), revision: 2, quantity_decimal: "10", sku: "MAT-C", unit: "each" };
  bill = { id: randomUUID(), version_id: randomUUID(), revision: 1, quantity_decimal: "10" };
  receipts: any[] = [{ id: randomUUID(), revision: 1, accepted_quantity: "8", quantity_decimal: "8", ordered_quantity: "10", delivered_quantity: "10", rejected_quantity: "0", missing_quantity: "2", unit: "each", document_id: randomUUID() }];
  proposal = { id: randomUUID(), order_revision_id: this.order.version_id, receipt_version_ids: [this.receipts[0].id], bill_revision_id: this.bill.version_id };
  newer = randomUUID();
  twoOrders = false;
  results = new Map<string, unknown>();
  claims = new Map<string, any>();
  constructor() { this.receipts[0].order_draft_id = this.order.id; }
  query = async (sql: string, values: any[] = []): Promise<any> => {
    this.calls.push({ sql, values });
    const rows = (items: any[]) => ({ rows: items, rowCount: items.length });
    if (sql.includes("INSERT INTO app.watchdog_command_identity")) {
      if (this.claims.has(values[1])) return rows([]);
      this.claims.set(values[1], { job_id: values[2], command_type: values[3], request_hash: values[4] });
      return rows([{ command_id: values[1] }]);
    }
    if (sql.includes("FROM app.watchdog_command_identity")) return rows([this.claims.get(values[1])]);
    if (sql.includes("INSERT INTO app.watchdog_command_result")) { this.results.set(values[1], JSON.parse(values[2])); return rows([]); }
    if (sql.includes("SELECT result FROM app.watchdog_command_result")) return rows(this.results.has(values[1]) ? [{ result: this.results.get(values[1]) }] : []);
    if (sql.includes("SELECT 'readiness.record'") || sql.includes("command_id=$2") && !sql.includes("watchdog_command")) return rows([]);
    if (sql.includes("AS tenant_id")) return rows([{ tenant_id: tenant }]);
    if (sql.includes("lock_audit_head")) return rows([]);
    if (sql.includes("clock_timestamp() AS occurred_at")) return rows([{ occurred_at: new Date("2026-10-13T00:00:00Z") }]);
    if (sql.includes("FROM app.supplier_fact_proposal")) return rows(sql.includes("source_text") ? [] : [{ id: randomUUID(), document_type: "invoice", quantity_decimal: "10", unit_price_pence: 2500, net_pence: 25000, issues: [] }]);
    if (sql.includes("count(*) n FROM app.supplier_fact_revision")) return rows([{ n: "0" }]);
    if (sql.includes("count(*) n FROM app.supplier_match_revision")) return rows([{ n: "1" }]);
    if (sql.includes("FROM app.purchase_order_revision r JOIN")) return rows([this.twoOrders && !values.includes(this.order.id) ? this.unrelated : this.order]);
    if (sql.includes("FROM app.supplier_fact_revision r JOIN")) return rows([this.bill]);
    if (sql.includes("FROM app.goods_receipt")) {
      if (sql.includes("id=$3")) return rows(this.receipts.filter(r => r.id === values[2]));
      if (sql.includes("sum(")) {
        const sum = (key: string) => String(this.receipts.reduce((n, r) => n + Number(r[key]), 0));
        const last = this.receipts.at(-1);
        return rows([{ ...last, accepted_quantity: sum("accepted_quantity"), delivered_quantity: sum("delivered_quantity"), rejected_quantity: sum("rejected_quantity"), missing_quantity: String(10 - Number(sum("accepted_quantity"))) }]);
      }
      return rows(sql.includes("LIMIT 1") ? [this.receipts.at(-1)] : this.receipts);
    }
    if (sql.includes("INSERT INTO app.goods_receipt")) {
      this.receipts.push({ id: values[0], order_draft_id: values[3], document_id: values[4], revision: values[5], ordered_quantity: values[6], delivered_quantity: values[7], accepted_quantity: values[8], quantity_decimal: String(values[8]), rejected_quantity: values[9], missing_quantity: values[10], unit: "each" });
      return rows([]);
    }
    if (sql.includes("SELECT $1::numeric <= $2::numeric")) return rows([{ ok: Number(values[0]) <= Number(values[1]) }]);
    if (sql.includes("SELECT * FROM app.supplier_match_proposal")) return rows([this.proposal]);
    if (sql.includes("SELECT id,state FROM app.supplier_match_proposal")) return rows([]);
    if (sql.includes("SELECT p.*,r.id revision_id")) {
      const id = values[2] ?? this.newer;
      return rows([{ ...this.proposal, id, revision: id === this.proposal.id ? 2 : 1, ordered: "10", received: "8", billed: "10", state: "matched", receipt_version_ids: this.proposal.receipt_version_ids }]);
    }
    if (sql.includes("SELECT r.id,r.revision")) return rows([{ revision: 1, audit_sequence: 1 }, ...(values[2] === this.proposal.id ? [{ revision: 2, audit_sequence: 2 }] : [])]);
    if (sql.includes("INSERT INTO app.supplier_match_allocation") && Number(values[5]) <= 0) throw new Error("supplier_match_allocation_quantity_decimal_check");
    if (sql.includes("count(*) n FROM app.supplier_document_intake")) return rows([{ n: 0 }]);
    if (sql.includes("FROM app.supplier_document") || sql.includes("FROM app.supplier_document_intake")) return rows([]);
    if (/^(BEGIN|COMMIT|ROLLBACK|SELECT set_config|SELECT pg_advisory|SELECT app\.|INSERT INTO)/u.test(sql)) return rows([]);
    throw new Error(`Unscripted SQL: ${sql}`);
  };
  pool() { return { connect: async () => ({ query: this.query, release() {} }) } as unknown as Pool; }
  correction() {
    return { version: "supplier-match-correction.v1" as const, commandId: randomUUID(), proposalId: this.proposal.id, expectedRevision: 1,
      orderVersionId: this.order.version_id, receiptVersionIds: this.proposal.receipt_version_ids,
      billVersionId: this.bill.version_id, allocations: [{ receiptVersionId: this.receipts[0].id, quantity: "8" }] };
  }
  inserts(table: string) { return this.calls.filter(c => c.sql.includes(`INSERT INTO app.${table}`)); }
}

describe("AUDIT-FIX-DBSRC-16 repository regressions (scripted SQL)", () => {
  it("does not match an invoice to an unrelated same-job order", async () => {
    const db = new SqlFixture(); db.twoOrders = true;
    await new SupplierMatchRepository(db.pool()).create(context, job, { commandId: randomUUID(), expectedRevision: 0 });
    expect(db.inserts("supplier_match_proposal")[0]!.values[6]).toBe(db.order.version_id);
  });
  it("refuses to guess when receipts belong to multiple orders", async () => {
    const db = new SqlFixture();
    db.receipts.push({ ...db.receipts[0], id: randomUUID(), order_draft_id: db.unrelated.id });
    await expect(new SupplierMatchRepository(db.pool()).create(context, job, { commandId: randomUUID(), expectedRevision: 0 }))
      .rejects.toThrow("MATCH_SOURCE_VERSION_CONFLICT");
    expect(db.inserts("supplier_match_proposal")).toHaveLength(0);
    expect(db.inserts("audit_event")).toHaveLength(0);
  });
  it.each([["0.29", 100, 29], ["0.5", 101, 50]] as const)("confirms exact fractional quantities with half-even rounding: %s", async (quantity, unitPricePence, netPence) => {
    const db = new SqlFixture();
    await expect(new SupplierDocumentRepository(db.pool()).confirm(context, job, { version: "supplier-fact-correction.v1", commandId: randomUUID(), documentId: db.bill.id, expectedRevision: 0, documentType: "invoice", quantity, unitPricePence, netPence })).resolves.toMatchObject({ revision: 1 });
    expect(db.inserts("supplier_fact_revision")[0]!.values.slice(8, 11)).toEqual([quantity, unitPricePence, netPence]);
  });
  it("later deliveries reduce the outstanding quantity cumulatively", async () => {
    const db = new SqlFixture(), original = structuredClone(db.receipts[0]), repo = new SupplierDocumentRepository(db.pool());
    await repo.appendReceipt(context, job, { accepted: "1", rejected: "0", expectedRevision: 1 });
    expect((await repo.view(context, job)).receipt).toMatchObject({ accepted: "9", missing: "1", revision: 2 });
    expect(db.receipts[0]).toEqual(original);
  });
  it("matches received goods after an entirely rejected later delivery", async () => {
    const db = new SqlFixture();
    await new SupplierDocumentRepository(db.pool()).appendReceipt(context, job, { accepted: "0", rejected: "1", expectedRevision: 1 });
    await expect(new SupplierMatchRepository(db.pool()).create(context, job, { commandId: randomUUID(), expectedRevision: 0 })).resolves.toBeDefined();
    expect(db.inserts("supplier_match_proposal")[0]!.values[7]).toEqual(db.receipts.map(r => r.id));
    expect(db.inserts("supplier_match_allocation").map(c => c.values.slice(4, 6))).toEqual([[db.receipts[0].id, "8"]]);
  });
  it("rejects allocations outside the correction source versions", async () => {
    const db = new SqlFixture(), undeclared = randomUUID();
    db.receipts.push({ ...db.receipts[0], id: undeclared, revision: 2, accepted_quantity: "1" });
    const correction = { ...db.correction(), allocations: [{ receiptVersionId: undeclared, quantity: "1" }] };
    await expect(new SupplierMatchRepository(db.pool()).correct(context, job, correction)).rejects.toThrow("MATCH_SOURCE_VERSION_CONFLICT");
    for (const table of ["supplier_match_revision", "supplier_match_allocation", "audit_event", "watchdog_command_result"]) expect(db.inserts(table)).toHaveLength(0);
    expect(db.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
  it("requires each allocation in the correction declaration even if the proposal includes it", async () => {
    const db = new SqlFixture(), second = randomUUID();
    db.proposal.receipt_version_ids.push(second);
    db.receipts.push({ ...db.receipts[0], id: second, revision: 2, accepted_quantity: "1" });
    const correction = { ...db.correction(), receiptVersionIds: [db.receipts[0].id], allocations: [{ receiptVersionId: second, quantity: "1" }] };
    await expect(new SupplierMatchRepository(db.pool()).correct(context, job, correction)).rejects.toThrow("MATCH_SOURCE_VERSION_CONFLICT");
    expect(db.inserts("supplier_match_revision")).toHaveLength(0);
    expect(db.inserts("audit_event")).toHaveLength(0);
  });
  it("returns the proposal actually corrected when a newer proposal exists", async () => {
    const db = new SqlFixture(), repo = new SupplierMatchRepository(db.pool()), correction = db.correction();
    const result = await repo.correct(context, job, correction);
    expect(result).toMatchObject({ proposal: { id: db.proposal.id }, revision: 2 });
    expect(await repo.correct(context, job, correction)).toEqual(result);
    expect(db.inserts("supplier_match_revision")).toHaveLength(1);
  });
});
