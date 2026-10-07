import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customerTypes } from "@jobguard/core";
import { migrate, MIGRATION_URLS, JobPartiesRepository, PreventionCheckRepository, verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership, type VerifiedTenantContext } from "../src/index.js";
import { closeTestPools } from "./pool-test-utils.js";

let pg: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string, context: VerifiedTenantContext;
const tenant = randomUUID(), other = randomUUID(), member = randomUUID(), user = randomUUID(), account = randomUUID();
const previousMode = process.env.JOBGUARD_ENV;
const scenarioNow = "2026-10-07T13:00:00.000Z";
const command = (binding: string, action = "property", fixture = "mixed", fields = {}) => ({ version: "prevention-command.v1", commandId: randomUUID(), action, expectedBindingId: binding, scenarioNow, fixture, ...fields });
let parties: JobPartiesRepository, prevention: PreventionCheckRepository;
async function job(type = "person", number: string | undefined = undefined) {
  const id = randomUUID(); await admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional prevention job','quoting')", [tenant,id]);
  const c = await parties.command(context,member,id,{version:"job-parties-command.v1",commandId:randomUUID(),action:"create_customer",customer:{version:"customer.v1",name:"Fictional customer",type,...(number ? {companyNumber:number} : {})}});
  const s = await parties.command(context,member,id,{version:"job-parties-command.v1",commandId:randomUUID(),action:"create_site",site:{version:"site.v1",addressLines:["1 Fictional Register Lane"],town:"London",postcode:"SW1A 1AA"}});
  const b = await parties.command(context,member,id,{version:"job-parties-command.v1",commandId:randomUUID(),action:"bind",expectedJobRevision:0,parties:{version:"job-parties.v1",customerRevisionId:c.revisionId,siteRevisionId:s.revisionId}});
  return { id, binding:b.id };
}
beforeAll(async () => {
  process.env.JOBGUARD_ENV="synthetic_demo";
  dir=await mkdtemp(join(tmpdir(),"mon7a-pg16-"));const port=59700+Math.floor(Math.random()*100);
  pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
  await pg.initialise();await pg.start();admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)",[tenant,other]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[user]);
  await admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional account')",[tenant,account]);
  await admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[tenant,member,account,user]);
  context=verifiedTenantContextFromMembership({identityUserId:user,tenantId:tenant,membershipId:member} as AuthenticatedMembership);
  await admin.query("CREATE ROLE prevention_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO prevention_login");
  runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"prevention_login",password:"synthetic"});
  parties=new JobPartiesRepository(runtime);prevention=new PreventionCheckRepository(runtime);
},60000);
afterAll(async () => { await closeTestPools(runtime,admin);if(pg)await pg.stop();if(dir)await rm(dir,{recursive:true,force:true});if(previousMode===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previousMode; });

describe("MON-7a real PostgreSQL guarantees", () => {
  it("persists cited property facts for homeowners, replaying exactly once with atomic audit", async () => {
    const j=await job(), input=command(j.binding);
    const [a,b]=await Promise.all([prevention.command(context,member,j.id,input),prevention.command(context,member,j.id,input)]);
    expect(a).toEqual(b);expect(a.view.property).toHaveLength(5);
    expect(a.view.property.map(x=>x.status)).toContain("unknown");
    for(const fact of a.view.property){expect(fact.source.id).toBeTruthy();expect(fact.retrievedAt).toBeTruthy();}
    expect((await prevention.view(context,member,j.id)).property).toEqual(a.view.property);
    expect((await admin.query("SELECT 1 FROM app.property_constraint_fact WHERE tenant_id=$1 AND command_id=$2",[tenant,input.commandId])).rowCount).toBe(5);
    expect((await admin.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND event_type='prevention.property' AND payload->'references'->>'commandId'=$2",[tenant,input.commandId])).rowCount).toBe(1);
    await expect(prevention.command(context,member,j.id,{...input,fixture:"fresh"})).rejects.toMatchObject({code:"COMMAND_CONFLICT"});
  });
  it("stale and missing fixtures are unknown for every check type, with explicit watch start/stop", async () => {
    const j=await job("business","ZZ000001");
    expect((await prevention.view(context,member,j.id)).watch).toMatchObject({enabled:false,revision:0});
    await expect(prevention.command(context,member,j.id,command(j.binding,"evaluate_watch","mixed",{expectedWatchRevision:0}))).rejects.toMatchObject({code:"WATCH_NOT_STARTED"});
    await prevention.command(context,member,j.id,command(j.binding,"start_watch","mixed",{expectedWatchRevision:0}));
    for(const fixture of ["stale","missing"]){
      const p=await prevention.command(context,member,j.id,command(j.binding,"property",fixture));expect(p.view.property.every(x=>x.status==="unknown")).toBe(true);
      const c=await prevention.command(context,member,j.id,command(j.binding,"company",fixture));expect(c.view.company?.status).toBe("unknown");
      const w=await prevention.command(context,member,j.id,command(j.binding,"evaluate_watch",fixture,{expectedWatchRevision:1}));expect(w.view.watch.results).toHaveLength(2);expect(w.view.watch.results.every(x=>x.status==="unknown")).toBe(true);
    }
    const stop=command(j.binding,"stop_watch","mixed",{expectedWatchRevision:1});
    await prevention.command(context,member,j.id,stop);expect((await prevention.view(context,member,j.id)).watch).toMatchObject({enabled:false,revision:2,results:[]});
    await expect(prevention.command(context,member,j.id,command(j.binding,"start_watch","mixed",{expectedWatchRevision:1}))).rejects.toMatchObject({code:"REVISION_CONFLICT"});
  });
  it("refuses every ineligible type server-side without a counterparty row", async () => {
    for(const type of customerTypes){
      const j=await job(type,"ZZ000001");
      if(type==="business") { await prevention.command(context,member,j.id,command(j.binding,"company"));continue; }
      for(const action of ["company","start_watch","evaluate_watch","stop_watch"]){
        await expect(prevention.command(context,member,j.id,command(j.binding,action,"mixed",action==="company"?{}:{expectedWatchRevision:0}))).rejects.toMatchObject({code:"NOT_REGISTERED_COMPANY"});
      }
      expect((await prevention.view(context,member,j.id)).companyEligibility).toBe("not run — not a registered company");
      expect((await admin.query("SELECT 1 FROM app.counterparty_check WHERE tenant_id=$1 AND job_id=$2",[tenant,j.id])).rowCount).toBe(0);
      await prevention.command(context,member,j.id,command(j.binding));
    }
    const unregistered=await job("business");await expect(prevention.command(context,member,unregistered.id,command(unregistered.binding,"company"))).rejects.toMatchObject({code:"NOT_REGISTERED_COMPANY"});
    expect((await admin.query("SELECT 1 FROM app.counterparty_check c JOIN app.customer_revision r ON(r.tenant_id,r.id)=(c.tenant_id,c.customer_revision_id) WHERE r.payload->>'type'<>'business'")).rowCount).toBe(0);
  });
  it("denies missing context, non-members, wrong-job bindings and direct SQL tampering", async () => {
    const j=await job(), wrong=await job();await prevention.command(context,member,j.id,command(j.binding));
    await expect(prevention.view(undefined as never,member,j.id)).rejects.toMatchObject({code:"INVALID_TENANT_CONTEXT"});
    await expect(prevention.view(context,randomUUID(),j.id)).rejects.toMatchObject({code:"FORBIDDEN"});
    const foreign=verifiedTenantContextFromMembership({identityUserId:user,tenantId:other,membershipId:member} as AuthenticatedMembership);
    await expect(prevention.view(foreign,member,j.id)).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(prevention.command(context,member,wrong.id,command(j.binding))).rejects.toMatchObject({code:"REVISION_CONFLICT"});
    for(const table of ["property_constraint_fact","counterparty_check"]){
      for(const sql of [`UPDATE app.${table} SET source_name='forged'`,`DELETE FROM app.${table}`,`TRUNCATE app.${table}`])await expect(withTenant(runtime,context,db=>db.$client.query(sql))).rejects.toMatchObject({code:"42501"});
    }
    const clone=async (changes:string)=>withTenant(runtime,context,db=>db.$client.query(`INSERT INTO app.property_constraint_fact SELECT ${changes} FROM app.property_constraint_fact WHERE tenant_id=$1 AND job_id=$2 LIMIT 1`,[tenant,j.id]));
    // Named columns avoid reliance on SELECT * column order for adversarial writes.
    const insert=async (sourceName:string|null,retrieved:string|null,jobId=j.id)=>withTenant(runtime,context,db=>db.$client.query(`INSERT INTO app.property_constraint_fact(tenant_id,id,job_id,binding_id,site_revision_id,command_id,kind,source_id,source_name,retrieved_at,result,audit_event_id) SELECT tenant_id,$3,$4,binding_id,site_revision_id,command_id,kind,source_id,$5,$6,result,audit_event_id FROM app.property_constraint_fact WHERE tenant_id=$1 AND job_id=$2 LIMIT 1`,[tenant,j.id,randomUUID(),jobId,sourceName,retrieved]));
    await expect(insert(null,scenarioNow)).rejects.toMatchObject({code:"23502"});
    await expect(insert("Generated property register (synthetic)",null)).rejects.toMatchObject({code:"23502"});
    await expect(insert("Generated property register (synthetic)","2026-10-07T12:00:00.000Z",wrong.id)).rejects.toMatchObject({code:"23503"});
    for(const changed of ["result-'source'","result-'retrievedAt'","jsonb_set(result,'{status}','\"clear\"'::jsonb)"]){
      await expect(withTenant(runtime,context,db=>db.$client.query(`INSERT INTO app.property_constraint_fact(tenant_id,id,job_id,binding_id,site_revision_id,command_id,kind,source_id,source_name,retrieved_at,result,audit_event_id)
        SELECT tenant_id,$3,job_id,binding_id,site_revision_id,command_id,kind,source_id,source_name,retrieved_at,${changed},audit_event_id FROM app.property_constraint_fact WHERE tenant_id=$1 AND job_id=$2 AND result->>'status'='unknown' LIMIT 1`,[tenant,j.id,randomUUID()]))).rejects.toMatchObject({code:"23514"});
    }
    // Cross-tenant writes fail RLS even when the row otherwise references known facts.
    await expect(clone(`'${other}'::uuid,gen_random_uuid(),job_id,binding_id,site_revision_id,command_id,kind,source_id,source_name,retrieved_at,result,audit_event_id,created_at`)).rejects.toMatchObject({code:"42501"});
    const company=await job("business","ZZ000001");await prevention.command(context,member,company.id,command(company.binding,"company"));
    await expect(withTenant(runtime,context,db=>db.$client.query(`INSERT INTO app.counterparty_check(tenant_id,id,job_id,binding_id,customer_revision_id,command_id,kind,watch_revision,source_id,source_name,retrieved_at,result,audit_event_id)
      SELECT c.tenant_id,$3,$4,b.id,b.customer_revision_id,c.command_id,c.kind,c.watch_revision,c.source_id,c.source_name,c.retrieved_at,c.result,c.audit_event_id
      FROM app.counterparty_check c JOIN app.job_party_binding b ON b.tenant_id=c.tenant_id AND b.id=$5 WHERE c.tenant_id=$1 AND c.job_id=$2 AND c.kind='company' LIMIT 1`,[tenant,company.id,randomUUID(),j.id,j.binding]))).rejects.toMatchObject({code:"23514"});
  });
  it("leaves fee derivations, journals, recovery cases, illustrations, value inputs and outbound state byte-identical", async () => {
    const j=await job("business","ZZ000001");
    await admin.query(`INSERT INTO app.fee_illustration_source(tenant_id,job_id,command_id,source_version,accepted_net_pence,eligible_net_pence,gross_landed_pence,base_obligation_pence,base_settled_pence,prior_posting_pence,source_ids) VALUES($1,$2,$3,'recovery-18800.v1',1880000,282000,338400,7900,7900,20300,$4)`,[tenant,j.id,randomUUID(),[randomUUID(),randomUUID()]]);
    const tables=["recovery_fee_derivation","recovery_fee_journal","journal","journal_line","recovery_case","fee_illustration_source","variation","variation_revision","customer_invoice","customer_payment","job_finding","action_outbox","decision","action_authorization"];
    const snapshot=async()=>Promise.all(tables.map(async table=>({table,rows:(await admin.query(`SELECT to_jsonb(r) row FROM app.${table} r WHERE tenant_id=$1 ORDER BY to_jsonb(r)::text`,[tenant])).rows})));
    const before=await snapshot();
    for(const action of ["property","company","start_watch","evaluate_watch","stop_watch"])await prevention.command(context,member,j.id,command(j.binding,action,"mixed",["start_watch","evaluate_watch","stop_watch"].includes(action)?{expectedWatchRevision:action==="start_watch"?0:1}:{}));
    expect(await snapshot()).toEqual(before);
  });
  it("two distinct watch-start commands against one revision give one effect and a typed conflict", async () => {
    const j=await job("business","ZZ000001");
    const results=await Promise.allSettled([prevention.command(context,member,j.id,command(j.binding,"start_watch","mixed",{expectedWatchRevision:0})),prevention.command(context,member,j.id,command(j.binding,"start_watch","mixed",{expectedWatchRevision:0}))]);
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    const failed=results.find(result=>result.status==="rejected");expect(failed?.status==="rejected"?failed.reason:null).toMatchObject({code:"REVISION_CONFLICT"});
    expect((await admin.query("SELECT 1 FROM app.counterparty_check WHERE tenant_id=$1 AND job_id=$2 AND kind='watch_start'",[tenant,j.id])).rowCount).toBe(1);
  });
  it("an audit failure rolls back the receipt and all property facts", async () => {
    const j=await job(),input=command(j.binding);
    await admin.query(`CREATE FUNCTION app.prevention_test_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='prevention.property' THEN RAISE EXCEPTION 'PREVENTION_TEST_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER prevention_test_audit_fault BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.prevention_test_audit_fault()`);
    try {
      await expect(prevention.command(context,member,j.id,input)).rejects.toThrow("PREVENTION_TEST_AUDIT_FAILURE");
      expect((await admin.query("SELECT 1 FROM app.property_constraint_fact WHERE tenant_id=$1 AND command_id=$2",[tenant,input.commandId])).rowCount).toBe(0);
      expect((await admin.query("SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2",[tenant,input.commandId])).rowCount).toBe(0);
    } finally { await admin.query("DROP TRIGGER prevention_test_audit_fault ON app.audit_event; DROP FUNCTION app.prevention_test_audit_fault()"); }
  });
  it("owns and isolates both tables with narrow grants and immutable rows even for the owner", async () => {
    const j=await job("business","ZZ000001");await prevention.command(context,member,j.id,command(j.binding));await prevention.command(context,member,j.id,command(j.binding,"company"));
    for(const table of ["property_constraint_fact","counterparty_check"]){
      const row=(await admin.query(`SELECT c.relrowsecurity,c.relforcerowsecurity,r.rolname owner,has_table_privilege('jobguard_runtime',c.oid,'SELECT') can_select,has_table_privilege('jobguard_runtime',c.oid,'INSERT') can_insert,has_table_privilege('jobguard_runtime',c.oid,'UPDATE,DELETE,TRUNCATE') can_mutate FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='app' AND c.relname=$1`,[table])).rows[0];
      expect(row).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:"jobguard_migration",can_select:true,can_insert:true,can_mutate:false});
      await expect(admin.query(`DELETE FROM app.${table}`)).rejects.toMatchObject({code:"55000"});
      expect((await runtime.query(`SELECT * FROM app.${table}`)).rowCount).toBe(0);
    }
  });
  it("upgrades the previous supported schema without altering an existing quoting job", async () => {
    await admin.query("CREATE DATABASE prevention_upgrade");
    const upgrade=new Pool({...admin.options,database:"prevention_upgrade"});
    try {
      await upgrade.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz DEFAULT clock_timestamp())");
      for(const url of MIGRATION_URLS.filter(url=>!url.pathname.endsWith("0103_prevention_checks.sql"))){await upgrade.query(await readFile(url,"utf8"));await upgrade.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);}
      await upgrade.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[tenant]);
      const id=randomUUID();await upgrade.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Earlier fictional job','quoting')",[tenant,id]);
      const before=(await upgrade.query("SELECT * FROM app.job WHERE id=$1",[id])).rows;
      await migrate(upgrade);await migrate(upgrade);
      expect((await upgrade.query("SELECT * FROM app.job WHERE id=$1",[id])).rows).toEqual(before);
      expect((await upgrade.query("SELECT 1 FROM public.jobguard_schema_migration WHERE migration_name='0103_prevention_checks.sql'")).rowCount).toBe(1);
    }finally{await upgrade.end();}
  });
});
