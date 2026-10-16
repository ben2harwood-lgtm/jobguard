import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PracticeInvoiceRepository } from "./practice-invoice-repository.js";
import { CustomerBillingCommandService } from "./customer-billing-repository.js";
import { UserCommandDispatcher, type ConsequentialCommand } from "./commands.js";
import { appendAuditBatch } from "./audit.js";
import { verifiedTenantContextForQueuedJob, type TenantTransaction } from "./tenant-context.js";

vi.mock("./audit.js", () => ({ appendAuditBatch: vi.fn(async () => []) }));
const tenantId = randomUUID(), jobId = randomUUID(), invoiceId = randomUUID(), actorMembershipId = randomUUID();
const context = verifiedTenantContextForQueuedJob(tenantId);
const invoice = { id: invoiceId, invoice_number: "DEMO-CUST-000001", issued_on: "2026-10-16",
 pdf_sha256: "a".repeat(64), source_hash: "b".repeat(64), final_account_revision_id: randomUUID(),
 net_pence: "10000", tax_pence: "2000", total_pence: "12000", credited_pence: "1200", paid_pence: "3000" };
function fixture(answer: (sql: string) => unknown[]) {
 const query = vi.fn(async (sql: string) => { const rows = answer(sql); return { rows, rowCount: rows.length }; });
 const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
 return { pool, query, repo: new PracticeInvoiceRepository(pool) };
}
afterEach(() => { vi.restoreAllMocks(); vi.mocked(appendAuditBatch).mockClear(); });

describe("LATER-B16 invoice projections", () => {
 it("L078 list, credit detail and receipt detail use the persisted balance", async () => {
  const { repo } = fixture(sql => sql.includes("FROM app.customer_invoice i") ? [{ ...invoice, credits: [], receipts: [] }] : []);
  const listed = (await repo.list(context, jobId))[0];
  expect(listed).toMatchObject({ balancePence: 7800, creditedPence: 1200, paidPence: 3000, customerCreditPence: 0 });
  expect((await repo.creditView(context, jobId, invoiceId)).invoice).toEqual(listed);
  expect((await repo.receiptView(context, jobId, invoiceId)).invoice).toEqual(listed);
 });
 it("L079 exact issue replay appends no second audit event and returns persisted balance", async () => {
  const { repo } = fixture(sql => {
   if (sql.includes("AS rebill_blocked")) return [{ rebill_blocked: false }];
   if (sql.includes("app.issue_practice_customer_invoice")) return [{ invoice_id: invoiceId, pdf_sha256: invoice.pdf_sha256, source_hash: invoice.source_hash }];
   if (sql.includes("FROM app.audit_event")) return [{ found: 1 }];
   if (sql.includes("FROM app.customer_invoice")) return [invoice];
   return [];
  });
  const result = await repo.issue(context, { jobId, finalAccountRevisionId: invoice.final_account_revision_id,
   actorMembershipId, commandId: randomUUID(), recipient: "practice@example.invalid", issuedOn: "2026-10-16" });
  expect(appendAuditBatch).not.toHaveBeenCalled();
  expect(result.balancePence).toBe(7800);
 });
 for (const timezone of ["Pacific/Auckland", "Europe/London", "America/Los_Angeles"]) {
  it(`L080 calendar date survives ${timezone}`, async () => {
   const previous = process.env.TZ;
   process.env.TZ = timezone;
   try {
    const { repo } = fixture(sql => sql.includes("FROM app.customer_invoice") ? [{ ...invoice,
     issued_on: new Date(2026, 9, 16), ...(sql.includes("issued_date") ? { issued_date: "2026-10-16" } : {}) }] : []);
    expect((await repo.list(context, jobId))[0]!.issuedOn).toBe("2026-10-16");
   } finally { if (previous === undefined) Reflect.deleteProperty(process.env, "TZ"); else process.env.TZ = previous; }
  });
 }
 for (const change of [{ invoiceId: randomUUID() }, { reason: "Changed synthetic reason" }]) {
  it(`L076 changed credit ${Object.keys(change)[0]} conflicts on replay`, async () => {
   const { pool, query } = fixture(sql => sql.includes("FROM app.command_receipt") ? [{
    job_id: jobId, invoice_id: invoiceId, amount_pence: "1200", reason: "Synthetic correction",
   }] : []);
   vi.spyOn(UserCommandDispatcher.prototype, "dispatch").mockImplementation(async (_context, raw, handler) => {
    await handler.lock!({ $client: { query } } as unknown as TenantTransaction, raw as ConsequentialCommand);
    return { creditNoteId: randomUUID() } as never;
   });
   const command = { version: "command.v1", commandId: randomUUID(), commandType: "customer_credit_note.issue",
    semanticKey: "synthetic-credit", actorMembershipId, subjectType: "job", subjectRef: jobId,
    action: { actionType: "customer_credit_note.issue", recipient: null, contentHash: "c".repeat(64),
     aggregateRevision: 0, amountPence: 1200, currency: "GBP", policyVersion: "candidate_m1_standard_v1", expiresAt: new Date(Date.now() + 60000) } };
   await expect(new CustomerBillingCommandService(pool).credit(context, { version: "customer-credit-note.issue.v1",
    command, invoiceId, amountPence: 1200, reason: "Synthetic correction", ...change })).rejects.toThrow("COMMAND_CONFLICT");
  });
 }
});
