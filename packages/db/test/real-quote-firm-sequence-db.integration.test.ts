import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { quoteDocumentV1, renderQuotePdf } from "@jobguard/core";
import { migrate } from "../src/migrate.js";
import { QuoteDeliveryRepository } from "../src/quote-delivery-repository.js";
import { QuoteRepository } from "../src/quote-repository.js";
import { authenticatePracticeSession } from "../src/practice-session.js";
import { createWorkFixture, closeWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testBoundTenantContext } from "./tenant-context-test-utils.js";

const tenant = "11111111-1111-4111-8111-111111111111";
const actor = "d1500000-0000-4000-8000-000000000003";
const user = "d1500000-0000-4000-8000-000000000001";
const migration = "0941_quote_firm_sequence.sql";
const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
let f: WorkFixture;
const priorEnvironment = process.env.JOBGUARD_ENV;
type Firm = Awaited<ReturnType<typeof firm>>;
type Job = Awaited<ReturnType<typeof job>>;
let legacyFirm: Firm, legacyA: Job, legacyB: Job;
let oldArtifacts: unknown[], oldPdfs: Uint8Array[], oldAuthority: Record<string, unknown>;

async function firm() {
 const token = randomUUID(), digest = sha(token);
 const db = await f.admin.connect();
 try {
  await db.query("BEGIN");
  await db.query("SET LOCAL ROLE jobguard_migration");
  await db.query("INSERT INTO control_plane.practice_session(token_digest) VALUES($1)", [digest]);
  await db.query("COMMIT");
 } catch (error) { await db.query("ROLLBACK"); throw error; }
 finally { db.release(); }
 return { token, digest, auth: await authenticatePracticeSession(f.runtime, token) };
}
async function job(owner: Firm, importedFrom?: string) {
 const id = randomUUID(), scope = randomUUID(), revision = randomUUID();
 if (importedFrom) {
  // Historical import fixture only. The allocator itself always runs as runtime
  // with every production guard enabled; no ownership column is ever rewritten.
  const db = await f.admin.connect();
  try {
   await db.query("BEGIN"); await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("INSERT INTO app.job(id,tenant_id,title,status,provenance) VALUES($1,$2,'Fictional imported job','quoting','imported')", [id, tenant]);
   await db.query(`INSERT INTO app.job_import_v3(tenant_id,id,job_id,source_job_id,session_digest,command_id,public_request_hash,fixture_id,snapshot,result,meter_exclusion_id,meter_reason,counted_places)
    VALUES($1,$2,$3,$4,$5,$6,$5,'fictional-extension-v3','{"lifecyclePoint":"invoiced"}','{}',$7,'imported_at_invoiced_stage',0)`,
   [tenant, randomUUID(), id, importedFrom, owner.digest, randomUUID(), randomUUID()]);
   await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
  const { seedSyntheticPartyFixture } = await import("../src/synthetic-party-fixture.js");
  const parties = await f.admin.connect();
  try { await parties.query("BEGIN"); await parties.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]); await seedSyntheticPartyFixture(parties, tenant, id); await parties.query("COMMIT"); }
  catch (error) { await parties.query("ROLLBACK"); throw error; } finally { parties.release(); }
 } else {
  await f.admin.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional decorating','quoting',$3,'capture')", [id, tenant, owner.digest]);
 }
 await f.admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope, tenant, id]);
 await f.admin.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Paint walls','1','item',10000,10000)", [revision, tenant, id, scope]);
 const input = {
  jobId: id, draftId: randomUUID(), expectedRevision: 0, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1",
  blockingQuestions: [], effectiveAt: new Date("2026-11-10T12:00:00Z"), lines: [{
   id: randomUUID(), scopeItemId: scope, scopeRevisionId: revision, description: "Paint walls", origin: "captured",
   included: true, exclusionReason: null, quantity: "1", unit: "item", unitRatePence: 10000, discountPercent: "0",
   taxTreatment: "standard_rate_20", rateProvenance: "entered", category: "Decorating", region: "London",
  }],
 };
 const saved = await new QuoteRepository(f.runtime).saveDraft(owner.auth.context, input);
 return { id, scope, quoteRevision: saved.id, input };
}
async function transaction<T>(owner: Firm, work: (db: PoolClient) => Promise<T>) {
 const db = await f.runtime.connect();
 try {
  await db.query("BEGIN");
  await db.query("SELECT app.bind_request('practice',$1,$2)", [owner.digest, tenant]);
  await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
  const result = await work(db);
  await db.query("COMMIT");
  return result;
 } catch (error) { await db.query("ROLLBACK"); throw error; }
 finally { db.release(); }
}
async function allocate(db: PoolClient, id: string) {
 return (await db.query<{ reference: string }>("SELECT app.allocate_quote_job_reference($1) reference", [id])).rows[0]!.reference;
}
async function document(db: PoolClient, j: Job, reference: string, issuedAt: Date | null = null) {
 // Called AFTER allocator, before all existing preview work, on the same client.
 const version = (await db.query("SELECT coalesce(max(document_version),0)+1 v FROM app.quote_document_version WHERE tenant_id=$1 AND job_id=$2", [tenant, j.id])).rows[0].v;
 const snapshot = quoteDocumentV1.parse({
  schemaVersion: "quote-document.v1", documentVersion: version, reference, quoteRevisionId: j.quoteRevision, currency: "GBP",
  issuer: { name: "Fictional builder", address: ["1 Fictional Road"], email: "builder@example.invalid" },
  customer: { name: "Fictional customer", address: ["2 Fictional Road"], email: "customer@example.invalid" },
  lines: [{ scopeItemId: j.scope, description: "Paint walls", quantity: "1", unit: "item", netPence: 10000 }],
  exclusions: [], qualifications: [], subtotalPence: 10000, discountPence: 0, netPence: 10000, taxPence: 2000, totalPence: 12000,
 });
 const pdf = renderQuotePdf(snapshot), id = randomUUID(), hash = sha(pdf);
 await db.query(`INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot,issued_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$14,$9,$10,$11,$12,$13)`,
 [id, tenant, j.id, j.quoteRevision, version, reference, hash, `fixture/quotes/${id}.pdf`, pdf.byteLength, snapshot.issuer, snapshot.customer, snapshot, issuedAt, hash]);
 return { id, pdf, hash, snapshot };
}
async function preview(owner: Firm, j: Job) {
 return transaction(owner, async db => {
  const reference = await allocate(db, j.id);
  return { reference, ...await document(db, j, reference) };
 });
}
async function authorityRows() {
 const result: Record<string, unknown> = {};
 for (const table of ["quote_send", "quote_acceptance", "action_authorization", "decision_resolution"])
  result[table] = (await f.admin.query(`SELECT to_jsonb(x) row FROM app.${table} x ORDER BY to_jsonb(x)::text`)).rows;
 return result;
}
async function artifactRows() {
 return (await f.admin.query("SELECT * FROM app.quote_document_version WHERE job_id=ANY($1::uuid[]) ORDER BY job_id,document_version", [[legacyA.id, legacyB.id]])).rows;
}

beforeAll(async () => {
 process.env.JOBGUARD_ENV = "synthetic_demo";
 f = await createWorkFixture(false);
 // Install the exact predecessor schema; the normal migrator still owns setup.
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [migration]);
 await migrate(f.admin);
 await installLegacySyntheticPartyFixtures(f.admin);
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
 await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
 const account = randomUUID();
 await f.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional practice builder')", [account, tenant]);
 await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [actor, tenant, account, user]);
 await f.admin.query("CREATE ROLE quote_sequence_login LOGIN PASSWORD 'synthetic-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO quote_sequence_login");
 await f.runtime.end();
 f.runtime = new Pool({ ...f.admin.options, user: "quote_sequence_login", password: "synthetic-only", max: 4 });
 legacyFirm = await firm(); legacyA = await job(legacyFirm); legacyB = await job(legacyFirm);
 // Prove the boundary is absent before the migration, using the runtime login.
 await expect(transaction(legacyFirm, db => allocate(db, legacyA.id))).rejects.toMatchObject({ code: "42883" });
 await transaction(legacyFirm, async db => {
  await document(db, legacyA, "Q-0007");
  await document(db, legacyA, "Q-0099");
  await document(db, legacyB, "Q-0007");
 });
 // A real, authorized synthetic quote_send proves issuance; no provider runs.
 const delivery = new QuoteDeliveryRepository(f.runtime);
 // Supply the historical artifact without calling the not-yet-installed allocator.
 const { QuoteDocumentRepository } = await import("../src/quote-document-repository.js");
 const legacyDocument = quoteDocumentV1.parse({
  schemaVersion: "quote-document.v1", documentVersion: 3, reference: "Q-0003", quoteRevisionId: legacyA.quoteRevision, currency: "GBP",
  issuer: { name: "Fictional builder", address: ["1 Fictional Road"], email: "builder@example.invalid" },
  customer: { name: "Fictional customer", address: ["2 Fictional Road"], email: "customer@example.invalid" },
  lines: [{ scopeItemId: legacyA.scope, description: "Paint walls", quantity: "1", unit: "item", netPence: 10000 }],
  exclusions: [], qualifications: [], subtotalPence: 10000, discountPence: 0, netPence: 10000, taxPence: 2000, totalPence: 12000,
 });
 const supplied = await new QuoteDocumentRepository(f.runtime).create(legacyFirm.auth.context, {
  jobId: legacyA.id, documentId: randomUUID(), quoteRevisionId: legacyA.quoteRevision, objectVersionId: "fictional-legacy-v3", document: legacyDocument,
 });
 const issued = { documentId: supplied.id, hash: supplied.content_hash, document: legacyDocument };
 await delivery.issue(legacyFirm.auth.context, legacyA.id, {
  documentId: issued.documentId, contentHash: issued.hash, recipient: "customer@example.invalid", commandId: randomUUID(),
 });
 const { QuoteAcceptanceRepository } = await import("../src/acceptance-repository.js");
 await new QuoteAcceptanceRepository(f.runtime).accept(legacyFirm.auth.context, legacyA.id, {
  commandId: randomUUID(), documentId: issued.documentId, documentHash: issued.hash,
  documentVersion: issued.document.documentVersion, statedCustomerName: "Fictional customer",
  statedMethod: "email", acceptedAt: new Date().toISOString(),
 });
 await transaction(legacyFirm, db => document(db, legacyA, "Q-0123"));
 // Misleading timestamp: it must not win over the quote_send above.
 // The immutable row is inserted with issued_at, never rewritten.
 await transaction(legacyFirm, db => document(db, legacyA, "Q-0122", new Date()));
 oldArtifacts = await artifactRows(); oldAuthority = await authorityRows();
 oldPdfs = (oldArtifacts as { snapshot: unknown }[]).map(row => renderQuotePdf(quoteDocumentV1.parse(row.snapshot)));
 await f.admin.query("DELETE FROM public.jobguard_schema_migration WHERE migration_name=$1", [migration]);
 await migrate(f.admin);
}, 120_000);
afterAll(async () => {
 if (priorEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = priorEnvironment;
 await closeWorkFixture(f);
});

it("one practice firm reserves distinct job references and retains them across revisions", async () => {
 const a = await firm(), first = await job(a), second = await job(a);
 expect((await preview(a, first)).reference).toBe("Q-0001");
 expect((await preview(a, second)).reference).toBe("Q-0002");
 const revised = await new QuoteRepository(f.runtime).saveDraft(a.auth.context, { ...first.input, expectedRevision: 1 });
 expect((await preview(a, { ...first, quoteRevision: revised.id })).reference).toBe("Q-0001");
 const other = await firm();
 expect((await preview(other, await job(other))).reference).toBe("Q-0001");
});

it("serializes same-firm and same-job concurrency before document-version selection", async () => {
 const a = await firm(), jobs = await Promise.all([job(a), job(a), job(a)]);
 const results = await Promise.all(jobs.map(j => preview(a, j)));
 expect(results.map(r => r.reference).sort()).toEqual(["Q-0001", "Q-0002", "Q-0003"]);
 const sameJob = await job(a);
 const same = await Promise.all([preview(a, sameJob), preview(a, sameJob)]);
 expect(same.map(r => r.reference)).toEqual(["Q-0004", "Q-0004"]);
 expect(same.map(r => r.snapshot.documentVersion).sort()).toEqual([1, 2]);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.quote_job_reference WHERE tenant_id=$1 AND job_id=$2", [tenant, sameJob.id])).rows[0].n).toBe(1);
});

it("rolls back numbers, rejects allocator-only commits, and retains cancellation reservations", async () => {
 const a = await firm(), first = await job(a), second = await job(a);
 await expect(transaction(a, async db => {
  expect(await allocate(db, first.id)).toBe("Q-0001");
  await document(db, first, "Q-0001"); throw new Error("ROLLBACK_FIXTURE");
 })).rejects.toThrow("ROLLBACK_FIXTURE");
 await expect(transaction(a, db => allocate(db, first.id))).rejects.toThrow("QUOTE_REFERENCE_PREVIEW_REQUIRED");
 expect((await preview(a, first)).reference).toBe("Q-0001");
 // The current, authorized disposition command cancels the acceptance or quote;
 // declining a quoting job is the cancellation path applicable to this fixture.
 const { RecordQuoteDispositionMutation } = await import("../src/acceptance-repository.js");
 const { UserCommandDispatcher } = await import("../src/commands.js");
 const artifact = await preview(a, first);
 await new UserCommandDispatcher(f.runtime).dispatch(a.auth.context, {
  version: "command.v1", commandId: randomUUID(), commandType: "quote.declined", semanticKey: `decline:${artifact.id}`,
  actorMembershipId: actor, subjectType: "quote_document", subjectRef: artifact.id,
  action: { actionType: "quote.declined", recipient: null, contentHash: artifact.hash, aggregateRevision: artifact.snapshot.documentVersion,
   amountPence: null, currency: null, policyVersion: "quote-disposition.v1", expiresAt: new Date(Date.now() + 60_000) },
 }, new RecordQuoteDispositionMutation(tenant, {
  version: "quote-disposition.v1", eventId: randomUUID(), jobId: first.id, documentId: artifact.id,
  documentVersion: artifact.snapshot.documentVersion, documentHash: artifact.hash, expectedJobRevision: 0, kind: "declined", occurredAt: new Date(),
 }));
 expect((await preview(a, second)).reference).toBe("Q-0002");
 expect(await transaction(a, db => allocate(db, first.id))).toBe("Q-0001");
});

it("pins legacy issuance via quote_send, keeps duplicates and every old PDF/hash/metadata byte", async () => {
 const sent = (await f.admin.query(`SELECT d.reference FROM app.quote_send s JOIN app.quote_document_version d ON(d.tenant_id,d.id)=(s.tenant_id,s.document_id)
 WHERE s.job_id=$1 ORDER BY d.document_version DESC LIMIT 1`, [legacyA.id])).rows[0].reference;
 expect(await transaction(legacyFirm, db => allocate(db, legacyA.id))).toBe(sent);
 expect(await transaction(legacyFirm, db => allocate(db, legacyB.id))).toBe("Q-0007");
 expect((await preview(legacyFirm, await job(legacyFirm))).reference).toBe("Q-0124");
 expect(await artifactRows()).toEqual(oldArtifacts);
 // Other tests can create their own approvals; every historical record survives
 // with its original values rather than requiring a globally empty namespace.
 const authority = await authorityRows();
 for (const table of Object.keys(oldAuthority))
  expect(authority[table]).toEqual(expect.arrayContaining(oldAuthority[table] as unknown[]));
 const delivery = new QuoteDeliveryRepository(f.runtime);
 for (const [index, row] of (oldArtifacts as { id: string; job_id: string; content_hash: string }[]).entries()) {
  const downloaded = await delivery.pdf(legacyFirm.auth.context, row.job_id, row.id);
  expect(downloaded.pdf).toEqual(oldPdfs[index]); expect(sha(downloaded.pdf)).toBe(row.content_hash);
 }
});

it("refuses another firm, cross-tenant, unbound calls, forged GUCs and wrong credential kinds", async () => {
 const a = await firm(), b = await firm(), j = await job(a);
 await preview(a, j); // Replay must authorize before returning an assignment too.
 await expect(transaction(b, db => allocate(db, j.id))).rejects.toThrow("QUOTE_REFERENCE_REFUSED");
 const unowned = randomUUID();
 await f.admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Unowned shared job')", [unowned, tenant]);
 await expect(transaction(a, db => allocate(db, unowned))).rejects.toThrow("QUOTE_REFERENCE_REFUSED");
 const otherTenant = randomUUID(), otherJob = randomUUID();
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [otherTenant]);
 await f.admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Other tenant')", [otherJob, otherTenant]);
 await expect(transaction(a, db => allocate(db, otherJob))).rejects.toThrow("QUOTE_REFERENCE_REFUSED");
 const db = await f.runtime.connect();
 try {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true),set_config('app.actor_id',$3,true)", [tenant, a.digest, actor]);
  await expect(allocate(db, j.id)).rejects.toThrow("QUOTE_REFERENCE_REFUSED");
 } finally { await db.query("ROLLBACK"); db.release(); }
 // A valid real session even for the shared practice actor is not a practice firm.
 const context = await testBoundTenantContext(f.admin, tenant, actor);
 const { withTenant } = await import("../src/tenant-context.js");
 await expect(withTenant(f.runtime, context, tx => allocate(tx.$client, j.id))).rejects.toThrow("QUOTE_REFERENCE_REFUSED");
});

it("keeps new tables and private predicates inaccessible to runtime writes and reads", async () => {
 const rows = (await f.admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname,
 has_table_privilege('jobguard_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') permitted
 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid IN('app.quote_firm_counter'::regclass,'app.quote_job_reference'::regclass)`)).rows;
 expect(rows).toHaveLength(2);
 for (const row of rows) expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, rolname: "jobguard_migration", permitted: false });
 for (const sql of ["SELECT app.quote_binding_owner_matches($1,$2)", "SELECT * FROM app.quote_practice_owners($1)"])
  await expect(f.runtime.query(sql, sql.includes("matches") ? [tenant, legacyFirm.digest] : [tenant])).rejects.toMatchObject({ code: "42501" });
 for (const sql of ["UPDATE app.quote_job_reference SET reference='Q-9999'", "DELETE FROM app.quote_job_reference", "SELECT * FROM app.quote_job_reference", "UPDATE app.quote_firm_counter SET next_number=1"])
  await expect(f.runtime.query(sql)).rejects.toMatchObject({ code: "42501" });
 const source = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
 expect(source).not.toContain("CREATE OR REPLACE");
});

it("follows imported lineage for ownership and seeds above all imported previews", async () => {
 const a = await firm(), b = await firm(), source = await job(a);
 const imported = await job(a, source.id);
 await transaction(a, db => document(db, imported, "Q-0500"));
 expect(await transaction(a, db => allocate(db, imported.id))).toBe("Q-0500");
 expect((await preview(a, source)).reference).toBe("Q-0501");
 await expect(transaction(b, db => allocate(db, imported.id))).rejects.toThrow("QUOTE_REFERENCE_REFUSED");
 expect((await f.admin.query("SELECT practice_session_digest FROM app.job WHERE id=$1", [imported.id])).rows[0].practice_session_digest).toBeNull();
});

it("fails closed on ambiguous imported ownership, even for the previously assigned owner", async () => {
 const a = await firm(), b = await firm(), sourceA = await job(a), sourceB = await job(b);
 const imported = await job(a, sourceA.id);
 await preview(a, imported);
 // Deliberately damaged historical catalogue fixture. Current v3 uniqueness
 // ordinarily excludes this shape; exercise fail-closed resolution without
 // mocking the resolver or binding. Restore the constraint after this test.
 // 0535 pre-adoption evidence references this key; drop and restore it with the key.
 await f.admin.query("ALTER TABLE app.import_pre_adoption_evidence DROP CONSTRAINT import_pre_adoption_evidence_tenant_id_job_id_fkey");
 await f.admin.query("ALTER TABLE app.job_import_v3 DROP CONSTRAINT job_import_v3_tenant_id_job_id_key");
 const duplicate = randomUUID();
 try {
  const fixture = await f.admin.connect();
  try {
   await fixture.query("BEGIN"); await fixture.query("SET LOCAL session_replication_role='replica'");
   await fixture.query(`INSERT INTO app.job_import_v3(tenant_id,id,job_id,source_job_id,session_digest,command_id,public_request_hash,fixture_id,snapshot,result,meter_exclusion_id,meter_reason,counted_places)
    SELECT tenant_id,$1,job_id,$2,session_digest,$5,public_request_hash,fixture_id,snapshot,result,$3,meter_reason,counted_places
    FROM app.job_import_v3 WHERE job_id=$4`, [duplicate, sourceB.id, randomUUID(), imported.id, randomUUID()]);
   await fixture.query("COMMIT");
  } catch (error) { await fixture.query("ROLLBACK"); throw error; } finally { fixture.release(); }
  await expect(transaction(a, db => allocate(db, imported.id))).rejects.toThrow("QUOTE_REFERENCE_REFUSED");
  await expect(transaction(b, db => allocate(db, imported.id))).rejects.toThrow("QUOTE_REFERENCE_REFUSED");
 } finally {
  const db = await f.admin.connect();
  try {
   await db.query("BEGIN"); await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("DELETE FROM app.job_import_v3 WHERE id=$1", [duplicate]);
   await db.query("ALTER TABLE app.job_import_v3 ADD CONSTRAINT job_import_v3_tenant_id_job_id_key UNIQUE(tenant_id,job_id)");
   await db.query("ALTER TABLE app.import_pre_adoption_evidence ADD CONSTRAINT import_pre_adoption_evidence_tenant_id_job_id_fkey FOREIGN KEY(tenant_id,job_id) REFERENCES app.job_import_v3(tenant_id,job_id)");
   await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
 }
});

it("follows the v1 succeeded receipt and frozen parties without assigning imported ownership", async () => {
 const a = await firm(), stranger = await firm(), source = await job(a), imported = await job(a, source.id);
 const binding = randomUUID(), command = randomUUID(), fixture = await f.admin.connect();
 try {
  await fixture.query("BEGIN"); await fixture.query("SET LOCAL session_replication_role='replica'");
  await fixture.query("DELETE FROM app.job_import_v3 WHERE job_id=$1", [imported.id]);
  await fixture.query(`INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance)
   SELECT tenant_id,$1,$2,100,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,'work_order_import'
   FROM app.job_party_binding WHERE tenant_id=$3 AND job_id=$4 ORDER BY revision DESC LIMIT 1`, [binding, imported.id, tenant, source.id]);
  await fixture.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at)
   VALUES($1,$2,'job.adopt_in_flight',$3,$4,'succeeded',$5,$6,clock_timestamp())`,
  [tenant, command, `import:${imported.id}`, sha("fictional import receipt"), actor, { jobId: imported.id, sourceJobId: source.id }]);
  await fixture.query(`INSERT INTO app.imported_job_baseline(id,tenant_id,job_id,provenance,lineage_strength,baseline_hash,baseline_description,accepted_value_source,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,import_terms_version,attested_by_membership_id,attested_at,party_binding_id)
   VALUES($1,$2,$3,'imported','builder_attested_weaker',$4,'Fictional v1 imported baseline','builder_attestation',10000,'GBP',1000,'reference_fee_policy_v1','synthetic_import_terms_candidate.v1',$5,clock_timestamp(),$6)`,
  [randomUUID(), tenant, imported.id, sha("fictional baseline"), actor, binding]);
  await fixture.query("COMMIT");
 } catch (error) { await fixture.query("ROLLBACK"); throw error; } finally { fixture.release(); }
 await transaction(a, db => document(db, imported, "Q-0777"));
 expect((await preview(a, source)).reference).toBe("Q-0778");
 expect(await transaction(a, db => allocate(db, imported.id))).toBe("Q-0777");
 await expect(transaction(stranger, db => allocate(db, imported.id))).rejects.toThrow("QUOTE_REFERENCE_REFUSED");
 expect((await f.admin.query("SELECT practice_session_digest FROM app.job WHERE id=$1", [imported.id])).rows[0].practice_session_digest).toBeNull();
});

it("keeps ordinary company identity distinct and ignores a forged practice GUC", async () => {
 const t = randomUUID(), m = randomUUID(), u = randomUUID(), account = randomUUID(), j = randomUUID();
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [t]);
 await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [u]);
 await f.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Ordinary fictional company')", [account, t]);
 await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [m, t, account, u]);
 await f.admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Ordinary fictional job')", [j, t]);
 const context = await testBoundTenantContext(f.admin, t, m);
 const { withTenant } = await import("../src/tenant-context.js");
 await expect(withTenant(f.runtime, context, async tx => {
  await tx.$client.query("SELECT set_config('app.practice_material_digest',$1,true)", [legacyFirm.digest]);
  expect(await allocate(tx.$client, j)).toBe("Q-0001");
  // Abort before persistence: this isolated assertion has no preview artifact.
  throw new Error("ORDINARY_ROLLBACK_FIXTURE");
 })).rejects.toThrow("ORDINARY_ROLLBACK_FIXTURE");
 expect((await f.admin.query("SELECT count(*)::int n FROM app.quote_firm_counter WHERE tenant_id=$1", [t])).rows[0].n).toBe(0);
});

it("grandfathers duplicate legacy assignments without consuming or recycling new numbers", async () => {
 const a = await firm(), first = await job(a), second = await job(a);
 // Existing writers remain usable during the dormant foundation interval.
 await transaction(a, async db => { await document(db, first, "Q-0001"); await document(db, second, "Q-0001"); });
 expect(await transaction(a, db => allocate(db, first.id))).toBe("Q-0001");
 expect(await transaction(a, db => allocate(db, second.id))).toBe("Q-0001");
 const assignments = (await f.admin.query("SELECT allocation_kind,allocated_number FROM app.quote_job_reference WHERE job_id=ANY($1::uuid[])", [[first.id, second.id]])).rows;
 expect(assignments).toEqual([{ allocation_kind: "legacy", allocated_number: null }, { allocation_kind: "legacy", allocated_number: null }]);
 expect((await preview(a, await job(a))).reference).toBe("Q-0002");
});
