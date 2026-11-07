import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { analyseLockOrder, type Footprint, type ObservedTransaction } from "./lock-observer.js";
import { isRequestBindingRefusal, RequestBindingRefusedError } from "../src/request-binding-error.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../src/tenant-context.js";
import { AccountingExportRepository } from "../src/accounting-export-repository.js";
import { PlatformInvoiceReadRepository } from "../src/platform-invoice-read-repository.js";
import { VatFixtureRepository } from "../src/vat-fixture-repository.js";
import { NoticeFixtureRepository } from "../src/notice-fixture-repository.js";
import { RetentionRecordRepository } from "../src/retention-record-repository.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { PayNowAttemptError } from "../src/pay-now-attempt-repository.js";

const footprint = (rows: Array<[string, number]> = [], advisory: string[] = []): Footprint => ({
  rows: new Map(rows), advisory: new Set(advisory), tableModes: new Map(),
});
const identity = "identity.session#(0,1)", job = "app.job#(0,2)", head = "audit_control.audit_head#(0,3)";
function transaction(binding: Footprint, guard: Footprint, after: Footprint = guard): ObservedTransaction {
  return { pid: 1, outcome: "commit", statements: [
    { sql: "SELECT app.bind_request($1, $2, $3)", footprint: binding },
    { sql: "SELECT id FROM app.job FOR SHARE", footprint: guard },
    { sql: "SELECT app.lock_audit_head()", footprint: after },
  ] };
}
it("excludes only the binding's credential locks from the first business lock", () => {
  const t = transaction(footprint([[identity, 2]]), footprint([[identity, 2], [job, 2]]));
  const result = analyseLockOrder(t, { mutable: new Set(["app.job"]) });
  expect(result.firstStatement).toBe("SELECT id FROM app.job FOR SHARE");
  expect(result.firstLocks).toEqual([{ key: job, rank: 2, advisory: false }]);
});
it.each([footprint([[identity, 2], [job, 2]]), footprint([[identity, 2]], ["1:2:3"])])(
  "keeps business and advisory locks taken by bind_request visible", binding => {
    const result = analyseLockOrder(transaction(binding, binding), { mutable: new Set() });
    expect(result.firstStatement).toBe("SELECT app.bind_request($1, $2, $3)");
  },
);
it("still reports credential lock upgrades after the audit head", () => {
  const t = transaction(footprint([[identity, 2]]), footprint([[identity, 2], [job, 2]]), footprint([[identity, 2], [job, 2], [head, 4]]));
  t.statements.push({ sql: "SELECT identity.session FOR UPDATE", footprint: footprint([[identity, 4], [job, 2], [head, 4]]) });
  expect(analyseLockOrder(t, { mutable: new Set() }).afterAudit).toEqual([
    { statement: "SELECT identity.session FOR UPDATE", locks: [`UPDATE ${identity}`] },
  ]);
});
it("recognizes the exact SQL refusal and sanitized wrapper without hiding unrelated faults", () => {
  expect(isRequestBindingRefusal(new RequestBindingRefusedError())).toBe(true);
  expect(isRequestBindingRefusal(Object.assign(new Error("REQUEST_BINDING_REFUSED"), { code: "42501" }))).toBe(true);
  for (const error of [new Error("REQUEST_BINDING_REFUSED"), Object.assign(new Error("private failure"), { code: "42501" }), null]) {
    expect(isRequestBindingRefusal(error)).toBe(false);
  }
});
it.each([new RequestBindingRefusedError(), Object.assign(new Error("REQUEST_BINDING_REFUSED"), { code: "42501" })])(
  "preserves repository refusal codes and rolls back before business SQL", async error => {
    const member = { tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() } as AuthenticatedMembership;
    const context = verifiedTenantContextFromMembership(member, { kind: "real", credential: "a".repeat(64) });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("bind_request")) throw error;
      return { rows: [] };
    });
    const release = vi.fn(), pool = { connect: async () => ({ query, release }) } as unknown as Pool;
    const calls: Array<[() => Promise<unknown>, string]> = [
      [() => new AccountingExportRepository(pool).routeChangeRead(context, "a".repeat(64), "demo-fictional-source"), "EXPORT_FORBIDDEN"],
      [() => new PlatformInvoiceReadRepository(pool).read(context, "a".repeat(64)), "PLATFORM_INVOICE_FORBIDDEN"],
      [() => new VatFixtureRepository(pool).read(context, member.membershipId, randomUUID()), "FORBIDDEN"],
      [() => new NoticeFixtureRepository(pool).read(context, randomUUID(), randomUUID()), "NOT_FOUND"],
      [() => new RetentionRecordRepository(pool).read(context, { sessionDigest: "a".repeat(64) }, randomUUID()), "RETENTION_UNAUTHENTICATED"],
      [() => new PracticeInvoiceRepository(pool).recordReceipt(context, { jobId: randomUUID(), invoiceId: randomUUID(), actorMembershipId: member.membershipId, commandId: randomUUID(), paidOn: "2026-11-07", amountPence: 100, method: "bank_transfer", reference: "Fictional receipt" }), "42501"],
      [() => new FinalAccountLockRepository(pool).acceptTerms(context, { actorMembershipId: member.membershipId, commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" }), "42501"],
    ];
    for (const [call, code] of calls) {
      query.mockClear();
      await expect(call()).rejects.toMatchObject({ code });
      expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "SELECT app.bind_request($1, $2, $3)", "ROLLBACK"]);
    }
    expect(release).toHaveBeenCalledTimes(calls.length);
    expect(PayNowAttemptError.fromDatabase(error).code).toBe(error instanceof RequestBindingRefusedError ? "UNAUTHENTICATED" : "FORBIDDEN");
  },
);
