import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { Pool, type PoolClient } from "pg";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID, migrate } from "@jobguard/db";
import { AppModule } from "./app.module.js";
const requireDb=createRequire(new URL("../../../packages/db/package.json",import.meta.url));
const EmbeddedPostgres=requireDb("embedded-postgres").default;
const {withTenant}=await import(new URL("../../../packages/db/src/tenant-context.ts",import.meta.url).href);
const {testTenantContext}=await import(new URL("../../../packages/db/test/tenant-context-test-utils.ts",import.meta.url).href);
const {freePort,closeTestPools,installLegacySyntheticPartyFixtures}=await import(new URL("../../../packages/db/test/pool-test-utils.ts",import.meta.url).href);
const statementsLog:string[]=[];
const proposalId=randomUUID(),scopeItemId=randomUUID(),baselineScopeId=randomUUID();
const credential=randomUUID(),session=randomUUID(),jobId=randomUUID(),digest=createHash("sha256").update(session).digest("hex"),fixed="2026-10-01T00:00:00Z";
let postgres:InstanceType<typeof EmbeddedPostgres>,owner:Pool,dir:string,port:number;
const pool=(user:string,database:string)=>new Pool({host:"127.0.0.1",port,database,user,password:credential,max:2});
function connection(user:string,database:string){const u=new URL("postgresql://127.0.0.1");u.username=user;u.password=credential;u.port=String(port);u.pathname=database;return u.href;}
async function nextRoutes(path:string,prefix="/api"):Promise<string[]>{const routes:string[]=[];for(const e of await readdir(path,{withFileTypes:true})){
 if(e.isDirectory())routes.push(...await nextRoutes(join(path,e.name),`${prefix}/${e.name}`));
 else if(e.name==="route.ts" && /export async function GET/u.test(await readFile(join(path,e.name),"utf8")))routes.push(prefix);
}return routes;}
function pathFor(route:string){return route.replace(/\{(?:id|jobId)\}|\[(?:id|jobId)\]/gu,jobId).replace(/\{[^}]+\}|\[[^\]]+\]/gu,"10000000-0000-4000-8000-000000000099");}
function stableHeaders(headers:Record<string,string>){return Object.fromEntries(Object.entries(headers).filter(([k])=>k!=="date").sort(([a],[b])=>a.localeCompare(b)));}
async function startNext(database:string):Promise<{child:ChildProcess;base:string}>{
 const httpPort=await freePort(31000,500),base=`http://127.0.0.1:${httpPort}`;
 const child=spawn(process.execPath,[new URL("../../web/node_modules/next/dist/bin/next",import.meta.url).pathname,"start","--hostname","127.0.0.1","--port",String(httpPort)],{cwd:new URL("../../web/",import.meta.url).pathname,env:{...process.env,JOBGUARD_ENV:"synthetic_demo",DATABASE_URL:connection("sv3_isolation_runtime",database)},stdio:"pipe"});
 await new Promise<void>((resolve,reject)=>{child.once("exit",()=>reject(new Error("NEXT_START_FAILED")));child.stdout?.on("data",chunk=>{if(String(chunk).includes("Ready in"))resolve()});child.stderr?.on("data",()=>undefined)});
 return {child,base};
}
beforeAll(async()=>{
 process.env.JOBGUARD_ENV="synthetic_demo";dir=await mkdtemp(join(tmpdir(),"sv3-isolation-"));port=await freePort(58000,500);
 postgres=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:credential,persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:(line:string)=>statementsLog.push(line)});await postgres.initialise();await postgres.start();owner=pool("postgres","postgres");
 await owner.query("ALTER SYSTEM SET log_line_prefix='SV3:%u:%d: '");await owner.query("SELECT pg_reload_conf()");
 await owner.query(`CREATE ROLE sv3_isolation_runtime LOGIN PASSWORD '${credential}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
 await owner.query("ALTER ROLE sv3_isolation_runtime SET log_statement='all'");
 await owner.query("CREATE DATABASE sv3_isolation_zero");const p=pool("postgres","sv3_isolation_zero");try{await migrate(p);await installLegacySyntheticPartyFixtures(p);
 await p.query("GRANT jobguard_runtime TO sv3_isolation_runtime");
 await p.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[DEMO_TENANT_ID]);await p.query("INSERT INTO identity.identity_user(id) VALUES($1)",[DEMO_IDENTITY_USER_ID]);
 await p.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional SV-3 builder')",[DEMO_ACCOUNT_ID,DEMO_TENANT_ID]);
 await p.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,DEMO_ACCOUNT_ID,DEMO_IDENTITY_USER_ID]);
 await p.query("INSERT INTO control_plane.practice_session(token_digest,created_at,expires_at) VALUES($1,$2,'2099-10-01')",[digest,fixed]);
 await p.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario,created_at,updated_at) VALUES($1,$2,'Fictional SV-3 isolation job','live',$3,'home',$4,$4)",[jobId,DEMO_TENANT_ID,digest,fixed]);
 await p.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state,created_at) VALUES($1,$2,$3,'confirmed',$4)",[baselineScopeId,DEMO_TENANT_ID,jobId,fixed]);
 await withTenant(p,testTenantContext(DEMO_TENANT_ID),async (db:{$client:PoolClient})=>{
  for(let n=0;n<25;n++){
   const evidenceId=`20000000-0000-4000-8000-${String(100+n).padStart(12,"0")}`,uploadId=`30000000-0000-4000-8000-${String(100+n).padStart(12,"0")}`;
   await db.$client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at) VALUES($1,$2,$3,$1::text,repeat('a',64),'image/png',100,'standard_evidence','2099-10-01')",[uploadId,DEMO_TENANT_ID,jobId]);
   await db.$client.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,'original','completion_photo',$3::text,'synthetic-v1',repeat('a',64),100,'image/png','standard_evidence',$5,$5)",[evidenceId,DEMO_TENANT_ID,uploadId,jobId,fixed]);
  }
 });
 }finally{await closeTestPools(p)}
 // Clone the freshly migrated and deterministically seeded baseline, preserving exact server timestamps and identities.
 await owner.query("CREATE DATABASE sv3_isolation_many TEMPLATE sv3_isolation_zero");
 const many=pool("postgres","sv3_isolation_many");try{
  await many.query(`CREATE ROLE sv3_isolation_shadow LOGIN PASSWORD '${credential}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_shadow TO sv3_isolation_shadow`);
  const shadow=pool("sv3_isolation_shadow","sv3_isolation_many");try{await withTenant(shadow,testTenantContext(DEMO_TENANT_ID),async (db:{$client:PoolClient})=>{
   for(let n=0;n<25;n++){
    const signalId=`10000000-0000-4000-8000-${String(100+n).padStart(12,"0")}`;
    await db.$client.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state) VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:isolation',$4,'Fictional held extra','low','held_for_final_check')",[DEMO_TENANT_ID,jobId,signalId,fixed]);
    const evidenceId=`20000000-0000-4000-8000-${String(100+n).padStart(12,"0")}`;
    await db.$client.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,'synthetic-v1',repeat('a',64),$5)",[DEMO_TENANT_ID,jobId,signalId,evidenceId,fixed]);
   }
  })}finally{await closeTestPools(shadow)}
 }finally{await closeTestPools(many)}
},60000);
afterAll(async()=>{await closeTestPools(owner);await postgres?.stop();if(dir)await rm(dir,{recursive:true,force:true})});
describe("SV-3 Test Q: signed-in builder HTTP surfaces",()=>{
 it("replays every OpenAPI builder GET and Next job GET with byte-identical status, headers and body",async()=>{
  const api=JSON.parse(await readFile(new URL("../openapi.json",import.meta.url),"utf8")) as {paths:Record<string,Record<string,unknown>>};
  const nestRoutes=Object.entries(api.paths).filter(([path,ops])=>ops.get && !path.startsWith('/auth/') && path!=="/healthz").map(([path])=>pathFor(path));
  const webRoutes=(await nextRoutes(new URL("../../web/app/api",import.meta.url).pathname)).filter(path=>path.startsWith('/api/jobs/')).map(pathFor);
  expect(nestRoutes.length).toBeGreaterThan(0);expect(webRoutes.length).toBeGreaterThan(0);
  async function replay(database:string){
   const logStart=statementsLog.length;
   const runtime=pool("sv3_isolation_runtime",database),module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(Pool).useValue(runtime).compile(),app=module.createNestApplication();
   let next:Awaited<ReturnType<typeof startNext>>|undefined;
   try{await app.init();await app.listen(await freePort(32000,500),"127.0.0.1");const nest=await app.getUrl();next=await startNext(database);const output=[];
    for(const [base,routes] of [[nest,nestRoutes],[next.base,webRoutes]] as const)for(const path of routes){
     const url=new URL(path,base);url.searchParams.set("tenantId",DEMO_TENANT_ID);url.searchParams.set("jobId",jobId);
     const response=await fetch(url,{headers:{cookie:`jg_session=${session}`,"x-jobguard-verified-tenant":DEMO_TENANT_ID}});
     output.push({route:path,status:response.status,headers:stableHeaders(Object.fromEntries(response.headers)),body:Buffer.from(await response.arrayBuffer()).toString("base64")});
    }
    await new Promise<void>(resolve=>setTimeout(resolve,25));
    const statements=statementsLog.slice(logStart).filter(s=>s.includes(`SV3:sv3_isolation_runtime:${database}:`) && /(?:statement|execute [^:]+):/u.test(s)).map(s=>s.replace(/^.*?(?:statement|execute [^:]+):/su,""));
    expect(statements.length).toBeGreaterThan(0);
    expect(statements.join("\n")).not.toMatch(/\b(?:shadow_commercial_signal|shadow_signal_\w+|shadow_reconciliation_run|shadow_disclosure_event|shadow_break_glass_access|shadow_must_surface_firing|reveal_shadow_signals|record_shadow_disclosure|surface_shadow_signal_early)\b/u);
    return {output,statements};
   }finally{if(next){next.child.kill("SIGTERM");await new Promise<void>(resolve=>next!.child.once("exit",()=>resolve()))}await app.close();await closeTestPools(runtime)}
  }
  expect(await replay("sv3_isolation_many")).toEqual(await replay("sv3_isolation_zero"));
 },180000);
 it("successful Log an extra, retries, mutation errors and current builder counts/inbox responses ignore held signals",async()=>{
  const {createWorkspaceApplication}=await import("./workspace/application.js");
  const responses=[];
  for(const database of ["sv3_isolation_zero","sv3_isolation_many"]){const p=pool("sv3_isolation_runtime",database);try{
   const app=createWorkspaceApplication({pool:p,sessionId:session}),out:unknown[]=[];
   const extra={version:"variation-command.v1",action:"propose",proposalId,scopeItemId,existingScopeItemId:null,lineageParentScopeItemId:null,description:"Fictional builder addition",captureText:"Fictional builder addition",price:null};
   const initial=await app.variation.command(jobId,extra);expect(initial.variations.some(v=>v.id===proposalId)).toBe(true);out.push(initial);
   out.push(await app.variation.command(jobId,extra));
   out.push(await app.decisions.list({tenantId:DEMO_TENANT_ID,jobId}));
   for(const command of [{version:"decision-resolution-command.v1",commandId:jobId,tenantId:DEMO_TENANT_ID,decisionId:jobId,findingFingerprint:"a".repeat(64),resolution:"dismissed",expectedSnapshotRevision:0},{version:"invalid"}]){
    try{out.push(await app.decisions.dismiss(command))}catch(e){out.push({code:(e as {code:string}).code})}
   }
   out.push(await app.value.read(jobId));
   const inspect=pool("postgres",database);try{out.push((await inspect.query("SELECT row_to_json(t)::text value FROM (SELECT * FROM app.action_outbox ORDER BY tenant_id,id) t")).rows)}finally{await closeTestPools(inspect)}
   responses.push(JSON.stringify(out));
  }finally{await closeTestPools(p)}}
  expect(responses[1]).toBe(responses[0]);
 });
});
