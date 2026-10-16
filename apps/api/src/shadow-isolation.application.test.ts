import "reflect-metadata";
import crypto, { createHash, randomUUID } from "node:crypto";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { Pool, type PoolClient } from "pg";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID, migrate } from "@jobguard/db";
// Build what this file needs when it is absent (repair round 5, 13 Oct 2026). CI runs `pnpm test` BEFORE `pnpm build`, and turbo's test task depends only on the packages' builds (^build), so on a clean checkout neither apps/api/dist nor apps/web/.next exists when this file starts (CI run 38322571867: ERR_MODULE_NOT_FOUND on the import below).
// Each output is built at most once per run of this file, with the command CI itself uses, from the repository root, and only when its marker file is absent (nothing is rebuilt when it is present). A failed build fails the file with the build's own output. The environment is CI's build environment: vitest's NODE_ENV=test and this file's own JOBGUARD_ENV/DATABASE_URL are not passed to a build.
const repoRoot=fileURLToPath(new URL("../../../",import.meta.url)),BUILD_TIMEOUT_MS=8*60_000,BUILD_HOOK_TIMEOUT_MS=10*60_000;
const present=(file:URL)=>access(file).then(()=>true,()=>false);
function buildEnvironment(){const env={...process.env};for(const key of Object.keys(env))if(key==="NODE_ENV"||key==="JOBGUARD_ENV"||key==="DATABASE_URL"||key.startsWith("VITEST"))delete env[key];return env}
async function buildIfAbsent(label:string,filter:string,marker:URL){
 if(await present(marker))return;
 const built=spawnSync("pnpm",["--filter",filter,"build"],{cwd:repoRoot,env:buildEnvironment(),encoding:"utf8",timeout:BUILD_TIMEOUT_MS,maxBuffer:64*1024*1024});
 const tail=`${built.stdout??""}${built.stderr??""}`.slice(-6000);
 if(built.error||built.status!==0)throw new Error(`${label} build failed: pnpm --filter ${filter} build (exit ${built.status}, signal ${built.signal}${built.error?`, ${built.error.message}`:""}). This test needs it and CI runs tests before builds. Build output (last 6000 characters):\n${tail}`);
 if(!await present(marker))throw new Error(`${label} build finished but ${fileURLToPath(marker)} is still missing. Build output (last 6000 characters):\n${tail}`);
}
await buildIfAbsent("API","@jobguard/api",new URL("../dist/app.module.js",import.meta.url));
// The compiled application: dependency injection here relies on tsc's emitDecoratorMetadata, which vitest's transform does not emit (a source import leaves every controller's pool undefined).
const {AppModule}=await import(new URL("../dist/app.module.js",import.meta.url).href);
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
async function nextRoutes(path:string,prefix="/api",method:"GET"|"POST"="GET"):Promise<string[]>{const routes:string[]=[];for(const e of await readdir(path,{withFileTypes:true})){
 if(e.isDirectory())routes.push(...await nextRoutes(join(path,e.name),`${prefix}/${e.name}`,method));
 else if(e.name==="route.ts" && new RegExp(`export\\s+(?:(?:async\\s+)?function\\s+${method}\\b|const\\s+${method}\\b)`,"u").test(await readFile(join(path,e.name),"utf8")))routes.push(prefix);
}return routes;}
function pathFor(route:string){return route.replace(/\{(?:id|jobId)\}|\[(?:id|jobId)\]/gu,jobId).replace(/\{[^}]+\}|\[[^\]]+\]/gu,"10000000-0000-4000-8000-000000000099");}
// PostgreSQL log entries start at a "LOG:" line; DETAIL (bound parameters) and continuation lines belong to the entry before them. onLog delivers raw stderr chunks cut anywhere, so entries are rebuilt from the joined text, and the database name in the log prefix (which differs by construction between the zero and many databases) is made neutral before the lists are compared.
// Repair round 6 (13 Oct 2026, CI run 38324335881). The runtime log is no longer compared as one interleaved sequence. Statements are grouped by database connection (session id, log_line_prefix %c), each connection's statements are cut into units (one transaction, BEGIN to COMMIT/ROLLBACK, or one statement outside a transaction) in their exact order, and the units are sorted into a fixed order.
// Compared exactly: every statement, every DETAIL (bound-parameter) line, the order of statements inside each unit, and what belongs to which unit. NOT compared: the relative order of units, whether on different connections (timing: one connection's COMMIT can be logged before or after another's BEGIN) or on one connection (which pooled connection serves a later request is itself timing: final-account-lock.application.ts runs two reads at once with Promise.all and the pool reuses whichever connection was released last). The session id only groups and is never compared; a marker line before each unit keeps the grouping itself compared.
const UNIT_MARK="<unit>";
const opensTransaction=(text:string)=>/^(?:BEGIN|START\s+TRANSACTION)\b/iu.test(text.trim()),closesTransaction=(text:string)=>/^(?:COMMIT|END|ABORT|ROLLBACK(?!\s+TO\b))\b/iu.test(text.trim());
function runtimeStatementsByUnit(raw:string,database:string):string[]{
 const prefix=`SV3:sv3_isolation_runtime:${database}:`,sessions=new Map<string,string[]>();
 for(const entry of raw.split(/\n(?=SV3:[^\n]*?: LOG:  )/u)){
  if(!entry.includes(prefix)||!/(?:statement|execute [^:]+):/u.test(entry))continue;
  const id=entry.match(new RegExp(`${prefix}([0-9a-f]+\\.[0-9a-f]+): `,"u"))?.[1];
  if(id===undefined)throw new Error(`runtime log entry without a session id (log_line_prefix must include %c): ${entry.slice(0,200)}`);
  const text=entry.replace(/^.*?(?:statement|execute [^:]+):/su,"").replaceAll(`${prefix}${id}:`,"SV3:sv3_isolation_runtime:DB:").replace(/\n$/u,""); // only the last entry of the raw log still ends with its own newline; which statement is last is timing too
  sessions.set(id,[...sessions.get(id)??[],text]);
 }
 const units:string[][]=[];
 for(const texts of sessions.values()){let open:string[]|undefined;
  for(const text of texts){
   if(open){open.push(text);if(closesTransaction(text)){units.push(open);open=undefined}}
   else if(opensTransaction(text))open=[text];
   else units.push([text]);
  }
  if(open)units.push(open);
 }
 const key=(unit:string[])=>JSON.stringify(unit);
 return units.sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0).flatMap(unit=>[UNIT_MARK,...unit]);
}
function runtimeStatements(logStart:number,database:string){return runtimeStatementsByUnit(statementsLog.slice(logStart).join(""),database);}
function stableHeaders(headers:Record<string,string>){return Object.fromEntries(Object.entries(headers).filter(([k])=>k!=="date").sort(([a],[b])=>a.localeCompare(b)));}
// NAMED LIMIT (coordinator ruling, 12 Oct 2026; SV-3 BUILDER_RECEIPT "Follow-up (12 Oct)"). Only in the replay comparison below, and only on the two prevention-checks GETs (Nest /jobs/{id}/prevention-checks and Next /api/jobs/{id}/prevention-checks),
// exactly two things are not compared byte for byte between the two replays: the body field `retrievedAt` (the database wall clock, so two replays can never match; it is also copied into payingParty.retrievedAt) and the `etag` response header, which Express derives from the body bytes.
// Only the Nest endpoint carries an etag (Next 15.5.27 sends none for a route handler), so the etag exclusion exists on that one endpoint only; on the Next endpoint the test asserts that no etag exists and compares the headers exactly.
// Every other byte of those two responses (status, every other header, every other body byte) is still compared exactly. Each excluded thing has its own positive assertion in the test (a time inside that replay's own window; an etag equal to Express's etag of the other fields plus that time).
const nestRetrievalRoute=`/jobs/${jobId}/prevention-checks`,nextRetrievalRoute=`/api/jobs/${jobId}/prevention-checks`;
const retrievedAtRoutes=new Set([nestRetrievalRoute,nextRetrievalRoute]);
const retrievedAtNeedle=(value:string)=>`"retrievedAt":"${value}"`;
const swapRetrievedAt=(text:string,from:string,to:string)=>text.split(retrievedAtNeedle(from)).join(retrievedAtNeedle(to));
const RETRIEVED_AT_CHECKED_SEPARATELY="<retrievedAt: checked by the named-limit assertions>",ETAG_CHECKED_SEPARATELY="<etag: checked by the named-limit assertions>";
type Retrieval={route:string;status:number;text:string;etag:string|undefined;before:number;after:number};
/** Positive assertion (a): the field is a well-formed time (and nothing else) inside the window the test itself read around that request; returns it. */
function checkRetrievedAt(r:Retrieval):string{
 expect(r.status,r.route).toBe(200);
 const body=JSON.parse(r.text) as {retrievedAt?:unknown;payingParty?:{retrievedAt?:unknown}|null},value=body.retrievedAt;
 expect(typeof value,`${r.route} retrievedAt`).toBe("string");const at=value as string;
 expect(at,r.route).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);expect(new Date(Date.parse(at)).toISOString(),r.route).toBe(at);
 expect(Date.parse(at),`${r.route} retrievedAt is not before the request`).toBeGreaterThanOrEqual(r.before);expect(Date.parse(at),`${r.route} retrievedAt is not after the response`).toBeLessThanOrEqual(r.after);
 // The repository assigns one value to both places; no other occurrence of this exact pair exists.
 if(body.payingParty)expect(body.payingParty.retrievedAt,r.route).toBe(at);
 expect(r.text.split(retrievedAtNeedle(at)).length-1,`${r.route} occurrences of the excluded field`).toBe(body.payingParty?2:1);
 return at;
}
async function startNext(database:string):Promise<{child:ChildProcess;base:string}>{
 const httpPort=await freePort(31000,500),base=`http://127.0.0.1:${httpPort}`;
 const child=spawn(process.execPath,[new URL("../../web/node_modules/next/dist/bin/next",import.meta.url).pathname,"start","--hostname","127.0.0.1","--port",String(httpPort)],{cwd:new URL("../../web/",import.meta.url).pathname,env:{...process.env,JOBGUARD_ENV:"synthetic_demo",DATABASE_URL:connection("sv3_isolation_runtime",database)},stdio:"pipe"});
 await new Promise<void>((resolve,reject)=>{child.once("exit",()=>reject(new Error("NEXT_START_FAILED")));child.stdout?.on("data",chunk=>{if(String(chunk).includes("Ready in"))resolve()});child.stderr?.on("data",()=>undefined)});
 return {child,base};
}
// The production web build that startNext serves (`next start` needs apps/web/.next/BUILD_ID); built once for the file, before the database hook, when absent.
beforeAll(()=>buildIfAbsent("Web production","@jobguard/web",new URL("../../web/.next/BUILD_ID",import.meta.url)),BUILD_HOOK_TIMEOUT_MS);
beforeAll(async()=>{
 process.env.JOBGUARD_ENV="synthetic_demo";dir=await mkdtemp(join(tmpdir(),"sv3-isolation-"));port=await freePort(58000,500);
 postgres=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:credential,persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:(line:string)=>statementsLog.push(line)});await postgres.initialise();await postgres.start();owner=pool("postgres","postgres");
 await owner.query("ALTER SYSTEM SET log_line_prefix='SV3:%u:%d:%c: '");await owner.query("SELECT pg_reload_conf()");
 await owner.query(`CREATE ROLE sv3_isolation_runtime LOGIN PASSWORD '${credential}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
 await owner.query("ALTER ROLE sv3_isolation_runtime SET log_statement='all'");
 await owner.query("CREATE DATABASE sv3_isolation_zero");const p=pool("postgres","sv3_isolation_zero");try{await migrate(p);await installLegacySyntheticPartyFixtures(p);
 await p.query("GRANT jobguard_runtime TO sv3_isolation_runtime");
 await p.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[DEMO_TENANT_ID]);await p.query("INSERT INTO identity.identity_user(id) VALUES($1)",[DEMO_IDENTITY_USER_ID]);
 await p.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional SV-3 builder')",[DEMO_ACCOUNT_ID,DEMO_TENANT_ID]);
 await p.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,DEMO_ACCOUNT_ID,DEMO_IDENTITY_USER_ID]);
 // Issue the session through the product's own SECURITY DEFINER routine: the seed trigger on practice_session refuses a direct insert by any other role (no guard is switched off).
 await p.query("SELECT app.issue_practice_session($1)",[digest]);
 await p.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario,created_at,updated_at) VALUES($1,$2,'Fictional SV-3 isolation job','live',$3,'home',$4,$4)",[jobId,DEMO_TENANT_ID,digest,fixed]);
 await p.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state,created_at) VALUES($1,$2,$3,'confirmed',$4)",[baselineScopeId,DEMO_TENANT_ID,jobId,fixed]);
 await withTenant(p,testTenantContext(DEMO_TENANT_ID),async (db:{$client:PoolClient})=>{
  for(let n=0;n<25;n++){
   const evidenceId=`20000000-0000-4000-8000-${String(100+n).padStart(12,"0")}`,uploadId=`30000000-0000-4000-8000-${String(100+n).padStart(12,"0")}`;
   await db.$client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at) VALUES($1,$2,$3,$4,repeat('a',64),'image/png',100,'standard_evidence','2099-10-01')",[uploadId,DEMO_TENANT_ID,jobId,uploadId]);
   await db.$client.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,'original','completion_photo',$6,'synthetic-v1',repeat('a',64),100,'image/png','standard_evidence',$5,$5)",[evidenceId,DEMO_TENANT_ID,uploadId,jobId,fixed,uploadId]);
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
 it("replays every OpenAPI builder GET and Next job GET with byte-identical status, headers and body (named limit: retrievedAt and its etag on the two prevention-checks GETs, asserted separately)",async()=>{
  const api=JSON.parse(await readFile(new URL("../openapi.json",import.meta.url),"utf8")) as {paths:Record<string,Record<string,unknown>>};
  const nestRoutes=Object.entries(api.paths).filter(([path,ops])=>ops.get && !path.startsWith('/auth/') && path!=="/healthz").map(([path])=>pathFor(path));
  const webRoutes=(await nextRoutes(new URL("../../web/app/api",import.meta.url).pathname)).filter(path=>path.startsWith('/api/jobs/')).map(pathFor);
  expect(nestRoutes.length).toBeGreaterThan(0);expect(webRoutes.length).toBeGreaterThan(0);
  async function replay(database:string){
   const logStart=statementsLog.length;
   const runtime=pool("sv3_isolation_runtime",database),module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(Pool).useValue(runtime).compile(),app=module.createNestApplication();
   let next:Awaited<ReturnType<typeof startNext>>|undefined;
   try{await app.init();await app.listen(await freePort(32000,500),"127.0.0.1");const nest=await app.getUrl();next=await startNext(database);const output=[],retrievals:Retrieval[]=[];
    // Express's own etag function, taken from the running application (used only by the named-limit assertion on the Nest endpoint).
    const nestEtag=(app.getHttpAdapter().getInstance() as {get(setting:string):unknown}).get("etag fn") as (body:Buffer)=>string;
    for(const [base,routes] of [[nest,nestRoutes],[next.base,webRoutes]] as const)for(const path of routes){
     const url=new URL(path,base);url.searchParams.set("tenantId",DEMO_TENANT_ID);url.searchParams.set("jobId",jobId);
     const before=Date.now();
     const response=await fetch(url,{headers:{cookie:`jg_session=${session}`,"x-jobguard-verified-tenant":DEMO_TENANT_ID}});
     const bytes=Buffer.from(await response.arrayBuffer()),after=Date.now(),headers=stableHeaders(Object.fromEntries(response.headers));
     if(retrievedAtRoutes.has(path)){
      // Named limit: compare everything except retrievedAt and the etag; both are asserted separately after the two replays.
      const text=bytes.toString("utf8"),at=(JSON.parse(text) as {retrievedAt?:unknown}).retrievedAt;
      retrievals.push({route:path,status:response.status,text,etag:headers.etag,before,after});
      output.push({route:path,status:response.status,headers:path===nestRetrievalRoute&&"etag" in headers?{...headers,etag:ETAG_CHECKED_SEPARATELY}:headers,body:Buffer.from(typeof at==="string"?swapRetrievedAt(text,at,RETRIEVED_AT_CHECKED_SEPARATELY):text).toString("base64")});
     }else output.push({route:path,status:response.status,headers,body:bytes.toString("base64")});
    }
    await new Promise<void>(resolve=>setTimeout(resolve,25));
    const statements=runtimeStatements(logStart,database);
    expect(statements.length).toBeGreaterThan(0);
    expect(statements.join("\n")).not.toMatch(/\b(?:shadow_commercial_signal|shadow_signal_\w+|shadow_reconciliation_run|shadow_disclosure_event|shadow_break_glass_access|shadow_must_surface_firing|reveal_shadow_signals|record_shadow_disclosure|surface_shadow_signal_early)\b/u);
    return {compared:{output,statements},retrievals,nestEtagOf:(text:string)=>nestEtag(Buffer.from(text,"utf8"))};
   }finally{if(next){next.child.kill("SIGTERM");await new Promise<void>(resolve=>next!.child.once("exit",()=>resolve()))}await app.close();await closeTestPools(runtime)}
  }
  const many=await replay("sv3_isolation_many"),zero=await replay("sv3_isolation_zero");
  // Everything compared exactly, except the two named-limit items (placeholders stand in for them on exactly the two prevention-checks GETs).
  expect(many.compared).toEqual(zero.compared);
  for(const route of retrievedAtRoutes){
   const m=many.retrievals.filter(r=>r.route===route),z=zero.retrievals.filter(r=>r.route===route);
   expect(m,`${route} fetched once in the many replay`).toHaveLength(1);expect(z,`${route} fetched once in the zero replay`).toHaveLength(1);
   // (a) each replay's retrievedAt is a well-formed time inside that replay's own request window.
   const mAt=checkRetrievedAt(m[0]!),zAt=checkRetrievedAt(z[0]!);
   // (b) Nest: the etag is Express's etag of the body, so the other replay's body with only retrievedAt swapped gives exactly this replay's etag: the etag changes with retrievedAt and with nothing else that is compared.
   if(route===nestRetrievalRoute){
    expect(m[0]!.etag,`${route} many etag present`).toEqual(expect.any(String));expect(z[0]!.etag,`${route} zero etag present`).toEqual(expect.any(String));
    expect(many.nestEtagOf(swapRetrievedAt(z[0]!.text,zAt,mAt)),`${route} many etag = etag(zero body with the many retrievedAt)`).toBe(m[0]!.etag);
    expect(zero.nestEtagOf(swapRetrievedAt(m[0]!.text,mAt,zAt)),`${route} zero etag = etag(many body with the zero retrievedAt)`).toBe(z[0]!.etag);
    if(mAt!==zAt)expect(m[0]!.etag,`${route} etag changes with retrievedAt`).not.toBe(z[0]!.etag);
   }else{
    // Next: no etag exists on this response in either replay, so nothing derived from retrievedAt is excluded here (headers were compared exactly above).
    expect(m[0]!.etag,`${route} many: no etag`).toBeUndefined();expect(z[0]!.etag,`${route} zero: no etag`).toBeUndefined();
   }
  }
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

/** Observable channels are compared independently, so absence/shape/extra fields cannot hide a leak. */
const channels=["responses","notifications","outbox","exports","counts","badges","errors","cache","analytics","telemetry","statements","publicRows"] as const;
type IsolationTrace=Record<typeof channels[number],unknown[]>;
function emptyTrace():IsolationTrace{return {responses:[],notifications:[],outbox:[],exports:[],counts:[],badges:[],errors:[],cache:[],analytics:[],telemetry:[],statements:[],publicRows:[]}}
function assertIsolation(zero:IsolationTrace,many:IsolationTrace){for(const channel of channels)expect(JSON.stringify(many[channel]),channel).toBe(JSON.stringify(zero[channel]));}

// Every comparator has an explicit negative control, including otherwise quiet notification/analytics paths.
it.each(channels)("Test Q monitor rejects a signal-dependent %s path",channel=>{
 const zero=emptyTrace(),many=structuredClone(zero);
 many[channel].push({heldSignalCount:25});expect(()=>assertIsolation(zero,many)).toThrow();
});

// Test Q-LOG (repair round 6): the statement-log normaliser behind both statement comparisons, proved on hand-made logs (no database, no server). Same statements re-interleaved across connections, or landing on other connections, compare equal; a changed, missing or extra statement, a changed bound parameter, a duplicated unit, a swap inside one transaction and a moved transaction boundary all compare different.
describe("SV-3 Test Q-LOG: runtime statement log normalisation (pure)",()=>{
 const DB="d_one",ROLE="SV3:sv3_isolation_runtime";
 // Lines exactly as PostgreSQL writes them with log_line_prefix 'SV3:%u:%d:%c: ' and log_statement='all'.
 const simple=(sid:string,sql:string,db=DB)=>`${ROLE}:${db}:${sid}: LOG:  statement: ${sql}`;
 const bound=(sid:string,sql:string,parameters:string,db=DB)=>`${ROLE}:${db}:${sid}: LOG:  execute <unnamed>: ${sql}\n${ROLE}:${db}:${sid}: DETAIL:  parameters: ${parameters}`;
 const logOf=(...entries:string[])=>`${entries.join("\n")}\n`;
 const normalise=(raw:string,db=DB)=>runtimeStatementsByUnit(raw,db);
 const [X,Y,Z]=["6a7c1d00.1001","6a7c1d00.1002","6a7c1d01.2003"] as const;
 // The shape CI run 38324335881 produced: a lock-view transaction on one connection and a draft read on another, started together.
 const lockBegin=simple(X,"BEGIN"),lockConfig=bound(X,"SELECT set_config('app.tenant_id', $1, true)","$1 = 'T'"),lockView=bound(X,"SELECT l.* FROM app.final_account_lock l WHERE l.job_id=$2","$1 = 'T', $2 = 'J'"),lockEnd=simple(X,"COMMIT");
 const draftBegin=simple(Y,"BEGIN"),draftConfig=bound(Y,"SELECT set_config('app.tenant_id', $1, true)","$1 = 'T'"),draftRead=bound(Y,"SELECT d.revision FROM app.final_account_draft d WHERE d.job_id=$2","$1 = 'T', $2 = 'J'"),draftEnd=simple(Y,"COMMIT");
 const draftFirst=logOf(lockBegin,lockConfig,lockView,draftBegin,lockEnd,draftConfig,draftRead,draftEnd),lockFirst=logOf(lockBegin,lockConfig,lockView,lockEnd,draftBegin,draftConfig,draftRead,draftEnd);
 const rename=(raw:string,from:string,to:string)=>raw.replaceAll(`:${from}: `,`:${to}: `);
 it("Q-LOG-1 the same two connections interleaved either way (the CI shape), or under other session ids, compare equal",()=>{
  expect(normalise(draftFirst)).toEqual(normalise(lockFirst));
  expect(normalise(rename(rename(draftFirst,X,"7b000000.9001"),Y,"7b000000.9002"))).toEqual(normalise(lockFirst));
  expect(normalise(logOf(draftBegin,draftConfig,draftRead,draftEnd,lockBegin,lockConfig,lockView,lockEnd))).toEqual(normalise(lockFirst));
 });
 it("Q-LOG-2 later statements landing on the other pooled connection compare equal (the pool reuses whichever connection was released last)",()=>{
  const first=["SELECT * FROM app.authenticate_practice_session($1)","$1 = 'S'"] as const,second=["SELECT * FROM app.contractor_session($1)","$1 = 'S'"] as const;
  const onFirst=logOf(bound(X,...first),bound(X,...second),lockBegin,lockConfig,lockEnd,draftBegin,draftConfig,draftEnd);
  const onSecond=logOf(bound(X,...first),lockBegin,lockConfig,lockEnd,draftBegin,draftConfig,draftEnd,bound(Y,...second));
  expect(normalise(onSecond)).toEqual(normalise(onFirst));
 });
 it("Q-LOG-3 every statement text and bound-parameter line is still in the result, each transaction is one unit behind a marker, and the database name and session id are neutral",()=>{
  const result=normalise(lockFirst),detail=(parameters:string)=>`\n${ROLE}:DB: DETAIL:  parameters: ${parameters}`;
  expect([...result].filter(line=>line!==UNIT_MARK).sort()).toEqual([" BEGIN"," BEGIN"," COMMIT"," COMMIT",` SELECT set_config('app.tenant_id', $1, true)${detail("$1 = 'T'")}`,` SELECT set_config('app.tenant_id', $1, true)${detail("$1 = 'T'")}`,` SELECT l.* FROM app.final_account_lock l WHERE l.job_id=$2${detail("$1 = 'T', $2 = 'J'")}`,` SELECT d.revision FROM app.final_account_draft d WHERE d.job_id=$2${detail("$1 = 'T', $2 = 'J'")}`].sort());
  expect(result.filter(line=>line===UNIT_MARK)).toHaveLength(2);expect(result[0]).toBe(UNIT_MARK);
  expect(result.join("\n")).not.toContain(X);expect(result.join("\n")).not.toContain(Y);expect(result.join("\n")).not.toContain(DB);
  expect(normalise(logOf(simple(Z,"SELECT 1")))).toEqual([UNIT_MARK," SELECT 1"]);
 });
 it("Q-LOG-4 a changed statement, a changed bound parameter, a missing statement, an extra statement and a duplicated unit each compare different",()=>{
  const base=normalise(lockFirst);
  expect(normalise(lockFirst.replace("final_account_lock l","final_account_lock x"))).not.toEqual(base);
  expect(normalise(lockFirst.replace("$2 = 'J'","$2 = 'K'"))).not.toEqual(base);
  expect(normalise(logOf(lockBegin,lockConfig,lockEnd,draftBegin,draftConfig,draftRead,draftEnd))).not.toEqual(base);
  expect(normalise(logOf(lockBegin,lockConfig,lockView,lockEnd,draftBegin,draftConfig,draftRead,draftEnd,simple(Y,"SELECT 1")))).not.toEqual(base);
  expect(normalise(logOf(lockBegin,lockConfig,lockView,lockEnd,draftBegin,draftConfig,draftRead,draftEnd,lockBegin,lockConfig,lockView,lockEnd))).not.toEqual(base);
  expect(normalise(logOf(simple(Z,"SELECT 1"),simple(Z,"SELECT 1")))).not.toEqual(normalise(logOf(simple(Z,"SELECT 1"))));
 });
 it("Q-LOG-5 two statements swapped inside one transaction, and a transaction boundary moved, each compare different",()=>{
  const base=normalise(lockFirst);
  expect(normalise(logOf(lockBegin,lockView,lockConfig,lockEnd,draftBegin,draftConfig,draftRead,draftEnd))).not.toEqual(base);
  expect(normalise(logOf(lockBegin,lockConfig,lockView,draftBegin,draftConfig,draftRead,draftEnd))).not.toEqual(base);
  expect(normalise(logOf(lockBegin,lockConfig,lockEnd,lockView,draftBegin,draftConfig,draftRead,draftEnd))).not.toEqual(base);
  expect(normalise(logOf(simple(Z,"BEGIN"),simple(Z,"SELECT 1"),simple(Z,"COMMIT"),simple(Z,"SELECT 2")))).not.toEqual(normalise(logOf(simple(Z,"BEGIN"),simple(Z,"SELECT 1"),simple(Z,"SELECT 2"),simple(Z,"COMMIT"))));
 });
 it("Q-LOG-6 ROLLBACK ends a unit, ROLLBACK TO SAVEPOINT does not, and an unterminated transaction is still one compared unit",()=>{
  expect(normalise(logOf(simple(Z,"BEGIN"),simple(Z,"SELECT 1"),simple(Z,"ROLLBACK"),simple(Z,"SELECT 2")))).toEqual([UNIT_MARK," BEGIN"," SELECT 1"," ROLLBACK",UNIT_MARK," SELECT 2"]);
  expect(normalise(logOf(simple(Z,"BEGIN"),simple(Z,"SAVEPOINT a"),simple(Z,"ROLLBACK TO a"),simple(Z,"COMMIT"),simple(Z,"SELECT 2")))).toEqual([UNIT_MARK," BEGIN"," SAVEPOINT a"," ROLLBACK TO a"," COMMIT",UNIT_MARK," SELECT 2"]);
  expect(normalise(logOf(simple(Z,"BEGIN"),simple(Z,"SELECT 1")))).toEqual([UNIT_MARK," BEGIN"," SELECT 1"]);
  expect(normalise(logOf(simple(Z,"BEGIN"),simple(Z,"SELECT 1")))).not.toEqual(normalise(logOf(simple(Z,"BEGIN"),simple(Z,"SELECT 2"))));
 });
 it("Q-LOG-7 other roles, other databases and lines that are not statements are ignored, and a runtime entry without a session id fails closed",()=>{
  const noise=logOf(`SV3:postgres:${DB}:6a7c1d02.3001: LOG:  statement: SELECT 'owner'`,simple(X,"SELECT 1","d_other"),`${ROLE}:${DB}:${Z}: LOG:  duration: 1.000 ms`,simple(Z,"SELECT 1"));
  expect(normalise(noise)).toEqual([UNIT_MARK," SELECT 1"]);
  expect(()=>normalise(`${ROLE}:${DB}: LOG:  statement: SELECT 1\n`)).toThrow(/without a session id/u);
 });
});

it("Test Q: successful mutations, exports, delivery/retry telemetry and every mutation error surface are identical",async()=>{
 const {seedAccount}=await import(new URL("../../../packages/db/test/final-account-lock.integration.test.ts",import.meta.url).href);
 const {createWorkspaceApplication}=await import("./workspace/application.js"),{ActionExecutor}=await import(new URL("../../../packages/db/src/outbox.ts",import.meta.url).href);
 // A fresh public fixture and two exact clones. No prior HTTP test can change the compared history.
 const initial=pool("postgres","sv3_isolation_zero"),a=await seedAccount(initial,DEMO_TENANT_ID,100000);
 const signalEvidence=randomUUID(),signalUpload=randomUUID(),queued=randomUUID(),authority=randomUUID(),approval=randomUUID(),decision=randomUUID(),artifact="Fictional approved notification";
 try{await withTenant(initial,testTenantContext(DEMO_TENANT_ID),async(db:{$client:PoolClient})=>{
  await db.$client.query("SET LOCAL session_replication_role='replica'"); // Fixture ownership binding only, as in SV-4's exported fixture.
  await db.$client.query("UPDATE app.job SET practice_session_digest=$1,practice_scenario='home',baseline_quote_version_id=$2,accepted_net_value_pence=100000,fee_policy_version='reference_fee_policy_v3' WHERE tenant_id=$3 AND id=$4",[digest,a.baselineId,DEMO_TENANT_ID,a.jobId]); // job_baseline_shape needs the accepted value and fee policy beside the baseline id
  await db.$client.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture') ON CONFLICT DO NOTHING",[DEMO_TENANT_ID,a.jobId]);
  // proof completion reads the scope item's progress row, which review confirmation creates and the exported lock fixture does not.
  await db.$client.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[DEMO_TENANT_ID,a.jobId,a.scopeItemId]);
 });
 await withTenant(initial,testTenantContext(DEMO_TENANT_ID),async(db:{$client:PoolClient})=>{
  // An original evidence object needs its upload parent row (evidence_object_kind_ck, evidence_object_upload_fk).
  await db.$client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at) VALUES($1,$2,$3,$4,repeat('a',64),'image/png',100,'standard_evidence','2099-10-01')",[signalUpload,DEMO_TENANT_ID,a.jobId,signalUpload]);
  await db.$client.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$6,$3,$4,'original','photo','synthetic:Q','Q:v1',repeat('a',64),0,'image/png','standard_evidence',$5,$5)",[signalEvidence,DEMO_TENANT_ID,a.jobId,a.scopeItemId,fixed,signalUpload]);
  await db.$client.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'synthetic_notification')",[decision,DEMO_TENANT_ID,a.jobId]);
  await db.$client.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)",[approval,DEMO_TENANT_ID,decision,DEMO_MEMBERSHIP_ID]);
  const hash=createHash("sha256").update(artifact).digest("hex");
  await db.$client.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'synthetic_notification','fixture@example.invalid',$6,1,'synthetic:Q','2099-10-01')",[authority,DEMO_TENANT_ID,decision,approval,DEMO_MEMBERSHIP_ID,hash]);
  await db.$client.query("INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,policy_version,authorization_expires_at,created_at) VALUES($1,$2,$3,'fake_capture','synthetic:Q','synthetic_notification','fixture@example.invalid',$4,$5,1,'synthetic:Q','2099-10-01',$6)",[queued,DEMO_TENANT_ID,authority,hash,artifact,fixed]);
 });
 }finally{await closeTestPools(initial)}
 const databases=["sv3_effect_zero","sv3_effect_many"];
 for(const name of databases)await owner.query(`CREATE DATABASE ${name} TEMPLATE sv3_isolation_zero`);
 const manyAdmin=pool("postgres",databases[1]!);
 try{const hidden=pool("sv3_isolation_shadow",databases[1]!);try{await withTenant(hidden,testTenantContext(DEMO_TENANT_ID),async(db:{$client:PoolClient})=>{
  for(let n=0;n<25;n++){const id=randomUUID();await db.$client.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state) VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:Q',$4,'Private fictional extra','low','held_for_final_check')",[DEMO_TENANT_ID,a.jobId,id,fixed]);
   await db.$client.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,'Q:v1',repeat('a',64),$5)",[DEMO_TENANT_ID,a.jobId,id,signalEvidence,fixed]);}
 })}finally{await closeTestPools(hidden)}
 expect((await manyAdmin.query("SELECT count(*)::int n FROM app.shadow_signal_evidence WHERE job_id=$1",[a.jobId])).rows).toEqual([{n:25}]);
 }finally{await closeTestPools(manyAdmin)}
 const originalUuid=crypto.randomUUID;
 async function replay(database:string):Promise<IsolationTrace>{
  const inspect=pool("postgres",database),runtime=pool("sv3_isolation_runtime",database),trace=emptyTrace();
  let sequence=0;const uuidMock=vi.spyOn(crypto,"randomUUID").mockImplementation(()=>`80000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}` as ReturnType<typeof randomUUID>);
  syncBuiltinESMExports();vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-13T00:00:00Z"));
  let app:ReturnType<typeof createWorkspaceApplication>,nest:import('@nestjs/common').INestApplication|undefined,next:Awaited<ReturnType<typeof startNext>>|undefined;
  try{
   // Test-local clocks/identities in these disposable databases only. The compared rows retain every byte.
   for(const name of ["now","transaction_timestamp","statement_timestamp","clock_timestamp"])
    await inspect.query(`CREATE OR REPLACE FUNCTION pg_catalog.${name}() RETURNS timestamptz LANGUAGE sql AS 'SELECT ''2026-10-13T00:00:00Z''::timestamptz'`);
   await inspect.query("CREATE SEQUENCE public.sv3_uuid_counter");await inspect.query("GRANT USAGE ON SEQUENCE public.sv3_uuid_counter TO PUBLIC");
   await inspect.query("CREATE OR REPLACE FUNCTION pg_catalog.gen_random_uuid() RETURNS uuid LANGUAGE sql VOLATILE AS $$ SELECT ('90000000-0000-4000-8000-'||lpad(nextval('public.sv3_uuid_counter')::text,12,'0'))::uuid $$");
   app=createWorkspaceApplication({pool:runtime,sessionId:session});
   const logStart=statementsLog.length;
   async function success(name:string,work:()=>Promise<unknown>){const result=await work();trace.responses.push({name,result});return result as any}
   const price={quantity:"1",unit:"item",unitRatePence:12000,direction:"addition"};
   const extra={version:"variation-command.v1",action:"propose",proposalId:randomUUID(),scopeItemId:randomUUID(),existingScopeItemId:null,lineageParentScopeItemId:null,description:"Fictional captured tap",captureText:"Fictional captured tap",price};
   const proposed=await success("Log an extra: priced",()=>app.variation.command(a.jobId,extra));
   await success("Log an extra: retry",()=>app.variation.command(a.jobId,extra));
   const revision=proposed.variations.find((v:any)=>v.id===extra.proposalId).currentRevisionId;
   await success("approve captured extra",()=>app.variation.command(a.jobId,{version:"variation-command.v1",action:"approve",variationId:extra.proposalId,revisionId:revision,approvalId:randomUUID(),attestation:"Builder-recorded practice acceptance — not an authenticated customer signature"}));
   await inspect.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal) SELECT gen_random_uuid(),r.tenant_id,r.job_id,$3,'variation',r.id,v.scope_item_id,r.id,ap.id,'Fictional approved extra',0,2 FROM app.variation v JOIN app.variation_revision r ON(r.tenant_id,r.id)=(v.tenant_id,v.current_revision_id) JOIN app.variation_approval ap ON(ap.tenant_id,ap.revision_id)=(r.tenant_id,r.id) WHERE v.tenant_id=$1 AND v.id=$2",[DEMO_TENANT_ID,extra.proposalId,a.revisionId]); // MIGFIX-5: the account must carry the approved variation, or the lock guard refuses it as stale
   await success("Log an extra: unpriced",()=>app.variation.command(a.jobId,{...extra,proposalId:randomUUID(),scopeItemId:randomUUID(),price:null}));
   const rate=await success("save rate",()=>app.materials.addRate({version:"material-rate-command.v1",merchantName:"Fictional Q merchant",sku:"Q-TAP",description:"Fictional tap",pricePence:2000,priceUnit:"each",taxBasis:"net",effectiveFrom:"2026-10-01",sourceLabel:"synthetic:Q",expectedVersion:0}));
   await success("save requirement",()=>app.materials.addRequirement(a.jobId,{version:"material-requirement-command.v1",scopeItemId:a.scopeItemId,skuId:rate.skuId,quantity:"2",unit:"each",expectedRevision:0}));
   await success("plan",()=>app.readiness.record(a.jobId,{version:"readiness-plan.v1",commandId:randomUUID(),scenarioNow:"2026-10-13T00:00:00Z"}));
   await success("advance",()=>app.readiness.advance(a.jobId,{version:"readiness-clock.v1",commandId:randomUUID(),scenarioNow:"2026-10-13T00:00:00Z"}));
   await success("seed inbox",()=>app.inboxRelevance.seed(a.jobId,{version:"inbox-seed.v1",commandId:randomUUID()}));
   await success("budget",()=>app.inboxRelevance.budget(a.jobId,{version:"inbox-budget.v1",commandId:randomUUID(),advisoryBudget:3}));
   const advisory=(await inspect.query("SELECT id FROM app.inbox_decision_revision WHERE job_id=$1 AND lane='advisory' ORDER BY id LIMIT 1",[a.jobId])).rows[0].id;
   await success("dismiss advisory",()=>app.inboxRelevance.dismiss(a.jobId,advisory,{version:"inbox-dismiss.v1",commandId:randomUUID()}));
   const evaluated=await success("evaluate decisions",()=>app.decisions.evaluate({version:"finding-evaluation-command.v1",commandId:randomUUID(),tenantId:DEMO_TENANT_ID,jobId:a.jobId}));
   const dismissible=evaluated.decisions.find((d:any)=>d.classification==="advisory");expect(dismissible).toBeDefined();
   await success("dismiss decision",()=>app.decisions.dismiss({version:"decision-resolution-command.v1",commandId:randomUUID(),tenantId:DEMO_TENANT_ID,decisionId:dismissible.id,findingFingerprint:dismissible.fingerprint,resolution:"dismissed",expectedSnapshotRevision:dismissible.source.snapshotRevision}));
   await success("terms",()=>app.finalAccountLock.acceptTerms(a.jobId,{version:"final-check-terms.accept.v1",commandId:randomUUID(),termsVersion:"synthetic_final_check_terms.v1"}));
   await success("review extra",()=>app.finalAccountLock.reviewExtra(a.jobId,{version:"final-review-extra.v1",commandId:randomUUID(),scopeItemId:randomUUID(),description:"Fictional reviewed extra",captureText:"Fictional reviewed extra",price:null}));
   await success("disposition",()=>app.finalAccountLock.disposition(a.jobId,{version:"final-account.disposition.v1",commandId:randomUUID(),scopeItemId:a.scopeItemId,disposition:"done"}));
   const proofScope=(await app.proof.get(a.jobId)).scopeItemId;
   const selected=await success("proof select",()=>app.proof.command(a.jobId,{version:"practice-proof-command.v1",action:"select_generated",commandId:randomUUID(),scopeItemId:proofScope,fixture:"completion-photo"}));
   const verified=await success("proof finalize",()=>app.proof.command(a.jobId,{version:"practice-proof-command.v1",action:"finalize",commandId:randomUUID(),uploadId:selected.upload.id,objectVersionId:selected.upload.objectVersionId}));
   await success("proof complete",()=>app.proof.command(a.jobId,{version:"practice-proof-command.v1",action:"complete",commandId:randomUUID(),scopeItemId:proofScope,evidenceId:verified.upload.evidenceId}));
   await success("final-account lock",()=>app.finalAccountLock.lock(a.jobId,{version:"final-account.lock.v1",commandId:randomUUID(),finalAccountRevisionId:a.revisionId,expectedRevision:1,declarationVersion:"final_account_declaration.v1"}));
   await success("final-account lock projection",()=>app.finalAccountLock.get(a.jobId));
   // Real authorized delivery exercises notification content and retry telemetry, with no external provider.
   let attempts=0;const adapter:import("@jobguard/db").OutboundAdapter={name:"fake_capture",supportsProviderDeduplication:false,deliver:async action=>{trace.notifications.push(action);return ++attempts===1?{kind:"retryable",code:"SYNTHETIC_RETRY"}:{kind:"succeeded",providerReference:"synthetic:Q"}},reconcile:async()=>"unknown"};
   const executor=new ActionExecutor(runtime,new Map([[adapter.name,adapter]]),{emit:(name:Parameters<import("@jobguard/db").SafeTelemetry["emit"]>[0],fields:Readonly<Record<string,string|number>>)=>trace.telemetry.push({name,fields})});
   await executor.execute(testTenantContext(DEMO_TENANT_ID),queued);await executor.execute(testTenantContext(DEMO_TENANT_ID),queued);
   expect(trace.notifications).toHaveLength(2);expect(trace.telemetry).toContainEqual(expect.objectContaining({name:"outbox.retry"}));
   await success("issue customer invoice",()=>app.customerInvoice.issue(a.jobId,{version:"practice-customer-invoice.issue.v1",commandId:randomUUID(),finalAccountRevisionId:a.revisionId,expectedSourceHash:"a".repeat(64),recipient:"fixture@example.invalid",issuedOn:"2026-10-13"}));
   const invoice=(await app.customerInvoice.get(a.jobId)).invoices[0]!;
   const pdf=await app.customerInvoice.pdf(a.jobId,invoice.id);expect(pdf.byteLength).toBeGreaterThan(0);trace.exports.push(Buffer.from(pdf).toString("base64"));
   const receipt=await success("record receipt",()=>app.customerInvoice.recordReceipt(a.jobId,{version:"practice-customer-receipt.record.v1",commandId:randomUUID(),invoiceId:invoice.id,paidOn:"2026-10-13",amountPence:1000,method:"bank_transfer",reference:"Fictional payment"}));
   const payment=(await inspect.query("SELECT id FROM app.customer_payment WHERE invoice_id=$1",[invoice.id])).rows[0].id;expect(receipt).toBeDefined();
   await success("reverse receipt",()=>app.customerInvoice.reverseReceipt(a.jobId,{version:"practice-customer-receipt.reverse.v1",commandId:randomUUID(),invoiceId:invoice.id,paymentId:payment,reason:"Fictional correction"}));
   const credit=await success("preview credit",()=>app.customerInvoice.previewCredit(a.jobId,{version:"practice-credit-note.preview.v1",invoiceId:invoice.id,netPence:1000,reason:"Fictional credit"}));
   await success("issue credit",()=>app.customerInvoice.issueCredit(a.jobId,{version:"practice-credit-note.issue.v1",commandId:randomUUID(),invoiceId:invoice.id,netPence:1000,reason:"Fictional credit",previewHash:credit.previewHash}));
   const inbox=await app.decisions.list({tenantId:DEMO_TENANT_ID,jobId:a.jobId}),relevance=await app.inboxRelevance.view(a.jobId),proof=await app.proof.get(a.jobId);
   trace.counts.push(inbox.counts,relevance,proof,await app.value.read(a.jobId),await app.practiceFeed.view(session,a.jobId,{version:"practice-feed-query.v1",limit:50}));trace.badges.push(inbox.counts,relevance,proof.mandatoryDecisionCount);
   // Every mutating HTTP boundary is replayed with the same malformed command; no omitted error/cache path.
   const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(Pool).useValue(runtime).compile();nest=module.createNestApplication({logger:false});await nest.init();await nest.listen(await freePort(33000,500),"127.0.0.1");
   const api=JSON.parse(await readFile(new URL("../openapi.json",import.meta.url),"utf8")) as {paths:Record<string,Record<string,unknown>>};
   for(const [path,ops] of Object.entries(api.paths))if(ops.post&&!path.startsWith("/auth/")&&!path.startsWith("/contractor")){
    const url=new URL(pathFor(path).replaceAll(jobId,a.jobId),await nest.getUrl());
    const response=await fetch(url,{method:"POST",headers:{cookie:`jg_session=${session}`,"content-type":"application/json"},body:JSON.stringify({version:"invalid"})});
    expect(response.status,path).toBeGreaterThanOrEqual(400);
    trace.errors.push({path,status:response.status,body:Buffer.from(await response.arrayBuffer()).toString("base64")});trace.cache.push({path,headers:stableHeaders(Object.fromEntries(response.headers))});
   }
   next=await startNext(database);
   const webMutations=(await nextRoutes(new URL("../../web/app/api",import.meta.url).pathname,"/api","POST")).filter(path=>/^\/api\/(?:jobs|decisions|material-rates|recovery-cases|sandbox|quotes)(?:\/|$)/u.test(path));
   expect(webMutations.length).toBeGreaterThan(0);
   for(const path of webMutations){
    const response=await fetch(new URL(pathFor(path).replaceAll(jobId,a.jobId),next.base),{method:"POST",headers:{cookie:`jg_session=${session}`,"content-type":"application/json"},body:JSON.stringify({version:"invalid"})});
    expect(response.status,path).toBeGreaterThanOrEqual(400);
    trace.errors.push({path,status:response.status,body:Buffer.from(await response.arrayBuffer()).toString("base64")});trace.cache.push({path,headers:stableHeaders(Object.fromEntries(response.headers))});
   }
   for(const table of ["action_outbox","action_attempt"])trace.outbox.push({table,rows:(await inspect.query(`SELECT row_to_json(t)::text bytes FROM app.${table} t ORDER BY row_to_json(t)::text`)).rows});
   const tables=(await inspect.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('app','infrastructure') AND tablename NOT LIKE 'shadow_%' ORDER BY schemaname,tablename")).rows;
   for(const table of tables){const name=`"${table.schemaname}"."${table.tablename}"`;
    // claimed_xact stores the cluster-wide PostgreSQL transaction number, which differs between any two replays in one cluster whatever the signals; every other byte of every row is compared.
    const bytes=table.tablename==="watchdog_command_identity"?"(to_jsonb(t)-'claimed_xact')::text":"row_to_json(t)::text";
    trace.publicRows.push({table:name,rows:(await inspect.query(`SELECT ${bytes} bytes FROM ${name} t ORDER BY 1`)).rows})}
   // Analytics has no separate persisted or network emitter in the current builder composition; public facts cover its inputs.
   trace.analytics.push(relevance);
   await new Promise<void>(resolve=>setTimeout(resolve,25));
   trace.statements=runtimeStatements(logStart,database);
   expect(trace.statements.length).toBeGreaterThan(0);expect(trace.statements.join("\n")).not.toMatch(/\b(?:shadow_\w+|surface_shadow_signal_early|record_shadow_disclosure)\b/u);
   return trace;
  }finally{if(next){next.child.kill("SIGTERM");await new Promise<void>(resolve=>next!.child.once("exit",()=>resolve()))}await nest?.close();await closeTestPools(runtime,inspect);uuidMock.mockRestore();syncBuiltinESMExports();expect(crypto.randomUUID).toBe(originalUuid);vi.useRealTimers()}
 }
 try{const zero=await replay(databases[0]!),many=await replay(databases[1]!);assertIsolation(zero,many)}finally{for(const name of databases)await owner.query(`DROP DATABASE ${name}`)}
},180000);
