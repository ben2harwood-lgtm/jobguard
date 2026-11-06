import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it } from "vitest";
import { type PlatformInvoiceDocument, type PlatformInvoiceIssueCommand, type PlatformInvoiceProfile } from "@jobguard/core";
import { PlatformTaxInvoiceFixtureRepository } from "../src/platform-tax-invoice-fixture-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { feeHash, feeSourceFixture } from "./platform-tax-invoice-fee-fixtures.js";
function setup() {
  const tenantId = randomUUID(), actorId = randomUUID(), issuerId = randomUUID(), context = testTenantContext(tenantId);
  const source = feeSourceFixture(randomUUID());
  const profile: PlatformInvoiceProfile = { version: "platform-invoice-profile.v1", tenantId, issuerId, name: "JobGuard fictional issuer",
    address: "Fictional address — simulation only", vatRegistration: "SIMULATION-NOT-REGISTERED", environment: "synthetic_demo" };
  const command: PlatformInvoiceIssueCommand = { version: "platform-invoice-issue.v1", environment: "synthetic_demo", commandId: randomUUID(),
    issuerId, actorMembershipId: actorId, kind: "invoice", originalNumber: null, taxPolicy: "D02-pending-approval-example",
    lines: [{ id: randomUUID(), sourceKind: "success_fee", sourceId: source.id, expectedSourceHash: source.document_hash, taxPence: 640 }] };
  const history: { document: PlatformInvoiceDocument; request_hash: string }[] = [], queries: string[] = [];
  const state = { source: source as typeof source | undefined, attempts: [] as unknown[] };
  // Protocol double only: real SQL predicates, RLS, privileges and uniqueness are CI integration assertions.
  const pool = { connect: async () => ({ release() {}, async query(sql: string, args?: unknown[]) {
    queries.push(sql);
    if (sql.includes("SELECT profile")) return { rows: [{ profile }] };
    if (sql.includes("SELECT document,request_hash")) return { rows: history };
    if (sql.includes("FROM app.platform_fee_statement s")) return { rows: state.source ? [state.source] : [] };
    if (sql.includes("FROM app.platform_fee_attempt a")) return { rows: state.attempts };
    if (sql.includes("mon1_company_actor")) return { rows: [{ id: actorId }] };
    if (sql.includes("INSERT INTO app.platform_invoice_document")) history.push({ document: JSON.parse(args![9] as string), request_hash: args![4] as string });
    return { rows: [{ id: actorId }], rowCount: 1 };
  } }) } as unknown as Pool;
  const repo = new PlatformTaxInvoiceFixtureRepository(pool);
  return { source, state, command, queries, issue: (raw: unknown = command) => repo.issue(context, "a".repeat(64), profile, raw) };
}
it("uses stored document principal, not cumulative principal; preserves every proof source and starts no collection", async () => {
  const t = setup(), invoice = await t.issue(), trace = invoice.request.lines[0]!.provenance;
  expect(invoice.principalPence).toBe(3200); expect(invoice.collectionStarted).toBe(false);
  expect(trace).toMatchObject({ kind: "success_fee", level: "statement", sourceSnapshot: t.source.document.sourceSnapshot,
    approval: { id: t.source.approval_id, hash: t.source.document_hash }, priorSettlements: { state: "none_recorded" } });
  expect(JSON.stringify(trace)).not.toContain("integration_unavailable");
  expect(t.queries.some(q => /INSERT INTO app.platform_fee_attempt|write_platform_fee_collection/u.test(q))).toBe(false);
});
it("rejects missing, changed, corrupted and wrong-job documents and nonpositive corrections", async () => {
  for (const change of [undefined, { document_hash: "b".repeat(64) }, { recomputed_hash: "b".repeat(64) },
    { snapshot_hash: "b".repeat(64) }, { job_id: randomUUID() }, { document: { ...setup().source.document, documentPrincipal: { pence: -1, currency: "GBP" } } }]) {
    const t = setup(); t.state.source = change === undefined ? undefined : { ...t.source, ...change };
    await expect(t.issue()).rejects.toThrow("PLATFORM_INVOICE_SOURCE_UNAVAILABLE");
  }
});
it("records attempt events and retains the original trace on replay and full remaining credit", async () => {
  const t = setup(); t.state.attempts = [{ id: randomUUID(), authorization_id: randomUUID(), kind: "collection", amount_pence: "1000",
    events: [{ revision: 1, state: "pending" }, { revision: 2, state: "settled" }] }];
  const invoice = await t.issue(); expect(invoice.request.lines[0]!.provenance).toMatchObject({ priorSettlements: { state: "recorded", attempts: [{ amountPence: 1000 }] } });
  t.state.attempts = []; expect(await t.issue()).toEqual(invoice);
  const credit = { ...t.command, commandId: randomUUID(), kind: "credit_note", originalNumber: invoice.number };
  const note = await t.issue(credit); expect(note.principalPence).toBe(3200);
  expect(note.request.lines[0]!.provenance).toEqual(invoice.request.lines[0]!.provenance);
  expect(await t.issue(credit)).toEqual(note);
  await expect(t.issue({ ...t.command, commandId: randomUUID() })).rejects.toThrow("PLATFORM_INVOICE_CONFLICT");
  await expect(t.issue({ ...credit, commandId: randomUUID() })).rejects.toThrow("PLATFORM_INVOICE_LIMIT");
});
it("refuses caller principal, proof, approval and payment references, including on replay", async () => {
  const t = setup(); await t.issue();
  for (const patch of [{ principalPence: 1 }, { proof: randomUUID() }, { approval: randomUUID() }, { payment: randomUUID() }, { provenance: t.source.document.sourceSnapshot }])
    await expect(t.issue({ ...t.command, lines: [{ ...t.command.lines[0], ...patch }] })).rejects.toThrow("INVALID_PLATFORM_INVOICE");
});
it("revalidates stored source and persisted actor on replay", async () => {
  const t = setup(); await t.issue();
  await expect(t.issue({ ...t.command, actorMembershipId: randomUUID(), commandId: randomUUID() })).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
  t.state.source = undefined;
  await expect(t.issue()).rejects.toThrow("PLATFORM_INVOICE_SOURCE_UNAVAILABLE");
});
it("refuses nonpositive statement corrections and bank metadata even with recomputed stored hashes", async () => {
  for (const amount of [0, -3200]) {
    const t = setup(); t.source.document = structuredClone(t.source.document);
    Object.assign(t.source.document.documentPrincipal, { pence: amount });
    t.source.document_hash = t.source.recomputed_hash = feeHash(t.source.document);
    t.command.lines[0]!.expectedSourceHash = t.source.document_hash;
    await expect(t.issue()).rejects.toThrow("PLATFORM_INVOICE_SOURCE_UNAVAILABLE");
  }
  const t = setup(); Object.assign(t.source.document.sourceSnapshot.sources[0]!, { bankAccount: "private synthetic value" });
  t.source.document_hash = t.source.recomputed_hash = feeHash(t.source.document);
  t.source.source_hash = t.source.snapshot_hash = feeHash(t.source.document.sourceSnapshot);
  t.command.lines[0]!.expectedSourceHash = t.source.document_hash;
  await expect(t.issue()).rejects.toThrow("PLATFORM_INVOICE_SOURCE_UNAVAILABLE");
});
