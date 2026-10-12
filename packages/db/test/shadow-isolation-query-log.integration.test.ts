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
 const digest=createHash("sha256").update(session).digest("hex");await admin.query("INSERT INTO control_plane.practice_session(token_digest,expires_at) VALUES($1,'2099-10-01')",[digest]);
 await admin.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional isolation job','live',$3,'home')",[J,DEMO_TENANT_ID,digest]);
},60000);
afterAll(async()=>{await closeTestPools(runtime,shadow,admin);await pg?.stop();if(dir)await rm(dir,{recursive:true,force:true})});
describe("SV-3 structural timing and runtime query logging",()=>{
 it("replays real builder applications with the same statement sequence/count and no shadow query",async()=>{
  const {createWorkspaceApplication}=await import(new URL("../../../apps/api/dist/workspace/application.js",import.meta.url).href);
  const app=createWorkspaceApplication({pool:runtime,sessionId:session});
  async function replay(){const start=logs.length,out=[];
   const calls=[()=>app.decisions.list({tenantId:DEMO_TENANT_ID,jobId:J}),()=>app.variation.get(J),()=>app.jobs.get({sessionId:session},J),()=>app.customerInvoice.get(J),()=>app.finalAccount.get(J),()=>app.materials.view(J),()=>app.supplierDocuments.view(J),()=>app.value.read(J)];
   for(const call of calls){try{out.push(await call())}catch(e){out.push({code:(e as {code:string}).code})}}
   // Drain socket/log callbacks before comparing the actual PostgreSQL output.
   await new Promise<void>(resolve=>setTimeout(resolve,25));
   const statements=logs.slice(start).filter(s=>s.includes("SV3:sv3_log_runtime:") && /(?:statement|execute [^:]+):/u.test(s)).map(s=>s.replace(/^.*?(?:statement|execute [^:]+):/su,""));
   expect(statements.length).toBeGreaterThan(0);expect(statements.join("\n")).not.toMatch(/\b(?:shadow_commercial_signal|shadow_signal_\w+|shadow_reconciliation_run|shadow_disclosure_event|shadow_break_glass_access|shadow_must_surface_firing|reveal_shadow_signals|record_shadow_disclosure|surface_shadow_signal_early)\b/u);
   return{out,statements};
  }
  const zero=await replay();await withTenant(shadow,testTenantContext(DEMO_TENANT_ID),async db=>{for(let n=0;n<25;n++)await db.$client.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state) VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:Q',clock_timestamp(),'Fictional held extra','low','held_for_final_check')",[DEMO_TENANT_ID,J,randomUUID()])});
  const many=await replay();expect(many.out).toEqual(zero.out);expect(many.statements).toEqual(zero.statements);
 });
});
