// Real PostgreSQL regressions, executed in CI; builder sandbox cannot bind localhost.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ManagedRecoveryRepository } from "../src/managed-recovery-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { cluster, fixture, newCase, command, start, counts, qualifyingAllocation, type Cluster, type Fixture } from "./managed-recovery-fixtures.js";
let c: Cluster, f: Fixture;
beforeAll(async () => { c = await cluster(); f = await fixture(c); }, 120000);
afterAll(async () => { await c?.close(); });
const repo = (session = f) => new ManagedRecoveryRepository(c.runtime, session.sessionDigest);
it("persists the exact election; concurrent replays produce one authorization and audit batch", async () => {
 const id = await newCase(c,f), input = command(id), before = await counts(c);
 const results = await Promise.all([repo().elect(f.context,f.job,input,f.actor),repo().elect(f.context,f.job,input,f.actor)]);
 expect(results[0]).toEqual(results[1]);
 expect(results[0]!.election).toMatchObject({ tenantId:f.tenant,jobId:f.job,caseId:id,selection:input.selection,termsVersion:input.termsVersion });
 expect(await repo().elect(f.context,f.job,{...input,commandId:randomUUID()},f.actor)).toEqual(results[0]);
 const after = await counts(c);
 for (const t of ['managed_recovery_election','command_receipt','action_authorization']) expect(after[t]-before[t]).toBe(1);
 expect(after.audit_event-before.audit_event).toBe(2);
 expect(after.recovery_fee_derivation).toBe(before.recovery_fee_derivation);
 expect(after.journal).toBe(before.journal);
 // A new repository reads the stored choice; projection cannot issue anything.
 expect((await repo().preview(f.context,f.job,id,f.actor)).serviceChargeInvoice?.points).toBe(5);
});
it("no election means no service-charge document, and the success fee stays identical", async () => {
 const id = await newCase(c,f), before = await repo().preview(f.context,f.job,id,f.actor);
 expect(before.serviceChargeInvoice).toBeNull();
 await repo().elect(f.context,f.job,command(id),f.actor);
 const after = await repo().preview(f.context,f.job,id,f.actor);
 expect(after.successFee).toEqual(before.successFee);
 expect(after.offeringEnabled).toBe(false); expect(after.realExternalActions).toBe(0);
});
it("refuses changed terms, altered service replay and caller tenant/principal before any effect", async () => {
 const id = await newCase(c,f), input = command(id);
 await repo().elect(f.context,f.job,input,f.actor);
 const before = await counts(c);
 for (const patch of [{termsVersion:'changed'}, {tenantId:f.tenant}, {amountPence:32000}, {cumulativeQualifyingPrincipal:{numerator:'99999',denominator:'1'}}]) {
  await expect(repo().elect(f.context,f.job,{...input,...patch},f.actor)).rejects.toThrow();
 }
 await expect(repo().elect(f.context,f.job,{...input,selection:{service:'solicitor_letter',points:10}},f.actor)).rejects.toMatchObject({code:'MANAGED_RECOVERY_CONFLICT'});
 expect(await counts(c)).toEqual(before);
});
it("pursuit before opt-in is permanently refused, including races; a replay remains one effect", async () => {
 const id = await newCase(c,f), db = await c.runtime.connect();
 try {
  await db.query('BEGIN'); await db.query("SELECT set_config('app.tenant_id',$1,true)",[f.tenant]);
  await start(c,f,id,db);
  const pending = repo().elect(f.context,f.job,command(id),f.actor);
  // Attach rejection before releasing the lock, without a timer or sleep.
  const refused = expect(pending).rejects.toMatchObject({code:'PURSUIT_ALREADY_STARTED'});
  await db.query('COMMIT'); await refused;
 } finally { await db.query('ROLLBACK'); db.release(); }
 expect((await repo().preview(f.context,f.job,id,f.actor)).serviceChargeInvoice).toBeNull();
 const other = await newCase(c,f), input = command(other);
 const elected = await repo().elect(f.context,f.job,input,f.actor); await start(c,f,other);
 expect(await repo().elect(f.context,f.job,input,f.actor)).toEqual(elected);
 expect((await repo().preview(f.context,f.job,other,f.actor)).serviceChargeInvoice?.points).toBe(5);
});
it("refuses cross-tenant/job access and impersonated identity, including replay after revocation", async () => {
 const b = await fixture(c), id = await newCase(c,f), input = command(id);
 await repo().elect(f.context,f.job,input,f.actor);
 const before = await counts(c);
 await expect(repo(b).elect(b.context,f.job,command(id),b.actor)).rejects.toMatchObject({code:'MANAGED_RECOVERY_FORBIDDEN'});
 await expect(repo(b).preview(b.context,f.job,id,b.actor)).rejects.toMatchObject({code:'MANAGED_RECOVERY_FORBIDDEN'});
 await expect(repo().elect(f.context,b.job,input,f.actor)).rejects.toMatchObject({code:'MANAGED_RECOVERY_FORBIDDEN'});
 await expect(repo().elect(f.context,f.job,input,{...f.actor,identityUserId:b.actor.identityUserId})).rejects.toMatchObject({code:'MANAGED_RECOVERY_FORBIDDEN'});
 expect(await withTenant(c.runtime,b.context,db=>db.$client.query('SELECT * FROM app.managed_recovery_election'))).toMatchObject({rows:[]});
 expect(await counts(c)).toEqual(before);
 const bid=await newCase(c,b),bi=command(bid);await repo(b).elect(b.context,b.job,bi,b.actor);
 await c.admin.query('UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2',[b.tenant,b.actor.membershipId]);
 await expect(repo(b).elect(b.context,b.job,bi,b.actor)).rejects.toMatchObject({code:'MANAGED_RECOVERY_FORBIDDEN'});
});
it("refuses a valid owner's identity pair from another verified session, including replay and preview", async () => {
 const other=await fixture(c),id=await newCase(c,f),input=command(id);
 await repo().elect(f.context,f.job,input,f.actor);
 const before=await counts(c);
 // The forged pair is real and matches membership; only the session differs.
 await expect(repo(other).elect(f.context,f.job,input,f.actor)).rejects.toMatchObject({code:'MANAGED_RECOVERY_FORBIDDEN'});
 await expect(repo(other).preview(f.context,f.job,id,f.actor)).rejects.toMatchObject({code:'MANAGED_RECOVERY_FORBIDDEN'});
 await expect(repo().preview(f.context,f.job,id,{...f.actor,identityUserId:other.actor.identityUserId})).rejects.toMatchObject({code:'MANAGED_RECOVERY_FORBIDDEN'});
 expect(await counts(c)).toEqual(before);
 expect(await repo().elect(f.context,f.job,input,f.actor)).toMatchObject({election:{actorMembershipId:f.actor.membershipId}});
});
it.each(['revoked','expired','unknown'])('refuses a %s session before election replay or preview',async state=>{
 const local=await fixture(c),id=await newCase(c,local),input=command(id);
 await repo(local).elect(local.context,local.job,input,local.actor);
 const before=await counts(c);
 if(state==='revoked') await c.admin.query('UPDATE identity.session SET revoked_at=clock_timestamp() WHERE token_digest=$1',[local.sessionDigest]);
 if(state==='expired') await c.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1",[local.sessionDigest]);
 const r=state==='unknown'?new ManagedRecoveryRepository(c.runtime,'0'.repeat(64)):repo(local);
 await expect(r.elect(local.context,local.job,input,local.actor)).rejects.toMatchObject({code:'MANAGED_RECOVERY_FORBIDDEN'});
 await expect(r.preview(local.context,local.job,id,local.actor)).rejects.toMatchObject({code:'MANAGED_RECOVERY_FORBIDDEN'});
 expect(await counts(c)).toEqual(before);
});
it("runtime cannot insert, alter, remove or truncate election/start facts or call unapproved SQL", async () => {
 const id = await newCase(c,f);
 for (const table of ['managed_recovery_election','managed_recovery_pursuit']) {
  for (const sql of [`INSERT INTO app.${table} SELECT * FROM app.${table}`,`UPDATE app.${table} SET case_id=case_id`,`DELETE FROM app.${table}`,`TRUNCATE app.${table}`])
   await expect(withTenant(c.runtime,f.context,db=>db.$client.query(sql))).rejects.toMatchObject({code:'42501'});
 }
 await expect(withTenant(c.runtime,f.context,db=>db.$client.query('SELECT app.mon9_elect($1,$2,$3,$4,$5,$6,5,$7)',
  [f.job,id,f.actor.membershipId,randomUUID(),randomUUID(),'drafted_for_you',command(id).termsVersion]))).rejects.toMatchObject({message:'MANAGED_RECOVERY_FORBIDDEN'});
});

it("uses only stored approved principal, subtracts reversals and fails closed on invalidated evidence", async () => {
 const id=await newCase(c,f), source=await qualifyingAllocation(c,f,id), before=await repo().preview(f.context,f.job,id,f.actor);
 expect(before.serviceChargeInvoice).toBeNull();
 expect(before.successFee).toEqual((await repo().preview(f.context,f.job,id,f.actor)).successFee);
 await repo().elect(f.context,f.job,command(id),f.actor);
 const elected=await repo().preview(f.context,f.job,id,f.actor);
 expect(elected.successFee).toEqual(before.successFee);expect(elected.serviceChargeInvoice?.principal.pence).toBe(1600);
 const db=await c.admin.connect();
 try {
  await db.query('BEGIN');await db.query('SET LOCAL session_replication_role=replica');
  const sourceId=randomUUID();
  await db.query(`INSERT INTO app.recovery_case_allocation_reversal(tenant_id,id,job_id,allocation_id,command_id,review_id,authorization_id,source_kind,source_id,credit_note_id,gross_pence,eligible_net_pence,tax_pence)
   VALUES($1,$2,$3,$4,$5,$6,$7,'credit_note',$8,$8,14400,12000,2400)`,[f.tenant,randomUUID(),f.job,source.allocation,randomUUID(),randomUUID(),randomUUID(),sourceId]);
  await db.query('COMMIT');
 } finally {await db.query('ROLLBACK');db.release();}
 expect((await repo().preview(f.context,f.job,id,f.actor)).serviceChargeInvoice?.principal.pence).toBe(1000);
 await withTenant(c.admin,f.context,db=>db.$client.query("INSERT INTO app.evidence_invalidation(tenant_id,id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[f.tenant,randomUUID(),source.evidence,f.actor.membershipId]));
 expect((await repo().preview(f.context,f.job,id,f.actor)).serviceChargeInvoice?.principal.pence).toBe(0);
});
it('refuses an already-pursuing legacy snapshot even without a start marker',async()=>{
 const id=await newCase(c,f),db=await c.admin.connect();
 try {await db.query('BEGIN');await db.query('SET LOCAL session_replication_role=replica');await db.query("UPDATE app.recovery_case SET state='active' WHERE tenant_id=$1 AND id=$2",[f.tenant,id]);await db.query('COMMIT');}
 finally {await db.query('ROLLBACK');db.release();}
 // A partial workbench history must not hide the progressed legacy snapshot.
 await withTenant(c.runtime,f.context,db=>db.$client.query(`INSERT INTO app.recovery_case_event
  (tenant_id,id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash)
  VALUES($1,$2,$3,$4,1,'opened',NULL,'identified','synthetic-owner',$5,$6)`,[f.tenant,randomUUID(),f.job,id,randomUUID(),'a'.repeat(64)]));
 await expect(repo().elect(f.context,f.job,command(id),f.actor)).rejects.toMatchObject({code:'PURSUIT_ALREADY_STARTED'});
});

it.each(['member','expired'])('refuses an unauthorized %s before any effect',async state=>{
 const b=await fixture(c),id=await newCase(c,b);
 if(state==='member') await c.admin.query("UPDATE app.membership SET role='member' WHERE tenant_id=$1 AND id=$2",[b.tenant,b.actor.membershipId]);
 else await c.admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[b.tenant,b.actor.membershipId]);
 const before=await counts(c);
 await expect(repo(b).elect(b.context,b.job,command(id),b.actor)).rejects.toThrow();
 expect(await counts(c)).toEqual(before);
});
it('persists the solicitor-letter election separately at ten points',async()=>{
 const id=await newCase(c,f);await qualifyingAllocation(c,f,id);
 const input={...command(id),selection:{service:'solicitor_letter',points:10}};
 const elected=await repo().elect(f.context,f.job,input,f.actor);
 expect(elected.election?.selection).toEqual(input.selection);
 const preview=await repo().preview(f.context,f.job,id,f.actor);
 expect(preview.serviceChargeInvoice).toMatchObject({service:'solicitor_letter',points:10,principal:{pence:3200,currency:'GBP'}});
});
