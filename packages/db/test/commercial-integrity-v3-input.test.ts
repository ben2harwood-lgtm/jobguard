import type { Pool } from "pg";
import { CommercialIntegrityV3Repository } from "../src/commercial-integrity-v3-repository.js";
import { verifiedTenantContextForQueuedJob } from "../src/tenant-context.js";
import { readFile } from "node:fs/promises";
import { expect,it,vi } from "vitest";
import {parseInventory,pathCompleteness} from "./lp-0-catalog.js";
import {existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import { readCommercialIntegrityV3Input,type CommercialIntegrityScope } from "../src/commercial-integrity-v3-sources.js";
const scope:CommercialIntegrityScope={tenantId:"11111111-1111-4111-8111-111111111111",jobId:"22222222-2222-4222-8222-222222222222",digest:"a".repeat(64),actor:{membershipId:"33333333-3333-4333-8333-333333333333",identityUserId:"44444444-4444-4444-8444-444444444444"}};
const time="2026-10-28T12:00:00.000000Z";
function fixture(){return {input:{version:"commercial-integrity-input.v3",environment:"synthetic_demo",tenantId:scope.tenantId,jobId:scope.jobId,scopeId:scope.digest,evaluatedAt:time,profile:{version:"synthetic_fixture.persisted-v3.1",ruleVersion:"persisted-v3.1",window:{start:time,end:time}},phase:"pre_lock",ordinaryFacts:{lockState:"absent",quotes:[],activations:[],activity:[],workEvents:[],assertions:[]}},availability:["identifier_phone_source_unavailable"]};}
function database(raw:unknown,authorized=true){const query=vi.fn().mockResolvedValueOnce({rowCount:authorized?1:0,rows:authorized?[{}]:[]}).mockResolvedValueOnce({rows:[{result:raw}]});return {db:{$client:{query}} as never,query};}
it("CH-6 actual source adapter accepts only exact server-bound versioned input and explicit refusals",async()=>{
 const raw=fixture(),{db,query}=database(raw);expect(await readCommercialIntegrityV3Input(db,scope)).toEqual(raw);
 expect(query.mock.calls[1]).toEqual(["SELECT app.ch6_integrity_sources($1,$2,$3) result",[scope.tenantId,scope.jobId,scope.digest]]);
});
it("CH-6 source decoder refuses hidden pre-lock fields, foreign scope, malformed facts and unversioned payloads",async()=>{
 const raw=fixture();
 for(const input of [{...raw.input,scopeId:"another-session"},{...raw.input,tenantId:scope.jobId},{...raw.input,jobId:scope.actor.membershipId},{...raw.input,version:"invented"},{...raw.input,published:{}},{...raw.input,ordinaryFacts:{...raw.input.ordinaryFacts,shadowSignals:[{description:"private"}]}}]){
  const {db}=database({...raw,input});await expect(readCommercialIntegrityV3Input(db,scope)).rejects.toThrow("INTEGRITY_SOURCE_UNAVAILABLE");
 }
 const {db,query}=database(raw,false);await expect(readCommercialIntegrityV3Input(db,scope)).rejects.toThrow("NOT_FOUND");expect(query).toHaveBeenCalledTimes(1);
});
it("CH-6 source migration confines publication calls to the locked branch and adds no runtime table grants",async()=>{
 const sql=await readFile(new URL("../migrations/0507_commercial_integrity_sources.sql",import.meta.url),"utf8");
 const body=sql.slice(sql.indexOf("CREATE FUNCTION app.ch6_integrity_sources"),sql.indexOf("-- Re-resolve all source facts"));
 const pre=body.slice(0,body.indexOf("IF has_lock THEN"));
 expect(pre).not.toMatch(/app\.(?:shadow_|final_check_|ch6_integrity_published)/u);
 expect(body).toContain("IF has_lock THEN publication:=app.ch6_integrity_published(t,j,d)");
 expect(sql).not.toMatch(/\bFROM\s+app\.receipt_allocation_fact_/iu);
 expect(sql).toContain("RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED");
 expect(sql).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON\s+(?:TABLE\s+)?app\.ch6_/iu);
 expect(sql).toContain("GRANT EXECUTE ON FUNCTION app.ch6_integrity_sources(uuid,uuid,text) TO jobguard_runtime");
 expect(sql).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+app\.(?:journal|meter_|subscription_|landing_allocation|recovery_fee)/iu);
});

it("CH-6 LP-0 rows retain a valid exact privilege inventory and complete path coverage",async()=>{
 const raw=JSON.parse(await readFile(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json",import.meta.url),"utf8"));
 const inventory=parseInventory(raw),root=fileURLToPath(new URL("../../../",import.meta.url));
 expect(pathCompleteness(inventory,p=>existsSync(root+p))).toEqual([]);
 expect(inventory.entries.filter(e=>e.key.includes("app.ch6_integrity_sources("))).toHaveLength(2);
});

it("CH-6 revocation between the ordinary authority read and controlled source query remains NOT_FOUND",async()=>{
 const query=vi.fn().mockResolvedValueOnce({rowCount:1,rows:[{}]}).mockRejectedValueOnce(new Error("NOT_FOUND"));
 await expect(readCommercialIntegrityV3Input({$client:{query}} as never,scope)).rejects.toMatchObject({code:"NOT_FOUND"});
});

it("CH-6 SQL receipt projection has a distinct identity while conflicting facts still fail closed",async()=>{
 const sql=await readFile(new URL("../migrations/0507_commercial_integrity_sources.sql",import.meta.url),"utf8");
 // Use the namespace actually emitted by the installed SQL receipt projection.
 const receiptType=sql.match(/app\.ch6_source\(t,j,d,p\.id::text,'([^']+)',p\.created_at/u)?.[1];
 expect(receiptType).toBeDefined();
 const source={tenantId:scope.tenantId,jobId:scope.jobId,scopeId:scope.digest,sourceId:"payment-1",sourceType:"customer_payment",revision:"1",hash:"a".repeat(64),recordedAt:time,provenance:"builder_attested"};
 const lockId="55555555-5555-4555-8555-555555555555";
 const raw=fixture();
 const payload={...raw,input:{...raw.input,phase:"post_lock",ordinaryFacts:{...raw.input.ordinaryFacts,lockState:"present",activity:[{source,activityKind:"payment"}]},published:{
  lockId,contractVersion:"persisted-published-integrity.v1",cutoff:time,
  lockSource:{...source,sourceId:lockId,sourceType:"final_account_lock",provenance:"server_recorded"},lockedAccount:{pence:100,currency:"GBP",basis:"gross"},
  catches:[],completions:[],receipts:[{source:{...source,sourceType:receiptType},value:{pence:101,currency:"GBP",basis:"gross"},reversed:false}],corrections:[],allocations:[],
 }}};
 const {db}=database(payload);expect(await readCommercialIntegrityV3Input(db,scope)).toEqual(payload);
 const conflicting={...payload,input:{...payload.input,published:{...payload.input.published,receipts:[{...payload.input.published.receipts[0],source}]}}};
 await expect(readCommercialIntegrityV3Input(database(conflicting).db,scope)).rejects.toThrow("INTEGRITY_SOURCE_UNAVAILABLE");
});

it("both integrity GET methods enforce read-only transactions and release them on failure",async()=>{
 const previous=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV="synthetic_demo";
 try{
  for(const method of ["readFamily","read"] as const)for(const fail of [false,true]){
   const statements:string[]=[],release=vi.fn();
   const query=vi.fn(async(sql:string)=>{
    statements.push(sql);
    if(sql==="SET TRANSACTION READ ONLY"&&fail)throw new Error("READ_ONLY_REQUIRED");
    if(sql.includes("saved_v1_sample"))return {rows:[{saved_v1_sample:false,provenance:"system_generated_quote",job_policy:null,activation_policy:null,terms_policy:null,terms_track:null,job_track:null,environment:null}]};
    if(sql.startsWith("WITH RECURSIVE practice_owned_job"))return {rowCount:1,rows:[{}]};
    if(sql.includes("SELECT app.ch6_integrity_sources"))return {rows:[{result:fixture()}]};
    return {rows:[]};
   });
   const pool={connect:async()=>({query,release})} as unknown as Pool;
   const repo=new CommercialIntegrityV3Repository(pool),context=verifiedTenantContextForQueuedJob(scope.tenantId);
   const result=repo[method](context,scope.actor,scope.digest,scope.jobId);
   if(fail){await expect(result).rejects.toThrow("READ_ONLY_REQUIRED");expect(statements.at(-1)).toBe("ROLLBACK");expect(statements).toHaveLength(4);}
   else{await expect(result).resolves.toBeDefined();expect(statements.at(-1)).toBe("COMMIT");}
   expect(statements[2]).toBe("SET TRANSACTION READ ONLY");expect(release).toHaveBeenCalledOnce();
  }
 }finally{if(previous===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previous;}
});

it("CH-6 installs no table locks; source readers and correction guards never lock job rows",async()=>{
 for(const name of ["0506_commercial_integrity_v3_receipts.sql","0507_commercial_integrity_sources.sql"]){
  const sql=await readFile(new URL(`../migrations/${name}`,import.meta.url),"utf8");
  expect(sql).not.toMatch(/\bLOCK\s+TABLE\b/iu);
  const end=sql.indexOf("CREATE OR REPLACE FUNCTION app.ch6_record_integrity_review")>0?sql.indexOf("CREATE OR REPLACE FUNCTION app.ch6_record_integrity_review"):sql.indexOf("CREATE FUNCTION app.ch6_record_integrity_review");
  expect(sql.slice(0,end)).not.toMatch(/\bFOR\s+(?:SHARE|UPDATE|NO KEY UPDATE|KEY SHARE)\b/iu);
  if(name.startsWith("0507")){
   const guard=sql.slice(sql.indexOf("CREATE FUNCTION app.ch6_guard_line_correction"),sql.indexOf("CREATE TRIGGER ch6_line_correction_bound"));
   expect(guard).toContain("pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.job_id::text,628))");
  }
 }
});
