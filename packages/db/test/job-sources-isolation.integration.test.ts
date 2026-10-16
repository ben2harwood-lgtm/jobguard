import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {Pool} from "pg";
import {parseObservation,proposalFromObservation} from "@jobguard/core";
import {ShadowDetectionRepository} from "../src/shadow-detection-repository.js";
import {ShadowObservationReader,FixtureObservationSources} from "../src/shadow-observation-reader.js";
import {JobSourceRepository} from "../src/job-source-repository.js";
import {ShadowDetectionWorker} from "../../../apps/api/src/shadow-detection.worker.js";
import {sourcesFixture,seedSource,closeWorkFixture,type SourceFixture} from "./job-sources-fixture.js";
/** Record query text per connection/transaction, never global pooled interleavings. */
function observed(pool:Pool,sequences:string[][]){return new Proxy(pool,{get(target,key){
 if(key==="connect")return async()=>{const client=await target.connect(),sequence:string[]=[];sequences.push(sequence);return new Proxy(client,{get(c,k){if(k==="query")return async(sql:string,values?:unknown[])=>{sequence.push(sql);return c.query(sql,values)};const v=Reflect.get(c,k,c);return typeof v==="function"?v.bind(c):v}})};
 const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;
}})}
describe("SV-7A fixture source isolation (intake Test O remains held)",()=>{
 let f:SourceFixture,shadow:Pool;
 beforeAll(async()=>{f=await sourcesFixture();for(let n=0;n<5;n++)await seedSource(f);const login=`sv7a_shadow_${randomUUID().replaceAll("-","")}`,credential=randomUUID();await f.admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${credential}'; GRANT jobguard_shadow TO ${login}`);shadow=new Pool({...f.admin.options,user:login,password:credential,max:2})},60000);
 afterAll(async()=>{await shadow?.end();await closeWorkFixture(f)});
 it("SV7A-17 runtime cannot query shadow or assume its role",async()=>{
  await expect(f.runtime.query("SELECT * FROM app.shadow_commercial_signal")).rejects.toMatchObject({code:"42501"});await expect(f.runtime.query("SET ROLE jobguard_shadow")).rejects.toMatchObject({code:"42501"});
 });
 it("SV7A-18 SV7A-19 independent fixture observations reach existing worker/sink; reads/query paths remain identical with held signals",async()=>{
  const {auth,jobId}=f.practice,sequences:string[][]=[],repo=new JobSourceRepository(observed(f.runtime,sequences));
  const before=await repo.read(auth.context,jobId,auth.digest,"diary"),messagesBefore=await repo.read(auth.context,jobId,auth.digest,"customer_message");const initial=sequences.splice(0);
  const reader=new ShadowObservationReader(f.runtime,new FixtureObservationSources([])),sink=new ShadowDetectionRepository(shadow);
  const worker=new ShadowDetectionWorker({assertTermsRelation:()=>reader.assertTermsRelation(),hasAcceptedTerms:context=>reader.hasAcceptedTerms(context),read:(context,request)=>reader.read(context,request),propose:async()=>({proposals:[]}),persist:(context,request)=>sink.persist(context,request)},"synthetic_demo",()=>"2026-10-13T12:00:00Z");
  const task={version:"shadow-detection-task.v1",tenantId:auth.context.tenantId,jobId};await worker.start();await expect(worker.execute(auth.context,task)).rejects.toMatchObject({code:"SHADOW_TERMS_NOT_ACCEPTED"});
  const {withTenant}=await import("../src/tenant-context.js");await withTenant(f.runtime,auth.context,db=>db.$client.query("SELECT app.accept_final_check_terms($1,$2,$3,$4)",[auth.context.tenantId,auth.membershipId,randomUUID(),"synthetic_final_check_terms.v1"]));
  await worker.execute(auth.context,task);await worker.execute(auth.context,task);
  expect((await f.admin.query("SELECT state FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND coalesced_into_signal_id IS NULL",[auth.context.tenantId,jobId])).rows).toEqual([{state:"held_for_final_check"}]);
  // Labelled isolation-only work facts, each bound to a distinct persisted original.
  // Seed before the read snapshot so only shadow state changes across the comparison.
  const originals=(await reader.read(auth.context,{version:"shadow-observation-read.v1",jobId})).observations;
  expect(originals).toHaveLength(5);expect(new Set(originals.map(o=>o.evidence.id)).size).toBe(5);
  const noise=originals.slice(1).map((original,n)=>parseObservation({...original,facts:{...original.facts,workReference:`synthetic:isolation-only:${n}`}}));
  await sink.persist(auth.context,{version:"shadow-detection-batch.v1",jobId,observations:noise,captures:[],proposals:noise.map(o=>proposalFromObservation(o,"deterministic","synthetic:isolation-fixture.v1","2026-10-13T12:00:00Z",{lock:"before_lock",adoption:"after_adoption"}))});
  expect((await f.admin.query("SELECT count(*)::int n FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND coalesced_into_signal_id IS NULL",[auth.context.tenantId,jobId])).rows[0].n).toBe(5);
  expect(await repo.read(auth.context,jobId,auth.digest,"diary")).toEqual(before);expect(await repo.read(auth.context,jobId,auth.digest,"customer_message")).toEqual(messagesBefore);expect(sequences).toEqual(initial);
  expect(sequences.flat().some(sql=>/shadow|detect/iu.test(sql))).toBe(false);
 });
});
