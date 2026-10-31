import { describe, expect, it, vi } from "vitest";
import { parseObservation, sha256 } from "@jobguard/core";
import { ShadowDetectionWorker, type ShadowWorkerPorts } from "./shadow-detection.worker.js";
const { testTenantContext } = await import(new URL("../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
const tenantId = "10000000-0000-4000-8000-000000000001", jobId = "10000000-0000-4000-8000-000000000002";
const task = { version: "shadow-detection-task.v1", tenantId, jobId };
const at = "2026-10-12T00:00:00Z";
const observation = parseObservation({ version: "observation.v1",tenantId,jobId,kind:"note_or_voice",text:"outside tap",citations:[{start:0,end:11,quote:"outside tap"}],
  evidence:{id:jobId,objectVersionId:"synthetic-v1",sha256:sha256("outside tap"),serverReceivedAt:at},facts:{workReference:"outside-tap",scopeArea:"job",description:"outside tap",status:"completed",estimatedValuePence:null,safetyImplication:false,customerClearlyRequested:false,needsPriorWrittenAgreement:false,significantWork:null,activeDispute:false,silenceMateriallyWorsensDispute:false,disclosureDuty:false} });
const ports = (): ShadowWorkerPorts => ({ assertTermsRelation:vi.fn(async()=>undefined),hasAcceptedTerms:vi.fn(async()=>true),read:vi.fn(async()=>({observations:[observation],captures:[]})),propose:vi.fn(async()=>({proposals:[]})),persist:vi.fn(async()=>undefined) });
describe("SV-3 worker boundary and terms gate", () => {
  it("passes each stamped context whole per call; repeated invocations never retain it", async () => {
    const p=ports(),worker=new ShadowDetectionWorker(p,"synthetic_demo",()=>at),context=testTenantContext(tenantId);
    await worker.start();await worker.execute(context,task);await worker.execute(context,task);
    expect(p.read).toHaveBeenCalledWith(context,{version:"shadow-observation-read.v1",jobId});
    expect(p.persist).toHaveBeenCalledTimes(2);expect(vi.mocked(p.persist).mock.calls[0]![1]).toEqual(vi.mocked(p.persist).mock.calls[1]![1]);
  });
  it("refuses unaccepted terms before reading, detecting or writing",async()=>{
    const p=ports();vi.mocked(p.hasAcceptedTerms).mockResolvedValue(false);
    await expect(new ShadowDetectionWorker(p,"synthetic_demo").execute(testTenantContext(tenantId),task)).rejects.toThrow("SHADOW_TERMS_NOT_ACCEPTED");
    expect(p.read).not.toHaveBeenCalled();expect(p.propose).not.toHaveBeenCalled();expect(p.persist).not.toHaveBeenCalled();
  });
  it("refuses startup without SV-4's real relation and outside synthetic mode",async()=>{
    const p=ports();vi.mocked(p.assertTermsRelation).mockRejectedValue(new Error("TERMS_RELATION_UNAVAILABLE"));
    await expect(new ShadowDetectionWorker(p,"synthetic_demo").start()).rejects.toThrow("TERMS_RELATION_UNAVAILABLE");
    for(const env of ["production_billing","pilot_no_charge","provider_sandbox","disabled"]){
      await expect(new ShadowDetectionWorker(p,env).start()).rejects.toThrow("SHADOW_SYNTHETIC_ONLY");
      await expect(new ShadowDetectionWorker(p,env).execute(testTenantContext(tenantId),task)).rejects.toThrow("SHADOW_SYNTHETIC_ONLY");
    }
  });
  it("rejects malformed, cross-tenant, authority-bearing and request-shaped tasks",async()=>{
    const p=ports(),worker=new ShadowDetectionWorker(p,"synthetic_demo");
    for(const extra of [{tenantId:"invalid"},{jobId:"invalid"},{price:800000},{approved:true},{headers:{}}])
      await expect(worker.execute(testTenantContext(tenantId),{...task,...extra})).rejects.toThrow("INVALID_SHADOW_TASK");
    await expect(worker.execute(testTenantContext(jobId),task)).rejects.toThrow("SHADOW_TASK_TENANT_MISMATCH");
    expect(p.read).not.toHaveBeenCalled();
  });
});

// Exercise the actual reader port with the SV-4 contract, rather than a boolean-only terms fake.
describe("SV-3 / SV-4 accepted terms integration port",()=>{
  it("requires the exact SV-4 version and the stamped tenant before processing",async()=>{
    const {ShadowObservationReader}=await import(new URL("../../../packages/db/src/shadow-observation-reader.ts",import.meta.url).href);
    const query=vi.fn(async(sql:string,values?:unknown[])=>{
      if(sql.includes("to_regclass"))return {rows:[{available:true}]};
      if(sql.includes("FROM app.final_check_terms_acceptance"))return {rows:[],rowCount:0};
      return {rows:[]};
    });
    const pool={query,connect:vi.fn(async()=>({query,release:vi.fn()}))} as unknown as import("pg").Pool;
    const reader=new ShadowObservationReader(pool,{decode:async()=>null}),p=ports();
    p.assertTermsRelation=()=>reader.assertTermsRelation();p.hasAcceptedTerms=c=>reader.hasAcceptedTerms(c);
    const worker=new ShadowDetectionWorker(p,"synthetic_demo");await worker.start();
    await expect(worker.execute(testTenantContext(tenantId),task)).rejects.toThrow("SHADOW_TERMS_NOT_ACCEPTED");
    const terms=query.mock.calls.filter(([sql])=>sql.includes("FROM app.final_check_terms_acceptance"));
    expect(terms).toHaveLength(1);expect(terms[0]![0]).toContain("terms_version=$2");
    expect(terms[0]![1]).toEqual([tenantId,"synthetic_final_check_terms.v1"]);
    expect(p.read).not.toHaveBeenCalled();expect(p.propose).not.toHaveBeenCalled();expect(p.persist).not.toHaveBeenCalled();
  });
});

describe("SV-3 actual shared worker composition",()=>{
 it("gates Graphile/outbox startup on SV-4 and keeps accepted terms per detection invocation",async()=>{
  let available=false;
  const registered=vi.fn(async(..._arguments:unknown[])=>({stop:vi.fn()})),execute=vi.fn(async(..._arguments:unknown[])=>undefined);
  const queries=vi.fn(async(sql:string)=>sql.includes("pg_auth_members")?{rows:[{safe:true}]}:sql.includes("to_regclass")?{rows:[{available}]}:sql.includes("final_check_terms_acceptance")?{rows:[],rowCount:0}:{rows:[]});
  vi.doMock("pg",()=>({Pool:class{query=queries;connect=async()=>({query:queries,release:vi.fn()});end=async()=>undefined;}}));
  vi.doMock("graphile-worker",async()=>({...await vi.importActual<Record<string,unknown>>("graphile-worker"),run:registered}));
  vi.doMock("@jobguard/db",async()=>({...await vi.importActual<Record<string,unknown>>("@jobguard/db"),ActionExecutor:class{execute=execute;}}));
  const listener=vi.spyOn(process,"once").mockReturnValue(process);
  vi.stubEnv("GRAPHILE_DATABASE_URL","postgresql://localhost/graphile");
  vi.stubEnv("RUNTIME_DATABASE_URL","postgresql://localhost/runtime");
  vi.stubEnv("SHADOW_DATABASE_URL","postgresql://localhost/shadow");vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
  try{
   vi.resetModules();await expect(import("./worker.js")).rejects.toThrow("TERMS_RELATION_UNAVAILABLE");expect(registered).not.toHaveBeenCalled();
   available=true;vi.resetModules();await import("./worker.js");expect(registered).toHaveBeenCalledTimes(1);
   const options=registered.mock.calls[0]![0] as unknown as {taskList:Record<string,(raw:unknown)=>Promise<void>>};
   expect(Object.keys(options.taskList)).toEqual(["discover_outbox","execute_outbox","detect_shadow_evidence","final_check","discover_final_check_requests","final_check_practice_run","discover_evidence_pack_requests","build_evidence_pack_v3"]);
   // Practice mode includes final-check and evidence-pack tasks, never outbox delivery.
   vi.stubEnv("JOBGUARD_WORKER_PRACTICE_FINAL_CHECK_ONLY","1");vi.resetModules();await import("./worker.js");
   const practice=registered.mock.calls[1]![0] as unknown as {taskList:Record<string,unknown>;crontab:string};
   expect(Object.keys(practice.taskList)).toEqual(["discover_final_check_requests","final_check_practice_run","discover_evidence_pack_requests","build_evidence_pack_v3"]);expect(practice.crontab).toBe("*/1 * * * * discover_final_check_requests\n*/1 * * * * discover_evidence_pack_requests");
   vi.stubEnv("JOBGUARD_WORKER_PRACTICE_FINAL_CHECK_ONLY","");
   await options.taskList.execute_outbox!({tenantId,actionId:jobId});
   expect(execute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({tenantId}),jobId,expect.any(Function));
   const beforeClaim=execute.mock.calls[0]![2] as (actionType:string)=>void;
   for(const environment of ["production_billing","pilot_no_charge","provider_sandbox","disabled"]){
    vi.stubEnv("JOBGUARD_ENV",environment);
    for(const actionType of ["future.action","fee.post"])
     expect(()=>beforeClaim(actionType)).toThrow("PRODUCTION_SETTLEMENT_DISABLED");
    expect(()=>beforeClaim("quote.send")).not.toThrow();
   }
   vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
   await expect(options.taskList.detect_shadow_evidence!(task)).rejects.toThrow("SHADOW_TERMS_NOT_ACCEPTED");
   expect(queries.mock.calls.filter(([sql])=>sql.includes("FROM app.evidence_object"))).toHaveLength(0);
  }finally{listener.mockRestore();vi.unstubAllEnvs();vi.doUnmock("pg");vi.doUnmock("graphile-worker");vi.doUnmock("@jobguard/db");vi.resetModules()}
 });
});

describe("SV-3 structural isolation of every builder success/error/effect path",()=>{
 it("all request adapters, UI caches/counts and business repositories lack a shadow capability",async()=>{
  const {readFile,readdir}=await import("node:fs/promises"),{join}=await import("node:path"),ts=await import("typescript");
  const root=new URL("../../../",import.meta.url).pathname;
  const excluded=new Set(["apps/api/src/worker.ts","apps/api/src/shadow-detection.worker.ts","packages/db/src/shadow-repository.ts","packages/db/src/shadow-observation-reader.ts","packages/db/src/shadow-detection-repository.ts"]);
  const forbidden=/\b(?:shadow_commercial_signal|shadow_signal_\w+|shadow_reconciliation_run|shadow_disclosure_event|shadow_break_glass_access|shadow_must_surface_firing|reveal_shadow_signals|record_shadow_disclosure|surface_shadow_signal_early)\b/u;
  const capabilities=new Set<string>(["detectShadowObservations","ShadowFixtureProposer"]);
  for(const file of [...excluded].filter(f=>f.startsWith("packages/db"))){
   const source=ts.createSourceFile(file,await readFile(join(root,file),"utf8"),ts.ScriptTarget.Latest,true);
   for(const statement of source.statements)if(ts.canHaveModifiers(statement)&&ts.getModifiers(statement)?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)){
    if((ts.isClassDeclaration(statement)||ts.isFunctionDeclaration(statement))&&statement.name)capabilities.add(statement.name.text);
   }
  }
  async function files(directory:string):Promise<string[]>{const out:string[]=[];for(const entry of await readdir(join(root,directory),{withFileTypes:true})){
   const path=join(directory,entry.name);if(entry.isDirectory())out.push(...await files(path));else if(/\.(?:ts|tsx)$/u.test(path)&&!path.includes(".test.")&&!path.endsWith(".d.ts"))out.push(path);
  }return out}
  const inspected=[];
  for(const file of (await Promise.all(["apps/api/src","apps/web/app","packages/db/src"].map(files))).flat()){
   if(excluded.has(file)||file.endsWith("/index.ts"))continue; // Inert barrel registrations convey no executing capability.
   const text=await readFile(join(root,file),"utf8");
   // Fast candidate filter is equivalent: tokens cannot contain an absent source substring.
   // Parse candidates to distinguish executing tokens from comments; no timeout increase.
   if(!forbidden.test(text)&&![...capabilities].some(name=>text.includes(name))&&!/shadow-(?:detection|observation|repository)|shadow-proposal/u.test(text)){inspected.push(file);continue;}
   const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
   // Scan executable tokens/string literals, not comments. Applies equally to success, errors, exports and logging.
   function visit(node:import("typescript").Node){
    if(ts.isImportDeclaration(node)){
     const clause=node.importClause;if(clause?.isTypeOnly)return;
     expect(node.moduleSpecifier.getText(source),file).not.toMatch(/shadow-(?:detection|observation|repository)|shadow-proposal/u);
     const bindings=clause?.namedBindings;
     if(bindings&&ts.isNamedImports(bindings))for(const binding of bindings.elements)if(!binding.isTypeOnly)
      expect(capabilities.has((binding.propertyName??binding.name).text),`${file}: shadow capability import`).toBe(false);
    }
    if(ts.isStringLiteralLike(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node)||ts.isIdentifier(node))expect(node.text,file).not.toMatch(forbidden);
    if(ts.isIdentifier(node)&&capabilities.has(node.text))throw new Error(`${file}: shadow capability ${node.text}`);
    ts.forEachChild(node,visit);
   }
   visit(source);inspected.push(file);
  }
  expect(inspected.some(f=>f.endsWith("application.ts"))).toBe(true);
  expect(inspected.some(f=>f.endsWith("route.ts"))).toBe(true);
  expect(inspected.some(f=>f.endsWith("materials-command.ts"))).toBe(true);
  expect(inspected.some(f=>f.endsWith("decision-inbox.tsx"))).toBe(true);
  expect(inspected.length).toBeGreaterThan(100);
  // Negative controls: every way a caller can acquire/use the capability is rejected by the policy.
  for(const name of ["shadow_commercial_signal","shadow_signal_evidence","shadow_disclosure_event","surface_shadow_signal_early"])
   expect(forbidden.test(`SELECT * FROM app.${name}`)).toBe(true);
  expect(capabilities.has("ShadowObservationReader")).toBe(true);expect(capabilities.has("ShadowDetectionRepository")).toBe(true);
 });
});
