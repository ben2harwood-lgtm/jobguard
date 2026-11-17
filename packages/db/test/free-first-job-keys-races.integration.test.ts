import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkFixture, closeWorkFixture, keyParent, snapshot, store, claimRows, insertSnapshot, workTenant, type WorkFixture } from "./free-first-job-keys-fixtures.js";
describe("MON3P-ATOMIC-01 private storage races",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture();},60000);afterAll(async()=>closeWorkFixture(f));
 it("overlapping cross-tenant sets in reversed object order have one winner and no orphan or partial claim",async()=>{
  const a=snapshot(await keyParent(f)), other=snapshot(await keyParent(f));
  // Callers cannot supply key order/subsets; reversed input field order still derives company then fallback.
  const b={fingerprint:a.fingerprint,phone:a.phone,company:other.company,provenance:other.provenance,activationId:other.activationId,jobId:other.jobId,tenantId:other.tenantId,id:other.id};
  const unchangedSql="SELECT (SELECT count(*)::int FROM app.job_activation) activations,(SELECT count(*)::int FROM app.command_receipt) receipts,(SELECT count(*)::int FROM app.audit_event) audits";
  const before=(await f.admin.query(unchangedSql)).rows;
  const results=await Promise.allSettled([store(f,a),store(f,b)]);
  expect((await f.admin.query(unchangedSql)).rows).toEqual(before);
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(x=>x.status==='rejected')).toHaveLength(1);
  const winner=results[0]!.status==='fulfilled'?a:b,loser=winner===a?b:a;
  expect(await claimRows(f,winner)).toHaveLength(2);expect(await claimRows(f,loser)).toEqual([]);
  expect((await f.admin.query("SELECT id FROM app.trial_identity_snapshot WHERE id=ANY($1::uuid[])",[[a.id,b.id]])).rows).toEqual([{id:winner.id}]);
 });
 it("explicit transaction rollback releases only uncommitted keys; caught collision leaves no snapshot",async()=>{
  const committed=snapshot(await keyParent(f));await store(f,committed);
  const a=snapshot(await keyParent(f)),db=await f.admin.connect();
  try{await db.query("BEGIN");await db.query("SET LOCAL ROLE jobguard_migration");await db.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenantId]);await insertSnapshot(db,a);await db.query("ROLLBACK");}finally{db.release();}
  expect(await claimRows(f,a)).toEqual([]);await store(f,a);expect(await claimRows(f,a)).toHaveLength(2);expect(await claimRows(f,committed)).toHaveLength(2);
  const b={...snapshot(await keyParent(f)),phone:a.phone,fingerprint:a.fingerprint};
  await workTenant(f.admin,b.tenantId,async client=>{
   await client.query("SET LOCAL ROLE jobguard_migration");await client.query("SAVEPOINT before_claim");
   await expect(insertSnapshot(client,b)).rejects.toThrow("TRIAL_IDENTITY_CONFLICT");await client.query("ROLLBACK TO SAVEPOINT before_claim");
   expect((await client.query("SELECT id FROM app.trial_identity_snapshot WHERE id=$1",[b.id])).rows).toEqual([]);
  });
 });
});
