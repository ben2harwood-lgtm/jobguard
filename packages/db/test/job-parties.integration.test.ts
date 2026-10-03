import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate, JobPartiesRepository, withTenant, type VerifiedTenantContext } from "../src/index.js";
import { closeTestPools } from "./pool-test-utils.js";

const tenant = randomUUID(), foreignTenant = randomUUID(), member = randomUUID();
const context = { tenantId: tenant } as VerifiedTenantContext;
const foreignContext = { tenantId: foreignTenant } as VerifiedTenantContext;
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, repository: JobPartiesRepository, dir: string;
let legacyInvoice: Record<string,unknown>;
const legacyJobs: string[] = [], legacySnapshot = JSON.stringify({ name: "Earlier synthetic customer", address: ["Earlier address"] });
const command = (action: string, data: Record<string, unknown> = {}) => ({ version: "job-parties-command.v1", commandId: randomUUID(), action, ...data });
const customer = { version: "customer.v1", name: "Fictional Person", type: "person", email: "fixture@example.invalid", phone: "00000000000" };
const site = { version: "site.v1", addressLines: ["14 Fictional Street"], town: "London", postcode: "sw1a1aa", unit: "Flat 1" };
const createJob = async () => { const id=randomUUID();await admin.query(`INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional job','quoting')`,[tenant,id]);return id; };
const saveParties = async (job: string, unit = "Flat 1") => {
  const c = await repository.command(context, member, job, command("create_customer", { customer }));
  const s = await repository.command(context, member, job, command("create_site", { site: { ...site, unit } }));
  const parties = { version: "job-parties.v1", customerRevisionId: c.revisionId, siteRevisionId: s.revisionId };
  return { c, s, parties };
};
beforeAll(async () => {
  dir=await mkdtemp(join(tmpdir(),"ch3a-pg16-"));const port=58000+Math.floor(Math.random()*300);
  postgres=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C"],onLog:()=>undefined});
  await postgres.initialise();await postgres.start();admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});
  // Upgrade from the exact previous supported schema with each lifecycle state.
  for (const url of MIGRATION_URLS.slice(0,-1)) await admin.query(await readFile(url,"utf8"));
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
  const migration=await readFile(MIGRATION_URLS.at(-1)!,"utf8");
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
    for(const table of tables){
      for(const verb of ["UPDATE","DELETE","TRUNCATE"]){const sql=verb==="UPDATE"?`UPDATE app.${table} SET tenant_id=tenant_id`:verb==="DELETE"?`DELETE FROM app.${table}`:`TRUNCATE app.${table}`;await expect(withTenant(runtime,context,db=>db.$client.query(sql))).rejects.toMatchObject({code:"42501"});}
    }
    const execute=await admin.query(`SELECT has_function_privilege('jobguard_runtime','app.bind_job_parties(uuid,uuid,uuid,integer,uuid,uuid,uuid,boolean,text,uuid,uuid)','EXECUTE') allowed,EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='app.bind_job_parties(uuid,uuid,uuid,integer,uuid,uuid,uuid,boolean,text,uuid,uuid)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') public_allowed`);
    expect(execute.rows[0]).toEqual({allowed:true,public_allowed:false});
    await expect(withTenant(runtime,context,db=>db.$client.query(`INSERT INTO app.job_party_current VALUES($1,$2,$3)`,[tenant,legacyJobs[0],randomUUID()]))).rejects.toMatchObject({code:"42501"});
  });
  it("refuses live and adoption without parties in the PostgreSQL boundary and rolls back",async()=>{
    const job=await createJob();
    await expect(admin.query(`UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2`,[tenant,job])).rejects.toThrow("JOB_PARTIES_REQUIRED");
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
  });
  it("groups shared identities and appends post-live corrections without changing historic bindings or snapshots",async()=>{
    const one=await createJob(),two=await createJob(),{parties}=await saveParties(one);
    for(const job of [one,two])await repository.command(context,member,job,command("bind",{expectedJobRevision:0,parties}));
    const before=(await repository.view(context,member,one)).current!;
    expect((await repository.view(context,member,one)).recognition.map(r=>r.jobId).sort()).toEqual([one,two].sort());
    await admin.query(`UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2`,[tenant,one]);
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
    await admin.query(`CREATE DATABASE ch3a_fresh`);const fresh=new Pool({...admin.options,database:"ch3a_fresh"});
    try{
      for(const url of MIGRATION_URLS.slice(0,-1))await fresh.query(await readFile(url,"utf8"));
      const t=randomUUID(),j=randomUUID();await fresh.query(`INSERT INTO control_plane.tenant(id) VALUES($1)`,[t]);await fresh.query(`INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'No invented details')`,[t,j]);
      await fresh.query(await readFile(MIGRATION_URLS.at(-1)!,"utf8"));
      expect((await fresh.query(`SELECT count(*)::int n FROM app.customer`)).rows[0].n).toBe(0);
      expect((await fresh.query(`SELECT action_type FROM app.decision WHERE tenant_id=$1 AND subject_ref=$2`,[t,j])).rows[0].action_type).toBe("job.parties.details_needed");
    }finally{await fresh.end();}
  });
});
