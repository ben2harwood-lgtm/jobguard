import { fakeAuditAppend } from "./audit-protocol-fixture.js";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerBillingCommandService } from "../src/customer-billing-repository.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { readSyntheticDemo } from "../src/demo-runtime.js";
import { DEMO_EMPTY_TENANT_ID, DEMO_TENANT_ID } from "../src/demo-seed.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const billingFixture = () => ({ tenantId: randomUUID(), jobId: randomUUID(), invoiceId: randomUUID(), actorMembershipId: randomUUID() });
function creditInput(f: ReturnType<typeof billingFixture>, amountPence: number) {
  const commandId = randomUUID();
  return { version: "customer-credit-note.issue.v1", invoiceId: f.invoiceId, amountPence, reason: "Fictional correction",
    command: { version: "command.v1", commandId, commandType: "customer_credit_note.issue", semanticKey: `credit:${commandId}`,
      actorMembershipId: f.actorMembershipId, subjectType: "job", subjectRef: f.jobId,
      action: { actionType: "customer_credit_note.issue", recipient: null, contentHash: "a".repeat(64), aggregateRevision: 0,
        amountPence, currency: "GBP", policyVersion: "candidate_m1_standard_v1", expiresAt: new Date(Date.now() + 300000) } } };
}
function receiptInput(f: ReturnType<typeof billingFixture>, amountPence: number, paidOn: string) {
  return { version: "customer-payment.record.v1", commandId: randomUUID(), actorMembershipId: f.actorMembershipId,
    jobId: f.jobId, invoiceId: f.invoiceId, paidOn, amountPence, currency: "GBP", method: "bank_transfer",
    reference: "INV-100", builderAttestsReceived: true };
}
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
type Row = Record<string, any>;

/** Deliberately bounded query double. Models the credit race and stored nullable
 * columns, not PostgreSQL isolation, privileges, RLS, triggers or PDF validity. */
class BillingSql {
  readonly credits: Row[] = [];
  readonly payments: Row[] = [];
  readonly receipts = new Map<string, Row>();
  readonly firstRead = deferred();
  readonly secondArrived = deferred();
  readonly releaseFirst = deferred();
  readonly calls: string[] = [];
  readonly auditedPayments = new Set<string>();
  private connections = 0;
  private lockTail = Promise.resolve();
  constructor(readonly fixture: ReturnType<typeof billingFixture>, readonly pause = false) {}
  pool(): Pool {
    return { connect: async () => {
      const connection = ++this.connections;
      const pendingCredits: Row[] = [], pendingPayments: Row[] = [], claimed: string[] = [];
      let unlock: (() => void) | undefined;
      const rows = (items: Row[]) => ({ rows: items, rowCount: items.length });
      const query = async (sql: string, values: any[] = []): Promise<any> => {
        this.calls.push(sql);
        if (sql === "COMMIT" || sql === "ROLLBACK") {
          if (sql === "COMMIT") { this.credits.push(...pendingCredits); this.payments.push(...pendingPayments); }
          else for (const id of claimed) this.receipts.delete(id);
          unlock?.(); return rows([]);
        }
        if (sql.includes("pg_advisory_xact_lock")) {
          if (connection === 2) this.secondArrived.resolve();
          const previous = this.lockTail, gate = deferred(); this.lockTail = gate.promise;
          await previous; unlock = gate.resolve; return rows([]);
        }
        if (sql.includes("INSERT INTO app.command_receipt")) {
          const prior = [...this.receipts.values()].find(r => r.command_id === values[0] || (r.command_type === values[2] && r.semantic_key === values[3]));
          if (prior) return rows([]);
          this.receipts.set(values[0], { command_id: values[0], command_type: values[2], semantic_key: values[3], request_hash: values[4], status: "processing" });
          claimed.push(values[0]); return rows([{ command_id: values[0] }]);
        }
        if (sql.includes("SELECT request_hash,status,result")) return rows([...this.receipts.values()].filter(r => r.command_id === values[1] || (r.command_type === values[2] && r.semantic_key === values[3])));
        if (sql.includes("UPDATE app.command_receipt")) { Object.assign(this.receipts.get(values[1])!, { status: "succeeded", result: JSON.parse(values[2]) }); return rows([]); }
        if (sql.includes("FROM app.membership")) return rows([{ role: "owner" }]);
        if (sql.includes("r.semantic_key LIKE 'payment:%'")) {
          const prior = this.receipts.get(values[1]);
          return rows(prior?.semantic_key?.startsWith("payment:") ? [prior] : []);
        }
        if (sql.includes("app.record_practice_customer_receipt(")) {
          // Model only the existing routine's command identity/replay contract.
          // Its PostgreSQL privileges and money limits are verified separately.
          const id = values[4], request = JSON.stringify(values.filter((_, i) => i !== 4)), prior = this.receipts.get(id);
          if (prior) {
            if (prior.request_hash !== request) throw Object.assign(new Error("IDEMPOTENCY_PAYLOAD_CONFLICT"), { code: "23505" });
            return rows([{ payment_id: prior.result.paymentId }]);
          }
          const paymentId = randomUUID();
          pendingPayments.push({ id: paymentId, authorization_id: randomUUID(), amount_pence: values[6], reference: values[8] });
          this.receipts.set(id, { request_hash: request, result: { paymentId }, status: "succeeded" });
          claimed.push(id); return rows([{ payment_id: paymentId }]);
        }
        if (sql.includes("FROM app.audit_event")) return rows(this.auditedPayments.has(values[1]) ? [{}] : []);
        if (sql.includes("SELECT authorization_id FROM app.customer_payment")) return rows([...pendingPayments, ...this.payments].filter(p => p.id === values[1]));
        if (sql.includes("FROM app.append_audit(")) {
          const events = fakeAuditAppend(values[0], this.fixture.tenantId);
          for (const event of events) if (event.payload.references?.paymentId) this.auditedPayments.add(event.payload.references.paymentId);
          return rows(events);
        }
        if (sql.includes("FROM app.customer_invoice")) {
          const credited = this.credits.reduce((n, c) => n + c.amount_pence, 0);
          const invoice = { id: this.fixture.invoiceId, total_pence: 12000, net_pence: 10000, tax_pence: 2000,
            invoice_number: "SYN-2026-000001", issued_on: "2026-10-13", tax_policy_version: "candidate_m1_standard_v1",
            source_hash: "b".repeat(64), pdf_sha256: "c".repeat(64), credited, credited_pence: credited,
            credit_pence: credited, receipt_pence: this.payments.reduce((n, p) => n + p.amount_pence, 0), reversed_pence: 0,
            credits: this.credits.map(c => ({ id: c.id, credit_number: c.credit_number, net_pence: c.net_pence, tax_pence: c.tax_pence, total_pence: c.total_pence, reason: c.reason, pdf_sha256: c.pdf_sha256, approved_at: c.approved_at, source_invoice_hash: c.source_invoice_hash })) };
          if (this.pause && sql.includes(" credited ")) {
            if (connection === 1) { this.firstRead.resolve(); await this.releaseFirst.promise; }
            if (connection === 2) this.secondArrived.resolve();
          }
          return rows([invoice]);
        }
        if (sql.includes("INSERT INTO app.customer_credit_note") || sql.includes("INSERT INTO app.customer_payment(")) {
          const match = /INSERT INTO app\.\w+\(([^)]+)\)\s*VALUES\(([^)]+)\)/u.exec(sql)!;
          const columns = match[1]!.split(","), expressions = match[2]!.split(","), row: Row = {};
          columns.forEach((column, index) => { const expression = expressions[index]!.trim(); row[column.trim()] = expression.startsWith("$") ? values[Number(expression.slice(1)) - 1] : expression === "true" ? true : expression.replaceAll("'", ""); });
          if (sql.includes("customer_credit_note(")) {
            for (const column of ["net_pence", "tax_pence", "total_pence", "source_invoice_hash", "preview_hash", "pdf_sha256", "pdf_bytes", "tax_policy_version", "approved_at"]) row[column] ??= null;
            pendingCredits.push(row);
          } else pendingPayments.push(row);
          return rows([]);
        }
        if (sql.includes("FROM app.customer_credit_note")) return rows(this.credits);
        if (sql.includes("transaction_timestamp()")) return rows([{ approved_at: new Date() }]);
        if (sql.includes("AS tenant_id")) return rows([{ tenant_id: this.fixture.tenantId }]);
        if (sql.includes("lock_audit_head")) return rows([]);
        if (sql.includes("clock_timestamp() AS occurred_at")) return rows([{ occurred_at: new Date() }]);
        if (/^(BEGIN|SELECT set_config|INSERT INTO app\.|SELECT app.advance_audit_head)/u.test(sql)) return rows([]);
        throw new Error(`Unexpected SQL: ${sql}`);
      };
      return { query, release() {} };
    } } as unknown as Pool;
  }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("dbsrc-03 audit reproductions with query doubles", () => {
  it("serializes competing credits against remaining debt", async () => {
    const f = billingFixture(), sql = new BillingSql(f, true), service = new CustomerBillingCommandService(sql.pool()), context = testTenantContext(f.tenantId);
    let clock = Date.now(); vi.spyOn(Date, "now").mockImplementation(() => clock++); // Distinct legacy credit numbers.
    const first = service.credit(context, creditInput(f, 8000));
    await sql.firstRead.promise;
    const second = service.credit(context, creditInput(f, 8000));
    await sql.secondArrived.promise;
    sql.releaseFirst.resolve();
    const results = await Promise.allSettled([first, second]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { message: "INVALID_CREDIT_AMOUNT" } });
    expect(sql.credits.reduce((n, c) => n + c.amount_pence, 0)).toBe(8000);
    expect(await service.balance(context, f.invoiceId)).toMatchObject({ balance: { pence: 4000 } });
    expect(sql.calls.find(call => call.includes("pg_advisory_xact_lock"))).toContain("$1::uuid::text || ':' || $2::uuid::text");
  });

  it("command-service credits remain readable", async () => {
    const f = billingFixture(), sql = new BillingSql(f), pool = sql.pool(), context = testTenantContext(f.tenantId);
    await new CustomerBillingCommandService(pool).credit(context, creditInput(f, 1200));
    const view = await new PracticeInvoiceRepository(pool).creditView(context, f.jobId, f.invoiceId);
    expect(view.credits).toHaveLength(1);
    expect(view.credits[0]).toMatchObject({ netPence: -1000, taxPence: -200, totalPence: -1200, sourceInvoiceHash: "c".repeat(64) });
    const credit = sql.credits[0]!;
    expect(createHash("sha256").update(credit.pdf_bytes).digest("hex")).toBe(view.credits[0]!.pdfSha256);
    expect(Buffer.from(credit.pdf_bytes).toString()).toContain("SYNTHETIC");
    expect(credit.approved_at).toBeInstanceOf(Date);
    const pdf = Buffer.from(credit.pdf_bytes).toString();
    const xref = Number(/startxref\n(\d+)/u.exec(pdf)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe("xref");
    const entries = pdf.slice(xref).split("\n").slice(3, 8);
    entries.forEach((entry, index) => expect(pdf.slice(Number(entry.slice(0, 10)))).toMatch(new RegExp(`^${index + 1} 0 obj`)));
  });

  it("refuses an unrepresentable gross credit without guessing VAT or leaving effects", async () => {
    const f = billingFixture(), sql = new BillingSql(f), service = new CustomerBillingCommandService(sql.pool());
    await expect(service.credit(testTenantContext(f.tenantId), creditInput(f, 3))).rejects.toThrow("INVALID_CREDIT_AMOUNT");
    expect(sql.credits).toHaveLength(0);
    expect(sql.receipts.size).toBe(0);
    expect(sql.calls.some(call => call.includes("lock_audit_head"))).toBe(false);
  });

  it("allows separate receipts sharing a bank reference", async () => {
    const f = billingFixture(), sql = new BillingSql(f), service = new CustomerBillingCommandService(sql.pool()), context = testTenantContext(f.tenantId);
    const first = receiptInput(f, 5000, "2026-10-13"), second = receiptInput(f, 7000, "2026-10-14");
    const a = await service.recordPayment(context, first), b = await service.recordPayment(context, second);
    expect(sql.payments).toHaveLength(2);
    expect(await service.balance(context, f.invoiceId)).toMatchObject({ status: "paid", balance: { pence: 0 } });
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000);
    await expect(service.recordPayment(context, first)).resolves.toEqual(a);
    await expect(service.recordPayment(context, second)).resolves.toEqual(b);
    expect(sql.payments).toHaveLength(2);
    expect(sql.auditedPayments.size).toBe(2);
  });

  it("preserves exact replay of a previously dispatched service receipt", async () => {
    const f = billingFixture(), sql = new BillingSql(f), service = new CustomerBillingCommandService(sql.pool()), context = testTenantContext(f.tenantId);
    const input = receiptInput(f, 5000, "2026-10-13"), paymentId = randomUUID();
    sql.payments.push({ id: paymentId, amount_pence: 5000 });
    sql.receipts.set(input.commandId, { command_type: "customer_payment.record", actor_membership_id: f.actorMembershipId,
      semantic_key: `payment:${f.invoiceId}:INV-100`, status: "succeeded", result: { paymentId },
      content_hash: createHash("sha256").update(JSON.stringify(input)).digest("hex") });
    await expect(service.recordPayment(context, input)).resolves.toMatchObject({ paymentId });
    await expect(service.recordPayment(context, { ...input, amountPence: 5001 })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    expect(sql.payments).toHaveLength(1);
  });

  it("home read survives unrelated workspace revocation", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const job = { id: randomUUID(), title: "Fictional primary job", status: "draft", revision: 0 };
    const pool = { connect: async () => {
      let tenant: string;
      return { release() {}, query: async (sql: string, values: unknown[] = []) => {
        if (sql.includes("set_config")) tenant = values[0] as string;
        const rows = sql.includes("FROM app.membership") ? tenant! === DEMO_EMPTY_TENANT_ID ? [] : [{ name: "Primary workshop" }]
          : sql.includes("FROM app.job j") ? [job] : [];
        return { rows, rowCount: rows.length };
      } };
    } } as unknown as Pool;
    const result = await readSyntheticDemo(pool);
    expect(result.tenant.id).toBe(DEMO_TENANT_ID);
    expect(result.jobs).toEqual([job]);
    expect(result.tenants).toEqual([result.tenant]);
  });

  it.each(["primary forbidden", "empty database failure"])("home still fails closed for %s", async failure => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const pool = { connect: async () => {
      let tenant: string;
      return { release() {}, query: async (sql: string, values: unknown[] = []) => {
        if (sql.includes("set_config")) tenant = values[0] as string;
        if (sql.includes("FROM app.membership") && tenant! === DEMO_EMPTY_TENANT_ID && failure === "empty database failure") throw new Error("fixture database unavailable");
        const rows = sql.includes("FROM app.membership") && failure !== "primary forbidden" ? [{ name: "Primary workshop" }] : [];
        return { rows, rowCount: rows.length };
      } };
    } } as unknown as Pool;
    await expect(readSyntheticDemo(pool)).rejects.toThrow(failure === "primary forbidden" ? "MEMBERSHIP_FORBIDDEN" : "fixture database unavailable");
  });
});
