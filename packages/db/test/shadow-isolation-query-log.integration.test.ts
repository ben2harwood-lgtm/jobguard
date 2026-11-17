import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../src/migrate.js";
import { withTenant } from "../src/tenant-context.js";
import { DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID } from "../src/demo-seed.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
const credential=randomUUID(),session=randomUUID(),J=randomUUID(),logs:string[]=[];
let pg:EmbeddedPostgres,admin:Pool,runtime:Pool,shadow:Pool,dir:string;
beforeAll(async()=>{
 process.env.JOBGUARD_ENV="synthetic_demo";dir=await mkdtemp(join(tmpdir(),"sv3-query-log-"));const port=await freePort(57500,500);
 pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:credential,persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:line=>logs.push(line)});await pg.initialise();await pg.start();
 const pool=(user:string)=>new Pool({host:"127.0.0.1",port,user,password:credential,database:"postgres",max:1});admin=pool("postgres");await migrate(admin);await installLegacySyntheticPartyFixtures(admin);
 await admin.query("ALTER SYSTEM SET log_line_prefix='SV3:%u: '");await admin.query("SELECT pg_reload_conf()");
 for(const [login,role] of [["sv3_log_runtime","jobguard_runtime"],["sv3_log_shadow","jobguard_shadow"]])await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${credential}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT ${role} TO ${login}`);
 await admin.query("ALTER ROLE sv3_log_runtime SET log_statement='all'");runtime=pool("sv3_log_runtime");shadow=pool("sv3_log_shadow");
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[DEMO_TENANT_ID]);await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[DEMO_IDENTITY_USER_ID]);
 await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional query-log builder')",[DEMO_ACCOUNT_ID,DEMO_TENANT_ID]);await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,DEMO_ACCOUNT_ID,DEMO_IDENTITY_USER_ID]);
 const digest=createHash("sha256").update(session).digest("hex");
 // Issue the session through the product's own SECURITY DEFINER routine: the seed trigger on practice_session refuses a direct insert by any other role (no guard is switched off).
 await admin.query("SELECT app.issue_practice_session($1)",[digest]);
 await admin.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional isolation job','live',$3,'home')",[J,DEMO_TENANT_ID,digest]);
},60000);
afterAll(async()=>{await closeTestPools(runtime,shadow,admin);await pg?.stop();if(dir)await rm(dir,{recursive:true,force:true})});
describe("SV-3 structural timing and runtime query logging",()=>{
 it("replays real builder applications with the same statement sequence/count and no shadow query",async()=>{
  const {createWorkspaceApplication}=await import(new URL("../../../apps/api/dist/workspace/application.js",import.meta.url).href);
  const app=createWorkspaceApplication({pool:runtime,sessionId:session});
  async function replay(){const start=(await logFence()).end,out=[];
   const calls=[()=>app.decisions.list({tenantId:DEMO_TENANT_ID,jobId:J}),()=>app.variation.get(J),()=>app.jobs.get({sessionId:session},J),()=>app.customerInvoice.get(J),()=>app.finalAccount.get(J),()=>app.materials.view(J),()=>app.supplierDocuments.view(J),()=>app.value.read(J)];
   for(const call of calls){try{out.push(await call())}catch(e){out.push({code:(e as {code:string}).code})}}
   const end=(await logFence()).start;
   const statements=logs.join("").slice(start,end)
    .split(/(?=^SV3:[^:\r\n]+: (?!DETAIL:))/mu)
    .filter(s=>/^SV3:sv3_log_runtime: LOG:  (?:statement|execute [^:\r\n]+):/u.test(s))
    .map(s=>s.replace(/^SV3:sv3_log_runtime: LOG:  (?:statement|execute [^:\r\n]+):/u,""));
   expect(statements.length).toBeGreaterThan(0);expect(statements.join("\n")).not.toMatch(/\b(?:shadow_commercial_signal|shadow_signal_\w+|shadow_reconciliation_run|shadow_disclosure_event|shadow_break_glass_access|shadow_must_surface_firing|reveal_shadow_signals|record_shadow_disclosure|surface_shadow_signal_early)\b/u);
   return{out,statements};
  }
  const evidence=randomUUID(),upload=randomUUID();await withTenant(admin,testTenantContext(DEMO_TENANT_ID),async db=>{
   // An original evidence object needs its upload parent row (evidence_object_kind_ck, evidence_object_upload_fk).
   await db.$client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at) VALUES($1,$2,$3,$4,repeat('a',64),'image/png',100,'standard_evidence','2099-10-01')",[upload,DEMO_TENANT_ID,J,upload]);
   await db.$client.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,'original','completion_photo','synthetic:Q','Q:v1',repeat('a',64),0,'image/png','standard_evidence','2026-10-01','2026-10-01')",[evidence,DEMO_TENANT_ID,upload,J]);
  });
  const zero=await replay();await withTenant(shadow,testTenantContext(DEMO_TENANT_ID),async db=>{for(let n=0;n<25;n++){
   const signal=randomUUID();await db.$client.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state) VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:Q',clock_timestamp(),'Fictional held extra','low','held_for_final_check')",[DEMO_TENANT_ID,J,signal]);
   await db.$client.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,'Q:v1',repeat('a',64),'2026-10-01')",[DEMO_TENANT_ID,J,signal,evidence]);
  }});
  expect((await admin.query("SELECT count(*)::int n FROM app.shadow_signal_evidence WHERE job_id=$1",[J])).rows).toEqual([{n:25}]);
  const many=await replay();expect(many.out).toEqual(zero.out);expect(many.statements).toEqual(zero.statements);
 });
});
async function logFence(){
 const sql=`SELECT 1 /* sv3-fence:${randomUUID()} */`;
 await runtime.query(sql);
 const header=`SV3:sv3_log_runtime: LOG:  statement: ${sql}\n`,deadline=Date.now()+5000;
 for(;;){
  const raw=logs.join(""),start=raw.indexOf(header);
  if(start>=0)return{start,end:start+header.length};
  if(Date.now()>=deadline)throw new Error("PostgreSQL log fence timeout");
  await new Promise<void>(resolve=>setTimeout(resolve,5));
 }
}
