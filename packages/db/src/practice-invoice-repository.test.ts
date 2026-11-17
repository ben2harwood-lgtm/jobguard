import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PracticeInvoiceRepository } from "./practice-invoice-repository.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "./tenant-context.js";

vi.mock("./audit.js", () => ({ appendAuditBatch: vi.fn(async () => []) }));
const tenantId = randomUUID(), jobId = randomUUID(), invoiceId = randomUUID();
const context = verifiedTenantContextFromMembership({ tenantId, identityUserId: randomUUID(), membershipId: randomUUID() } as AuthenticatedMembership);
const invoice = {
  id: invoiceId, invoice_number: "DEMO-CUST-000001", issued_on: "2026-10-14",
  pdf_sha256: "a".repeat(64), source_hash: "b".repeat(64), final_account_revision_id: randomUUID(),
  net_pence: "20003", tax_pence: "4001", total_pence: "24004", credited_pence: "0", paid_pence: "0",
};
const credit = {
  id: randomUUID(), credit_number: "DEMO-CN-000001", net_pence: "-10001", tax_pence: "-2000",
  total_pence: "-12001", reason: "Synthetic correction", pdf_sha256: "c".repeat(64),
  source_invoice_hash: invoice.pdf_sha256, approved_at: "2026-10-14T10:00:00Z",
};
function scriptedPool(answer: (sql: string) => unknown[]) {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    const rows = answer(sql);
    return { rows, rowCount: rows.length };
  });
  const release = vi.fn();
  const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
  return { repo: new PracticeInvoiceRepository(pool), query, release };
}
const creditInput = (netPence = 1) => ({ jobId, invoiceId, netPence, reason: "Synthetic correction" });
const issueInput = { jobId, finalAccountRevisionId: randomUUID(), actorMembershipId: randomUUID(),
  commandId: randomUUID(), recipient: "practice-customer@example.invalid", issuedOn: "2026-10-14" };

describe("practice invoice audit regressions (scripted SQL responses)", () => {
  it("credit history and balance share one snapshot", async () => {
    let committed = false;
    const { repo } = scriptedPool(sql => {
      if (sql.startsWith("SELECT i.*")) {
        // A second connection commits immediately after this statement's snapshot.
        const row = { ...invoice, credits: committed ? [credit] : [] };
        committed = true;
        return [row];
      }
      if (sql.startsWith("SELECT * FROM app.customer_credit_note")) return committed ? [credit] : [];
      return [];
    });
    const view = await repo.creditView(context, jobId, invoiceId);
    expect(view.invoice.balancePence).toBe(view.invoice.totalPence + view.credits.reduce((n, c) => n + c.totalPence, 0));
  });

  it("split credits cannot exceed original net principal", async () => {
    const { repo, query } = scriptedPool(sql => {
      if (sql.includes("app.issue_practice_customer_credit_note")) return [{ credit_note_id: credit.id, credit_number: credit.credit_number, pdf_sha256: credit.pdf_sha256, total_pence: "-1" }];
      if (sql.includes("FROM app.customer_invoice i")) return [{ ...invoice, credited: "24003", credited_net: "20003" }];
      return [];
    });
    await expect(repo.previewCredit(context, creditInput())).rejects.toThrow("CREDIT_EXCEEDS_AVAILABLE_AMOUNT");
    await expect(repo.issueCredit(context, { ...creditInput(), actorMembershipId: randomUUID(), commandId: randomUUID(), previewHash: "d".repeat(64) })).rejects.toThrow("CREDIT_EXCEEDS_AVAILABLE_AMOUNT");
    expect(query.mock.calls.some(([sql]) => sql.includes("app.issue_practice_customer_credit_note"))).toBe(false);
    const statements = query.mock.calls.map(([sql]) => sql);
    expect(statements.filter(sql => sql.includes("pg_advisory_xact_lock"))).toHaveLength(2);
    for (const index of statements.flatMap((sql, i) => sql.includes("FROM app.customer_invoice i") ? [i] : [])) {
      expect(statements.slice(0, index).some(sql => sql.includes("pg_advisory_xact_lock"))).toBe(true);
    }
  });

  it("revised account cannot rebill previously invoiced scope", async () => {
    const { repo, query } = scriptedPool(sql => {
      if (sql.includes("AS rebill_blocked")) return [{ rebill_blocked: true }];
      if (sql.includes("app.issue_practice_customer_invoice")) return [{ invoice_id: invoiceId, pdf_sha256: invoice.pdf_sha256, source_hash: invoice.source_hash }];
      if (sql.includes("FROM app.customer_invoice")) return [invoice];
      return [];
    });
    await expect(repo.issue(context, issueInput)).rejects.toThrow("INVOICE_CORRECTION_OR_SUPPLEMENTARY_REQUIRED");
    expect(query.mock.calls.some(([sql]) => sql.includes("app.issue_practice_customer_invoice"))).toBe(false);
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("completed credit commands still replay after all original net has been credited", async () => {
    const { repo, query } = scriptedPool(sql => {
      if (sql.includes("FROM app.command_receipt")) return [{ found: 1 }];
      if (sql.includes("app.issue_practice_customer_credit_note")) return [{ credit_note_id: credit.id, credit_number: credit.credit_number, pdf_sha256: credit.pdf_sha256, total_pence: "-12001" }];
      if (sql.includes("FROM app.customer_invoice i")) return [{ ...invoice, credited: "24003", credited_net: "20003" }];
      if (sql.includes("FROM app.audit_event")) return [{ found: 1 }];
      return [];
    });
    expect(await repo.issueCredit(context, { ...creditInput(10001), actorMembershipId: randomUUID(), commandId: randomUUID(), previewHash: "d".repeat(64) })).toMatchObject({ creditNoteId: credit.id, totalPence: -12001 });
    expect(query.mock.calls.some(([sql]) => sql.includes("app.issue_practice_customer_credit_note"))).toBe(true);
  });
});
