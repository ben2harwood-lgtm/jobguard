import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { appendAuditBatch, ContractorRepository } from "../src/index.js";
import { ContractorApplication } from "../../../apps/api/src/contractor/contractor.application.js";
import { digestOf } from "./contractor-practice-session-fixtures.js";
import { ownerTx, type Cluster, type SessionFixture } from "./contractor-entitlement-fixtures.js";
export { cluster,startSession,status,unchanged,snapshot,startBeforeMigration,applyMigration,ownerTx,makeSessionExpired } from "./contractor-entitlement-fixtures.js";
export type { Cluster,SessionFixture };
export const own="0199_contractor_retained_workspace.sql";
export const query=(f:SessionFixture,resource="contracts",id?:string)=>({version:"contractor-query.v1",tenantId:f.p.tenantId,resource,...(id?{id}:{})});
export const read=(c:Cluster,f:SessionFixture,resource="contracts",id?:string)=>new ContractorApplication(c.runtime).read({version:"contractor-principal.v1",sessionId:f.session},query(f,resource,id));
export const resume=(c:Cluster,f:SessionFixture)=>new ContractorApplication(c.runtime).resume({version:"contractor-principal.v1",sessionId:f.session});
export async function track(c:Cluster,f:SessionFixture) {
 await ownerTx(c,f.p.tenantId,async db=>{
  await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))",[f.p.tenantId]);
  const id=randomUUID();const revision=(await db.$client.query("SELECT max(revision) revision FROM app.commercial_track_assignment")).rows[0].revision;
  await db.$client.query("SELECT app.assign_commercial_track($1,$2,'small_builder',$3,$4,'operations:retained-fixture')",[f.p.tenantId,id,`synthetic-agreement:${f.p.tenantId}`,revision]);
  await appendAuditBatch(db,[{id,version:"audit.v1",actorRef:"operations:retained-fixture",eventType:"commercial_track.assigned",subjectType:"tenant",subjectRef:f.p.tenantId,payload:{references:{environment:"synthetic_demo"}}}]);
 });
}
/** Privileged fictional session binding only; not a sign-in or product authorization. */
export async function memberSession(c:Cluster,f:SessionFixture,member:string) {
 const session=randomUUID();
 await c.admin.query(`INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
 SELECT $1,tenant_id,id,identity_user_id,$2,clock_timestamp(),clock_timestamp()+interval '1 day' FROM app.membership WHERE tenant_id=$3 AND id=$4`,[randomUUID(),digestOf(session),f.p.tenantId,member]);
 return {...f,session,p:await new ContractorRepository(c.runtime).resolveSession(session)};
}
/** Exact predecessor inventory: exclude only this migration's signature. */
export async function catalogue(db:Pool|PoolClient) {
 const routines=(await db.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control')
 AND NOT(n.nspname='app' AND p.proname='mon8_retained_contractor_workspace' AND oidvectortypes(p.proargtypes)='uuid, jsonb') ORDER BY 1,2,3`)).rows;
 const relations=(await db.query(`SELECT n.nspname,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,
 (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,
 (SELECT jsonb_agg(jsonb_build_object('name',x.conname,'definition',pg_get_constraintdef(x.oid)) ORDER BY x.conname) FROM pg_constraint x WHERE x.conrelid=c.oid) constraints
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') ORDER BY 1,2`)).rows;
 const policies=(await db.query("SELECT * FROM pg_policies WHERE schemaname IN('app','identity','control_plane','audit_control') ORDER BY schemaname,tablename,policyname")).rows;
 return {routines,relations,policies};
}
export async function raw(c:Cluster,tenant:string|null,session:string,q:unknown) {
 const db=await c.runtime.connect();try{await db.query("BEGIN");if(tenant!==null)await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);return (await db.query("SELECT app.mon8_retained_contractor_workspace($1,$2::jsonb) workspace",[session,JSON.stringify(q)])).rows[0].workspace;}finally{await db.query("ROLLBACK");db.release();}
}
