import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate, ContractorPracticeSessionRepository, ContractorEntitlementAuthorityRepository } from "../src/index.js";
import { company, start } from "./practice-worker-switch-fixtures.js";
import { cluster,startSession,status,read,raw,unchanged,makeSessionExpired,snapshot,type Cluster } from "./contractor-entitlement-fixtures.js";
let c: Cluster;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";c=await cluster();},120000);
afterAll(async()=>{await c?.close();});
it("effective switched member is not replaced by owner",async()=>{const f=await company(c);await status(c,f,"active");await start(c,f);expect((await read(c,f)).membershipId).toBe(f.members.operative);});
it("expired and revoked sessions refuse",async()=>{for(const kind of ["expired","revoked"]){const f=await startSession(c);await status(c,f,"active");if(kind==="expired")await makeSessionExpired(c,f.session);else await new ContractorPracticeSessionRepository(c.runtime).revoke(f.context,f.session);await expect(read(c,f)).rejects.toThrow();}});
it("revoked membership cannot obtain authority",async()=>{const f=await startSession(c);await status(c,f,"active");await c.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.p.membershipId]);await expect(read(c,f)).rejects.toThrow();});
it("forged actor and tenant cannot select another agreement",async()=>{const a=await startSession(c),b=await startSession(c);await status(c,b,"active");await unchanged(c,()=>expect(raw(c,b.p.tenantId,a.session)).rejects.toThrow());await expect(read(c,{...a,session:randomUUID()})).rejects.toThrow();await expect(new ContractorEntitlementAuthorityRepository(c.runtime).withAuthority({session:a.session,actor:b.p.membershipId} as unknown as string,async()=>null)).rejects.toThrow();});
it("non-synthetic database refuses",async()=>{
 const db=await c.admin.connect();try { await db.query("CREATE DATABASE mon8_wrong_environment"); } finally {db.release();}
 const admin=new Pool({...c.config,database:"mon8_wrong_environment"});
 const wrong=new Pool({...c.config,database:"mon8_wrong_environment",user:"ent4b_login"});
 try{
  await migrate(admin); const f=await startSession(c), before=await snapshot(admin);
  await expect(wrong.query("SELECT app.mon8_contractor_agreement_context($1)",[f.session])).rejects.toMatchObject({message:"MODE_FORBIDDEN"});
  expect(await snapshot(admin)).toEqual(before);
 }finally{await wrong.end();await admin.end();}
});
it("status change during lock wait is observed",async()=>{
 const f=await startSession(c);await status(c,f,"active");const before=await snapshot(c.admin);const writer=await c.admin.connect();
 try{await writer.query("BEGIN");await writer.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))",[f.p.tenantId]);
 const pending=new ContractorEntitlementAuthorityRepository(c.runtime).withAuthority(f.session,async(db,a)=>{expect((await db.$client.query("SELECT count(*)::int n FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND mode='ShareLock' AND granted")).rows[0].n).toBeGreaterThan(0);return a;});
 // Wait for an actual lock waiter, never a fixed sleep as proof of concurrency.
 let waiting=false;for(let i=0;i<200;i++){waiting=(await c.admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) ok")).rows[0].ok;if(waiting)break;await new Promise(r=>setTimeout(r,10));}expect(waiting).toBe(true);
 const inserted=await writer.query("INSERT INTO app.contractor_agreement_status_revision SELECT tenant_id,$2,assignment_id,2,'suspended',schema_version,environment,clock_timestamp(),$3 FROM app.contractor_agreement_status_revision WHERE tenant_id=$1 RETURNING to_jsonb(contractor_agreement_status_revision) AS inserted_row",[f.p.tenantId,randomUUID(),`fictional-fixture:${randomUUID()}`]);
 await writer.query("COMMIT");expect((await pending).status?.status).toBe("suspended");
 const after=await snapshot(c.admin), table="app.contractor_agreement_status_revision";
 expect({...after,[table]:before[table]}).toEqual(before);
 expect(after[table]).toEqual(expect.arrayContaining([...(before[table] as unknown[]),inserted.rows[0].inserted_row]));
 expect(after[table]).toHaveLength((before[table] as unknown[]).length+1);
 }finally{await writer.query("ROLLBACK");writer.release();}
});
