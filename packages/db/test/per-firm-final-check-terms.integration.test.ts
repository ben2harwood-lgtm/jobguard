import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { cluster, startBeforeMigration, seedHomeOwner, type Cluster } from "./contractor-practice-session-fixtures.js";
import { startBlankPracticeCompany } from "../src/blank-practice-company.js";
import { authenticatePracticeSession, practiceMaterialPool } from "../src/practice-session.js";
import { ShadowObservationReader, FixtureObservationSources } from "../src/shadow-observation-reader.js";
import { verifiedTenantContextForQueuedJob } from "../src/tenant-context.js";
import { withTenant } from "../src/tenant-context.js";
import { FinalAccountLockApplication } from "../../../apps/api/src/final-account-lock.application.js";
let c: Cluster;
const start = { version: "blank-practice-company.v1", action: "start" };
const terms = (commandId = randomUUID()) => ({ version: "final-check-terms.accept.v1", commandId, termsVersion: "synthetic_final_check_terms.v1" });
async function firm() {
 const token = await startBlankPracticeCompany(c.runtime, start);
 const auth = await authenticatePracticeSession(c.runtime, token);
 const app = new FinalAccountLockApplication(c.runtime, token);
 const createJob = async () => {
  const id = randomUUID();
  await withTenant(c.runtime, auth.context, db => db.$client.query("SELECT app.create_practice_sandbox_job($1,$2,$3,$4)", [auth.context.tenantId,id,auth.membershipId,auth.digest]));
  return id;
 };
 return { token, auth, app, createJob, job: await createJob() };
}
async function visible(f: Awaited<ReturnType<typeof firm>>, digest = f.auth.digest) {
 return withTenant(practiceMaterialPool(c.runtime,digest),f.auth.context,async db =>
  (await db.$client.query("SELECT id FROM app.final_check_terms_acceptance WHERE tenant_id=$1",[f.auth.context.tenantId])).rows);
}
beforeAll(async () => {
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 c = await startBeforeMigration("0735_per_firm_final_check_terms.sql");
 await seedHomeOwner(c);
},240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it("accepting Final Check practice wording in firm A does not accept it in firm B",async () => {
 const a=await firm(), b=await firm();
 // Upgrade rehearsal also records the defect on the actual base, using application calls.
 await a.app.acceptTerms(a.job,terms());
 expect((await a.app.get(a.job)).termsAccepted).toBe(true);
 const baseB=(await b.app.get(b.job)).termsAccepted;
 // CI/router can run this phase first to record the requested real pre-fix red
 // result, then run the normal upgrade regression in a fresh database.
 if(process.env.JOBGUARD_PER_FIRM_TERMS_BASE==="1")expect(baseB).toBe(false);
 expect(baseB,"base defect: tenant-only acceptance leaks into firm B").toBe(true);
 const historical=(await c.admin.query("SELECT row_to_json(a) value FROM app.final_check_terms_acceptance a ORDER BY id")).rows;
 const locks=(await c.admin.query("SELECT row_to_json(l) value FROM app.final_account_lock l ORDER BY id")).rows;
 await c.admin.query(await readFile(new URL("../migrations/0735_per_firm_final_check_terms.sql",import.meta.url),"utf8"));
 expect((await c.admin.query("SELECT to_jsonb(a)-'practice_session_digest' value FROM app.final_check_terms_acceptance a ORDER BY id")).rows).toEqual(historical);
 expect((await c.admin.query("SELECT row_to_json(l) value FROM app.final_account_lock l ORDER BY id")).rows).toEqual(locks);
 // Unattributed history grants no practice firm new authority.
 expect((await a.app.get(a.job)).termsAccepted).toBe(false);
 const command=terms();
 const accepted=await a.app.acceptTerms(a.job,command);
 expect(await a.app.acceptTerms(a.job,command)).toEqual(accepted);
 expect((await a.app.get(await a.createJob())).termsAccepted).toBe(true);
 expect((await b.app.get(b.job)).termsAccepted).toBe(false);
 expect(await visible(a)).toHaveLength(1);
 expect(await visible(b)).toEqual([]);
 const directLock=(job:string)=>withTenant(practiceMaterialPool(c.runtime,b.auth.digest),b.auth.context,db=>
  db.$client.query("SELECT app.lock_final_account($1,$2,$3,$4,$5,0,'final_account_declaration.v1')",[b.auth.context.tenantId,job,b.auth.membershipId,randomUUID(),randomUUID()]));
 await expect(directLock(a.job)).rejects.toThrow("FORBIDDEN");
 await expect(directLock(b.job)).rejects.toThrow("DISCLOSURE_TERMS_NOT_ACCEPTED");
 await expect(b.app.acceptTerms(b.job,command)).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
 await expect(b.app.acceptTerms(a.job,terms())).rejects.toMatchObject({code:"NOT_FOUND"});
 await expect(visible(b,a.auth.digest)).rejects.toThrow(/FORBIDDEN/);
 await expect(b.app.lock(b.job,{version:"final-account.lock.v1",commandId:randomUUID(),finalAccountRevisionId:randomUUID(),expectedRevision:0,declarationVersion:"final_account_declaration.v1"})).rejects.toMatchObject({code:"DISCLOSURE_TERMS_NOT_ACCEPTED"});
 const simultaneous=terms();
 const concurrent=await Promise.all([a.app.acceptTerms(a.job,simultaneous),a.app.acceptTerms(a.job,simultaneous)]);
 expect(concurrent[0]).toEqual(concurrent[1]);
 expect(await visible(a)).toHaveLength(2);
 // Private worker terms resolution has no browser setting and preserves cutoff time.
 const workerClient=await c.admin.connect();
 await workerClient.query("BEGIN");
 try {
  await workerClient.query("SELECT set_config('app.tenant_id',$1,true)",[a.auth.context.tenantId]);
  const worker=await workerClient.query("SELECT app.final_check_job_terms($1,$2,$4) a, app.final_check_job_terms($1,$3,$4) b, app.final_check_job_terms($1,$2,$4,'2000-01-01') past",[a.auth.context.tenantId,a.job,b.job,command.termsVersion]);
  expect(worker.rows).toEqual([{a:true,b:false,past:false}]);
 } finally { await workerClient.query("ROLLBACK"); workerClient.release(); }
 const reader=new ShadowObservationReader(c.runtime,new FixtureObservationSources([]));
 const queued=verifiedTenantContextForQueuedJob(a.auth.context.tenantId);
 expect(await reader.hasAcceptedTerms(queued,a.job)).toBe(true);
 expect(await reader.hasAcceptedTerms(queued,await a.createJob())).toBe(true);
 expect(await reader.hasAcceptedTerms(queued,b.job)).toBe(false);
 const browserA=new ShadowObservationReader(practiceMaterialPool(c.runtime,a.auth.digest),new FixtureObservationSources([]));
 expect(await browserA.hasAcceptedTerms(a.auth.context,a.job)).toBe(true);
 expect(await browserA.hasAcceptedTerms(a.auth.context,b.job)).toBe(false);
 expect(await reader.hasAcceptedTerms(queued,randomUUID())).toBe(false);
 expect(await reader.hasAcceptedTerms(verifiedTenantContextForQueuedJob(randomUUID()),a.job)).toBe(false);
 expect(await withTenant(c.runtime,queued,async db => (await db.$client.query("SELECT app.final_check_runtime_job_terms($1,$2) accepted",[a.job,"wrong-version"])).rows[0].accepted)).toBe(false);
 expect((await c.runtime.query("SELECT app.final_check_runtime_job_terms($1,$2) accepted",[a.job,command.termsVersion])).rows).toEqual([{accepted:false}]);
 await expect(c.runtime.query("SELECT app.final_check_job_terms($1,$2,$3,$4)",[a.auth.context.tenantId,a.job,command.termsVersion,"infinity"])).rejects.toThrow(/permission denied/);
 const reset=await startBlankPracticeCompany(c.runtime,{...start,action:"reset"},a.token);
 await expect(a.app.acceptTerms(a.job,command)).rejects.toMatchObject({code:"UNAUTHENTICATED"});
 const fresh=await authenticatePracticeSession(c.runtime,reset);
 expect(await withTenant(practiceMaterialPool(c.runtime,fresh.digest),fresh.context,async db => (await db.$client.query("SELECT id FROM app.final_check_terms_acceptance")).rows)).toEqual([]);
 // Missing bound session never exposes shared-tenant history or grants write access.
 const client=await c.runtime.connect();
 try {
  await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)",[b.auth.context.tenantId]);
  expect((await client.query("SELECT id FROM app.final_check_terms_acceptance")).rows).toEqual([]);
  await expect(client.query("SELECT app.accept_final_check_terms($1,$2,$3,$4)",[b.auth.context.tenantId,b.auth.membershipId,randomUUID(),command.termsVersion])).rejects.toThrow();
 } finally { await client.query("ROLLBACK"); client.release(); }
 await expect(c.runtime.query("INSERT INTO app.final_check_terms_acceptance DEFAULT VALUES")).rejects.toThrow(/permission denied/);
 await expect(c.runtime.query("SELECT app.final_check_job_scope($1,$2)",[b.auth.context.tenantId,b.job])).rejects.toThrow(/permission denied/);
 expect((await c.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.final_check_terms_acceptance'::regclass")).rows).toEqual([{relrowsecurity:true,relforcerowsecurity:true}]);
},240_000);

it("fresh installation retains forced RLS and narrow acceptance privileges",async () => {
 const fresh=await cluster();
 try {
  expect((await fresh.admin.query("SELECT has_table_privilege('jobguard_runtime','app.final_check_terms_acceptance','SELECT') read, has_table_privilege('jobguard_runtime','app.final_check_terms_acceptance','INSERT') write, has_table_privilege('jobguard_runtime','control_plane.request_binding','SELECT') binding")).rows).toEqual([{read:true,write:false,binding:false}]);
  expect((await fresh.admin.query("SELECT has_function_privilege('jobguard_runtime','app.final_check_runtime_job_terms(uuid,text)','EXECUTE') runtime, EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE p.oid='app.final_check_runtime_job_terms(uuid,text)'::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE') public, has_function_privilege('jobguard_runtime','app.final_check_job_terms(uuid,uuid,text,timestamp with time zone)','EXECUTE') private_terms, has_function_privilege('jobguard_runtime','app.final_check_job_scope(uuid,uuid)','EXECUTE') private_scope")).rows).toEqual([{runtime:true,public:false,private_terms:false,private_scope:false}]);
  expect((await fresh.admin.query("SELECT policyname,permissive FROM pg_policies WHERE schemaname='app' AND tablename='final_check_terms_acceptance' ORDER BY policyname")).rows).toEqual([{policyname:"firm_read",permissive:"RESTRICTIVE"},{policyname:"tenant_isolation",permissive:"PERMISSIVE"}]);
 } finally { await fresh.close(); }
},240_000);
