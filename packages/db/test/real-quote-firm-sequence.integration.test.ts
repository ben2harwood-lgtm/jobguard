import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { quoteDocumentV1, renderQuotePdf } from "@jobguard/core";
import { Pool, type PoolClient } from "pg";
import { UserCommandDispatcher } from "../src/commands.js";
import { JobRepository } from "../src/job-repository.js";
import { ContractorRepository } from "../src/contractor-repository.js";
import { withTenant, verifiedTenantContextFromMembership, type VerifiedTenantContext } from "../src/tenant-context.js";
import { testBoundTenantContext } from "./tenant-context-test-utils.js";
import { QuoteDeliveryRepository } from "../src/quote-delivery-repository.js";
import { IssueQuoteMutation, QuoteDocumentRepository } from "../src/quote-document-repository.js";
import { RecordBuilderAcceptanceMutation, QuoteAcceptanceRepository } from "../src/acceptance-repository.js";
import { QuoteRepository } from "../src/quote-repository.js";
import { authenticatePracticeSession } from "../src/practice-session.js";
import { migrate } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

const tenant = "11111111-1111-4111-8111-111111111111";
const actor = "d1500000-0000-4000-8000-000000000003";
const migration = "0941_quote_firm_sequence.sql";
const recipient = "customer@example.invalid";
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
let f: WorkFixture, delivery: QuoteDeliveryRepository;
const previousEnvironment = process.env.JOBGUARD_ENV;
type Firm = Awaited<ReturnType<typeof firm>>;
type Job = Awaited<ReturnType<typeof job>>;
let legacyFirm: Firm, legacyJob: Job, legacyDuplicate: Job;
let predecessorCatalogue: Awaited<ReturnType<typeof routineCatalogue>>;
let predecessorPosture: unknown[];
let predecessorCompany: { context: VerifiedTenantContext; job: Job };
let historical: { id: string; job_id: string; snapshot: unknown; content_hash: string }[];

async function firm() {
 const token = randomUUID(), digest = sha(token);
 const db = await f.admin.connect();
 try {
  await db.query("BEGIN"); await db.query("SET LOCAL ROLE jobguard_migration");
  await db.query("INSERT INTO control_plane.practice_session(token_digest) VALUES($1)", [digest]);
  await db.query("COMMIT");
 } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
 return { digest, auth: await authenticatePracticeSession(f.runtime, token) };
}
async function job(owner: Firm, company?: VerifiedTenantContext) {
 const t = company?.tenantId ?? tenant, context = company ?? owner.auth.context;
 const id = randomUUID(), scope = randomUUID(), revision = randomUUID();
 if (company) {
  const jobs=new JobRepository(f.runtime);
  await jobs.create(company,["job:update"],{id,title:"Fictional company painting"});
  await jobs.transition(company,["job:update"],{jobId:id,expectedRevision:0,to:"quoting",reason:"start_quote"});
 }
 else await f.admin.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional painting','quoting',$3,'capture')", [id, tenant, owner.digest]);
 await f.admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope, t, id]);
 await f.admin.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Paint walls','1','item',10000,10000)", [revision, t, id, scope]);
 const input = { jobId: id, draftId: randomUUID(), expectedRevision: 0, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1",
  blockingQuestions: [], effectiveAt: new Date("2026-11-10T12:00:00Z"), lines: [{ id: randomUUID(), scopeItemId: scope, scopeRevisionId: revision,
   description: "Paint walls", origin: "captured", included: true, exclusionReason: null, quantity: "1", unit: "item", unitRatePence: 10000,
   discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: "Decorating", region: "London" }] };
 const saved = await new QuoteRepository(f.runtime).saveDraft(context, input);
 return { id, scope, input, quoteRevision: saved.id };
}
const preview = (owner: Firm, j: Job, email = recipient) => delivery.preview(owner.auth.context, j.id, email);
const issue = (owner: Firm, j: Job, p: Awaited<ReturnType<typeof preview>>, commandId = randomUUID()) =>
 delivery.issue(owner.auth.context, j.id, { documentId: p.documentId, contentHash: p.hash, recipient, commandId });

beforeAll(async () => {
 process.env.JOBGUARD_ENV = "synthetic_demo";
 f = await createWorkFixture(false);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1),($2)", [migration, "0944_quote_company_sequence.sql"]);
 await migrate(f.admin); await installLegacySyntheticPartyFixtures(f.admin);
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
 const user = "d1500000-0000-4000-8000-000000000001", account = randomUUID();
 await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
 await f.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional builder')", [account, tenant]);
 await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [actor, tenant, account, user]);
 await f.admin.query("CREATE ROLE quote_preview_login LOGIN PASSWORD 'synthetic-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO quote_preview_login");
 await f.runtime.end(); f.runtime = new Pool({ ...f.admin.options, user: "quote_preview_login", password: "synthetic-only", max: 2 });
 delivery = new QuoteDeliveryRepository(f.runtime);
 legacyFirm = await firm(); legacyJob = await job(legacyFirm); legacyDuplicate = await job(legacyFirm);
 // Supplied historical artifacts remain supported; runtime preview must use the allocator.
 const documents = new QuoteDocumentRepository(f.runtime);
 for (const j of [legacyJob, legacyDuplicate]) {
  const document = { schemaVersion: "quote-document.v1", documentVersion: 1, reference: "Q-0001", quoteRevisionId: j.quoteRevision, currency: "GBP",
   issuer: { name: "Fictional legacy builder", address: ["1 Fictional Road"], email: "builder@example.invalid" },
   customer: { name: "Fictional customer", address: ["2 Fictional Road"], email: recipient },
   lines: [{ scopeItemId: j.scope, description: "Paint walls", quantity: "1", unit: "item", netPence: 10000 }],
   exclusions: [], qualifications: [], subtotalPence: 10000, discountPence: 0, netPence: 10000, taxPence: 2000, totalPence: 12000 };
  await documents.create(legacyFirm.auth.context, { jobId: j.id, documentId: randomUUID(), quoteRevisionId: j.quoteRevision, objectVersionId: "fictional-v1", document });
 }
 // An issued/accepted older document outranks a later unsent legacy preview.
 const old = (await f.admin.query("SELECT id,snapshot,content_hash FROM app.quote_document_version WHERE job_id=$1", [legacyJob.id])).rows[0];
 await delivery.issue(legacyFirm.auth.context, legacyJob.id, { documentId: old.id, contentHash: old.content_hash, recipient, commandId: randomUUID() });
 await new QuoteAcceptanceRepository(f.runtime).accept(legacyFirm.auth.context, legacyJob.id, { commandId: randomUUID(), documentId: old.id,
  documentHash: old.content_hash, documentVersion: 1, statedCustomerName: "Fictional customer", statedMethod: "email", acceptedAt: new Date().toISOString() });
 await documents.create(legacyFirm.auth.context, { jobId: legacyJob.id, documentId: randomUUID(), quoteRevisionId: legacyJob.quoteRevision,
  objectVersionId: "fictional-v2", document: { ...old.snapshot, documentVersion: 2, reference: "Q-0009", cancellationKit: undefined } });
 historical = (await f.admin.query("SELECT * FROM app.quote_document_version ORDER BY job_id,document_version")).rows;
 await f.admin.query("DELETE FROM public.jobguard_schema_migration WHERE migration_name=$1", [migration]); await migrate(f.admin);
 predecessorCatalogue = await routineCatalogue(); predecessorPosture = await privatePosture();
 // The actual repository path is refused by 0941 for a legitimate company job.
 const context = await companyContext(tenant);
 const companyJob = await job(legacyFirm, context);
 await expect(delivery.preview(context, companyJob.id, recipient)).rejects.toThrow("QUOTE_REFERENCE_REFUSED");
 predecessorCompany = { context, job: companyJob };
 await f.admin.query("DELETE FROM public.jobguard_schema_migration WHERE migration_name=$1", ["0944_quote_company_sequence.sql"]);
 await migrate(f.admin);
}, 120_000);
afterAll(async () => {
 if (previousEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previousEnvironment;
 await closeWorkFixture(f);
});

it("two runtime previews use one firm sequence and a revised quote retains its reference", async () => {
 const owner = await firm(), a = await job(owner), b = await job(owner);
 const first = await preview(owner, a), second = await preview(owner, b);
 expect([first.document.reference, second.document.reference]).toEqual(["Q-0001", "Q-0002"]);
 expect((await preview(owner, a)).documentId).toBe(first.documentId);
 await new QuoteRepository(f.runtime).saveDraft(owner.auth.context, { ...a.input, expectedRevision: 1 });
 const revised = await preview(owner, a);
 expect(revised.document.reference).toBe("Q-0001"); expect(revised.document.documentVersion).toBe(2);
 for (const p of [first, second, revised]) {
  expect(p.document.cancellationKit?.reference).toBe(p.document.reference);
  expect(new TextDecoder().decode(p.pdf)).toContain(p.document.reference);
  expect(await delivery.view(owner.auth.context, p === second ? b.id : a.id, p.documentId)).toMatchObject({ documentId: p.documentId, reference: p.document.reference, documentVersion: p.document.documentVersion });
 }
 expect((await preview(owner, await job(owner))).document.reference).toBe("Q-0003");
});

it("serializes concurrent different jobs and same-job reuse or new document versions", async () => {
 const owner = await firm(), a = await job(owner), b = await job(owner);
 const different = await Promise.all([preview(owner, a), preview(owner, b)]);
 expect(different.map(p => p.document.reference).sort()).toEqual(["Q-0001", "Q-0002"]);
 const same = await Promise.all([preview(owner, a), preview(owner, a)]);
 expect(same[0].documentId).toBe(same[1].documentId);
 const changed = await Promise.all([preview(owner, a, "a@example.invalid"), preview(owner, a, "b@example.invalid")]);
 expect(new Set(changed.map(p => p.document.documentVersion)).size).toBe(2);
 expect(new Set(changed.map(p => p.document.reference)).size).toBe(1);
 const reused = await preview(owner, a, "a@example.invalid");
 expect(reused.documentId).toBe(changed[0]!.documentId);
 expect(await delivery.view(owner.auth.context, a.id, reused.documentId)).toMatchObject({ documentId: reused.documentId,
  documentVersion: changed[0]!.document.documentVersion, reference: changed[0]!.document.reference });
 const view = await delivery.view(owner.auth.context, a.id);
 expect(view?.quoteRevision).toBe(1); expect(view!.documentVersion).toBeGreaterThan(1);
});

it("does not consume a number on failure and refuses foreign firms and tenants before reuse", async () => {
 const owner = await firm(), other = await firm(), a = await job(owner);
 await new QuoteRepository(f.runtime).saveDraft(owner.auth.context, { ...a.input, expectedRevision: 1, blockingQuestions: ["Unanswered fictional question"] });
 await expect(preview(owner, a)).rejects.toThrow("QUOTE_NOT_ISSUABLE");
 expect((await preview(owner, await job(owner))).document.reference).toBe("Q-0001");
 await new QuoteRepository(f.runtime).saveDraft(owner.auth.context, { ...a.input, expectedRevision: 2 });
 expect((await preview(owner, a)).document.reference).toBe("Q-0002");
 await expect(preview(other, a)).rejects.toThrow("QUOTE_REFERENCE_REFUSED");
 const otherTenant = randomUUID(), otherJob = randomUUID();
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [otherTenant]);
 await f.admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Fictional foreign job')", [otherJob, otherTenant]);
 await expect(preview(owner, { ...a, id: otherJob })).rejects.toThrow("QUOTE_REFERENCE_REFUSED");
 expect((await preview(other, await job(other))).document.reference).toBe("Q-0001");
});

it("issue, replay, delivery and cancellation preserve exact documents and accepted identity after another preview", async () => {
 const owner = await firm(), a = await job(owner), original = await preview(owner, a), command = randomUUID();
 await issue(owner, a, original, command);
 expect(await issue(owner, a, original, command)).toMatchObject({ documentId: original.documentId, reference: "Q-0001" });
 await expect(delivery.issue(owner.auth.context, a.id, { documentId: original.documentId, contentHash: original.hash, recipient: "changed@example.invalid", commandId: command })).rejects.toBeTruthy();
 await delivery.execute(owner.auth.context, a.id, original.documentId, "success");
 const acceptances = new QuoteAcceptanceRepository(f.runtime);
 await acceptances.accept(owner.auth.context, a.id, { commandId: randomUUID(), documentId: original.documentId, documentHash: original.hash,
  documentVersion: original.document.documentVersion, statedCustomerName: "Fictional customer", statedMethod: "email", acceptedAt: new Date().toISOString() });
 await preview(owner, await job(owner));
 const latest = await preview(owner, a, "new@example.invalid");
 const view = await delivery.view(owner.auth.context, a.id);
 expect(view?.documentId).toBe(latest.documentId);
 expect(view?.acceptedDocumentReferences).toEqual({ [original.documentId]: { reference: "Q-0001", documentVersion: 1 } });
 expect(await delivery.pdf(owner.auth.context, a.id, original.documentId)).toMatchObject({ pdf: original.pdf, hash: original.hash, version: 1 });
 await acceptances.disposition(owner.auth.context, a.id, { commandId: randomUUID(), documentId: original.documentId, documentHash: original.hash,
  documentVersion: 1, kind: "acceptance_cancelled", occurredAt: new Date().toISOString() });
 expect((await delivery.view(owner.auth.context, a.id))?.acceptedDocumentReferences).toEqual({});
 expect((await preview(owner, a)).document.reference).toBe("Q-0001");
 expect((await delivery.pdf(owner.auth.context, a.id, original.documentId)).pdf).toEqual(original.pdf);
 expect((await preview(owner, await job(owner))).document.reference).toBe("Q-0003");
});

it("upgrade preserves historical duplicate PDFs and hashes and pins future runtime previews", async () => {
 const before = historical.map(row => ({ ...row }));
 const accepted = historical.find(row => row.job_id === legacyJob.id && quoteDocumentV1.parse(row.snapshot).documentVersion === 1)!;
 const legacyView = await delivery.view(legacyFirm.auth.context, legacyJob.id);
 expect(legacyView?.reference).toBe("Q-0009");
 expect(legacyView?.acceptedDocumentReferences).toEqual({ [accepted.id]: { reference: "Q-0001", documentVersion: 1 } });
 for (const j of [legacyJob, legacyDuplicate]) {
  const p = await preview(legacyFirm, j);
  expect(p.document.reference).toBe("Q-0001"); expect(p.document.documentVersion).toBe(j === legacyJob ? 3 : 2);
 }
 const after = (await f.admin.query("SELECT * FROM app.quote_document_version WHERE id=ANY($1::uuid[]) ORDER BY job_id,document_version", [historical.map(row => row.id)])).rows;
 expect(after).toEqual(before);
 for (const row of historical) {
  const pdf = await delivery.pdf(legacyFirm.auth.context, row.job_id, row.id);
  expect(pdf.pdf).toEqual(renderQuotePdf(quoteDocumentV1.parse(row.snapshot))); expect(sha(pdf.pdf)).toBe(row.content_hash);
 }
 expect((await preview(legacyFirm, await job(legacyFirm))).document.reference).toBe("Q-0010");
});

// Genuine persisted real credentials; no practice route is broadened by this test.
async function companyContext(t: string, credential = sha(randomUUID())) {
 const member = randomUUID(), person = randomUUID(), account = randomUUID();
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [t]);
 await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [person]);
 await f.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional company')", [account,t]);
 await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member,t,account,person]);
 return testBoundTenantContext(f.admin,t,member,credential);
}
async function privateSnapshot() {
 const result: Record<string, unknown> = {};
 for (const table of ["quote_firm_counter", "quote_job_reference"])
  result[table] = (await f.admin.query(`SELECT * FROM app.${table} ORDER BY tenant_id,${table === "quote_firm_counter" ? "firm_key" : "job_id"}`)).rows;
 return result;
}
async function request(work: (db: PoolClient) => Promise<unknown>) {
 const db = await f.runtime.connect();
 try { await db.query("BEGIN"); return await work(db); }
 finally { await db.query("ROLLBACK"); db.release(); }
}
const bindHome = (db: PoolClient, owner: Firm) => db.query("SELECT app.bind_request('practice',$1,$2)", [owner.digest,tenant]);
const allocate = (db: PoolClient, id: string) => db.query("SELECT app.allocate_quote_job_reference($1) reference", [id]);

it("company-made ownerless jobs receive company references only through valid unscoped company bindings", async () => {
 const owner = await firm();
 const contractorSession = randomUUID(), principal = await new ContractorRepository(f.runtime).startPractice(contractorSession);
 const contractor = verifiedTenantContextFromMembership(principal, { kind: "contractor_practice", credential: contractorSession });
 const contexts = [predecessorCompany.context, await companyContext("33333333-3333-4333-8333-333333333333"), contractor];
 for (const context of contexts) {
  const a = context === predecessorCompany.context ? predecessorCompany.job : await job(owner,context), b = await job(owner,context);
  const [first,second] = await Promise.all([delivery.preview(context,a.id,recipient),delivery.preview(context,b.id,recipient)]);
  expect(first.document.reference).not.toBe(second.document.reference);
  expect((await delivery.preview(context,a.id,recipient)).documentId).toBe(first.documentId);
  await new QuoteRepository(f.runtime).saveDraft(context,{...a.input,expectedRevision:1});
  const revised = await delivery.preview(context,a.id,recipient);
  expect(revised.document.reference).toBe(first.document.reference);
  await companyAcceptance(context,a,first);
  expect((await delivery.view(context,a.id))?.acceptedDocumentReferences).toEqual({[first.documentId]:{reference:first.document.reference,documentVersion:1}});
  const blocked=await job(owner,context);
  await new QuoteRepository(f.runtime).saveDraft(context,{...blocked.input,expectedRevision:1,blockingQuestions:["Fictional unanswered scope question"]});
  const beforeFailure=await privateSnapshot();
  await expect(delivery.preview(context,blocked.id,recipient)).rejects.toThrow("QUOTE_NOT_ISSUABLE");
  expect(await privateSnapshot()).toEqual(beforeFailure);
  for (const [j,p] of [[a,first],[b,second],[a,revised]] as const) {
   const stored = (await f.admin.query("SELECT reference,snapshot,content_hash FROM app.quote_document_version WHERE id=$1",[p.documentId])).rows[0];
   expect(stored.reference).toBe(p.document.reference); expect(stored.snapshot).toEqual(p.document); expect(stored.content_hash).toBe(p.hash);
   expect((await delivery.pdf(context,j.id,p.documentId)).pdf).toEqual(p.pdf);
   expect(new TextDecoder().decode(p.pdf)).toContain(p.document.reference);
  }
  // Same home binding, guessed company ID: denial both before and after advancement.
  for (let attempt=0;attempt<2;attempt++) {
   const before = await privateSnapshot();
   await expect(request(async db=>{await bindHome(db,owner);await allocate(db,a.id);})).rejects.toMatchObject({code:"42501"});
   expect(await privateSnapshot()).toEqual(before);
   if (!attempt) await delivery.preview(context,(await job(owner,context)).id,recipient);
  }
 }
 // Same shared tenant, independent practice sequence (no practice job in 3333).
 const a = await job(owner), b = await job(owner);
 expect((await preview(owner,a)).document.reference).toBe("Q-0001");
 expect((await preview(owner,b)).document.reference).toBe("Q-0002");
});

it("denies allocator attacks without reading or advancing private assignments", async () => {
 const home = await firm(), foreign = await firm(), j = await job(foreign), owned = await job(home);
 await preview(foreign,j); await preview(home,owned);
 const imported=randomUUID(), fixture=await f.admin.connect();
 // Explicit administrative historical-lineage fixture, as in the allocator
 // suite. Runtime attacks below keep every installed ownership guard enabled.
 try {
  await fixture.query("BEGIN; SET LOCAL session_replication_role='replica'");
  await fixture.query("INSERT INTO app.job(id,tenant_id,title,status,provenance) VALUES($1,$2,'Fictional historical import','quoting','imported')",[imported,tenant]);
  await fixture.query(`INSERT INTO app.job_import_v3(tenant_id,id,job_id,source_job_id,session_digest,command_id,public_request_hash,fixture_id,snapshot,result,meter_exclusion_id,meter_reason,counted_places)
   VALUES($1,$2,$3,$4,$5,$6,$5,'fictional-extension-v3','{"lifecyclePoint":"invoiced"}','{}',$7,'imported_at_invoiced_stage',0)`,
   [tenant,randomUUID(),imported,owned.id,home.digest,randomUUID(),randomUUID()]);
  await fixture.query("COMMIT");
 } catch(error) {await fixture.query("ROLLBACK");throw error;} finally {fixture.release();}
 const lineage=(await f.admin.query("SELECT * FROM app.job_import_v3 WHERE job_id=$1",[imported])).rows;
 const credential = sha(randomUUID()), context = await companyContext(tenant,credential), company = await job(home,context);
 await delivery.preview(context,company.id,recipient);
 const before = await privateSnapshot();
 for (const id of [company.id,j.id,randomUUID()]) {
  await expect(request(async db=>{await bindHome(db,home);await db.query("SELECT set_config('app.practice_material_digest',$1,true)",[foreign.digest]);await allocate(db,id);})).rejects.toMatchObject({code:"42501"});
 }
 await expect(request(async db=>{await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true)",[tenant,actor]);await allocate(db,company.id);})).rejects.toMatchObject({code:"42501"});
 await expect(request(db=>db.query("SELECT app.bind_request('real',$1,$2)",[credential,randomUUID()]))).rejects.toMatchObject({code:"42501"});
 await expect(withTenant(f.runtime,context,tx=>allocate(tx.$client,owned.id))).rejects.toMatchObject({code:"42501"});
 for (const state of ["revoked_at=clock_timestamp()", "revoked_at=NULL,expires_at=clock_timestamp()-interval '1 second'"]) {
  const expiredHome=await firm();
  await f.admin.query(`UPDATE control_plane.practice_session SET ${state} WHERE token_digest=$1`,[expiredHome.digest]);
  await expect(request(async db=>{await bindHome(db,expiredHome);await allocate(db,company.id);})).rejects.toMatchObject({code:"42501"});
  await f.admin.query(`UPDATE identity.session SET ${state} WHERE token_digest=$1`,[credential]);
  await expect(delivery.preview(context,company.id,recipient)).rejects.toBeTruthy();
 }
 await expect(request(async db=>{await bindHome(db,home);await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
  await db.query("UPDATE app.job SET practice_session_digest=$1 WHERE id=$2",[foreign.digest,owned.id]);})).rejects.toMatchObject({code:"42501"});
 await expect(request(async db=>{await bindHome(db,home);
  await db.query("UPDATE app.job_import_v3 SET source_job_id=$1 WHERE job_id=$2",[j.id,imported]);})).rejects.toMatchObject({code:"42501"});
 for (const table of ["quote_firm_counter","quote_job_reference"]) {
  for (const sql of [`SELECT * FROM app.${table}`,`DELETE FROM app.${table}`,`UPDATE app.${table} SET firm_key='company'`,`INSERT INTO app.${table} DEFAULT VALUES`])
   await expect(request(async db=>{await bindHome(db,home);await db.query(sql);})).rejects.toMatchObject({code:"42501"});
 }
 await expect(request(async db=>{await bindHome(db,home);await db.query("SELECT app.quote_binding_owner_matches($1,$2)",[tenant,home.digest]);})).rejects.toMatchObject({code:"42501"});
 expect(await privateSnapshot()).toEqual(before);
 expect((await f.admin.query("SELECT * FROM app.job_import_v3 WHERE job_id=$1",[imported])).rows).toEqual(lineage);
});

it.each([false,true])("revalidates expiry after a firm lock wait (assigned replay: %s)", async assigned => {
 const credential=sha(randomUUID()), context=await companyContext(tenant,credential), j=await job(legacyFirm,context);
 if (assigned) await delivery.preview(context,j.id,recipient);
 // The persisted deadline naturally expires; no request-binding routine is changed.
 await f.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()+interval '3 seconds' WHERE token_digest=$1",[credential]);
 const before=await privateSnapshot(), lock=await f.admin.connect(), db=await f.runtime.connect();
 try {
  await lock.query("BEGIN"); await lock.query("SELECT pg_advisory_xact_lock(hashtextextended($1,941))",[`${tenant}:quote-firm:company`]);
  await db.query("BEGIN"); await db.query("SELECT app.bind_request('real',$1,$2)",[credential,tenant]);
  const pid=(await db.query("SELECT pg_backend_pid() pid")).rows[0].pid;
  const pending=allocate(db,j.id).then(()=>({code:"unexpected_success"}),error=>error as {code:string});
  let waiting=false;
  for(let attempt=0;attempt<100;attempt++) {
   waiting=(await f.admin.query("SELECT wait_event='advisory' waiting FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0].waiting;
   if(waiting)break;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  expect(waiting).toBe(true);
  await lock.query("SELECT pg_sleep(greatest(0,extract(epoch FROM (expires_at-clock_timestamp())))+0.05) FROM identity.session WHERE token_digest=$1",[credential]);
  await lock.query("COMMIT");
  expect(await pending).toMatchObject({code:"42501"});
 } finally {await db.query("ROLLBACK");await lock.query("ROLLBACK");db.release();lock.release();}
 expect(await privateSnapshot()).toEqual(before);
});

async function routineCatalogue() {
 return (await f.admin.query(`SELECT p.oid::regprocedure::text identity,pg_get_userbyid(p.proowner) owner,
  p.proacl::text acl,p.prosecdef,p.proconfig,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') hash
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app'
  AND p.proname IN ('quote_binding_owner_matches','allocate_quote_job_reference') ORDER BY p.proname`)).rows;
}
async function privatePosture() {
 return (await f.admin.query(`SELECT c.relname,pg_get_userbyid(c.relowner) owner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c WHERE c.oid IN ('app.quote_firm_counter'::regclass,'app.quote_job_reference'::regclass) ORDER BY c.relname`)).rows;
}
it("0944 composes the exact routine successor proof and preserves private catalogue posture", async()=>{
 const proof=JSON.parse(await readFile(new URL('./migration-proofs/0944_quote_company_sequence.proof.json',import.meta.url),'utf8'));
 const current=await routineCatalogue();
 expect(current).toHaveLength(2);
 for(const [index,row] of current.entries()) {
  const change=proof.lp0.find((entry:{section:string;after:{identity:string}})=>entry.section==='routines'&&entry.after.identity===`function:${row.identity}`);
  expect(change.before.definitionSha256).toBe(predecessorCatalogue[index].hash);
  expect(change.after.definitionSha256).toBe(row.hash);
  expect({...row,hash:predecessorCatalogue[index].hash}).toEqual(predecessorCatalogue[index]);
 }
 expect(await privatePosture()).toEqual(predecessorPosture);
 for(const row of await privatePosture()) expect(row).toMatchObject({relrowsecurity:true,relforcerowsecurity:true});
});

it("refuses a genuine delegated customer binding and preserves credential-row revocation locking", async()=>{
 const home=await firm(), j=await job(home);
 const c=(await f.admin.query("SELECT b.customer_id FROM app.job_party_current p JOIN app.job_party_binding b ON(b.tenant_id,b.id)=(p.tenant_id,p.binding_id) WHERE p.tenant_id=$1 AND p.job_id=$2",[tenant,j.id])).rows[0].customer_id;
 const link=sha(randomUUID()), digest=sha(randomUUID());
 await f.admin.query("SELECT identity.customer_portal_issue($1,$2,$3,$4,$5,$6)",[tenant,home.digest,j.id,c,link,`customer-signin-reference.v1:${tenant}/${j.id}/${c}/${'a'.repeat(43)}`]);
 await f.admin.query("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,'redeem')",[tenant,j.id,c,link,digest]);
 const before=await privateSnapshot();
 // Binder is private to migration; establish genuine delegated authority as its
 // installed caller, then exercise allocator as a non-owner runtime role.
 const admin=await f.admin.connect();
 try {
  await admin.query("BEGIN");await admin.query("SET LOCAL ROLE jobguard_migration");
  await admin.query("SELECT app.lp6_bind_customer_portal($1,$2,$3,$4)",[tenant,j.id,c,digest]);
  await admin.query("SET LOCAL ROLE jobguard_runtime");
  await expect(allocate(admin,j.id)).rejects.toMatchObject({code:"42501"});
 } finally {await admin.query("ROLLBACK");admin.release();}
 expect(await privateSnapshot()).toEqual(before);
 const credential=sha(randomUUID()), context=await companyContext(tenant,credential), company=await job(home,context);
 await delivery.preview(context,company.id,recipient);
 const revoker=await f.admin.connect();
 try {
  await withTenant(f.runtime,context,async tx=>{
   await revoker.query("BEGIN; SET LOCAL lock_timeout='100ms'");
   await expect(revoker.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[credential])).rejects.toMatchObject({code:"55P03"});
   await revoker.query("ROLLBACK");
   expect((await allocate(tx.$client,company.id)).rows[0].reference).toBe((await delivery.view(context,company.id))?.reference);
  });
  await revoker.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[credential]);
  const snapshot=await privateSnapshot();
  await expect(delivery.preview(context,company.id,recipient)).rejects.toBeTruthy();
  expect(await privateSnapshot()).toEqual(snapshot);
 } finally {await revoker.query("ROLLBACK");revoker.release();}
});

// The synthetic delivery/acceptance convenience methods hardcode the home actor.
// Exercise the existing general command mutations with the actually bound actor.
async function companyAcceptance(context: VerifiedTenantContext,j:Job,p:Awaited<ReturnType<typeof preview>>) {
 const actorMembershipId=await withTenant(f.runtime,context,async tx=>(await tx.$client.query("SELECT app.current_actor() actor")).rows[0].actor as string);
 const dispatcher=new UserCommandDispatcher(f.runtime), content=new TextDecoder().decode(p.pdf);
 await dispatcher.dispatch(context,{version:"command.v1",commandId:randomUUID(),commandType:"quote.send",semanticKey:`quote-send:${p.documentId}`,
  actorMembershipId,subjectType:"quote_document",subjectRef:p.documentId,authorizationId:randomUUID(),
  action:{actionType:"quote.send",recipient:JSON.stringify([recipient]),contentHash:p.hash,aggregateRevision:p.document.documentVersion,
   amountPence:null,currency:null,policyVersion:"free-quote-send.v1",expiresAt:new Date(Date.now()+60_000)}},
  new IssueQuoteMutation({tenantId:context.tenantId,jobId:j.id,documentId:p.documentId,outboxActionId:randomUUID(),recipients:[recipient],immutableContent:content}));
 const expectedJobRevision=(await new JobRepository(f.runtime).get(context,["job:view"],j.id)).revision;
 await dispatcher.dispatch(context,{version:"command.v1",commandId:randomUUID(),commandType:"quote.acceptance.attest",semanticKey:`accept:${p.documentId}`,
  actorMembershipId,subjectType:"quote_document",subjectRef:p.documentId,
  action:{actionType:"quote.acceptance.attest",recipient:"Fictional customer",contentHash:p.hash,aggregateRevision:p.document.documentVersion,
   amountPence:p.document.totalPence,currency:"GBP",policyVersion:"builder-attestation.v1",expiresAt:new Date(Date.now()+60_000)}},
  new RecordBuilderAcceptanceMutation(context.tenantId,{version:"quote-acceptance.v1",acceptanceId:randomUUID(),jobId:j.id,documentId:p.documentId,
   documentVersion:p.document.documentVersion,documentHash:p.hash,expectedJobRevision,acceptedTotalPence:p.document.totalPence,
   acceptedAt:new Date().toISOString(),statedCustomerName:"Fictional customer",statedMethod:"email",evidenceId:null}));
}
