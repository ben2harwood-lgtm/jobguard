import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MIGRATION_URLS, migrate, withTenant, requireLiveJob, JobRepository,
  PurchaseOrderRepository, SupplierDocumentRepository, SupplierMatchRepository,
  DiscrepancyRepository, ReadinessRepository, InboxRelevanceRepository,
  EvidenceService, ProofCommandService, MaterialRepository, JobPartiesRepository, type VerifiedTenantContext,
} from "../src/index.js";
import type { PrivateVersionedStorage } from "@jobguard/storage";
import { watchdogCommandGuards } from "@jobguard/core";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { closeTestPools } from "./pool-test-utils.js";

const tenant = randomUUID(), otherTenant = randomUUID(), member = randomUUID();
const context = { tenantId: tenant } as VerifiedTenantContext;
const states = ["draft", "quoting", "accepted", "invoiced", "paid", "lost"];
const legacy = Object.fromEntries(states.map(status => [status, { jobId: randomUUID(), uploadId: randomUUID() }]));
const tables = ["purchase_order_draft", "purchase_order_revision", "purchase_order_placement", "supplier_document", "supplier_document_version", "supplier_document_intake", "goods_receipt", "supplier_fact_proposal", "supplier_fact_revision", "supplier_match_proposal", "supplier_match_revision", "supplier_match_allocation", "discrepancy_finding_revision", "discrepancy_review_outcome", "supplier_bill_supersession", "planned_work_revision", "readiness_snapshot", "readiness_decision", "inbox_finding_revision", "inbox_decision_revision", "inbox_outcome_event", "evidence_upload", "evidence_object", "evidence_link", "synthetic_evidence_original", "stage_completion", "watchdog_command_identity"];
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const storage: PrivateVersionedStorage = {
  async createUploadUrl() { return "https://generated.invalid/upload"; },
  async createDownloadUrl() { return "https://generated.invalid/download"; },
  async readExactVersion() { throw new Error("No original in this negative-path fixture"); },
  async deleteExactVersion() {},
};
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jg-ch2-"));
  const port = 60400 + Math.floor(Math.random() * 100);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", max: 4 });
  // Upgrade fixture: these rows existed in the preceding supported schema, where
  // proof uploads were possible before/after live. No guard is bypassed/disabled.
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  const watchdogMigration = MIGRATION_URLS.find(url => url.pathname.endsWith("_watchdog_live.sql"))!;
  for (const url of MIGRATION_URLS.filter(url => basename(fileURLToPath(url)) < basename(fileURLToPath(watchdogMigration)))) { // the schema before CH-2, whatever its number
    await admin.query(await readFile(url, "utf8"));
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)", [basename(fileURLToPath(url))]);
  }
  await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1),($2)", [tenant, otherTenant]);
  const user = randomUUID(), account = randomUUID();
  await admin.query("INSERT INTO identity.identity_user(id)VALUES($1)", [user]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'Fictional builder')", [account, tenant]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$3,$4,'owner')", [member, tenant, account, user]);
  for (const status of states) {
    const ids = legacy[status]!;
    await admin.query("INSERT INTO app.job(id,tenant_id,title,status)VALUES($1,$2,'Legacy fictional job',$3)", [ids.jobId, tenant, status]);
    await admin.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)VALUES($1,$2,$3,$4,repeat('a',64),'image/png',100,'standard_evidence','2099-01-01')", [ids.uploadId, tenant, ids.jobId, `legacy/${ids.uploadId}`]);
  }
  await migrate(admin); await migrate(admin);
  await admin.query("CREATE ROLE ch2_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO ch2_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "ch2_login", password: "synthetic", max: 4 });
}, 60000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

function attempts(jobId: string, uploadId: string) {
  const id = randomUUID(), commandId = randomUUID();
  const po = new PurchaseOrderRepository(runtime), docs = new SupplierDocumentRepository(runtime), match = new SupplierMatchRepository(runtime), checks = new DiscrepancyRepository(runtime), ready = new ReadinessRepository(runtime), inbox = new InboxRelevanceRepository(runtime), evidence = new EvidenceService(runtime, storage), proof = new ProofCommandService(runtime, storage);
  return [
    ["revise", () => po.revise(context, jobId, { version: "purchase-order-draft.v1", requirementId: id, quantity: "10", unitPricePence: 2000, recipient: "orders@fictional.invalid", requiredDate: "2026-10-01", expectedRevision: 0 })],
    ["place", () => po.place(context, jobId, { version: "command.v1", commandId, commandType: "purchase_order.simulate", semanticKey: `order:${commandId}`, actorMembershipId: member, subjectType: "purchase_order", subjectRef: id, action: { actionType: "purchase_order.simulate", recipient: "orders@fictional.invalid", contentHash: "a".repeat(64), aggregateRevision: 1, amountPence: 20000, currency: "GBP", policyVersion: "synthetic-po.v1", expiresAt: new Date("2099-01-01") } })],
    ["intake", () => docs.intake(context, jobId, { version: "supplier-document-intake.v1", fixtureId: "materials-B-invoice", channel: "picker", expectedRevision: 0 })],
    ["appendReceipt", () => docs.appendReceipt(context, jobId, { accepted: "1", rejected: "0", expectedRevision: 0 })],
    ["confirm", () => docs.confirm(context, jobId, { version: "supplier-fact-correction.v1", documentId: id, commandId, documentType: "invoice", quantity: "10", unitPricePence: 2500, netPence: 25000, expectedRevision: 0 })],
    ["create", () => match.create(context, jobId, { commandId, expectedRevision: 0 })],
    ["correct", () => match.correct(context, jobId, { version: "supplier-match-correction.v1", proposalId: id, commandId, expectedRevision: 0, billVersionId: id, orderVersionId: id, receiptVersionIds: [id], allocations: [{ receiptVersionId: id, quantity: "8" }] })],
    ["evaluate", () => checks.evaluate(context, jobId, { commandId, ruleRevision: "supplier-overcharge.v1" })],
    ["review", () => checks.review(context, jobId, { commandId, findingId: id, expectedRevision: 0, outcome: "dismissed", reason: "Fictional check" })],
    ["supersede", () => checks.supersede(context, jobId, { commandId, originalFactRevisionId: id, replacementFactRevisionId: randomUUID(), expectedRevision: 0 })],
    ["record", () => ready.record(context, jobId, { commandId, scenarioNow: "2026-03-27T09:00:00.000Z" })],
    ["advance", () => ready.advance(context, jobId, { commandId, scenarioNow: "2026-03-30T08:00:00.000Z" })],
    ["seed", () => inbox.seed(context, jobId, commandId, member)],
    ["dismiss", () => inbox.dismiss(context, jobId, id, { commandId }, member)],
    ["beginUpload", () => evidence.beginUpload(context, { id: commandId, jobId, expectedSha256: "a".repeat(64), contentType: "image/png", maximumBytes: 100, expiresAt: new Date("2099-01-01") })],
    ["finalize", () => evidence.finalize(context, { uploadId, objectVersionId: "fictional-v1", evidenceType: "electrical_certificate" })],
    ["complete", () => proof.complete(context, { version: "proof.complete.v1", commandId, actorMembershipId: member, jobId, scopeItemId: id, stage: "electrical-stage", evidenceId: id, requiredEvidenceType: "electrical_certificate", decisionId: null })],
  ] as const;
}
async function counts() {
  const result: Record<string, number> = {};
  for (const table of [...tables, "audit_event", "action_outbox", "command_receipt", "decision_resolution", "action_authorization"]) result[table] = Number((await admin.query(`SELECT count(*) n FROM app.${table}`)).rows[0].n);
  return result;
}
describe("CH-2 actual PostgreSQL enforcement", () => {
  it.each(states)("every guarded command refuses %s atomically", async status => {
    const ids = legacy[status]!, before = await counts(), commands = attempts(ids.jobId, ids.uploadId);
    expect(commands.map(([name]) => name)).toEqual(watchdogCommandGuards.map(entry => entry.method));
    for (const [name, invoke] of commands) await expect(invoke(), name).rejects.toMatchObject({ code: "JOB_NOT_LIVE" });
    expect(await counts()).toEqual(before);
    expect((await admin.query("SELECT state,object_version_id FROM app.evidence_upload WHERE id=$1", [ids.uploadId])).rows[0]).toEqual({ state: "pending", object_version_id: null });
  });
  it.each(tables)("direct runtime insert into %s cannot bypass the guard", async table => {
    for (const status of states) await expect(withTenant(runtime, context, db => db.$client.query(`INSERT INTO app.${table}(tenant_id,job_id)VALUES($1,$2)`, [tenant, legacy[status]!.jobId]))).rejects.toThrow("JOB_NOT_LIVE");
  });
  it("catalogs restrict the helper, triggers, roles and locking reads", async () => {
    const fn = (await admin.query("SELECT p.prosecdef,p.proconfig,r.rolname,p.proacl::text acl FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='app.require_watchdog_live(uuid)'::regprocedure")).rows[0];
    expect(fn).toMatchObject({ prosecdef: true, rolname: "jobguard_migration" });
    expect(fn.proconfig).toContain("search_path=pg_catalog, app");
    expect(fn.acl).toContain("jobguard_runtime=X/"); expect(fn.acl).not.toMatch(/(?:\{|,)=/u); // PUBLIC is absent (checked separately below).
    expect((await admin.query("SELECT has_function_privilege('jobguard_runtime','app.require_watchdog_live(uuid)','EXECUTE') runtime,has_function_privilege('jobguard_infrastructure','app.require_watchdog_live(uuid)','EXECUTE') infrastructure")).rows[0]).toEqual({ runtime: true, infrastructure: false });
    const role=(await admin.query("SELECT rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname='jobguard_runtime'")).rows[0];
    expect(role).toEqual({rolsuper:false,rolbypassrls:false,rolcreaterole:false});
    const protectedTables=await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='app' AND c.relname=ANY($1::text[])",[tables]);
    expect(protectedTables.rows).toHaveLength(tables.length);
    expect(protectedTables.rows.every(row=>row.relrowsecurity&&row.relforcerowsecurity&&row.rolname==='jobguard_migration')).toBe(true);
    expect((await admin.query("SELECT has_column_privilege('jobguard_runtime','app.evidence_upload','job_id','UPDATE') identity_edit,has_column_privilege('jobguard_runtime','app.evidence_upload','state','UPDATE') lifecycle_update")).rows[0]).toEqual({identity_edit:false,lifecycle_update:true});
    // Command identities and stored results are append-only for the runtime: select and insert, nothing else.
    for (const table of ["watchdog_command_identity", "watchdog_command_result", "proof_application_response"]) {
      const privilege = (role: string, kind: string) => `has_table_privilege('${role}','app.${table}','${kind}')`;
      expect((await admin.query(`SELECT ${privilege("jobguard_runtime", "SELECT")} s,${privilege("jobguard_runtime", "INSERT")} i,${privilege("jobguard_runtime", "UPDATE")} u,${privilege("jobguard_runtime", "DELETE")} d,${privilege("jobguard_runtime", "TRUNCATE")} t,${privilege("jobguard_infrastructure", "SELECT")} infra`)).rows[0]).toEqual({ s: true, i: true, u: false, d: false, t: false, infra: false });
    }
    const constraints=["purchase_order_requirement_job_fk","evidence_upload_job_fk","evidence_upload_scope_job_fk","evidence_object_job_fk","evidence_object_scope_job_fk","evidence_object_upload_job_fk","evidence_object_original_job_fk","evidence_link_evidence_job_fk","stage_completion_evidence_job_fk","synthetic_original_upload_job_fk"];
    const checked=await admin.query("SELECT conname,convalidated FROM pg_constraint WHERE conname=ANY($1::text[])",[constraints]);
    expect(checked.rows).toHaveLength(constraints.length);expect(checked.rows.every(row=>row.convalidated)).toBe(true);
    const triggers = await admin.query("SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname='a_watchdog_live_before_insert'");
    expect(triggers.rows.map(r => r.relname).sort()).toEqual([...tables].sort());
    await expect(runtime.query("SELECT app.require_watchdog_live($1)", [legacy.draft!.jobId])).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(runtime, { tenantId: otherTenant } as VerifiedTenantContext, db => requireLiveJob(db, legacy.draft!.jobId))).rejects.toMatchObject({ code: "JOB_NOT_FOUND" });
    for (const lock of ["SHARE", "UPDATE"]) await expect(withTenant(runtime, context, db => db.$client.query(`SELECT id FROM app.job WHERE id=$1 FOR ${lock}`, [legacy.draft!.jobId]))).rejects.toMatchObject({ code: "42501" });
  });
  it("rejects forged cross-job source links, recovery exceptions, and direct finalisation", async () => {
    const liveId=randomUUID(); await importWatchdogFixtureJob(admin,tenant,liveId);
    const oldJob=legacy.draft!.jobId,scopeId=randomUUID();
    await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')",[scopeId,tenant,oldJob]);
    const uploadId=randomUUID();
    await expect(withTenant(runtime,context,db=>db.$client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)VALUES($1,$2,$3,$4,$5,repeat('a',64),'image/png',100,'standard_evidence','2099-01-01')",[uploadId,tenant,liveId,scopeId,`wrong/${uploadId}`]))).rejects.toMatchObject({code:"23503"});
    await expect(withTenant(runtime,context,db=>db.$client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)VALUES($1,$2,$3,'synthetic/recovery/forged',repeat('a',64),'application/pdf',100,'standard_evidence','verified','forged-v1',now(),'2099-01-01')",[randomUUID(),tenant,oldJob]))).rejects.toThrow("JOB_NOT_LIVE");
    await expect(withTenant(runtime,context,db=>db.$client.query("UPDATE app.evidence_upload SET state='verified',object_version_id='forged',server_verified_at=now() WHERE tenant_id=$1 AND id=$2",[tenant,legacy.draft!.uploadId]))).rejects.toThrow("JOB_NOT_LIVE");
    await expect(withTenant(runtime,context,db=>db.$client.query("UPDATE app.evidence_upload SET job_id=$1 WHERE id=$2",[liveId,legacy.draft!.uploadId]))).rejects.toMatchObject({code:"42501"});
    // UPDATE(id) stays granted for beginUpload's idempotent upsert (a no-op "SET id=EXCLUDED.id"); the guard makes a real change impossible.
    await expect(withTenant(runtime,context,db=>db.$client.query("UPDATE app.evidence_upload SET id=$1 WHERE id=$2",[randomUUID(),legacy.draft!.uploadId]))).rejects.toMatchObject({code:"42501"});
    expect((await admin.query("SELECT count(*)::int n FROM app.evidence_upload WHERE id=$1",[legacy.draft!.uploadId])).rows[0].n).toBe(1);
    const materials=new MaterialRepository(runtime),rate=await materials.addRate(context,{merchantName:"Fictional merchant",sku:`CH2-${liveId}`,description:"Fictional item",pricePence:2000,priceUnit:"each",taxBasis:"net",effectiveFrom:"2026-09-20",sourceLabel:"CH-2",expectedVersion:0});
    const requirement=await materials.addRequirement(context,{jobId:oldJob,scopeItemId:scopeId,skuId:rate.skuId,quantity:"10",unit:"each",expectedRevision:0});
    await expect(withTenant(runtime,context,db=>db.$client.query("INSERT INTO app.purchase_order_draft(id,tenant_id,job_id,requirement_id)VALUES($1,$2,$3,$4)",[randomUUID(),tenant,liveId,requirement.id]))).rejects.toMatchObject({code:"23503"});
  });
  it("imports at live accept inputs; invoiced imports reject them and reads survive exit", async () => {
    const liveId = randomUUID(), billedId = randomUUID();
    await importWatchdogFixtureJob(admin, tenant, liveId);
    await importWatchdogFixtureJob(admin, tenant, billedId, "Fictional billed job", "invoiced");
    const repo = new ReadinessRepository(runtime), commandId = randomUUID(), input = { commandId, scenarioNow: "2026-03-27T09:00:00.000Z" };
    await expect(repo.record(context, billedId, input)).rejects.toMatchObject({ code: "JOB_NOT_LIVE" });
    const first = await repo.record(context, liveId, input);
    expect(await repo.record(context, liveId, input)).toEqual(first);
    await expect(repo.record(context, liveId, { ...input, resolved: true })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await new JobRepository(runtime).transition(context, ["job:update"], { jobId: liveId, expectedRevision: 1, to: "invoiced", reason: "issue_invoice" });
    expect(await repo.view(context, liveId)).toEqual(first);
    await expect(repo.advance(context, liveId, { commandId: randomUUID(), scenarioNow: "2026-03-30T08:00:00.000Z" })).rejects.toMatchObject({ code: "JOB_NOT_LIVE" });
  });
  it("round 16: live party corrections preserve the imported binding and allow watchdog inputs before and after", async () => {
    const jobId = randomUUID(); await importWatchdogFixtureJob(admin, tenant, jobId);
    const baseline = (await admin.query("SELECT party_binding_id,attested_by_membership_id FROM app.imported_job_baseline WHERE tenant_id=$1 AND job_id=$2", [tenant, jobId])).rows[0];
    const parties = new JobPartiesRepository(runtime), readiness = new ReadinessRepository(runtime);
    const before = await parties.view(context, baseline.attested_by_membership_id, jobId);
    expect(before).toMatchObject({ status: "live", jobRevision: 1, currentIds: { bindingId: baseline.party_binding_id } });
    expect(before.current).not.toBeNull();
    const input = { commandId: randomUUID(), scenarioNow: "2026-03-27T09:00:00.000Z" };
    const first = await readiness.record(context, jobId, input);
    const correction = { version: "job-parties-command.v1", commandId: randomUUID(), action: "correct", expectedJobRevision: before.jobRevision,
      reason: "Fictional correction confirmed for the site", parties: { version: "job-parties.v1", customerRevisionId: before.current!.customerRevisionId,
        payingPartyRevisionId: before.current!.payingPartyRevisionId, siteRevisionId: before.current!.siteRevisionId } };
    const corrected = await parties.command(context, baseline.attested_by_membership_id, jobId, correction);
    expect(await parties.command(context, baseline.attested_by_membership_id, jobId, correction)).toEqual(corrected);
    const after = await parties.view(context, baseline.attested_by_membership_id, jobId);
    expect(after).toMatchObject({ status: "live", jobRevision: 2, currentIds: { bindingId: corrected.id } });
    expect(after.currentIds!.bindingId).not.toBe(baseline.party_binding_id);
    expect((await admin.query("SELECT party_binding_id FROM app.imported_job_baseline WHERE tenant_id=$1 AND job_id=$2", [tenant, jobId])).rows[0].party_binding_id).toBe(baseline.party_binding_id);
    expect(await readiness.record(context, jobId, input)).toEqual(first);
    const second = await readiness.record(context, jobId, { ...input, commandId: randomUUID(), resolved: true });
    expect(second.snapshot).toMatchObject({ revision: 2, ready: true });
    expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='job.parties.correct'", [tenant, jobId])).rows[0].n).toBe(1);
  });
  it("holds the first business lock until commit; both race orders serialize", async () => {
    for (const commandFirst of [true, false]) {
      const jobId = randomUUID(); await importWatchdogFixtureJob(admin, tenant, jobId);
      const a = await runtime.connect(), b = await runtime.connect();
      try {
        await a.query("BEGIN"); await b.query("BEGIN");
        await a.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]); await b.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
        if (commandFirst) {
          await a.query("SELECT app.require_watchdog_live($1)", [jobId]);
          let finished = false;
          const exiting = b.query("SELECT app.transition_job($1,$2,1,'invoiced','issue_invoice',NULL,NULL,NULL,NULL)", [tenant, jobId]).then(() => { finished = true; });
          await a.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,content_hash,status)VALUES($1,$2,$3,'fictional','invoice',repeat('a',64),'ready')", [randomUUID(), tenant, jobId]);
          expect(finished).toBe(false); await a.query("COMMIT"); await exiting; await b.query("COMMIT");
        } else {
          await b.query("SELECT app.transition_job($1,$2,1,'invoiced','issue_invoice',NULL,NULL,NULL,NULL)", [tenant, jobId]);
          const adding = a.query("SELECT app.require_watchdog_live($1)", [jobId]);
          const refused = expect(adding).rejects.toThrow("JOB_NOT_LIVE");
          await b.query("COMMIT"); await refused; await a.query("ROLLBACK");
          expect((await admin.query("SELECT count(*)::int n FROM app.supplier_document WHERE job_id=$1", [jobId])).rows[0].n).toBe(0);
        }
      } finally { await a.query("ROLLBACK"); await b.query("ROLLBACK"); a.release(); b.release(); }
    }
  });
});
