import { workTenant } from "./job-work-state-fixtures.js";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration, type Cluster } from "./contractor-practice-session-fixtures.js";
import { snapshot } from "./contractor-entitlement-fixtures.js";
import { migrate } from "../src/migrate.js";
const own="0390_customer_stage_acknowledgement.sql",hash=(v:string)=>createHash("sha256").update(v).digest("hex");
let c:Cluster;
beforeAll(async()=>{
 c=await startBeforeMigration(own);const before=await snapshot(c.admin);await applyMigration(c,own);
 expect(await snapshot(c.admin)).toEqual({...before,"app.customer_stage_acknowledgement":[]});
 await migrate(c.admin);await migrate(c.admin);expect(await snapshot(c.admin)).toEqual({...before,"app.customer_stage_acknowledgement":[]});
},120000);
afterAll(async()=>{await c?.close();});
async function identity(sql:string,args:unknown[]) {
 const db=await c.admin.connect();
 try{await db.query("BEGIN");await db.query("SET LOCAL ROLE jobguard_identity");const r=await db.query(sql,args);await db.query("COMMIT");return r;}
 catch(e){await db.query("ROLLBACK");throw e;}finally{db.release();}
}
async function world() {
 const t=randomUUID(),a=randomUUID(),m=randomUUID(),u=randomUUID(),j=randomUUID(),b=hash(randomUUID());
 await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[t]);
 await c.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[u]);
 await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)",[`${u}@fixture.invalid`,u]);
 await c.admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional stage builder')",[t,a]);
 await c.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[t,m,a,u]);
 await c.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)",[u,t,m]);
 await c.admin.query("INSERT INTO identity.session(id,user_id,token_digest,csrf_token,expires_at,environment) VALUES($1,$2,$3,'fictional-stage-csrf',clock_timestamp()+interval '1 hour','synthetic_demo')",[randomUUID(),u,b]);
 await c.admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional recorded stage','live')",[t,j]);
 await c.admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture') ON CONFLICT DO NOTHING",[t,j]);
 const party=(await c.admin.query("SELECT b.customer_id FROM app.job_party_current p JOIN app.job_party_binding b ON(b.tenant_id,b.id)=(p.tenant_id,p.binding_id) WHERE p.tenant_id=$1 AND p.job_id=$2",[t,j])).rows[0];
 const customer=party.customer_id as string,link=hash(randomBytes(32).toString("base64url")),d=hash(randomUUID());
 await identity("SELECT identity.customer_portal_issue($1,$2,$3,$4,$5,$6)",[t,b,j,customer,link,`/customer/sign-in#${t}/${j}/${customer}/${"a".repeat(43)}`]);
 await identity("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,'redeem')",[t,j,customer,link,d]);
 return {t,j,customer,d,m};
}
type World=Awaited<ReturnType<typeof world>>;
async function completion(w:World,previous:string|null=null) {
 return workTenant(c.admin,w.t,async db=>{
 const scope=previous?(await db.query("SELECT scope_item_id FROM app.stage_completion WHERE tenant_id=$1 AND id=$2",[w.t,previous])).rows[0].scope_item_id as string:randomUUID();
 const e=randomUUID(),l=randomUUID(),s=randomUUID(),v=randomUUID();
 if(!previous)await db.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')",[w.t,scope,w.j]);
 await db.query(`INSERT INTO app.evidence_upload(tenant_id,id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_verified_at)
 VALUES($1,$2,$3,$4,$2::text,$5,'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day','verified',$6,clock_timestamp())`,[w.t,e,w.j,scope,"a".repeat(64),v]);
 await db.query(`INSERT INTO app.evidence_object(tenant_id,id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_verified_at)
 VALUES($1,$2,$2,$3,$4,'original','pre_cover_photo',$2::text,$5,$6,80,'image/png','standard_evidence',clock_timestamp())`,[w.t,e,w.j,scope,v,"a".repeat(64)]);
 await db.query("INSERT INTO app.evidence_link(tenant_id,id,evidence_id,job_id,scope_item_id,required_evidence_type) VALUES($1,$2,$3,$4,$5,'pre_cover_photo')",[w.t,l,e,w.j,scope]);
 await db.query("INSERT INTO app.stage_completion(tenant_id,id,job_id,scope_item_id,stage,evidence_link_id,command_id,supersedes_completion_id) VALUES($1,$2,$3,$4,'Fictional pre-cover stage',$5,$6,$7)",[w.t,s,w.j,scope,l,randomUUID(),previous]);
 return {s,e,scope};
 });
}
const run=async(w:World,s:string|null=null,command:string|null=null,h:string|null=null)=>(await identity("SELECT identity.customer_stages($1,$2,$3,$4,$5,$6,$7) result",[w.t,w.j,w.customer,w.d,s,command,h])).rows[0].result;
const refused={code:"42501",message:"CUSTOMER_REFUSED"};
const view=async(w:World,s:string)=>(await run(w)).stages.find((x:{snapshot:{completionId:string}})=>x.snapshot.completionId===s);
async function invalidate(w:World,e:string){await workTenant(c.admin,w.t,db=>db.query("INSERT INTO app.evidence_invalidation(tenant_id,id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[w.t,randomUUID(),e,w.m]));}
it("refuses a nonexistent/unverified completion and never creates a completion",async()=>{
 const w=await world();expect((await run(w)).stages).toEqual([]);await expect(run(w,randomUUID(),randomUUID(),"a".repeat(64))).rejects.toMatchObject(refused);
 const p=await completion(w);await workTenant(c.admin,w.t,db=>db.query("UPDATE app.evidence_upload SET state='rejected',rejection_code='fictional_unverified',server_verified_at=NULL WHERE tenant_id=$1 AND id=$2",[w.t,p.e]));
 const v=await view(w,p.s);expect(v.reviewRequired).toBe(true);await expect(run(w,p.s,randomUUID(),v.hash)).rejects.toMatchObject(refused);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.customer_stage_acknowledgement WHERE tenant_id=$1",[w.t])).rows[0].n).toBe(0);
});
it("acknowledges exactly once under concurrent replay, with no financial effects",async()=>{
 const w=await world(),p=await completion(w),v=await view(w,p.s),command=randomUUID();
 expect(v.reviewRequired).toBe(false);await expect(run(w,p.s,randomUUID(),"f".repeat(64))).rejects.toMatchObject(refused);const before=await snapshot(c.admin);
 const [a,b]=await Promise.all([run(w,p.s,command,v.hash),run(w,p.s,command,v.hash)]);expect(a).toEqual(b);
 await expect(run(w,p.s,command,"b".repeat(64))).rejects.toMatchObject(refused);
 const after=await snapshot(c.admin);
 for(const table of Object.keys(before).filter(t=>!['app.audit_event','audit_control.audit_head','app.customer_stage_acknowledgement'].includes(t)))expect(after[table],table).toEqual(before[table]);
 const rows=(await c.admin.query("SELECT snapshot,snapshot_hash FROM app.customer_stage_acknowledgement WHERE tenant_id=$1",[w.t])).rows;expect(rows).toEqual([{snapshot:v.snapshot,snapshot_hash:v.hash}]);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='customer_portal.stage_acknowledged'",[w.t])).rows[0].n).toBe(1);
});
it("later invalidation preserves history and replay but requests fresh review; stale new acknowledgements refuse",async()=>{
 const w=await world(),p=await completion(w),v=await view(w,p.s),command=randomUUID();
 const a=await run(w,p.s,command,v.hash);await invalidate(w,p.e);
 expect(await run(w,p.s,command,v.hash)).toEqual(a);
 expect(await view(w,p.s)).toMatchObject({reviewRequired:true,acknowledgement:{id:a.id}});
 await expect(run(w,p.s,randomUUID(),v.hash)).rejects.toMatchObject(refused);
 const replacement=await completion(w,p.s),fresh=await view(w,replacement.s);expect(fresh.reviewRequired).toBe(false);
 expect((await run(w,replacement.s,randomUUID(),fresh.hash)).id).not.toBe(a.id);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.customer_stage_acknowledgement WHERE tenant_id=$1",[w.t])).rows[0].n).toBe(2);
});
it("invalidated and superseded completions cannot be newly acknowledged",async()=>{
 const w=await world(),p=await completion(w),v=await view(w,p.s);await invalidate(w,p.e);
 await expect(run(w,p.s,randomUUID(),v.hash)).rejects.toMatchObject(refused);
 const second=await completion(w,p.s),s=await view(w,second.s);await completion(w,second.s);
 await expect(run(w,second.s,randomUUID(),s.hash)).rejects.toMatchObject(refused);
});
it("refuses other job, other customer, other tenant, forged and revoked sessions even on replay",async()=>{
 const w=await world(),foreign=await world(),p=await completion(foreign),v=await view(foreign,p.s);
 await expect(run(w,p.s,randomUUID(),v.hash)).rejects.toMatchObject(refused);
 for(const x of [{...w,j:foreign.j},{...w,t:foreign.t},{...w,customer:foreign.customer},{...w,d:hash('forged')}])await expect(run(x)).rejects.toMatchObject(refused);
 const otherJob=randomUUID();await c.admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional other job','live')",[w.t,otherJob]);
 const sameTenantOther=await completion({...w,j:otherJob}),otherView=(await c.admin.query("SELECT app.customer_stage_snapshot($1,$2,$3) v",[w.t,otherJob,sameTenantOther.s])).rows[0].v;
 await expect(run(w,sameTenantOther.s,randomUUID(),otherView.hash)).rejects.toMatchObject(refused);
 const own=await completion(w),ov=await view(w,own.s),command=randomUUID();await run(w,own.s,command,ov.hash);
 await c.admin.query("UPDATE app.customer_portal_session SET revoked_at=clock_timestamp() WHERE tenant_id=$1",[w.t]);await expect(run(w,own.s,command,ov.hash)).rejects.toMatchObject(refused);
});
it("an invalidation committed while acknowledgement waits for the upload is observed",async()=>{
 const w=await world(),p=await completion(w),v=await view(w,p.s),db=await c.admin.connect();
 try {
  await db.query("BEGIN");await db.query("SELECT set_config('app.tenant_id',$1,true)",[w.t]);await db.query("SELECT 1 FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[w.t,p.e]);
  const outcome=run(w,p.s,randomUUID(),v.hash).then(result=>({result}),error=>({error}));
  await db.query("INSERT INTO app.evidence_invalidation(tenant_id,id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[w.t,randomUUID(),p.e,w.m]);
  await db.query("COMMIT");expect(await outcome).toMatchObject({error:refused});
 }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
});
it("private FORCE-RLS table and helper have no direct application privileges; history cannot be edited",async()=>{
 const w=await world(),p=await completion(w),v=await view(w,p.s);await run(w,p.s,randomUUID(),v.hash);
 for(const role of ['jobguard_runtime','jobguard_identity','jobguard_infrastructure'])expect((await c.admin.query("SELECT has_table_privilege($1,'app.customer_stage_acknowledgement','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed",[role])).rows[0].allowed).toBe(false);
 expect((await c.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.customer_stage_acknowledgement'::regclass")).rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true});
 await expect(identity("SELECT * FROM app.customer_stage_acknowledgement",[])).rejects.toMatchObject({code:"42501"});
 const db=await c.admin.connect();
 try {
  await db.query("BEGIN");await db.query("SET LOCAL ROLE jobguard_migration");await db.query("SELECT set_config('app.tenant_id',$1,true)",[randomUUID()]);
  expect((await db.query("SELECT * FROM app.customer_stage_acknowledgement")).rows).toEqual([]);await db.query("ROLLBACK");
 }finally{db.release();}
 await expect(c.admin.query("UPDATE app.customer_stage_acknowledgement SET snapshot=snapshot WHERE tenant_id=$1",[w.t])).rejects.toMatchObject({code:'55000'});
 for(const role of ['jobguard_runtime','jobguard_infrastructure'])expect((await c.admin.query("SELECT has_function_privilege($1,'identity.customer_stages(uuid,uuid,uuid,text,uuid,uuid,text)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
});
