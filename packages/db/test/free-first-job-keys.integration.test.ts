import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freeFirstJobKeys } from "../../core/src/free-first-job.js";
import { createWorkFixture, closeWorkFixture, keyParent, snapshot, store, claimRows, workTenant, type WorkFixture } from "./free-first-job-keys-fixtures.js";
describe("MON3P private key storage", () => {
 let f: WorkFixture;
 beforeAll(async () => { f = await createWorkFixture(); }, 60000);
 afterAll(async () => closeWorkFixture(f));
 it("stores both stable tuple bytes, including quotes and backslashes, and exact internal replay adds nothing", async () => {
  const s = snapshot(await keyParent(f)); s.company += '\\"'; await store(f,s);
  const expected = freeFirstJobKeys({version:"free-first-job-identity.v1",environment:"synthetic_demo",companyNumber:s.company,normalizedPhone:s.phone,cardFingerprint:s.fingerprint});
  expect(await claimRows(f,s)).toEqual(expected);
  await workTenant(f.admin,s.tenantId,async db => { await db.query("SET LOCAL ROLE jobguard_migration"); await db.query("SELECT app.claim_trial_identity_keys($1,$2)",[s.tenantId,s.id]); });
  expect(await claimRows(f,s)).toEqual(expected);
  await expect(f.admin.query("UPDATE app.trial_identity_snapshot SET company_number='changed' WHERE id=$1",[s.id])).rejects.toMatchObject({code:"55000"});
 });
 it("MON3P-KEY-01/02/03 either key collision rolls back snapshot and entire batch across tenants", async () => {
  const first=snapshot(await keyParent(f)); await store(f,first);
  for (const changes of [{company:first.company}, {phone:first.phone,fingerprint:first.fingerprint}, {company:null,phone:first.phone,fingerprint:first.fingerprint}]) {
   const other={...snapshot(await keyParent(f)),...changes};
   await expect(store(f,other as typeof first)).rejects.toMatchObject({message:"TRIAL_IDENTITY_CONFLICT",code:"23505"});
   expect(await claimRows(f,other as typeof first)).toEqual([]);
   expect((await f.admin.query("SELECT id FROM app.trial_identity_snapshot WHERE id=$1",[other.id])).rows).toEqual([]);
  }
 });
 it("company-only snapshots retain just the company key, never a partial fallback",async()=>{
  const s=snapshot(await keyParent(f));await store(f,{...s,phone:null} as unknown as typeof s);
  expect(await claimRows(f,s)).toEqual([JSON.stringify(["free-first-job.v1","company",s.company])]);
 });
 it("MON3P-KEY-02 fallback-only storage cannot be bypassed by adding a company or changing schema version",async()=>{
  const first=snapshot(await keyParent(f));await store(f,{...first,company:null} as unknown as typeof first);
  const next={...snapshot(await keyParent(f)),phone:first.phone,fingerprint:first.fingerprint};
  await expect(store(f,next)).rejects.toThrow("TRIAL_IDENTITY_CONFLICT");
  await expect(f.admin.query("UPDATE app.trial_identity_snapshot SET version='free-first-job-identity.v2' WHERE id=$1",[first.id])).rejects.toMatchObject({code:"55000"});
 });
 it("requires persisted fictional provenance, version, environment and verification time",async()=>{
  const a=snapshot(await keyParent(f));
  for(const [version,environment,source,at] of [
   ["v2","synthetic_demo","fictional_verified_fixture.v1","2026-10-18"],
   ["free-first-job-identity.v1","production","fictional_verified_fixture.v1","2026-10-18"],
   ["free-first-job-identity.v1","synthetic_demo","browser_verified_true","2026-10-18"],
   ["free-first-job-identity.v1","synthetic_demo",null,"2026-10-18"],
   ["free-first-job-identity.v1","synthetic_demo","fictional_verified_fixture.v1",null],
  ]) await expect(workTenant(f.admin,a.tenantId,db=>db.query(`INSERT INTO app.trial_identity_snapshot(tenant_id,id,job_id,activation_id,version,environment,verification_source,verification_id,verified_at,company_number)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[a.tenantId,a.id,a.jobId,a.activationId,version,environment,source,a.provenance,at,a.company]))).rejects.toThrow();
  expect(await claimRows(f,a)).toEqual([]);
 });
 it("snapshot completeness and composite activation/claim references fail closed",async()=>{
  const a=snapshot(await keyParent(f)), b=snapshot(await keyParent(f,a.tenantId)), foreign=snapshot(await keyParent(f));
  for(const bad of [{company:null,phone:null},{company:null,fingerprint:null},{fingerprint:"real_card"},{activationId:b.activationId},{jobId:b.jobId},{tenantId:foreign.tenantId}])
   await expect(store(f,{...a,...bad} as typeof a)).rejects.toThrow();
  await store(f,a);
  await expect(workTenant(f.admin,a.tenantId,db=>db.query(`INSERT INTO app.trial_identity_key_claim(identity_key,tenant_id,job_id,activation_id,snapshot_id) VALUES('forged',$1,$2,$3,$4)`,[a.tenantId,b.jobId,a.activationId,a.id]))).rejects.toThrow();
  await expect(workTenant(f.admin,a.tenantId,db=>db.query("SELECT app.claim_trial_identity_keys($1,$2)",[a.tenantId,randomUUID()]))).rejects.toThrow("TRIAL_IDENTITY_REQUIRED");
 });
});
