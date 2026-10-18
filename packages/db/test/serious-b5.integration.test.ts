// Dispatcher/CI: these regressions require real PostgreSQL; never start it in the builder sandbox.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { FinalAccountCommandService } from "../src/final-account-repository.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { approvePricedVariation, insertPricedVariation, VariationRepository } from "../src/variation-repository.js";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, prepareActivationFixtureV3 } from "../src/demo-seed.js";
import { PracticeActivationRepository } from "../src/activation-repository.js";
import { migrate } from "../src/migrate.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { addFixtureCapture, asFixtureTenant, closeLockFixture, createLockFixture, LOCK_HASH, LOCK_OWNER, prepareLock, seedAccount, type LockFixture } from "./final-account-lock.integration.test.js";
import { readInvoicePdf } from "./serious-b5-pdf-reader.js";

let f: LockFixture;
const previousEnvironment = process.env.JOBGUARD_ENV;
beforeAll(async () => { f = await createLockFixture(); process.env.JOBGUARD_ENV = "synthetic_demo"; }, 60000);
afterAll(async () => {
 if (previousEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previousEnvironment;
 if (f) await closeLockFixture(f);
});
async function approve(tenantId: string, variationId: string, actor = LOCK_OWNER, pool = f.runtime) {
 return withTenant(pool, testTenantContext(tenantId), async db => {
  const row = (await db.$client.query("SELECT r.* FROM app.variation v JOIN app.variation_revision r ON(r.tenant_id,r.id)=(v.tenant_id,v.current_revision_id) WHERE v.tenant_id=$1 AND v.id=$2", [tenantId, variationId])).rows[0];
  const approval = { id: randomUUID(), revisionId: row.id, revision: row.revision, contentHash: row.content_hash,
   signedDeltaPence: Number(row.signed_delta_pence), method: "builder_attestation" as const, actorMembershipId: actor, evidenceId: null, approvedAt: new Date() };
  await approvePricedVariation(db, tenantId, variationId, approval);
  return { ...row, approvalId: approval.id };
 });
}
async function reprice(tenantId: string, variation: any, pence: number) {
 const id = randomUUID();
 await withTenant(f.runtime, testTenantContext(tenantId), db => insertPricedVariation(db, tenantId, {
  id, variationId: variation.variation_id, revision: variation.revision + 1, previousRevisionId: variation.id,
  scopeItemId: variation.scope_item_id, description: "Fictional repriced extra", quantity: "1", unit: "item",
  unitRatePence: Math.abs(pence), signedDeltaPence: pence, contentHash: "b".repeat(64), confirmedByMembershipId: variation.confirmed_by_membership_id,
  rateProvenance: { kind: "human_entered", sourceRef: "synthetic-b5", sourceHash: LOCK_HASH, rateVersion: "synthetic.v1" }, state: "priced",
 }));
 return id;
}
async function rebuildFixture(a: Awaited<ReturnType<typeof seedAccount>>, approved: any) {
 const revisionId = randomUUID(), hash = randomUUID().replaceAll("-", "").repeat(2);
 await asFixtureTenant(f.admin, a.tenantId, async db => {
  await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
   SELECT $1,tenant_id,job_id,final_account_draft_id,2,id,$2,baseline_quote_version_id,currency,tax_policy_version,15000,3000,18000,false,findings FROM app.final_account_revision WHERE tenant_id=$3 AND id=$4`, [revisionId, hash, a.tenantId, a.revisionId]);
  await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal)
   SELECT gen_random_uuid(),tenant_id,job_id,$1,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal FROM app.final_account_line WHERE tenant_id=$2 AND final_account_revision_id=$3`, [revisionId, a.tenantId, a.revisionId]);
  await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal)
   VALUES(gen_random_uuid(),$1,$2,$3,'variation',$4,$5,$4,$6,$7,$8,2)`, [a.tenantId, a.jobId, revisionId, approved.id, approved.scope_item_id, approved.approvalId, approved.description, approved.signed_delta_pence]);
  await db.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=2 WHERE tenant_id=$2 AND id=$3", [revisionId, a.tenantId, a.draftId]);
 });
 return { revisionId, hash };
}

describe("SERIOUS-B5 final accounts and invoice artifacts", () => {
 it.each(["baseline-only", "approved-variation"] as const)("r1 locks and replays a %s account without SQL alias/record ambiguity", async kind => {
  const a = await seedAccount(f.admin, undefined, 10000), repo = await prepareLock(f, a);
  let input = a.input;
  if (kind === "approved-variation") {
   const variation = await addFixtureCapture(f, a, 5000), approved = await approve(a.tenantId, variation);
   const rebuilt = await rebuildFixture(a, approved);
   input = { ...input, finalAccountRevisionId: rebuilt.revisionId, expectedRevision: 2 };
  }
  const locked = await repo.lock(a.context, input);
  expect(locked).toMatchObject({ tenantId: a.tenantId, jobId: a.jobId, finalAccountRevisionId: input.finalAccountRevisionId, baselineQuoteVersionId: a.baselineId });
  expect((await repo.read(a.context, a.jobId)).lock).toEqual(locked);
  expect(await repo.lock(a.context, input)).toEqual(locked);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0].n).toBe(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [a.tenantId, input.commandId])).rows[0].n).toBe(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='final_account.locked'", [a.tenantId])).rows[0].n).toBe(1);
 });

 it("S15 pending repricing retains the last approved revision, including an omission, until replacement approval", async () => {
  await seedAccount(f.admin, DEMO_TENANT_ID, 10000);
  await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING", [DEMO_IDENTITY_USER_ID]);
  await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) SELECT $1,tenant_id,account_id,$2,'owner' FROM app.membership WHERE tenant_id=$3 AND id=$4 ON CONFLICT DO NOTHING", [DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID, DEMO_TENANT_ID, LOCK_OWNER]);
  const context = testTenantContext(DEMO_TENANT_ID), service = new FinalAccountCommandService(f.runtime);
  const jobId = await prepareActivationFixtureV3(f.admin, context, "Fictional B5 baseline", 10000, f.runtime);
  await new PracticeActivationRepository(f.runtime).start(context, jobId, { commandId: randomUUID(), scenario: "no_charge" });
  const variationId = randomUUID();
  await new VariationRepository(f.runtime).logBuilderExtra(context, { version: "log-builder-extra.v1", actorMembershipId: DEMO_MEMBERSHIP_ID,
   proposal: { version: "variation-proposal.v1", id: variationId, jobId, scopeItemId: randomUUID(), existingScopeItemId: null, lineageParentScopeItemId: null, captureKind: "text", captureText: "Fictional extra", description: "Fictional extra", suggestion: null },
   price: { quantity: "1", unit: "item", unitRatePence: 5000, direction: "addition", confirmedByMembershipId: DEMO_MEMBERSHIP_ID, rateProvenance: { kind: "human_entered", sourceRef: "synthetic-b5", sourceHash: LOCK_HASH, rateVersion: "synthetic.v1" } }, deviceId: null, deviceCapturedAt: null });
  const first = await approve(DEMO_TENANT_ID, variationId, DEMO_MEMBERSHIP_ID);
  const build = () => service.assemble(context, { version: "final-account.assemble.v1", commandId: randomUUID(), jobId, actorMembershipId: DEMO_MEMBERSHIP_ID });
  expect((await build()).totals.net.pence).toBe(15000);
  const nextId = await reprice(DEMO_TENANT_ID, first, 7000), pending = await build();
  expect(pending.totals.net.pence).toBe(15000);
  expect(pending.lines.filter(l => l.kind === "variation")).toMatchObject([{ sourceId: first.id, approvalId: first.approvalId, netPence: 5000 }]);
  expect((await service.read(context, jobId))?.pending).toMatchObject([{ sourceId: nextId, netPence: 7000 }]);
  const next = await approve(DEMO_TENANT_ID, variationId, DEMO_MEMBERSHIP_ID);
  expect((await build()).totals.net.pence).toBe(17000);
  await reprice(DEMO_TENANT_ID, next, -2000);
  await approve(DEMO_TENANT_ID, variationId, DEMO_MEMBERSHIP_ID);
  expect((await build()).totals.net.pence).toBe(8000);
  const omission = (await f.admin.query("SELECT r.* FROM app.variation_revision r JOIN app.variation v ON v.tenant_id=r.tenant_id AND v.current_revision_id=r.id WHERE v.tenant_id=$1 AND v.id=$2", [DEMO_TENANT_ID, variationId])).rows[0];
  await reprice(DEMO_TENANT_ID, omission, 3000);
  expect((await build()).totals.net.pence).toBe(8000);
 });

 it("S16 rejects approvals added after assembly with no lock, receipt or audit effects, then accepts a rebuilt account", async () => {
  const a = await seedAccount(f.admin, undefined, 10000), repo = await prepareLock(f, a);
  const variation = await addFixtureCapture(f, a, 5000), approved = await approve(a.tenantId, variation);
  const auditBefore = (await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [a.tenantId])).rows[0].n;
  await expect(repo.lock(a.context, a.input)).rejects.toMatchObject({ code: "STALE_REVISION" });
  await expect(asFixtureTenant(f.runtime, a.tenantId, db => db.query("SELECT app.lock_final_account($1,$2,$3,$4,$5,$6,$7)", [a.tenantId,a.jobId,LOCK_OWNER,a.input.commandId,a.revisionId,1,a.input.declarationVersion]))).rejects.toThrow("STALE_OR_BLOCKED_FINAL_ACCOUNT");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(0);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [a.tenantId,a.input.commandId])).rows[0].n).toBe(0);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(auditBefore);
  const rebuilt = await rebuildFixture(a, approved);
  // Pending price changes do not supersede the immutable approved commercial source.
  await reprice(a.tenantId, approved, 7000);
  const input = { ...a.input, finalAccountRevisionId: rebuilt.revisionId, expectedRevision: 2 };
  const locked = await repo.lock(a.context, input);
  expect(await repo.lock(a.context, input)).toEqual(locked);
 });

 it("S16 a lock waiting on concurrent approval rechecks committed sources before writing", async () => {
  const a = await seedAccount(f.admin, undefined, 10000), repo = await prepareLock(f, a);
  const variation = await addFixtureCapture(f, a, 5000);
  let entered!: () => void, resume!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { resume = resolve; });
  const delayed = { connect: async () => {
   const client = await f.runtime.connect();
   return { release: () => client.release(), query: async (sql: string, values?: unknown[]) => {
    if (sql === "COMMIT") { entered(); await gate; }
    return client.query(sql, values);
   } };
  } } as unknown as Pool;
  const approving = approve(a.tenantId, variation, LOCK_OWNER, delayed);
  await ready;
  const locking = expect(repo.lock(a.context, a.input)).rejects.toMatchObject({ code: "STALE_REVISION" });
  try {
   let waiting = false;
   for (let attempt = 0; attempt < 100; attempt++) {
    const rows = (await f.admin.query("SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%FROM app.lock_final_account(%'")).rows;
    if (rows.length) { waiting = true; break; }
    await new Promise(resolve => setTimeout(resolve, 10));
   }
   expect(waiting, "lock must wait for the uncommitted variation approval").toBe(true);
  } finally { resume(); await approving; await locking; }
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(0);
 });

 it.each(["legacy", "lock-bound"] as const)("S17 %s issue stores a readable PDF whose bytes, authorization, outbox and receipt share the digest", async kind => {
  const a = await seedAccount(f.admin, undefined, 10000), invoices = new PracticeInvoiceRepository(f.runtime);
  // Zero-valued fixture lines exercise pagination and escaping without changing approved totals.
  await asFixtureTenant(f.admin, a.tenantId, async db => {
   for (let n = 1; n <= 75; n++) await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
    VALUES(gen_random_uuid(),$1,$2,$3,'baseline',$4,$5,$6,$7,0,$8)`, [a.tenantId,a.jobId,a.revisionId,randomUUID(),a.scopeItemId,a.baselineId,`Fictional row ${n} (brackets) \\ literal`,n+1]);
  });
  const input = { jobId: a.jobId, finalAccountRevisionId: a.revisionId, actorMembershipId: LOCK_OWNER, commandId: randomUUID(), recipient: "practice-customer@example.invalid", issuedOn: "2026-10-16" };
  if (kind === "legacy") await invoices.issue(a.context, input);
  else {
   const repo = await prepareLock(f, a); await repo.lock(a.context, a.input);
   const lockRow = (await f.admin.query("SELECT id,locked_at::text cutoff FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2", [a.tenantId,a.jobId])).rows[0];
   await asFixtureTenant(f.shadow, a.tenantId, db => db.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status) VALUES($1,$2,$3,$4,$5::timestamptz,'completed')", [a.tenantId,a.jobId,randomUUID(),lockRow.id,lockRow.cutoff]));
   await repo.issueInvoice(a.context, { ...input, expectedSourceHash: LOCK_HASH, invoiceKind: "final" });
  }
  const saved = (await f.admin.query("SELECT * FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2", [a.tenantId,a.jobId])).rows[0];
  const bytes = await invoices.artifact(a.context, a.jobId, saved.id);
  expect(bytes).toEqual(saved.pdf_bytes);
  const parsed = readInvoicePdf(bytes!);
  expect(parsed.pages).toBeGreaterThan(1);
  expect(parsed.text).toContain("Fictional row 75 (brackets) \\ literal");
  expect(parsed.text).toContain(saved.invoice_number);
  expect(parsed.text).toContain("Not a real tax invoice");
  expect(parsed.text).toContain("nothing is sent or charged");
  expect(parsed.text).toContain("Fictional baseline");
  const digest = createHash("sha256").update(bytes!).digest("hex");
  expect(saved.pdf_sha256.trim()).toBe(digest);
  expect((await f.admin.query("SELECT content_hash FROM app.action_authorization WHERE tenant_id=$1 AND id=$2", [a.tenantId,saved.authorization_id])).rows[0].content_hash.trim()).toBe(digest);
  const outbox = (await f.admin.query("SELECT content_hash,immutable_content FROM app.action_outbox WHERE tenant_id=$1 AND authorization_id=$2", [a.tenantId,saved.authorization_id])).rows[0];
  expect(outbox.content_hash.trim()).toBe(digest);
  expect(Buffer.from(outbox.immutable_content, "utf8")).toEqual(bytes);
  expect((await f.admin.query("SELECT result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [a.tenantId,input.commandId])).rows[0].result.pdfSha256).toBe(digest);
  // Existing saved artifacts are immutable: rerunning the migration never regenerates them.
  await migrate(f.admin);
  expect(await invoices.artifact(a.context, a.jobId, saved.id)).toEqual(bytes);
 });
});
