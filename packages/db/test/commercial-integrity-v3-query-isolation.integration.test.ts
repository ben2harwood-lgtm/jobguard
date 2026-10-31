import { readFile,readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { selectIntegrityFamily,integrityActivitySql,integrityFamilySql } from "../src/commercial-integrity-v3-sources.js";
import { actor,tenant,protectedFacts,reviewFor,createIntegrityFixture,seedIntegrityJob,transaction,type IntegrityFixture } from "./commercial-integrity-v3-fixtures.js";
const base={saved_v1_sample:false,provenance:"system_generated_quote",job_policy:null,activation_policy:null,terms_policy:null,terms_track:null,job_track:null,environment:null};
describe("local family and architecture checks",()=>{
 it("family fails closed on contradictions, unsupported track, policy and imports",()=>{
  expect(selectIntegrityFamily(base)).toBe("v3");expect(selectIntegrityFamily({...base,saved_v1_sample:true})).toBe("v1");
  expect(selectIntegrityFamily({...base,provenance:"imported",job_policy:"reference_fee_policy_v1"})).toBe("v1");
  for(const changes of [{saved_v1_sample:true,job_policy:"reference_fee_policy_v3"},{job_track:"contractor"},{terms_track:"contractor"},{job_policy:"unknown"},{provenance:"imported"},{environment:"pilot_no_charge"},{job_policy:"reference_fee_policy_v3",activation_policy:"reference_fee_policy_v1"}])expect(()=>selectIntegrityFamily({...base,...changes})).toThrow("INTEGRITY_FAMILY_UNAVAILABLE");
 });
 it("minimal SQL contains no tenant-wide counters or shadow relation",()=>{
  expect(integrityFamilySql).not.toMatch(/count\s*\(|journal|cap_pence|effects/iu);
  expect(integrityActivitySql).not.toMatch(/shadow|reveal|signal/iu);
  expect(integrityActivitySql).toContain("i.tenant_id=$1 AND i.job_id=$2");
  expect(integrityActivitySql).toContain("p.tenant_id=$1 AND p.job_id=$2");
 });
 it("actual authority sources cannot consume this advisory module or feedback",async()=>{
  const roots=[new URL("../src/",import.meta.url),new URL("../../core/src/",import.meta.url),new URL("../../../apps/api/src/",import.meta.url)];
  let inspected=0;
  async function scan(root:URL){for(const e of await readdir(root,{withFileTypes:true})){
   const url=new URL(e.name+(e.isDirectory()?"/":""),root);if(e.isDirectory()){await scan(url);continue;}
   if(!e.name.endsWith(".ts")||e.name.includes(".test.")||!/(?:pricing|meter|fee|entitlement|account-repository|subscription|activation)/u.test(e.name)||e.name.includes("commercial-integrity"))continue;
   inspected++;const text=await readFile(url,"utf8");expect(text,url.pathname).not.toMatch(/commercial-integrity-v3|commercialIntegrityV3|commercial_integrity\.review\.v3|ch6_(?:record_integrity_review|integrity_source_fingerprint)/u);
  }}
  for(const root of roots)await scan(root);expect(inspected).toBeGreaterThan(20);
  // The separately owned CH6-B full transitive boundary remains a merge gate.
 });
 it("read/review source contains no business DML and SQL helpers contain no financial writes",async()=>{
  for(const name of ["commercial-integrity-v3-repository.ts","commercial-integrity-v3-sources.ts"]){const text=await readFile(new URL(`../src/${name}`,import.meta.url),"utf8");expect(text).not.toMatch(/\b(?:INSERT INTO|UPDATE app\.|DELETE FROM)\b/iu);}
  const sql=await readFile(new URL("../migrations/0506_commercial_integrity_v3_receipts.sql",import.meta.url),"utf8");
  const writes=[...sql.matchAll(/\bINSERT INTO\s+([a-z_.]+)/giu)].map(m=>m[1]);expect(writes.sort()).toEqual(["app.audit_event","app.command_receipt"]);
  expect(sql).not.toMatch(/\b(?:UPDATE|DELETE FROM)\s+app\./iu);
 });
});
describe("PostgreSQL zero/many hidden signal query log",()=>{
 let f:IntegrityFixture;beforeAll(async()=>{f=await createIntegrityFixture();},120000);afterAll(async()=>{await f?.close();});
 it("CI-P02 same executed query sequence and public values, with no hidden relation grants",async()=>{
  const {job}=await seedIntegrityJob(f),protectedBefore=await protectedFacts(f);
  const queries:string[]=[];
  // Record the statements actually sent to pg; controlled routines are inspected independently below.
  const original=f.runtime.connect.bind(f.runtime);
  f.runtime.connect=(async()=>{const db=await original(),query=db.query.bind(db);return new Proxy(db,{get(target,key){if(key==="query")return async(sql:string,values?:unknown[])=>{queries.push(sql);return query(sql,values);};const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;}});}) as typeof f.runtime.connect;
  const zero=await f.repo.read(f.auth.context,actor,f.auth.digest,job),sequence=queries.splice(0);
  await transaction(f.admin,async db=>{for(let n=0;n<25;n++){const id=randomUUID();await db.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
   VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic.ch6',clock_timestamp(),'Fictional hidden work','low','held_for_final_check')`,[tenant,job,id]);}});
  const many=await f.repo.read(f.auth.context,actor,f.auth.digest,job);
  expect(queries).toEqual(sequence);expect(sequence.length).toBeGreaterThan(5);expect(sequence.join("\n")).not.toMatch(/shadow_|reveal_shadow|set role/iu);
  expect({...many,result:{...many.result,evaluatedAt:zero.result.evaluatedAt}}).toEqual(zero);
  // Read-clock is intentionally different. All other serialized bytes must match.
  const bodies=await f.admin.query("SELECT pg_get_functiondef(p.oid) body FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN ('authenticate_practice_session','ch6_integrity_authority','ch6_integrity_family','ch6_integrity_source_fingerprint','ch6_integrity_sources')");
  expect(bodies.rows).toHaveLength(5);for(const row of bodies.rows)expect(row.body).not.toMatch(/\bapp\.shadow_|reveal_shadow|SET ROLE/iu);
  const grants=await f.admin.query("SELECT has_table_privilege('jobguard_runtime','app.shadow_commercial_signal','SELECT') allowed");expect(grants.rows[0].allowed).toBe(false);
  expect(f.logs.join("")).toContain("SELECT");
  const review=await reviewFor(f,job);
  await f.repo.review(f.auth.context,actor,f.auth.digest,job,review);
  await f.repo.review(f.auth.context,actor,f.auth.digest,job,review);
  // Includes both legacy meter tables and MON-1 lifecycle source, place, correction and day ledgers.
  // Hidden-signal volume, advisory reads, feedback and its replay cannot change these economic records.
  expect(await protectedFacts(f)).toEqual(protectedBefore);
 });

it("CH-6 unlocked reads never invoke even the private publication entry",async()=>{
 const {job}=await seedIntegrityJob(f);
 const definition=(await f.admin.query("SELECT pg_get_functiondef('app.ch6_integrity_published(uuid,uuid,text)'::regprocedure) body")).rows[0].body;
 try{
  await f.admin.query("CREATE OR REPLACE FUNCTION app.ch6_integrity_published(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'PRELOCK_PUBLICATION_READ'; END $$");
  const view=await f.repo.read(f.auth.context,actor,f.auth.digest,job);
  expect(view.published).toBeNull();expect(view.result.findings.map(f=>f.kind)).toEqual(["invoice_or_payment_without_lock"]);
 }finally{await f.admin.query(definition);}
 await expect(transaction(f.runtime,db=>db.query("SELECT app.ch6_integrity_published($1,$2,$3)",[tenant,job,f.auth.digest]))).rejects.toMatchObject({code:"42501"});
});

});
