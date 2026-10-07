import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdoptInFlightJobMutation, appendAuditBatch, authenticatePracticeSession, authorizePracticeJob, issuePracticeSession, DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID, MIGRATION_URLS, migrate, JobPartiesRepository, UserCommandDispatcher, withTenant, type VerifiedTenantContext } from "../src/index.js";
import { closeTestPools } from "./pool-test-utils.js";

const tenant = randomUUID(), foreignTenant = randomUUID(), member = randomUUID();
const migrationURL=MIGRATION_URLS.find(url=>url.pathname.endsWith("0095_job_parties.sql"))!;
const context = { tenantId: tenant } as VerifiedTenantContext;
const foreignContext = { tenantId: foreignTenant } as VerifiedTenantContext;
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, repository: JobPartiesRepository, dir: string;
let legacyInvoice: Record<string,unknown>;
const legacyJobs: string[] = [], legacySnapshot = JSON.stringify({ name: "Earlier synthetic customer", address: ["Earlier address"] });
const command = (action: string, data: Record<string, unknown> = {}) => ({ version: "job-parties-command.v1", commandId: randomUUID(), action, ...data });
const customer = { version: "customer.v1", name: "Fictional Person", type: "person", email: "fixture@example.invalid", phone: "00000000000" };
const site = { version: "site.v1", addressLines: ["14 Fictional Street"], town: "London", postcode: "sw1a1aa", unit: "Flat 1" };
const createJob = async () => { const id=randomUUID();await admin.query(`INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional job','quoting')`,[tenant,id]);return id; };
/** Direct status write as the migration-owner session, in a transaction carrying the tenant context that every
 * application write has: the live guard reads the tenant's current binding through FORCE RLS, so without the context
 * it would see no binding and refuse for the wrong reason. */
const setLiveDirectly = async (job: string) => {
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
    await client.query(`UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2`, [tenant, job]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
};
const saveParties = async (job: string, unit = "Flat 1") => {
  const c = await repository.command(context, member, job, command("create_customer", { customer }));
  const s = await repository.command(context, member, job, command("create_site", { site: { ...site, unit } }));
  const parties = { version: "job-parties.v1", customerRevisionId: c.revisionId, siteRevisionId: s.revisionId };
  return { c, s, parties };
};
describe("individual address lines cannot contain CR/LF", () => {
  it.each(["Second\nThird", "Second\rThird", "Second\r\nThird"])("rejects command and direct runtime SQL without persisting a site: %j", async line => {
    const job = await createJob(), input = command("create_site", { site: { ...site, addressLines: ["First line", line] } });
    await expect(repository.command(context, member, job, input)).rejects.toMatchObject({ code: "INVALID_PARTIES" });
    expect((await admin.query("SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [tenant, input.commandId])).rowCount).toBe(0);
    const siteId = randomUUID();
    await expect(withTenant(runtime, context, async db => {
      await db.$client.query("INSERT INTO app.site(tenant_id,id) VALUES($1,$2)", [tenant, siteId]);
      await db.$client.query("INSERT INTO app.site_revision(tenant_id,id,site_id,revision,payload,match_key) VALUES($1,$2,$3,1,$4,'[]')", [tenant, randomUUID(), siteId, JSON.stringify({ ...site, postcode: "SW1A 1AA", addressLines: ["First line", line] })]);
    })).rejects.toMatchObject({ code: "23514", constraint: "site_revision_address_lines_no_cr_lf" });
    expect((await admin.query("SELECT 1 FROM app.site WHERE tenant_id=$1 AND id=$2", [tenant, siteId])).rowCount).toBe(0);
  });
});
describe("stored party revision schemas at the runtime INSERT boundary", () => {
  it("keeps JavaScript trimming and UTF-16 length boundaries in UTF8", async () => {
    expect((await admin.query("SHOW server_encoding")).rows).toEqual([{ server_encoding: "UTF8" }]);
    const trimCharacters = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680,
      ...Array.from({ length: 11 }, (_, index) => 0x2000 + index), 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff];
    const values = ["", "x", "x".repeat(160), "x".repeat(161),
      ...trimCharacters.flatMap(point => {
        const space = String.fromCodePoint(point);
        return [space.repeat(3), `${space}${"x".repeat(160)}${space}`, `${space}${"x".repeat(161)}${space}`, `x${space}x`];
      }),
      ...[0x85, 0x180e, 0x200b, 0xffff, 0x10000, 0x1f600, 0x10ffff].flatMap(point => {
        const character = String.fromCodePoint(point);
        return [character, character.repeat(80), character.repeat(81), `\u00a0${character.repeat(80)}\ufeff`];
      })];
    const result = await admin.query<{ valid: boolean }>(
      "SELECT app.valid_party_revision_text(value,1,160) AS valid FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS input(value,ordinal) ORDER BY ordinal",
      [JSON.stringify(values)]);
    expect(result.rows.map(row => row.valid)).toEqual(values.map(value => value.trim().length >= 1 && value.trim().length <= 160));
  });
  const invalidSites: Array<[string, Record<string, unknown>]> = [
    ["null line", { addressLines: [null] }], ["number line", { addressLines: [7] }],
    ["empty line", { addressLines: [""] }], ["blank line", { addressLines: [" \t "] }],
    ["overlong first line", { addressLines: ["x".repeat(161)] }],
    ["overlong fourth line", { addressLines: ["One", "Two", "Three", "x".repeat(161)] }],
    ["overlong UTF-16 line", { addressLines: ["😀".repeat(81)] }], ["Unicode blank line", { addressLines: ["\u00a0\ufeff"] }],
    ["non-array lines", { addressLines: "One" }], ["no lines", { addressLines: [] }],
    ["too many lines", { addressLines: ["One", "Two", "Three", "Four", "Five"] }],
    ["number town", { town: 7 }], ["blank town", { town: " \t " }], ["overlong town", { town: "x".repeat(161) }],
    ["null unit", { unit: null }], ["number unit", { unit: 7 }], ["blank unit", { unit: " " }], ["overlong unit", { unit: "x".repeat(161) }],
    ["number UPRN", { uprn: 123 }], ["null UPRN", { uprn: null }], ["overlong UPRN", { uprn: "1".repeat(13) }],
    ["null version", { version: null }], ["missing version", { version: undefined }],
  ];
  it.each(invalidSites)("refuses %s and rolls back the site identity and revision", async (_label, fields) => {
    const id = randomUUID(), revision = randomUUID();
    await expect(withTenant(runtime, context, async db => {
      expect((await db.$client.query("SELECT current_user,pg_has_role(current_user,'jobguard_runtime','USAGE') AS runtime_role")).rows[0]).toEqual({ current_user: "ch3a_login", runtime_role: true });
      await db.$client.query("INSERT INTO app.site(tenant_id,id) VALUES($1,$2)", [tenant, id]);
      await db.$client.query("INSERT INTO app.site_revision(tenant_id,id,site_id,revision,payload,match_key) VALUES($1,$2,$3,1,$4,'[]')", [tenant, revision, id, JSON.stringify({ ...site, postcode: "SW1A 1AA", ...fields })]);
    })).rejects.toMatchObject({ code: "23514" });
    expect((await admin.query("SELECT 1 FROM app.site WHERE tenant_id=$1 AND id=$2", [tenant, id])).rowCount).toBe(0);
    expect((await admin.query("SELECT 1 FROM app.site_revision WHERE tenant_id=$1 AND id=$2", [tenant, revision])).rowCount).toBe(0);
  });
  const invalidCustomers: Array<[string, Record<string, unknown>]> = [
    ["empty phone", { phone: "" }], ["blank phone", { phone: " \t " }], ["short phone", { phone: "12" }],
    ["overlong phone", { phone: "1".repeat(41) }], ["null phone", { phone: null }], ["number phone", { phone: 7 }],
    ["blank name", { name: " \t " }], ["number name", { name: 7 }], ["overlong name", { name: "x".repeat(161) }],
    ["Unicode blank name", { name: "\u00a0\ufeff" }], ["overlong UTF-16 name", { name: "😀".repeat(81) }],
    ["empty email", { email: "" }], ["invalid email", { email: "not-an-email" }], ["overlong email", { email: `${"x".repeat(310)}@example.invalid` }],
    ["number email", { email: 7 }], ["null email", { email: null }],
    ["invalid company number", { companyNumber: "invalid" }], ["number company number", { companyNumber: 12345678 }], ["null company number", { companyNumber: null }],
    ["null version", { version: null }], ["missing version", { version: undefined }], ["invalid type", { type: "other" }],
  ];
  it.each(invalidCustomers)("refuses %s and rolls back the customer identity and revision", async (_label, fields) => {
    const id = randomUUID(), revision = randomUUID();
    await expect(withTenant(runtime, context, async db => {
      expect((await db.$client.query("SELECT current_user,pg_has_role(current_user,'jobguard_runtime','USAGE') AS runtime_role")).rows[0]).toEqual({ current_user: "ch3a_login", runtime_role: true });
      await db.$client.query("INSERT INTO app.customer(tenant_id,id) VALUES($1,$2)", [tenant, id]);
      await db.$client.query("INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) VALUES($1,$2,$3,1,$4)", [tenant, revision, id, JSON.stringify({ ...customer, ...fields })]);
    })).rejects.toMatchObject({ code: "23514" });
    expect((await admin.query("SELECT 1 FROM app.customer WHERE tenant_id=$1 AND id=$2", [tenant, id])).rowCount).toBe(0);
    expect((await admin.query("SELECT 1 FROM app.customer_revision WHERE tenant_id=$1 AND id=$2", [tenant, revision])).rowCount).toBe(0);
  });
  it("keeps valid maximum-length revisions readable in every parties workspace", async () => {
    const job = await createJob();
    const c = await repository.command(context, member, job, command("create_customer", { customer: { ...customer, name: "x".repeat(160), phone: "1".repeat(40), email: `${"x".repeat(304)}@example.invalid`, companyNumber: "AB123456" } }));
    const s = await repository.command(context, member, job, command("create_site", { site: { ...site, addressLines: Array(4).fill("x".repeat(160)), town: "x".repeat(160), unit: "x".repeat(160), uprn: "1".repeat(12) } }));
    const view = await repository.view(context, member, job);
    expect(view.customers.find(row => row.revisionId === c.revisionId)?.customer.phone).toHaveLength(40);
    expect(view.sites.find(row => row.revisionId === s.revisionId)?.site.addressLines).toEqual(Array(4).fill("x".repeat(160)));
    const unicode = await repository.command(context, member, job, command("create_site", { site: { ...site, addressLines: ["😀".repeat(80)] } }));
    expect((await repository.view(context, member, job)).sites.find(row => row.revisionId === unicode.revisionId)?.site.addressLines).toEqual(["😀".repeat(80)]);
  });
});
beforeAll(async () => {
  dir=await mkdtemp(join(tmpdir(),"ch3a-pg16-"));const port=58000+Math.floor(Math.random()*300);
  postgres=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
  await postgres.initialise();await postgres.start();admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});
  // Upgrade from the exact previous supported schema with each lifecycle state.
  for (const url of MIGRATION_URLS.slice(0,MIGRATION_URLS.indexOf(migrationURL))) await admin.query(await readFile(url,"utf8"));
  const user=randomUUID(),account=randomUUID();
  await admin.query(`INSERT INTO control_plane.tenant(id) VALUES($1),($2)`,[tenant,foreignTenant]);
  await admin.query(`INSERT INTO identity.identity_user(id) VALUES($1)`,[user]);
  await admin.query(`INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional')`,[tenant,account]);
  await admin.query(`INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')`,[tenant,member,account,user]);
  for (const status of ["draft","quoting","accepted","live","invoiced","paid","lost"]) {const job=randomUUID();legacyJobs.push(job);await admin.query(`INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Old fictional job',$3)`,[tenant,job,status]);}
  const draft=randomUUID(),revision=randomUUID();
  await admin.query(`INSERT INTO app.quote_draft(tenant_id,id,job_id,revision) VALUES($1,$2,$3,1)`,[tenant,draft,legacyJobs[0]]);
  await admin.query(`INSERT INTO app.quote_revision(tenant_id,id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers) VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',100,0,100,20,120,true,'[]')`,[tenant,revision,legacyJobs[0],draft]);
  await admin.query(`INSERT INTO app.quote_document_version(tenant_id,id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot) VALUES($1,$2,$3,$2,1,'OLD',$4,'old','v1',4,'{}',$5,$5)`,[tenant,revision,legacyJobs[0],"a".repeat(64),legacySnapshot]);
  await admin.query(`INSERT INTO app.quote_version(tenant_id,id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,100,'issued')`,[tenant,revision,legacyJobs[0],"a".repeat(64)]);
  const finalDraft=randomUUID(),finalRevision=randomUUID();
  await admin.query(`INSERT INTO app.final_account_draft(tenant_id,id,job_id) VALUES($1,$2,$3)`,[tenant,finalDraft,legacyJobs[0]]);
  await admin.query(`INSERT INTO app.final_account_revision(tenant_id,id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings) VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',100,20,120,false,'[]')`,[tenant,finalRevision,legacyJobs[0],finalDraft,"b".repeat(64),revision]);
  await admin.query(`UPDATE app.final_account_draft SET revision=1,current_revision_id=$1 WHERE tenant_id=$2 AND id=$3`,[finalRevision,tenant,finalDraft]);
  const invoiceClient=await admin.connect();
  try {await invoiceClient.query("BEGIN");await invoiceClient.query(`SELECT set_config('app.tenant_id',$1,true)`,[tenant]);await invoiceClient.query(`SELECT app.issue_practice_customer_invoice($1,$2,$3,$4,$5,'fixture@example.invalid','2026-09-17')`,[tenant,legacyJobs[0],finalRevision,member,randomUUID()]);await invoiceClient.query("COMMIT");}catch(error){await invoiceClient.query("ROLLBACK");throw error;}finally{invoiceClient.release();}
  legacyInvoice=(await admin.query(`SELECT id,pdf_bytes,pdf_sha256 FROM app.customer_invoice WHERE tenant_id=$1`,[tenant])).rows[0];
  const migration=await readFile(migrationURL,"utf8");
  await admin.query(migration.replace("BEGIN;","BEGIN; SELECT set_config('app.deployment_mode','synthetic_demo',true);"));
  await admin.query(`CREATE ROLE ch3a_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO ch3a_login;`);
  runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"ch3a_login",password:"synthetic",max:5});repository=new JobPartiesRepository(runtime);
},60000);
afterAll(async()=>{await closeTestPools(runtime,admin);await postgres?.stop();if(dir)await rm(dir,{recursive:true,force:true});});

describe("CH-3a real PostgreSQL guarantees",()=>{
  it("backfills synthetic jobs across all states with provenance and preserves earlier document bytes/hashes",async()=>{
    const bindings=await admin.query(`SELECT provenance FROM app.job_party_binding WHERE tenant_id=$1 ORDER BY job_id`,[tenant]);expect(bindings.rowCount).toBe(7);
    expect(bindings.rows.filter(x=>x.provenance==="backfilled_from_quote_snapshot")).toHaveLength(1);
    const old=(await admin.query(`SELECT customer,snapshot,content_hash,parties_snapshot FROM app.quote_document_version WHERE tenant_id=$1`,[tenant])).rows[0];
    expect((await admin.query(`SELECT id,pdf_bytes,pdf_sha256 FROM app.customer_invoice WHERE tenant_id=$1`,[tenant])).rows[0]).toEqual(legacyInvoice);
    expect((await admin.query(`SELECT parties_snapshot FROM app.customer_invoice WHERE tenant_id=$1`,[tenant])).rows[0].parties_snapshot).toBeNull();
    expect(old.customer).toEqual(JSON.parse(legacySnapshot));expect(old.snapshot).toEqual(JSON.parse(legacySnapshot));expect(old.content_hash).toBe("a".repeat(64));expect(old.parties_snapshot).toBeNull();
  });
  it("fails closed without tenant context, rejects foreign members, and keeps runtime grants narrow",async()=>{
    expect((await runtime.query(`SELECT * FROM app.customer`)).rows).toEqual([]);
    await expect(repository.view(context,randomUUID(),legacyJobs[0]!)).rejects.toThrow("FORBIDDEN");
    expect((await withTenant(runtime,foreignContext,db=>db.$client.query(`SELECT * FROM app.job_party_binding`))).rows).toEqual([]);
    const tables=["customer","customer_revision","site","site_revision","job_party_binding","job_party_current"];
    const catalog=await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1)`,[tables]);
    expect(catalog.rowCount).toBe(6);for(const row of catalog.rows)expect(row).toMatchObject({relrowsecurity:true,relforcerowsecurity:true,owner:"jobguard_migration"});
    expect((await admin.query("SELECT prosecdef,provolatile,pg_get_userbyid(proowner) AS owner,has_function_privilege('jobguard_runtime',oid,'EXECUTE') AS runtime_allowed FROM pg_proc WHERE oid='app.valid_party_revision_text(jsonb,integer,integer)'::regprocedure")).rows).toEqual([{ prosecdef: false, provolatile: "i", owner: "jobguard_migration", runtime_allowed: true }]);
    expect((await admin.query("SELECT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='app.valid_party_revision_text(jsonb,integer,integer)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') AS public_allowed")).rows).toEqual([{ public_allowed: false }]);
    for(const table of tables){
      for(const verb of ["UPDATE","DELETE","TRUNCATE"]){const sql=verb==="UPDATE"?`UPDATE app.${table} SET tenant_id=tenant_id`:verb==="DELETE"?`DELETE FROM app.${table}`:`TRUNCATE app.${table}`;await expect(withTenant(runtime,context,db=>db.$client.query(sql))).rejects.toMatchObject({code:"42501"});}
    }
    const execute=await admin.query(`SELECT has_function_privilege('jobguard_runtime','app.bind_job_parties(uuid,uuid,uuid,integer,uuid,uuid,uuid,boolean,text,uuid,uuid)','EXECUTE') allowed,EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='app.bind_job_parties(uuid,uuid,uuid,integer,uuid,uuid,uuid,boolean,text,uuid,uuid)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') public_allowed`);
    expect(execute.rows[0]).toEqual({allowed:true,public_allowed:false});
    await expect(withTenant(runtime,context,db=>db.$client.query(`INSERT INTO app.job_party_current VALUES($1,$2,$3)`,[tenant,legacyJobs[0],randomUUID()]))).rejects.toMatchObject({code:"42501"});
  });
  it("refuses live and adoption without parties in the PostgreSQL boundary and rolls back",async()=>{
    const job=await createJob();
    await expect(setLiveDirectly(job)).rejects.toThrow("JOB_PARTIES_REQUIRED");
    await expect(withTenant(runtime,context,db=>db.$client.query(`SELECT app.adopt_in_flight_job($1,$2,$3,'Fictional import','live',$4,'Fictional baseline',100000,1500,'reference_fee_policy_v1','synthetic_import_terms_candidate.v1',$5,now())`,[tenant,randomUUID(),randomUUID(),"b".repeat(64),member]))).rejects.toThrow("JOB_PARTIES_REQUIRED");
    expect((await repository.view(context,member,job)).current).toBeNull();
  });
  it("serializes concurrent bindings, deduplicates replay and conflicts on changed payloads",async()=>{
    const job=await createJob(),{parties}=await saveParties(job);
    const a=command("bind",{expectedJobRevision:0,parties}),b=command("bind",{expectedJobRevision:0,parties});
    const results=await Promise.allSettled([repository.command(context,member,job,a),repository.command(context,member,job,b)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(results.find(r=>r.status==="rejected")).toMatchObject({reason:{code:"REVISION_CONFLICT"}});
    const winner=results[0]?.status==="fulfilled"?a:b;
    const first=await repository.command(context,member,job,winner);expect(await repository.command(context,member,job,winner)).toEqual(first);
    await expect(repository.command(context,member,job,{...winner,expectedJobRevision:1})).rejects.toThrow("COMMAND_CONFLICT");
    expect((await admin.query(`SELECT count(*)::int n FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2`,[tenant,job])).rows[0].n).toBe(1);
    const binding=(await repository.view(context,member,job)).current!;
    expect((await repository.list(context,member)).jobs.find(row=>row.id===job)).toMatchObject({customerLabel:customer.name,siteLabel:"Flat 1, 14 Fictional Street, SW1A 1AA"});
    await expect(admin.query(`INSERT INTO app.job_party_current VALUES($1,$2,$3)`,[tenant,job,binding.bindingId])).rejects.toMatchObject({code:"23505"});
    const otherJob=await createJob();
    await expect(admin.query(`INSERT INTO app.job_party_current VALUES($1,$2,$3)`,[tenant,otherJob,binding.bindingId])).rejects.toMatchObject({code:"23503"});
    const losing=results[0]?.status==="fulfilled"?b:a;
    expect((await admin.query(`SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2`,[tenant,losing.commandId])).rowCount).toBe(0);
  });
  it("proposes normalized matches without automatic reuse; different and unknown units stay separate",async()=>{
    const job=await createJob(),a=await saveParties(job),b=await repository.command(context,member,job,command("create_site",{site:{...site,postcode:"SW1A 1AA"}}));
    expect(a.s.id).not.toBe(b.id);
    const match=await admin.query(`SELECT count(*)::int n FROM app.site_revision WHERE tenant_id=$1 AND match_key=(SELECT match_key FROM app.site_revision WHERE tenant_id=$1 AND id=$2)`,[tenant,a.s.revisionId]);expect(match.rows[0].n).toBeGreaterThanOrEqual(2);
    await expect(repository.command(context,member,job,command("create_site",{site,reuseSiteId:a.s.id}))).rejects.toThrow("SAME_PLACE_CONFIRMATION_REQUIRED");
    const reused=await repository.command(context,member,job,command("create_site",{site,reuseSiteId:a.s.id,confirmSamePlace:true}));expect(reused.id).toBe(a.s.id);
    await expect(repository.command(context,member,job,command("create_site",{site:{...site,unit:"Flat 2"},reuseSiteId:a.s.id,confirmSamePlace:true}))).rejects.toThrow("PARTY_NOT_FOUND");
    // An unrelated address with the same unit is not the same place, whatever the client claims.
    await expect(repository.command(context,member,job,command("create_site",{site:{...site,postcode:"EC1A 1BB",addressLines:["1 Unrelated Road"]},reuseSiteId:a.s.id,confirmSamePlace:true}))).rejects.toThrow("PARTY_NOT_FOUND");
  });
  it("groups shared identities and appends post-live corrections without changing historic bindings or snapshots",async()=>{
    const one=await createJob(),two=await createJob(),{parties}=await saveParties(one);
    for(const job of [one,two])await repository.command(context,member,job,command("bind",{expectedJobRevision:0,parties}));
    const before=(await repository.view(context,member,one)).current!;
    expect((await repository.view(context,member,one)).recognition.map(r=>r.jobId).sort()).toEqual([one,two].sort());
    await setLiveDirectly(one);
    await expect(repository.command(context,member,one,command("bind",{expectedJobRevision:1,parties}))).rejects.toThrow("CORRECTION_REASON_REQUIRED");
    await expect(repository.command(context,member,one,command("correct",{expectedJobRevision:1,parties}))).rejects.toThrow("CORRECTION_REASON_REQUIRED");
    await repository.command(context,member,one,command("correct",{expectedJobRevision:1,parties,reason:"Correct fictional payer"}));
    expect((await admin.query(`SELECT snapshot FROM app.job_party_snapshot WHERE tenant_id=$1 AND binding_id=$2`,[tenant,before.bindingId])).rows[0].snapshot).toEqual(before);
    const audit=await admin.query(`SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type LIKE 'job.parties.%'`,[tenant]);
    for(const {payload} of audit.rows){expect(Object.keys(payload).sort()).toEqual(["classifications","hashes","references"]);expect(Object.keys(payload.references).sort()).toEqual(["commandId","identityId"]);expect(JSON.stringify(payload)).not.toMatch(/Fictional|Street|example\.invalid|00000000000|Correct fictional/u);}
  });
  it("uses composite foreign keys to reject cross-tenant parties and hides foreign identities",async()=>{
    const job=await createJob(),{parties,c}=await saveParties(job);
    const foreignCustomer=randomUUID(),foreignCustomerRevision=randomUUID(),foreignSite=randomUUID(),foreignSiteRevision=randomUUID();
    await admin.query(`INSERT INTO app.customer(tenant_id,id) VALUES($1,$2)`,[foreignTenant,foreignCustomer]);
    await admin.query(`INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) VALUES($1,$2,$3,1,$4)`,[foreignTenant,foreignCustomerRevision,foreignCustomer,JSON.stringify(customer)]);
    await admin.query(`INSERT INTO app.site(tenant_id,id) VALUES($1,$2)`,[foreignTenant,foreignSite]);
    await admin.query(`INSERT INTO app.site_revision(tenant_id,id,site_id,revision,payload,match_key) VALUES($1,$2,$3,1,$4,'[]')`,[foreignTenant,foreignSiteRevision,foreignSite,JSON.stringify({...site,postcode:"SW1A 1AA"})]);
    for(const [key,id] of [["customerRevisionId",foreignCustomerRevision],["payingPartyRevisionId",foreignCustomerRevision],["siteRevisionId",foreignSiteRevision]]){
      await expect(repository.command(context,member,job,command("bind",{expectedJobRevision:0,parties:{...parties,[key!]:id}}))).rejects.toThrow("PARTY_NOT_FOUND");
    }
    const view=await repository.view(context,member,job);
    expect(view.customers.map(x=>x.id)).not.toContain(foreignCustomer);expect(view.sites.map(x=>x.id)).not.toContain(foreignSite);
    for(const [customerId,customerRevision,payerId,payerRevision,siteId,siteRevision] of [
      [foreignCustomer,foreignCustomerRevision,c.id,c.revisionId,view.sites.find(x=>x.revisionId===parties.siteRevisionId)!.id,parties.siteRevisionId],
      [c.id,c.revisionId,foreignCustomer,foreignCustomerRevision,view.sites.find(x=>x.revisionId===parties.siteRevisionId)!.id,parties.siteRevisionId],
      [c.id,c.revisionId,c.id,c.revisionId,foreignSite,foreignSiteRevision],
    ])await expect(admin.query(`INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance) VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,'entered')`,[tenant,randomUUID(),job,customerId,customerRevision,payerId,payerRevision,siteId,siteRevision])).rejects.toMatchObject({code:"23503"});
    await expect(repository.command(context,member,job,command("bind",{expectedJobRevision:0,parties:{...parties,customerRevisionId:randomUUID()}}))).rejects.toThrow("PARTY_NOT_FOUND");
    await expect(admin.query(`INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) VALUES($1,$2,$3,1,$4)`,[foreignTenant,randomUUID(),c.id,JSON.stringify(customer)])).rejects.toMatchObject({code:"23503"});
    await expect(withTenant(runtime,context,db=>db.$client.query(`INSERT INTO app.customer(tenant_id,id) VALUES($1,$2)`,[foreignTenant,randomUUID()]))).rejects.toMatchObject({code:"42501"});
  });
  it.each(["customer", "payer"])("keeps a job's exact bound %s revision when another job revises and binds the shared registry identity", async party => {
    const first = await createJob(), second = await createJob(), { c, parties } = await saveParties(first);
    const pay = await repository.command(context, member, first, command("create_customer", { customer: { ...customer, name: "Fictional payer" } }));
    const initial = { ...parties, payingPartyRevisionId: pay.revisionId };
    for (const job of [first, second]) await repository.command(context, member, job, command("bind", { expectedJobRevision: 0, parties: initial }));
    const before = await repository.view(context, member, first);
    const shared = party === "customer" ? c : pay;
    const updated = await repository.command(context, member, second, command("revise_customer", { customerId: shared.id, expectedRevision: 1, customer: { ...customer, name: "Revised on the other fictional job" } }));
    await repository.command(context, member, second, command("bind", { expectedJobRevision: 1, parties: { ...initial, [party === "customer" ? "customerRevisionId" : "payingPartyRevisionId"]: updated.revisionId } }));
    const reopened = await repository.view(context, member, first);
    expect(reopened.current).toEqual(before.current);
    expect(reopened.customers.find(row => row.id === shared.id)?.revisionId).toBe(updated.revisionId);
    // Registry suggestions stay current, but a job's saved snapshot is the source for unchanged saves.
    await repository.command(context, member, first, command("bind", { expectedJobRevision: reopened.jobRevision, parties: {
      version: "job-parties.v1", customerRevisionId: reopened.current!.customerRevisionId,
      payingPartyRevisionId: reopened.current!.payingPartyRevisionId, siteRevisionId: reopened.current!.siteRevisionId,
    } }));
    const saved = await repository.view(context, member, first);
    expect(saved.current!.customerRevisionId).toBe(before.current!.customerRevisionId);
    expect(saved.current!.payingPartyRevisionId).toBe(before.current!.payingPartyRevisionId);
    expect(saved.current!.customer).toEqual(before.current!.customer); expect(saved.current!.payingParty).toEqual(before.current!.payingParty);
    expect(saved.customers).toEqual(reopened.customers); expect(saved.sites).toEqual(reopened.sites);
    expect((await repository.view(context, member, second)).current![party === "customer" ? "customerRevisionId" : "payingPartyRevisionId"]).toBe(updated.revisionId);
  });

  it("keeps customer revisions immutable, replayable and guarded by their expected revision",async()=>{
    const job=await createJob(),{c,parties}=await saveParties(job);
    await repository.command(context,member,job,command("bind",{expectedJobRevision:0,parties}));
    const before=(await repository.view(context,member,job)).current;
    const change=command("revise_customer",{customerId:c.id,expectedRevision:1,customer:{...customer,name:"Corrected fictional person"}});
    const result=await repository.command(context,member,job,change);
    expect(result.revision).toBe(2);expect(await repository.command(context,member,job,change)).toEqual(result);
    await expect(repository.command(context,member,job,{...change,customer:{...customer,name:"Different fictional person"}})).rejects.toThrow("COMMAND_CONFLICT");
    await expect(repository.command(context,member,job,{...change,commandId:randomUUID()})).rejects.toThrow("REVISION_CONFLICT");
    expect((await repository.view(context,member,job)).current).toEqual(before);
    expect((await admin.query(`SELECT payload FROM app.customer_revision WHERE tenant_id=$1 AND id=$2`,[tenant,c.revisionId])).rows[0].payload).toEqual(customer);
  });
  it("fresh installation invents no non-synthetic parties and raises details-needed Decisions",async()=>{
    await admin.query(`CREATE DATABASE ch3a_fresh`);const fresh=new Pool({...admin.options,password:"synthetic",database:"ch3a_fresh"});
    try{
      for(const url of MIGRATION_URLS.slice(0,MIGRATION_URLS.indexOf(migrationURL)))await fresh.query(await readFile(url,"utf8"));
      const t=randomUUID(),j=randomUUID();await fresh.query(`INSERT INTO control_plane.tenant(id) VALUES($1)`,[t]);await fresh.query(`INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'No invented details')`,[t,j]);
      await fresh.query(await readFile(migrationURL,"utf8"));
      expect((await fresh.query(`SELECT count(*)::int n FROM app.customer`)).rows[0].n).toBe(0);
      expect((await fresh.query(`SELECT action_type FROM app.decision WHERE tenant_id=$1 AND subject_ref=$2`,[t,j])).rows[0].action_type).toBe("job.parties.details_needed");
    }finally{await fresh.end();}
  });
  it("applies the full migration chain to a SQL_ASCII database without UTF8 encoding", async () => {
    // Reuse this suite's cluster; template0 permits a different database encoding.
    // Do not change the encoding flags of the six earlier regression suites.
    await admin.query("CREATE DATABASE ch3a_sql_ascii TEMPLATE template0 ENCODING 'SQL_ASCII' LC_COLLATE 'C' LC_CTYPE 'C'");
    const ascii = new Pool({ ...admin.options, password: "synthetic", database: "ch3a_sql_ascii", max: 1 });
    try {
      expect((await ascii.query("SHOW server_encoding")).rows).toEqual([{ server_encoding: "SQL_ASCII" }]);
      await migrate(ascii);
      const expected = MIGRATION_URLS.map(url => url.pathname.split("/").at(-1));
      expect((await ascii.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name)).toEqual(expected);
      expect((await ascii.query("SELECT to_regprocedure('app.valid_party_revision_text(jsonb,integer,integer)') IS NOT NULL AS installed")).rows).toEqual([{ installed: true }]);
      await migrate(ascii);
      expect((await ascii.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name)).toEqual(expected);
    } finally {
      await ascii.end();
      await admin.query("DROP DATABASE ch3a_sql_ascii");
    }
  });
});

describe("CH-3a adoption authorization boundary (round 2)",()=>{
  const OWNER_POLICY="synthetic_import_terms_candidate.v1";
  const adoptInput=(job:string,hash:string,customerRevisionId:string,siteRevisionId:string)=>({parties:{customerRevisionId,siteRevisionId},version:"adopt-job.v1" as const,jobId:job,baselineId:randomUUID(),title:"Fictional import",lifecyclePoint:"live" as const,provenance:"imported" as const,lineageStrength:"builder_attested_weaker" as const,baselineHash:hash,baselineDescription:"Fictional baseline",acceptedNetValuePence:100000,recoveryCapPence:1500,acceptedValueSource:"builder_attestation" as const,attestedByMembershipId:member,attestedAt:new Date(0),importTermsVersion:OWNER_POLICY as typeof OWNER_POLICY,feePolicyVersion:"reference_fee_policy_v1" as const,mode:"synthetic_candidate" as const});
  const commandFor=(job:string,hash:string)=>({version:"command.v1" as const,commandId:randomUUID(),commandType:"job.adopt_in_flight",semanticKey:`import:${job}`,actorMembershipId:member,subjectType:"job",subjectRef:job,action:{actionType:"job.adopt_in_flight",recipient:null,contentHash:hash,aggregateRevision:0,amountPence:100000,currency:"GBP" as const,policyVersion:OWNER_POLICY,expiresAt:new Date(Date.now()+60000)}});
  const callAdopt=(a:{job:string;hash:string;customer:string;site:string;command:string;authorization:string;actor?:string;net?:number;policy?:string;baseline?:string})=>withTenant(runtime,context,db=>db.$client.query(
    `SELECT app.adopt_in_flight_job($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [tenant,a.job,a.baseline??randomUUID(),"Fictional import","live",a.hash,"Fictional baseline",a.net??100000,1500,"reference_fee_policy_v1",a.policy??OWNER_POLICY,a.actor??member,new Date(0),a.customer,a.site,null,a.command,a.authorization]));
  // The rows the command dispatcher writes, created directly so each defect can be isolated.
  async function authority(o:{job:string;hash:string;actor?:string;net?:number;policy?:string;expiresInMs?:number;revoked?:boolean;receipt?:"processing"|"succeeded";subject?:string}){
    const command=randomUUID(),decision=randomUUID(),resolution=randomUUID(),authorization=randomUUID(),actor=o.actor??member,receipt=o.receipt??"processing";
    await admin.query(`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at) VALUES($1,$2,'job.adopt_in_flight',$3,$4,$5,$6,$7,$8)`,
      [command,tenant,`import:${o.job}`,"d".repeat(64),receipt,actor,receipt==="succeeded"?"{}":null,receipt==="succeeded"?new Date():null]);
    await admin.query(`INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'job.adopt_in_flight')`,[decision,tenant,o.subject??o.job]);
    await admin.query(`INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)`,[resolution,tenant,decision,actor]);
    await admin.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at,revoked_at) VALUES($1,$2,$3,$4,$5,'job.adopt_in_flight',NULL,$6,0,$7,'GBP',$8,$9,$10)`,
      [authorization,tenant,decision,resolution,actor,o.hash,o.net??100000,o.policy??OWNER_POLICY,new Date(Date.now()+(o.expiresInMs??60000)),o.revoked?new Date():null]);
    return {command,authorization};
  }
  async function extraOwner(kind:"revoked"|"expired"){
    const user=randomUUID(),id=randomUUID(),account=(await admin.query(`SELECT id FROM app.account WHERE tenant_id=$1 LIMIT 1`,[tenant])).rows[0].id;
    await admin.query(`INSERT INTO identity.identity_user(id) VALUES($1)`,[user]);
    await admin.query(`INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role,revoked_at,expires_at) VALUES($1,$2,$3,$4,'owner',$5,$6)`,
      [tenant,id,account,user,kind==="revoked"?new Date(Date.now()-3600_000):null,kind==="expired"?new Date(Date.now()-3600_000):null]);
    return id;
  }
  // Everything the dispatcher does in one transaction: the routine, the audit events and the receipt completion.
  const executeDirect=(a:{job:string;hash:string;customer:string;site:string;command:string;authorization:string},steps:{audit?:boolean;receipt?:boolean;auditedAuthorization?:string}={})=>withTenant(runtime,context,async db=>{
    const baseline=randomUUID();
    await db.$client.query(`SELECT app.adopt_in_flight_job($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,[tenant,a.job,baseline,"Fictional import","live",a.hash,"Fictional baseline",100000,1500,"reference_fee_policy_v1",OWNER_POLICY,member,new Date(0),a.customer,a.site,null,a.command,a.authorization]);
    if(steps.audit!==false)await appendAuditBatch(db,[
      {id:randomUUID(),version:"audit.v1",actorRef:`membership:${member}`,eventType:"job.imported_baseline_attested",subjectType:"job",subjectRef:a.job,payload:{references:{baselineId:baseline,attestedByMembershipId:member},classifications:{action:"commercial"}}},
      {id:randomUUID(),version:"audit.v1",actorRef:`membership:${member}`,eventType:"command.succeeded",subjectType:"job",subjectRef:a.job,payload:{references:{commandId:a.command,authorizationId:steps.auditedAuthorization??a.authorization},classifications:{action:"commercial"}}}]);
    if(steps.receipt!==false)await db.$client.query(`UPDATE app.command_receipt SET status='succeeded',result='{"ok":true}'::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2`,[tenant,a.command]);
  });
  const exists=async(job:string)=>(await admin.query(`SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2`,[tenant,job])).rowCount===1;
  const revisions=async()=>{const {c,s}=await saveParties(await createJob());return{customer:c.revisionId as string,site:s.revisionId as string};};

  it("adopts through the dispatcher with command, authorization, result and audit recorded together",async()=>{
    const {customer,site}=await revisions(),job=randomUUID(),hash="e".repeat(64),command=commandFor(job,hash);
    await new UserCommandDispatcher(runtime).dispatch(context,command,new AdoptInFlightJobMutation(tenant,"synthetic_candidate",adoptInput(job,hash,customer,site)));
    expect((await admin.query(`SELECT status FROM app.job WHERE tenant_id=$1 AND id=$2`,[tenant,job])).rows[0].status).toBe("live");
    expect((await admin.query(`SELECT 1 FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2`,[tenant,job])).rowCount).toBe(1);
    expect((await admin.query(`SELECT status FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2`,[tenant,command.commandId])).rows[0].status).toBe("succeeded");
    expect((await admin.query(`SELECT event_type FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 ORDER BY event_type`,[tenant,job])).rows.map(r=>r.event_type)).toEqual(["command.succeeded","job.imported_baseline_attested"]);
  });
  it("rolls the command, authorization and job back together when the adoption fails inside the boundary",async()=>{
    const {site}=await revisions(),job=randomUUID(),hash="f".repeat(64),command=commandFor(job,hash);
    await expect(new UserCommandDispatcher(runtime).dispatch(context,command,new AdoptInFlightJobMutation(tenant,"synthetic_candidate",adoptInput(job,hash,randomUUID(),site)))).rejects.toMatchObject({code:"22023"});
    expect(await exists(job)).toBe(false);
    expect((await admin.query(`SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2`,[tenant,command.commandId])).rowCount).toBe(0);
    expect((await admin.query(`SELECT 1 FROM app.decision WHERE tenant_id=$1 AND subject_ref=$2`,[tenant,job])).rowCount).toBe(0);
  });
  it("refuses runtime SQL that carries no command or authorization, and creates nothing",async()=>{
    const {customer,site}=await revisions(),job=randomUUID(),hash="a1".repeat(32);
    await expect(callAdopt({job,hash,customer,site,command:randomUUID(),authorization:randomUUID()})).rejects.toMatchObject({code:"42501"});
    expect(await exists(job)).toBe(false);
  });
  it("refuses each missing authority on its own: actor, authorization and receipt",async()=>{
    const {customer,site}=await revisions(),hash="b2".repeat(32),revoked=await extraOwner("revoked"),expired=await extraOwner("expired");
    const cases:Array<[string,Partial<Parameters<typeof authority>[0]>,{actor?:string;net?:number;policy?:string}]>=[
      ["revoked actor",{actor:revoked},{actor:revoked}],
      ["expired actor",{actor:expired},{actor:expired}],
      ["revoked authorization",{revoked:true},{}],
      ["expired authorization",{expiresInMs:-1000},{}],
      ["spent receipt",{receipt:"succeeded"},{}],
      ["authorization for another job",{subject:randomUUID()},{}],
      ["authorization for a different amount",{net:99999},{}],
      ["authorization for a different policy",{policy:"synthetic_import_terms_other.v1"},{}],
      ["authorization for different content",{hash:"c3".repeat(32)},{}],
    ];
    for(const [label,seed,call] of cases){
      const job=randomUUID(),{command,authorization}=await authority({job,hash,...seed});
      await expect(callAdopt({job,hash,customer,site,command,authorization,...call}),label).rejects.toMatchObject({code:"42501"});
      expect(await exists(job),label).toBe(false);
    }
    // A receipt for one job paired with another job's valid authorization, in a call that targets the second job.
    const a=randomUUID(),b=randomUUID(),first=await authority({job:a,hash}),second=await authority({job:b,hash});
    await expect(callAdopt({job:b,hash,customer,site,command:first.command,authorization:second.authorization})).rejects.toMatchObject({code:"42501"});
    expect(await exists(b)).toBe(false);
    // And the reverse pairing.
    await expect(callAdopt({job:a,hash,customer,site,command:second.command,authorization:first.authorization})).rejects.toMatchObject({code:"42501"});
    expect(await exists(a)).toBe(false);
  });
  it("cannot commit a direct execution that records no result or no audit",async()=>{
    const {customer,site}=await revisions(),hash="e5".repeat(32);
    for(const [label,steps] of [["no audit and no receipt completion",{audit:false,receipt:false}],["audit but receipt left processing",{receipt:false}],["receipt completed but no audit",{audit:false}],["audit naming a different authorization",{auditedAuthorization:randomUUID()}]] as Array<[string,{audit?:boolean;receipt?:boolean;auditedAuthorization?:string}]>){
      const job=randomUUID(),{command,authorization}=await authority({job,hash});
      await expect(executeDirect({job,hash,customer,site,command,authorization},steps),label).rejects.toMatchObject({code:"23514"});
      expect(await exists(job),label).toBe(false);
    }
  });
  it("commits a direct execution that completes the receipt and appends both audit events, bound to the exact receipt and authorization",async()=>{
    const {customer,site}=await revisions(),job=randomUUID(),hash="d4".repeat(32),{command,authorization}=await authority({job,hash});
    await executeDirect({job,hash,customer,site,command,authorization});
    expect(await exists(job)).toBe(true);
    expect((await admin.query(`SELECT 1 FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2`,[tenant,job])).rowCount).toBe(1);
    expect((await admin.query(`SELECT status FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2`,[tenant,command])).rows[0].status).toBe("succeeded");
    expect((await admin.query(`SELECT event_type FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 ORDER BY event_type`,[tenant,job])).rows.map(r=>r.event_type)).toEqual(["command.succeeded","job.imported_baseline_attested"]);
  });
});

describe("CH-3a binding changes leave their record (round 4)",()=>{
  type Steps={complete?:boolean;audit?:boolean;auditBinding?:string;auditJob?:string;auditCommand?:string;resultId?:string;twice?:boolean;eventType?:string};
  // Everything the repository does for one binding change in one transaction: claim the receipt, call the routine, complete the receipt, append the audit event.
  const bindDirect=async(job:string,customerRevision:string,siteRevision:string,steps:Steps={})=>{
    const command=randomUUID(),binding=randomUUID(),other=randomUUID();
    const expected=(await repository.view(context,member,job)).jobRevision;
    await withTenant(runtime,context,async db=>{
      await db.$client.query(`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'job.parties',$3,$4,'processing',$5)`,[command,tenant,command,"d".repeat(64),member]);
      const bind=(id:string,revision:number)=>db.$client.query(`SELECT app.bind_job_parties($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[tenant,job,id,revision,customerRevision,null,siteRevision,false,null,member,command]);
      await bind(binding,expected);
      if(steps.twice)await bind(other,expected+1);
      if(steps.complete!==false)await db.$client.query(`UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2`,[tenant,command,JSON.stringify({id:steps.resultId??binding})]);
      if(steps.audit!==false)await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${member}`,eventType:steps.eventType??"job.parties.bind",subjectType:"job",subjectRef:steps.auditJob??job,payload:{references:{commandId:steps.auditCommand??command,identityId:steps.auditBinding??binding},hashes:{request:"d".repeat(64)},classifications:{action:"operational"}}}]);
    });
    return{command,binding};
  };
  const untouched=async(job:string,revision:number)=>{
    expect((await admin.query(`SELECT count(*)::int n FROM app.job_party_binding WHERE tenant_id=$1 AND job_id=$2`,[tenant,job])).rows[0].n).toBe(0);
    expect((await admin.query(`SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2`,[tenant,job])).rows[0].revision).toBe(revision);
  };
  it("cannot commit a binding change whose receipt is not completed or whose audit event is missing or does not match",async()=>{
    const cases:Array<[string,Steps]>=[
      ["no completion and no audit",{complete:false,audit:false}],
      ["audit but the receipt left processing",{complete:false}],
      ["completion but no audit",{audit:false}],
      ["audit naming a different binding",{auditBinding:randomUUID()}],
      ["audit naming a different command",{auditCommand:randomUUID()}],
      ["audit for a different job",{auditJob:randomUUID()}],
      ["receipt result naming a different binding",{resultId:randomUUID()}],
      ["correction audit missing its reason's event type",{eventType:"job.parties.create_customer"}],
    ];
    for(const [label,steps] of cases){
      const job=await createJob(),{c,s}=await saveParties(job);
      await expect(bindDirect(job,c.revisionId,s.revisionId,steps),label).rejects.toMatchObject({code:"23514"});
      await untouched(job,0);
    }
  });
  it("commits a binding change that completes its receipt and appends its audit event, linked to that exact command",async()=>{
    const job=await createJob(),{c,s}=await saveParties(job),{command,binding}=await bindDirect(job,c.revisionId,s.revisionId);
    const row=(await admin.query(`SELECT command_id,revision FROM app.job_party_binding WHERE tenant_id=$1 AND id=$2`,[tenant,binding])).rows[0];
    expect(row).toEqual({command_id:command,revision:1});
    expect((await admin.query(`SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2`,[tenant,job])).rows[0].binding_id).toBe(binding);
  });
  it("does not let one receipt authorize two binding effects",async()=>{
    const job=await createJob(),{c,s}=await saveParties(job);
    await expect(bindDirect(job,c.revisionId,s.revisionId,{twice:true}),"two in one transaction").rejects.toMatchObject({code:"23505"});
    await untouched(job,0);
    // A receipt that has already been used cannot be claimed again for another binding.
    const used=await bindDirect(job,c.revisionId,s.revisionId),next=randomUUID();
    await expect(withTenant(runtime,context,db=>db.$client.query(`SELECT app.bind_job_parties($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[tenant,job,next,1,c.revisionId,null,s.revisionId,false,null,member,used.command]))).rejects.toMatchObject({code:"42501"});
    expect((await admin.query(`SELECT count(*)::int n FROM app.job_party_binding WHERE tenant_id=$1 AND job_id=$2`,[tenant,job])).rows[0].n).toBe(1);
  });
});

describe("CH-3a a null correction flag cannot bypass the post-live guard (round 5)",()=>{
  // Everything the repository does for one binding change in one transaction, but with the routine's correction flag and reason
  // supplied exactly as given, so a null flag reaches the routine. The receipt is completed and the plain bind audit event is
  // appended, so the commit-time record check is satisfied: only the routine's own refusal can stop the change.
  const bindWithFlag=async(job:string,customerRevision:string,siteRevision:string,flag:boolean|null,reason:string|null,eventType="job.parties.bind",directInsert=false)=>{
    const command=randomUUID(),binding=randomUUID(),expected=(await repository.view(context,member,job)).jobRevision;
    await withTenant(runtime,context,async db=>{
      await db.$client.query(`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'job.parties',$3,$4,'processing',$5)`,[command,tenant,command,"d".repeat(64),member]);
      expect((await db.$client.query("SELECT current_user,pg_has_role(current_user,'jobguard_runtime','USAGE') AS runtime_role")).rows[0]).toEqual({ current_user: "ch3a_login", runtime_role: true });
      if (directInsert) await db.$client.query(`INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance,correction_reason,command_id)
        SELECT $1,$2,$3,$4,c.customer_id,c.id,c.customer_id,c.id,s.site_id,s.id,'entered',$7,$8 FROM app.customer_revision c,app.site_revision s WHERE c.tenant_id=$1 AND c.id=$5 AND s.tenant_id=$1 AND s.id=$6`, [tenant,binding,job,expected+1,customerRevision,siteRevision,reason,command]);
      else await db.$client.query(`SELECT app.bind_job_parties($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[tenant,job,binding,expected,customerRevision,null,siteRevision,flag,reason,member,command]);
      await db.$client.query(`UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2`,[tenant,command,JSON.stringify({id:binding})]);
      await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${member}`,eventType,subjectType:"job",subjectRef:job,payload:{references:{commandId:command,identityId:binding},hashes:{request:"d".repeat(64)},classifications:{action:"operational"}}}]);
    });
    return{command,binding};
  };
  const state=async(job:string)=>({
    auditHead:(await admin.query(`SELECT * FROM audit_control.audit_head WHERE tenant_id=$1`,[tenant])).rows,
    bindings:(await admin.query(`SELECT count(*)::int n FROM app.job_party_binding WHERE tenant_id=$1 AND job_id=$2`,[tenant,job])).rows[0].n,
    revision:(await admin.query(`SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2`,[tenant,job])).rows[0].revision,
    current:(await admin.query(`SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2`,[tenant,job])).rows[0].binding_id as string,
    receipts:(await admin.query(`SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_type='job.parties'`,[tenant])).rows[0].n,
    audits:(await admin.query(`SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type LIKE 'job.parties.%'`,[tenant,job])).rows[0].n,
  });
  it.each([["tab", "\t"], ["line feed", "\n"], ["carriage return", "\r"], ["NBSP", "\u00a0"], ["BOM", "\ufeff"], ["empty", ""], ["spaces", "   "], ["overlong UTF-16", "😀".repeat(251)]])("refuses %s correction reasons in both routine and constraint with full receipt/audit rollback", async (_label, reason) => {
    const job = await createJob(), { c, s, parties } = await saveParties(job);
    await repository.command(context, member, job, command("bind", { expectedJobRevision: 0, parties })); await setLiveDirectly(job);
    const before = await state(job);
    for (const directInsert of [false, true]) {
      // On the defective migration tab/LF/CR/NBSP/BOM reach receipt completion, the matching correction audit and commit.
      // Thus rejection cannot be explained by a missing record in the deferred receipt/audit protocol.
      await expect(bindWithFlag(job, c.revisionId, s.revisionId, true, reason!, "job.parties.correct", directInsert)).rejects.toMatchObject(directInsert
        ? { code: "23514", constraint: "job_party_binding_correction_reason_check" }
        : { code: "22023", message: expect.stringContaining("CORRECTION_REASON_REQUIRED") });
      expect(await state(job)).toEqual(before);
    }
  });
  it("explicitly refuses a null post-live reason and accepts a trimmed nonblank boundary reason", async () => {
    const job = await createJob(), { c, s, parties } = await saveParties(job);
    await repository.command(context, member, job, command("bind", { expectedJobRevision: 0, parties })); await setLiveDirectly(job);
    const before = await state(job);
    await expect(bindWithFlag(job, c.revisionId, s.revisionId, true, null, "job.parties.correct")).rejects.toMatchObject({ code: "22023", message: expect.stringContaining("CORRECTION_REASON_REQUIRED") });
    expect(await state(job)).toEqual(before);
    const reason = `\t\u00a0${"x".repeat(500)}\r\ufeff`;
    const done = await bindWithFlag(job, c.revisionId, s.revisionId, true, reason, "job.parties.correct");
    expect((await admin.query(`SELECT correction_reason FROM app.job_party_binding WHERE tenant_id=$1 AND id=$2`, [tenant, done.binding])).rows[0].correction_reason).toBe(reason);
  });
  it("refuses a live job's binding change unless the correction flag is true, and rolls everything back",async()=>{
    const job=await createJob(),{parties}=await saveParties(job);
    await repository.command(context,member,job,command("bind",{expectedJobRevision:0,parties}));
    await setLiveDirectly(job);
    const next=await saveParties(job,"Flat 7");
    const before=await state(job);
    const cases:Array<[string,boolean|null,string|null]>=[
      ["null flag with a non-empty reason",null,"A reason that is present"],
      ["null flag with no reason",null,null],
      ["false flag with a non-empty reason",false,"A reason that is present"],
    ];
    for(const [label,flag,reason] of cases){
      await expect(bindWithFlag(job,next.c.revisionId,next.s.revisionId,flag,reason),label).rejects.toMatchObject({code:"22023",message:expect.stringContaining("CORRECTION_REASON_REQUIRED")});
      expect(await state(job),label).toEqual(before);
    }
    // The permitted route still works: a true flag with a reason is a correction and keeps that reason.
    const done=await bindWithFlag(job,next.c.revisionId,next.s.revisionId,true,"Correct the fictional site","job.parties.correct");
    expect((await admin.query(`SELECT correction_reason FROM app.job_party_binding WHERE tenant_id=$1 AND id=$2`,[tenant,done.binding])).rows[0].correction_reason).toBe("Correct the fictional site");
  });
});


describe("CH-3a SBOX-SESSION-1 registry ownership on real PostgreSQL", () => {
  it("isolates labels, unbound suggestions, recognition and forged registry references; an adopted job inherits only its source session", async () => {
    const previous = process.env.JOBGUARD_ENV;
    process.env.JOBGUARD_ENV = "synthetic_demo";
    try {
      const account = randomUUID();
      await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [DEMO_TENANT_ID]);
      await admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING", [DEMO_IDENTITY_USER_ID]);
      await admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional session account')", [DEMO_TENANT_ID, account]);
      await admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING", [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, account, DEMO_IDENTITY_USER_ID]);
      const ownerToken = await issuePracticeSession(runtime), strangerToken = await issuePracticeSession(runtime);
      const owner = await authenticatePracticeSession(runtime, ownerToken), stranger = await authenticatePracticeSession(runtime, strangerToken);
      const ownedJob = (await repository.list(owner.context, owner.membershipId, owner.digest)).jobs.find(value => value.status === "quoting")!.id;
      const strangerJob = (await repository.list(stranger.context, stranger.membershipId, stranger.digest)).jobs.find(value => value.status === "quoting")!.id;
      const c = await repository.command(owner.context, owner.membershipId, ownedJob, command("create_customer", { customer }), owner.digest);
      const pay = await repository.command(owner.context, owner.membershipId, ownedJob, command("create_customer", { customer: { ...customer, name: "Fictional separate payer" } }), owner.digest);
      const place = await repository.command(owner.context, owner.membershipId, ownedJob, command("create_site", { site }), owner.digest);
      // The creator can use newly created, not-yet-bound identities. Another session cannot see or use them.
      const unbound = await repository.view(owner.context, owner.membershipId, ownedJob, owner.digest);
      expect(unbound.customers.map(value => value.id)).toEqual(expect.arrayContaining([c.id, pay.id]));
      expect(unbound.sites.map(value => value.id)).toContain(place.id);
      const emptyStranger = await repository.view(stranger.context, stranger.membershipId, strangerJob, stranger.digest);
      expect(emptyStranger.customers).toEqual([]); expect(emptyStranger.sites).toEqual([]);
      const ownCustomer = await repository.command(stranger.context, stranger.membershipId, strangerJob, command("create_customer", {
        customer: { ...customer, name: "Fictional stranger customer" },
      }), stranger.digest);
      const ownSite = await repository.command(stranger.context, stranger.membershipId, strangerJob, command("create_site", {
        site: { ...site, addressLines: ["22 Fictional Elsewhere"] },
      }), stranger.digest);
      const strangerBefore = await repository.view(stranger.context, stranger.membershipId, strangerJob, stranger.digest);
      expect(strangerBefore.customers.map(value => value.id)).toEqual([ownCustomer.id]);
      expect(strangerBefore.sites.map(value => value.id)).toEqual([ownSite.id]);
      const parties = { version: "job-parties.v1", customerRevisionId: c.revisionId, payingPartyRevisionId: pay.revisionId, siteRevisionId: place.revisionId };
      for (const data of [
        command("revise_customer", { customerId: c.id, expectedRevision: 1, customer: { ...customer, name: "Fictional stolen edit" } }),
        command("create_site", { site, reuseSiteId: place.id, confirmSamePlace: true }),
        command("bind", { expectedJobRevision: 0, parties }),
        command("bind", { expectedJobRevision: 0, parties: { version: "job-parties.v1", customerRevisionId: ownCustomer.revisionId, siteRevisionId: place.revisionId } }),
        command("bind", { expectedJobRevision: 0, parties: { version: "job-parties.v1", customerRevisionId: ownCustomer.revisionId, siteRevisionId: ownSite.revisionId, payingPartyRevisionId: pay.revisionId } }),
      ]) {
        await expect(repository.command(stranger.context, stranger.membershipId, strangerJob, data, stranger.digest)).rejects.toThrow("NOT_FOUND");
        expect((await admin.query("SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [DEMO_TENANT_ID, data.commandId])).rowCount).toBe(0);
      }
      const bind = command("bind", { expectedJobRevision: 0, parties });
      const saved = await repository.command(owner.context, owner.membershipId, ownedJob, bind, owner.digest);
      expect(await repository.command(owner.context, owner.membershipId, ownedJob, bind, owner.digest)).toEqual(saved);
      await expect(repository.view(stranger.context, stranger.membershipId, ownedJob, stranger.digest)).rejects.toThrow("NOT_FOUND");
      await expect(repository.command(stranger.context, stranger.membershipId, ownedJob, bind, stranger.digest)).rejects.toThrow("NOT_FOUND");
      const strangersList = await repository.list(stranger.context, stranger.membershipId, stranger.digest);
      expect(strangersList.jobs.map(value => value.id)).not.toContain(ownedJob);
      expect(JSON.stringify(strangersList)).not.toContain(customer.name);
      expect(JSON.stringify(strangersList)).not.toContain(site.addressLines[0]);
      expect(await repository.view(stranger.context, stranger.membershipId, strangerJob, stranger.digest)).toEqual(strangerBefore);
      expect((await repository.view(owner.context, owner.membershipId, ownedJob, owner.digest)).current?.customer.name).toBe(customer.name);

      // Exercise the unchanged controlled routine/dispatcher and immutable source audit reference.
      const imported = randomUUID(), baseline = randomUUID();
      const baselineHash = createHash("sha256").update("Fictional inherited ownership").digest("hex");
      const mutation = new AdoptInFlightJobMutation(DEMO_TENANT_ID, "synthetic_candidate", {
        version: "adopt-job.v1", jobId: imported, baselineId: baseline, title: "Fictional owned import", lifecyclePoint: "live",
        provenance: "imported", lineageStrength: "builder_attested_weaker", baselineHash, baselineDescription: "Fictional baseline",
        acceptedNetValuePence: 100000, recoveryCapPence: 1500, acceptedValueSource: "builder_attestation", attestedByMembershipId: DEMO_MEMBERSHIP_ID,
        attestedAt: new Date(0), importTermsVersion: "synthetic_import_terms_candidate.v1", feePolicyVersion: "reference_fee_policy_v1", mode: "synthetic_candidate", parties,
      });
      await new UserCommandDispatcher(runtime).dispatch(owner.context, {
        version: "command.v1", commandId: randomUUID(), commandType: "job.adopt_in_flight", semanticKey: `import:${imported}`,
        actorMembershipId: owner.membershipId, subjectType: "job", subjectRef: imported,
        action: { actionType: "job.adopt_in_flight", recipient: null, contentHash: baselineHash, aggregateRevision: 0, amountPence: 100000,
          currency: "GBP", policyVersion: "synthetic_import_terms_candidate.v1", expiresAt: new Date(Date.now() + 300000) },
      }, { mutate: mutation.mutate.bind(mutation), auditEvents: (result, cmd) => mutation.auditEvents(result, cmd).map(event => ({
        ...event, payload: { ...event.payload, references: { ...event.payload.references, sourceJobId: ownedJob } },
      })) });
      expect((await authorizePracticeJob(runtime, ownerToken, imported)).digest).toBe(owner.digest);
      await expect(authorizePracticeJob(runtime, strangerToken, imported)).rejects.toThrow("NOT_FOUND");
      await expect(authorizePracticeJob(runtime, undefined, imported)).rejects.toThrow("UNAUTHENTICATED");
      const importedView = await repository.view(owner.context, owner.membershipId, imported, owner.digest);
      expect(importedView.current?.customerRevisionId).toBe(c.revisionId);
      expect(importedView.recognition.map(value => value.jobId).sort()).toEqual([ownedJob, imported].sort());
      expect((await repository.list(owner.context, owner.membershipId, owner.digest)).jobs.map(value => value.id)).toEqual(expect.arrayContaining([ownedJob, imported]));
      expect((await repository.list(stranger.context, stranger.membershipId, stranger.digest)).jobs.map(value => value.id)).not.toContain(imported);
      await expect(repository.view(stranger.context, stranger.membershipId, imported, stranger.digest)).rejects.toThrow("NOT_FOUND");
      const legacy = await createJob();
      await expect(authorizePracticeJob(runtime, ownerToken, legacy)).rejects.toThrow("NOT_FOUND");
    } finally { if (previous === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previous; }
  });
});

describe("CH-3a round 13 generated practice entry", () => {
  beforeAll(async () => {
    const account = randomUUID();
    await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [DEMO_TENANT_ID]);
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING", [DEMO_IDENTITY_USER_ID]);
    await admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional round 13 account')", [DEMO_TENANT_ID, account]);
    await admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING", [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, account, DEMO_IDENTITY_USER_ID]);
  });
  async function session() {
    const digest = createHash("sha256").update(randomUUID()).digest("hex");
    await runtime.query("SELECT app.issue_practice_session($1)", [digest]);
    return { digest, context: { tenantId: DEMO_TENANT_ID } as VerifiedTenantContext };
  }
  it("issues the unchanged three home scenarios with a bound live example, empty quoting suggestions and isolated reusable identities", async () => {
    const owner = await session(), stranger = await session();
    const jobs = (await repository.list(owner.context, DEMO_MEMBERSHIP_ID, owner.digest)).jobs;
    expect(jobs.map(({ title, status, revision }) => ({ title, status, revision })).sort((a, b) => a.title.localeCompare(b.title))).toEqual([
      { title: "Kitchen extension", status: "live", revision: 0 },
      { title: "Loft conversion", status: "quoting", revision: 0 },
      { title: "Practice kitchen", status: "quoting", revision: 0 },
    ]);
    const live = jobs.find(job => job.status === "live")!;
    const view = await repository.view(owner.context, DEMO_MEMBERSHIP_ID, live.id, owner.digest);
    expect(view.current).toMatchObject({ customer: { name: "Fictional scenario customer", type: "person", email: "scenario-customer@example.invalid" },
      site: { addressLines: ["1 Scenario Street"], town: "London", postcode: "SW1A 1AA" } });
    expect(view.current!.payingPartyRevisionId).toBe(view.current!.customerRevisionId);
    expect((await admin.query("SELECT job_track,environment,provenance,source_id FROM app.job_commercial_track WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, live.id])).rows).toEqual([
      { job_track: "small_builder", environment: "synthetic_demo", provenance: "legacy_synthetic_live_fixture", source_id: live.id },
    ]);
    expect(view.customers.map(row => row.id)).toEqual([view.currentIds!.customerId]);
    expect(view.sites.map(row => row.id)).toEqual([view.currentIds!.siteId]);
    expect((await admin.query("SELECT provenance,revision FROM app.job_party_binding WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, view.current!.bindingId])).rows).toEqual([{ provenance: "backfilled_synthetic_fixture", revision: 0 }]);
    for (const job of jobs.filter(job => job.status === "quoting")) {
      const quote = await repository.view(owner.context, DEMO_MEMBERSHIP_ID, job.id, owner.digest);
      expect(quote.current).toBeNull(); expect(quote.customers).toEqual([]); expect(quote.sites).toEqual([]);
    }
    const strangerJob = (await repository.list(stranger.context, DEMO_MEMBERSHIP_ID, stranger.digest)).jobs.find(job => job.status === "quoting")!;
    const stolen = command("bind", { expectedJobRevision: 0, parties: { version: "job-parties.v1",
      customerRevisionId: view.current!.customerRevisionId, siteRevisionId: view.current!.siteRevisionId } });
    await expect(repository.command(stranger.context, DEMO_MEMBERSHIP_ID, strangerJob.id, stolen, stranger.digest)).rejects.toThrow("NOT_FOUND");
    expect((await admin.query("SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [DEMO_TENANT_ID, stolen.commandId])).rowCount).toBe(0);
    // A confirmed binding may reuse the owner's known defaults; suggestions are not authorization.
    const quoteJob = jobs.find(job => job.status === "quoting")!;
    await repository.command(owner.context, DEMO_MEMBERSHIP_ID, quoteJob.id, { ...stolen, commandId: randomUUID() }, owner.digest);
    const bound = await repository.view(owner.context, DEMO_MEMBERSHIP_ID, quoteJob.id, owner.digest);
    expect(bound.current!.customerRevisionId).toBe(view.current!.customerRevisionId);
    expect(bound.recognition.map(row => row.jobId).sort()).toEqual([live.id, quoteJob.id].sort());
  });
  it("refuses missing parties despite forged scenario, session and bypass settings on direct runtime INSERT and UPDATE", async () => {
    const owner = await session(), id = randomUUID();
    const quote = (await repository.list(owner.context, DEMO_MEMBERSHIP_ID, owner.digest)).jobs.find(job => job.status === "quoting")!;
    for (const insert of [true, false]) {
      await expect(withTenant(runtime, owner.context, async db => {
        await db.$client.query("SELECT set_config('app.practice_session_digest',$1,true),set_config('app.practice_scenario','home',true),set_config('app.skip_job_parties','true',true)", [owner.digest]);
        if (insert) await db.$client.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario) VALUES($1,$2,'Forged fictional home','live',$3,'home')", [id, DEMO_TENANT_ID, owner.digest]);
        else await db.$client.query("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, quote.id]);
      })).rejects.toMatchObject(insert ? { code: "22023", message: "JOB_PARTIES_REQUIRED" } : { code: "42501" });
    }
    // Runtime has no direct status UPDATE grant; the allowed migration-owner
    // path must independently reject the same attempted unbound promotion.
    await expect(withTenant(admin, owner.context, async db => {
      await db.$client.query("SET LOCAL ROLE jobguard_migration");
      await db.$client.query("SELECT set_config('app.skip_job_parties','true',true)");
      await db.$client.query("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, quote.id]);
    })).rejects.toMatchObject({ code: "22023", message: "JOB_PARTIES_REQUIRED" });
    expect((await admin.query("SELECT 1 FROM app.job WHERE id=$1", [id])).rowCount).toBe(0);
    expect((await repository.view(owner.context, DEMO_MEMBERSHIP_ID, quote.id, owner.digest))).toMatchObject({ status: "quoting", jobRevision: 0, current: null });
    const catalogue = (await admin.query(`SELECT r.rolname,p.prosecdef,p.proconfig,
      has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime_execute,
      has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure_execute,
      EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute
      FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='app.issue_practice_session(text)'::regprocedure`)).rows[0];
    expect(catalogue).toEqual({ rolname: "jobguard_migration", prosecdef: true, proconfig: ["search_path=pg_catalog"], runtime_execute: true, infrastructure_execute: false, public_execute: false });
    const generator = (await admin.query(`SELECT r.rolname,p.prosecdef,
      has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime_execute,
      has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure_execute,
      EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute,
      pg_has_role('ch3a_login','jobguard_migration','MEMBER') can_assume_migration
      FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='app.seed_generated_practice_job_parties()'::regprocedure`)).rows[0];
    expect(generator).toEqual({ rolname: "jobguard_migration", prosecdef: false, runtime_execute: false, infrastructure_execute: false, public_execute: false, can_assume_migration: false });
    await expect(runtime.query("SET ROLE jobguard_migration")).rejects.toMatchObject({ code: "42501" });
  });
  it("rolls back the session and generated parties when the final home-job insert fails", async () => {
    const digest = createHash("sha256").update(randomUUID()).digest("hex");
    const counts = async () => (await admin.query(`SELECT
      (SELECT count(*)::int FROM control_plane.practice_session) sessions,
      (SELECT count(*)::int FROM app.job WHERE tenant_id=$1) jobs,
      (SELECT count(*)::int FROM app.customer_revision WHERE tenant_id=$1) customers,
      (SELECT count(*)::int FROM app.site_revision WHERE tenant_id=$1) sites,
      (SELECT count(*)::int FROM app.job_party_binding WHERE tenant_id=$1) bindings,
      (SELECT count(*)::int FROM app.job_party_current WHERE tenant_id=$1) current_bindings`, [DEMO_TENANT_ID])).rows[0];
    const before = await counts(), db = await admin.connect();
    try {
      await db.query("BEGIN");
      // Transactional fault injection exists only on this admin connection and is
      // rolled back. Call as runtime; the issuer retains its migration-role definer.
      await db.query(`CREATE FUNCTION app.ch3a_fail_last_home() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
        IF NEW.practice_session_digest=TG_ARGV[0] AND NEW.title='Loft conversion' THEN
          RAISE EXCEPTION 'SYNTHETIC_HOME_FIXTURE_FAILURE' USING ERRCODE='23514';
        END IF; RETURN NEW; END $$`);
      await db.query(`CREATE TRIGGER ch3a_fail_last_home BEFORE INSERT ON app.job FOR EACH ROW EXECUTE FUNCTION app.ch3a_fail_last_home('${digest}')`);
      await db.query("SET LOCAL ROLE jobguard_runtime");
      await expect(db.query("SELECT app.issue_practice_session($1)", [digest])).rejects.toMatchObject({ code: "23514", message: "SYNTHETIC_HOME_FIXTURE_FAILURE" });
    } finally { await db.query("ROLLBACK"); db.release(); }
    expect(await counts()).toEqual(before);
    expect((await admin.query("SELECT 1 FROM control_plane.practice_session WHERE token_digest=$1", [digest])).rowCount).toBe(0);
  });
  it("keeps duplicate, malformed and unauthorized issuance atomic with no extra jobs or parties", async () => {
    const owner = await session();
    const counts = async () => (await admin.query(`SELECT
      (SELECT count(*)::int FROM control_plane.practice_session) sessions,
      (SELECT count(*)::int FROM app.job WHERE tenant_id=$1) jobs,
      (SELECT count(*)::int FROM app.customer WHERE tenant_id=$1) customers,
      (SELECT count(*)::int FROM app.site WHERE tenant_id=$1) sites,
      (SELECT count(*)::int FROM app.job_party_binding WHERE tenant_id=$1) bindings`, [DEMO_TENANT_ID])).rows[0];
    const before = await counts();
    await expect(runtime.query("SELECT app.issue_practice_session($1)", [owner.digest])).rejects.toMatchObject({ code: "23505" });
    await expect(runtime.query("SELECT app.issue_practice_session($1)", ["forged"])).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.query("SELECT app.issue_practice_session($1)", [null])).rejects.toMatchObject({ code: "23502" });
    try {
      await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID]);
      await expect(runtime.query("SELECT app.issue_practice_session($1)", [createHash("sha256").update(randomUUID()).digest("hex")])).rejects.toMatchObject({ code: "42501" });
    } finally {
      await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID]);
    }
    expect(await counts()).toEqual(before);
  });
});
