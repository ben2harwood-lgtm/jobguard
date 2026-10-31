import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSyntheticInvoicePdf, money } from "@jobguard/core";
import { CustomerBillingCommandService } from "../src/customer-billing-repository.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID,
  DEMO_EMPTY_ACCOUNT_ID, DEMO_EMPTY_MEMBERSHIP_ID, DEMO_EMPTY_TENANT_ID } from "../src/demo-seed.js";
import { issuePracticeSession, authenticatePracticeSession } from "../src/practice-session.js";
import { migrate } from "../src/migrate.js";
import { readSyntheticDemo } from "../src/demo-runtime.js";
import { UserCommandDispatcher } from "../src/commands.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool, directory: string;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  directory = await mkdtemp(join(tmpdir(), "jobguard-audit-dbsrc-03-"));
  const port = await freePort(57000, 500);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase("jobguard_synthetic_demo");
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic" , database: "jobguard_synthetic_demo"});
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  for (const [tenant, account, member] of [[DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_MEMBERSHIP_ID], [DEMO_EMPTY_TENANT_ID, DEMO_EMPTY_ACCOUNT_ID, DEMO_EMPTY_MEMBERSHIP_ID]]) {
    await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
    await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional audit workshop')", [account, tenant]);
    await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member, tenant, account, DEMO_IDENTITY_USER_ID]);
  }
  // Disposable cluster only: use the existing restricted runtime role, no GRANT.
  await admin.query("ALTER ROLE jobguard_runtime LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS");
  runtime = new Pool({ host: "127.0.0.1", port, database: "jobguard_synthetic_demo", user: "jobguard_runtime", password: "synthetic" });
}, 60000);
afterAll(async () => {
  vi.unstubAllEnvs(); await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const context = testTenantContext(DEMO_TENANT_ID);
async function invoiceFixture() {
  const jobId = randomUUID(), scope = randomUUID(), quote = randomUUID(), draft = randomUUID(), revision = randomUUID(), hash = "b".repeat(64);
  await admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional invoice audit','live')", [jobId, DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope, DEMO_TENANT_ID, jobId]);
  await admin.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,10000,'accepted')", [quote, DEMO_TENANT_ID, jobId, hash]);
  await admin.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draft, DEMO_TENANT_ID, jobId]);
  await withTenant(runtime, context, db => db.$client.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
    VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',10000,2000,12000,false,'[]')`, [revision, DEMO_TENANT_ID, jobId, draft, hash, quote]));
  await admin.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=1 WHERE tenant_id=$2 AND id=$3", [revision, DEMO_TENANT_ID, draft]);
  const next = Number((await admin.query("SELECT coalesce((SELECT next_number FROM app.customer_invoice_sequence WHERE tenant_id=$1),1) n", [DEMO_TENANT_ID])).rows[0].n);
  const invoiceNumber = `SYN-2026-${String(next).padStart(6, "0")}`;
  const pdf = createSyntheticInvoicePdf({ invoiceNumber, issuerName: "Fictional Builder Ltd", total: money(12000), sourceRevisionId: revision, evidenceVersionIds: [] });
  const service = new CustomerBillingCommandService(runtime);
  const issued = await service.issue(context, { version: "customer-invoice.issue.v1", finalAccountRevisionId: revision, issuedOn: "2026-10-13",
    issuer: { legalName: "Fictional Builder Ltd", address: "1 Fictional Street", vatNumber: null },
    command: { version: "command.v1", commandId: randomUUID(), commandType: "customer_invoice.issue", semanticKey: `invoice:${revision}`,
      actorMembershipId: DEMO_MEMBERSHIP_ID, subjectType: "job", subjectRef: jobId,
      action: { actionType: "final_account.issue", recipient: null, contentHash: createHash("sha256").update(pdf).digest("hex"),
        aggregateRevision: 1, amountPence: 12000, currency: "GBP", policyVersion: "candidate_m1_standard_v1", expiresAt: new Date(Date.now() + 300000) } } });
  return { service, jobId, invoiceId: issued.invoiceId };
}
function credit(f: Awaited<ReturnType<typeof invoiceFixture>>, amountPence: number) {
  const commandId = randomUUID();
  return { version: "customer-credit-note.issue.v1", invoiceId: f.invoiceId, amountPence, reason: "Fictional correction",
    command: { version: "command.v1", commandId, commandType: "customer_credit_note.issue", semanticKey: `credit:${commandId}`,
      actorMembershipId: DEMO_MEMBERSHIP_ID, subjectType: "job", subjectRef: f.jobId,
      action: { actionType: "customer_credit_note.issue", recipient: null, contentHash: "a".repeat(64), aggregateRevision: 0,
        amountPence, currency: "GBP", policyVersion: "candidate_m1_standard_v1", expiresAt: new Date(Date.now() + 300000) } } };
}
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };

it("serializes competing credits against remaining debt", async () => {
  const f = await invoiceFixture(), read = deferred(), secondArrived = deferred(), release = deferred();
  let connection = 0;
  const observed = { connect: async () => {
    const client = await runtime.connect(), number = ++connection;
    return { release: () => client.release(), query: async (sql: string, values?: unknown[]) => {
      if (number === 2 && (sql.includes("pg_advisory_xact_lock") || sql.includes(" credited FROM"))) secondArrived.resolve();
      const result = await client.query(sql, values);
      if (number === 1 && sql.includes(" credited FROM")) { read.resolve(); await release.promise; }
      return result;
    } } as PoolClient;
  } } as unknown as Pool;
  const service = new CustomerBillingCommandService(observed);
  const first = service.credit(context, credit(f, 8000));
  // Attach handlers before waiting so a failure cannot become unhandled.
  const firstResult = first.then(value => ({ status: "fulfilled" as const, value }), reason => ({ status: "rejected" as const, reason }));
  try {
    await Promise.race([read.promise, first.then(() => { throw new Error("First credit completed before its paused balance read"); })]);
    // UUID spelling must not select a different invoice lock.
    const second = service.credit(context, { ...credit(f, 8000), invoiceId: f.invoiceId.toUpperCase() });
    const resultsPromise = Promise.allSettled([first, second]);
    await Promise.race([secondArrived.promise, second.then(() => { throw new Error("Second credit completed before reaching the invoice lock/read"); })]);
    release.resolve();
    const results = await resultsPromise;
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { message: "INVALID_CREDIT_AMOUNT" } });
    const stored = (await admin.query("SELECT count(*)::int n,sum(amount_pence)::int total FROM app.customer_credit_note WHERE tenant_id=$1 AND invoice_id=$2", [DEMO_TENANT_ID, f.invoiceId])).rows[0];
    expect(stored).toEqual({ n: 1, total: 8000 });
    expect(await f.service.balance(context, f.invoiceId)).toMatchObject({ balance: { pence: 4000 } });
  } finally { release.resolve(); await firstResult; }
});

it("command-service credits remain readable", async () => {
  const f = await invoiceFixture(), input = credit(f, 1200), before = (await admin.query("SELECT * FROM app.customer_invoice WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, f.invoiceId])).rows;
  const issued = await f.service.credit(context, input);
  const view = await new PracticeInvoiceRepository(runtime).creditView(context, f.jobId, f.invoiceId);
  expect(view.credits).toHaveLength(1);
  expect(view.credits[0]).toMatchObject({ id: issued.creditNoteId, netPence: -1000, taxPence: -200, totalPence: -1200 });
  expect(view.credits[0]!.netPence + view.credits[0]!.taxPence).toBe(-1200);
  const stored = (await admin.query("SELECT * FROM app.customer_credit_note WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, issued.creditNoteId])).rows[0];
  expect(createHash("sha256").update(stored.pdf_bytes).digest("hex")).toBe(view.credits[0]!.pdfSha256);
  expect(stored.pdf_bytes.toString()).toContain("SYNTHETIC");
  expect(stored.tax_policy_version).toBe("candidate_m1_standard_v1");
  expect(stored.approved_at).toBeInstanceOf(Date);
  expect(stored.source_invoice_hash.trim()).toBe(before[0].pdf_sha256.trim());
  expect((await admin.query("SELECT * FROM app.customer_invoice WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, f.invoiceId])).rows).toEqual(before);
  await expect(f.service.credit(context, input)).resolves.toEqual(issued);
  await expect(new PracticeInvoiceRepository(runtime).creditView(testTenantContext(DEMO_EMPTY_TENANT_ID), f.jobId, f.invoiceId)).rejects.toThrow("INVOICE_NOT_FOUND");
});

it("allows separate receipts sharing a bank reference", async () => {
  const f = await invoiceFixture();
  const receipt = (amountPence: number, paidOn: string) => ({ version: "customer-payment.record.v1", commandId: randomUUID(), actorMembershipId: DEMO_MEMBERSHIP_ID,
    jobId: f.jobId, invoiceId: f.invoiceId, paidOn, amountPence, currency: "GBP", method: "bank_transfer", reference: "INV-100", builderAttestsReceived: true });
  const a = receipt(5000, "2026-10-13"), b = receipt(7000, "2026-10-14");
  const first = await f.service.recordPayment(context, a), second = await f.service.recordPayment(context, b);
  expect(first.paymentId).not.toBe(second.paymentId);
  expect(await f.service.balance(context, f.invoiceId)).toMatchObject({ status: "paid", balance: { pence: 0 } });
  await expect(f.service.recordPayment(context, a)).resolves.toEqual(first);
  await expect(f.service.recordPayment(context, b)).resolves.toEqual(second);
  expect((await admin.query("SELECT count(*)::int n FROM app.customer_payment WHERE tenant_id=$1 AND invoice_id=$2", [DEMO_TENANT_ID, f.invoiceId])).rows[0].n).toBe(2);
  expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='customer_payment.recorded' AND subject_ref=$2", [DEMO_TENANT_ID, f.jobId])).rows[0].n).toBe(2);
  await expect(f.service.recordPayment(context, { ...a, amountPence: 5001 })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
  expect((await admin.query("SELECT count(*)::int n FROM app.customer_payment WHERE tenant_id=$1 AND invoice_id=$2", [DEMO_TENANT_ID, f.invoiceId])).rows[0].n).toBe(2);
});

it("preserves an exact legacy service receipt without rewriting history", async () => {
  const f = await invoiceFixture(), input = { version: "customer-payment.record.v1", commandId: randomUUID(), actorMembershipId: DEMO_MEMBERSHIP_ID,
    jobId: f.jobId, invoiceId: f.invoiceId, paidOn: "2026-10-13", amountPence: 5000, currency: "GBP", method: "bank_transfer", reference: "INV-100", builderAttestsReceived: true };
  const paymentId = randomUUID();
  const original = await new UserCommandDispatcher(runtime).dispatch(context, {
    version: "command.v1", commandId: input.commandId, commandType: "customer_payment.record", semanticKey: `payment:${input.invoiceId}:${input.reference}`,
    actorMembershipId: input.actorMembershipId, subjectType: "job", subjectRef: input.jobId,
    action: { actionType: "customer_payment.record", recipient: null, contentHash: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
      aggregateRevision: 0, amountPence: input.amountPence, currency: "GBP", policyVersion: "manual_receipt_v1", expiresAt: new Date(Date.now() + 300000) },
  }, { mutate: async (db, command) => {
    await db.$client.query(`INSERT INTO app.customer_payment(id,tenant_id,job_id,invoice_id,authorization_id,paid_on,amount_pence,currency,method,reference,builder_attested,provenance)
      VALUES($1,$2,$3,$4,$5,$6,$7,'GBP',$8,$9,true,'manual_builder_attestation')`, [paymentId, DEMO_TENANT_ID, f.jobId, f.invoiceId, command.authorizationId, input.paidOn, input.amountPence, input.method, input.reference]);
    return { paymentId, provenance: "manual_builder_attestation", qualifyingRecoveryProof: false, platformFeeSettlement: false };
  } });
  const before = (await admin.query("SELECT * FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [DEMO_TENANT_ID, input.commandId])).rows;
  await expect(f.service.recordPayment(context, input)).resolves.toEqual(original);
  await expect(f.service.recordPayment(context, { ...input, amountPence: 5001 })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
  expect((await admin.query("SELECT * FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [DEMO_TENANT_ID, input.commandId])).rows).toEqual(before);
  expect((await admin.query("SELECT count(*)::int n FROM app.customer_payment WHERE tenant_id=$1 AND invoice_id=$2", [DEMO_TENANT_ID, f.invoiceId])).rows[0].n).toBe(1);
});

it("home read survives unrelated workspace revocation", async () => {
  const session = await issuePracticeSession(runtime);
  expect((await authenticatePracticeSession(runtime, session)).context.tenantId).toBe(DEMO_TENANT_ID);
  const before = await readSyntheticDemo(runtime);
  expect(before.tenants.map(t => t.id)).toContain(DEMO_EMPTY_TENANT_ID);
  await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [DEMO_EMPTY_TENANT_ID, DEMO_EMPTY_MEMBERSHIP_ID]);
  try {
    const after = await readSyntheticDemo(runtime);
    expect(after.tenant).toEqual(before.tenant);
    expect(after.jobs).toEqual(before.jobs);
    expect(after.tenants).toEqual([after.tenant]);
    await expect(authenticatePracticeSession(runtime, session)).resolves.toMatchObject({ context: { tenantId: DEMO_TENANT_ID } });
    expect((await runtime.query("SELECT id FROM app.job")).rows).toEqual([]);
  } finally { await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2", [DEMO_EMPTY_TENANT_ID, DEMO_EMPTY_MEMBERSHIP_ID]); }
});
