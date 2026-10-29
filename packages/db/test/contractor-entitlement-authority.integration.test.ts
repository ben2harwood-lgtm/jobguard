import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { evaluateContractorEntitlement } from "@jobguard/core";
import { appendAuditBatch } from "../src/index.js";
import { cluster, startSession, status, read, raw, unchanged, snapshot, ownerTx, type Cluster } from "./contractor-entitlement-fixtures.js";
let c: Cluster;
beforeAll(async () => { process.env.JOBGUARD_ENV="synthetic_demo"; c=await cluster(); },120000);
afterAll(async () => { await c?.close(); });
it("a reference without active status grants nothing", async () => {
 const f=await startSession(c);
 // The generated practice now has an explicit active fixture. A new assignment without
 // a status must still fail closed; the previous assignment's active status cannot leak.
 await ownerTx(c,f.p.tenantId, async db => {
  const assignment=randomUUID(),actorRef=`membership:${f.p.membershipId}`;
  await db.$client.query("SELECT app.assign_commercial_track($1,$2,'contractor',$3,1,$4)",[f.p.tenantId,assignment,`synthetic-agreement:${randomUUID()}`,actorRef]);
  await appendAuditBatch(db,[{id:assignment,version:"audit.v1",actorRef,eventType:"commercial_track.assigned",subjectType:"tenant",subjectRef:f.p.tenantId,payload:{references:{assignment,environment:"synthetic_demo"}}}]);
 });
 const a=await read(c,f); expect(a.assignment).not.toBeNull(); expect(a.status).toBeNull(); expect(evaluateContractorEntitlement(a,"work_orders").newWorkEligible).toBe(false);
 await status(c,f,"active"); expect(evaluateContractorEntitlement(await read(c,f),"work_orders").newWorkEligible).toBe(true);
 // Owner-only, rolled-back fixture removal constructs the absent-assignment boundary.
 const missing=await startSession(c), db=await c.admin.connect();
 try {
  await db.query("BEGIN");await db.query("SELECT set_config('app.tenant_id',$1,true)",[missing.p.tenantId]);
  await db.query("ALTER TABLE app.contractor_agreement_status_revision DISABLE TRIGGER USER");
  await db.query("DELETE FROM app.contractor_agreement_status_revision WHERE tenant_id=$1",[missing.p.tenantId]);
  await db.query("ALTER TABLE app.contractor_agreement_status_revision ENABLE TRIGGER USER");
  await db.query("ALTER TABLE app.commercial_track_assignment DISABLE TRIGGER USER");
  await db.query("DELETE FROM app.commercial_track_assignment WHERE tenant_id=$1",[missing.p.tenantId]);
  await db.query("ALTER TABLE app.commercial_track_assignment ENABLE TRIGGER USER");
  const before=await snapshot(db);await db.query("SET LOCAL ROLE jobguard_runtime");
  const absent=(await db.query("SELECT app.mon8_contractor_agreement_context($1) a",[missing.session])).rows[0].a;
  expect(absent.assignment).toBeNull();expect(absent.status).toBeNull();expect(evaluateContractorEntitlement(absent,"work_orders").newWorkEligible).toBe(false);
  await db.query("RESET ROLE");expect(await snapshot(db)).toEqual(before);
 }finally{await db.query("ROLLBACK");db.release();}
});
it("a fresh connection reads the latest bound revision", async () => {
 const f=await startSession(c); await status(c,f,"active"); const id=await status(c,f,"suspended");
 const runtime=new Pool({...c.config,database:"jobguard_synthetic_demo",user:"ent4b_login",max:1});
 try { expect((await read({...c,runtime},f)).status).toEqual({id,revision:3,status:"suspended"}); } finally { await runtime.end(); }
});
it("superseded assignment cannot authorize new work", async () => {
 const f=await startSession(c); await status(c,f,"active");
 const assignment = randomUUID(), actorRef = `membership:${f.p.membershipId}`;
 await ownerTx(c,f.p.tenantId, async db => {
  await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [f.p.tenantId]);
  await db.$client.query(`INSERT INTO app.commercial_track_assignment(tenant_id,id,revision,commercial_track,agreement_reference,environment,actor_ref) SELECT tenant_id,$2,max(revision)+1,'contractor',$3,'synthetic_demo',$4 FROM app.commercial_track_assignment WHERE tenant_id=$1 GROUP BY tenant_id`,[f.p.tenantId,assignment,`synthetic-agreement:${randomUUID()}`,actorRef]);
  await appendAuditBatch(db, [{ id: assignment, version: "audit.v1", actorRef, eventType: "commercial_track.assigned", subjectType: "tenant", subjectRef: f.p.tenantId, payload: { references: { assignment, environment: "synthetic_demo" } } }]);
 });
 const authority = await read(c,f);
 expect(authority.assignment?.id).toBe(assignment);
 expect(authority.status).toBeNull();
 expect(evaluateContractorEntitlement(authority,"work_orders").newWorkEligible).toBe(false);
});
it("foreign assignment binding fails", async () => {
 const a=await startSession(c),b=await startSession(c); const foreign=(await read(c,b)).assignment!.id;
 await unchanged(c,()=>expect(status(c,a,"active",foreign)).rejects.toMatchObject({code:"23503"}));
});
it("missing and malformed tenant contexts fail closed", async () => {
 const f=await startSession(c); for(const tenant of [null,"","invalid",randomUUID()]) await unchanged(c,()=>expect(raw(c,tenant,f.session)).rejects.toThrow());
});
it("pooled connections retain no authority", async () => {
 const f=await startSession(c); const runtime=new Pool({...c.config,database:"jobguard_synthetic_demo",user:"ent4b_login",max:1});
 try { await read({...c,runtime},f); await unchanged(c,()=>expect(raw({...c,runtime},null,f.session)).rejects.toThrow()); } finally { await runtime.end(); }
});
