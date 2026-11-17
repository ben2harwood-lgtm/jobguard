import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll,beforeAll,expect,it } from "vitest";
import { ContractorPracticeSessionRepository,ContractorRetainedReadRepository } from "../src/index.js";
import { company,start } from "./practice-worker-switch-fixtures.js";
import { cluster,startSession,resume,read,query,raw,track,unchanged,makeSessionExpired,type Cluster } from "./contractor-retained-read-fixtures.js";
let c:Cluster;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";c=await cluster();},120000);
afterAll(async()=>{await c?.close();});
it("switched operative is never replaced by owner",async()=>{
 const f=await company(c);await start(c,f);await track(c,f);
 const view=await read(c,f);expect(view.membershipId).toBe(f.members.operative);expect(view.contracts).toEqual([]);expect(view.units).toEqual([]);expect(view.revision).toBe(0);
 await expect(resume(c,f)).rejects.toMatchObject({code:"NOT_FOUND"});
 await c.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.members.operative]);await expect(read(c,f)).rejects.toThrow();
});
it("expired and revoked sessions refuse",async()=>{
 for(const kind of ["expired","revoked"]){const f=await startSession(c);if(kind==="expired")await makeSessionExpired(c,f.session);else await new ContractorPracticeSessionRepository(c.runtime).revoke(f.context,f.session);await unchanged(c,()=>expect(read(c,f)).rejects.toThrow());}
 const f=await startSession(c);await c.admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.p.membershipId]);await expect(read(c,f)).rejects.toThrow();
});
it("foreign tenant and malformed context fail closed",async()=>{
 const f=await startSession(c),other=await startSession(c);
 for(const tenant of [null,"","invalid",other.p.tenantId])await unchanged(c,()=>expect(raw(c,tenant,f.session,query(f))).rejects.toThrow());
 await expect(new ContractorRetainedReadRepository(c.runtime).query(f.session,query(other))).rejects.toMatchObject({code:"NOT_FOUND"});
 for(const q of [null,[],{}, {...query(f),tenantId:randomUUID()}, {...query(f),id:null},{...query(f),permission:"organisation.manage"},{...query(f),resource:"commands"}])await unchanged(c,()=>expect(raw(c,f.p.tenantId,f.session,q)).rejects.toThrow());
});
it("pooled connections retain no previous tenant",async()=>{
 const runtime=new Pool({...c.config,database:"jobguard_synthetic_demo",user:"ent4b_login",max:1}),pooled={...c,runtime};
 try{const a=await startSession(c),b=await startSession(c);await read(pooled,a);expect((await read(pooled,b)).tenantId).toBe(b.p.tenantId);await expect(raw(pooled,null,a.session,query(a))).rejects.toThrow();}finally{await runtime.end();}
});
it("revocation committed during the lock wait is observed",async()=>{
 const f=await startSession(c),writer=await c.admin.connect();let pending:Promise<unknown>|undefined;
 try{
  await writer.query("BEGIN");await writer.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))",[f.p.tenantId]);
  pending=read(c,f).then(value=>({value}),error=>({error}));
  let waiting=false;for(let i=0;i<200;i++){waiting=(await c.admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) ok")).rows[0].ok;if(waiting)break;await new Promise(r=>setTimeout(r,10));}expect(waiting).toBe(true);
  await writer.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.p.membershipId]);await writer.query("COMMIT");expect(await pending).toMatchObject({error:{code:"FORBIDDEN"}});
 }finally{await writer.query("ROLLBACK");writer.release();await pending;}
});
it("reads leave all business rows receipts and audit heads unchanged",async()=>{
 const f=await company(c);await track(c,f);await unchanged(c,async()=>{await read(c,f);await resume(c,f);await raw(c,f.p.tenantId,f.session,query(f));});
});
it("retained reads grant no write capability",async()=>{
 const f=await startSession(c);await track(c,f);await unchanged(c,async()=>{
  await read(c,f);await expect(raw(c,f.p.tenantId,f.session,{...query(f),kind:"grant.create"})).rejects.toThrow("INVALID_COMMAND");
  for(const sql of ["INSERT INTO app.role_grant DEFAULT VALUES","UPDATE app.role_grant SET role='owner'","DELETE FROM app.role_grant","TRUNCATE app.role_grant"]){await expect(c.runtime.query(sql)).rejects.toMatchObject({code:"42501"});}
  const client=await c.runtime.connect();try{await client.query("BEGIN");await client.query("SELECT set_config('app.tenant_id',$1,true)",[f.p.tenantId]);expect((await client.query("SELECT app.contractor_allowed($1,'organisation.manage',$2) allowed",[f.p.membershipId,f.p.tenantId])).rows[0].allowed).toBe(false);}finally{await client.query("ROLLBACK");client.release();}
 });
});
