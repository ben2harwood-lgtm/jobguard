import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ContractorRepository, ExtraRepository, appendAuditBatch, withTenant } from "../src/index.js";
import { cluster, fixture, raise, ownerTx, type Cluster } from "./extra-fixtures.js";
import { startSession, status, snapshot, unchanged } from "./contractor-entitlement-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { ContractorApplication } from "../../../apps/api/src/contractor/contractor.application.js";
import { SiteExtraApplication } from "../../../apps/api/src/contractor/site-extra.application.js";
let c:Cluster;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";c=await cluster();},120000);
afterAll(async()=>{await c?.close();});
const invite=(tenant:string)=>({version:"contractor-command.v1",environment:"synthetic_demo",kind:"member.invite",role:"operative",commandId:randomUUID(),id:randomUUID(),expectedRevision:0,email:"worker@fictional.invalid",scope:{kind:"tenant",id:tenant},clientId:null,contractId:null});
async function track(f:Awaited<ReturnType<typeof startSession>>,value:"contractor"|"small_builder") {
 await ownerTx(c,f.p.tenantId,async db=>{
  const id=randomUUID(),actorRef=`membership:${f.p.membershipId}`;
  const rev=(await db.$client.query("SELECT max(revision)::int n FROM app.commercial_track_assignment WHERE tenant_id=$1",[f.p.tenantId])).rows[0].n;
  await db.$client.query("SELECT app.assign_commercial_track($1,$2,$3,$4,$5,$6)",[f.p.tenantId,id,value,`synthetic-agreement:${randomUUID()}`,rev,actorRef]);
  await appendAuditBatch(db,[{id,version:"audit.v1",actorRef,eventType:"commercial_track.assigned",subjectType:"tenant",subjectRef:f.p.tenantId,payload:{references:{assignment:id,environment:"synthetic_demo"}}}]);
 });
}
it("active agreement creates exactly one operative; duplicate and conflicting replay preserve existing command guarantees",async()=>{
 const f=await startSession(c),app=new ContractorApplication(c.runtime),p={version:"contractor-principal.v1",sessionId:f.session},raw=invite(f.p.tenantId);
 const first=await app.command(p,raw);expect(await app.command(p,raw)).toEqual(first);
 await expect(app.command(p,{...raw,email:"changed@fictional.invalid"})).rejects.toMatchObject({code:"COMMAND_CONFLICT"});
 expect((await c.admin.query("SELECT count(*)::int n FROM app.membership WHERE tenant_id=$1 AND role='operative'",[f.p.tenantId])).rows[0].n).toBe(1);
 await status(c,f,"suspended");
 await unchanged(c,()=>expect(new ContractorRepository(c.runtime).startPractice(f.session)).resolves.toEqual(f.p));
 await unchanged(c,()=>expect(app.command(p,raw)).rejects.toMatchObject({code:"FORBIDDEN"}));
 expect((await c.admin.query("SELECT count(*)::int n FROM app.membership WHERE tenant_id=$1 AND role='operative'",[f.p.tenantId])).rows[0].n).toBe(1);
 await status(c,f,"active");expect(await app.command(p,raw)).toEqual(first);
});
it.each(["Solo","Builder"])("small-builder %s cannot create membership, grant, invitation or site origin through SQL or routes",async _plan=>{
 // Plans cannot grant contractor features: no plan field is consulted in these writes.
 const f=await startSession(c);await track(f,"small_builder");await status(c,f,"active");
 const tenant=f.p.tenantId,run=(sql:string,params:unknown[])=>ownerTx(c,tenant,db=>db.$client.query(sql,params));
 for(const [sql,params] of [
  ["INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) SELECT tenant_id,$2,account_id,identity_user_id,'operative' FROM app.membership WHERE tenant_id=$1 AND id=$3",[tenant,randomUUID(),f.p.membershipId]],
  ["UPDATE app.membership SET role='operative' WHERE tenant_id=$1 AND id=$2",[tenant,f.p.membershipId]],
  ["INSERT INTO app.role_grant VALUES($1,$2,$3,'operative','tenant',$1,NULL)",[tenant,randomUUID(),f.p.membershipId]],
  ["INSERT INTO identity.invitation(id,email,tenant_id,account_id,role,expires_at,issuer_user_id) SELECT $2,'worker@fictional.invalid',tenant_id,account_id,'operative',clock_timestamp()+interval '1 day',identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$3",[tenant,randomUUID(),f.p.membershipId]],
  ["INSERT INTO app.extra_origin(tenant_id,kind,job_track) VALUES($1,'site_user','contractor')",[tenant]],
  ["INSERT INTO app.extra_origin(tenant_id,kind,job_track) VALUES($1,'site_user','small_builder')",[tenant]],
  ["INSERT INTO app.extra_origin(tenant_id,kind,job_track) VALUES($1,'jobguard_surfaced_confirmed','contractor')",[tenant]],
 ] as Array<[string,unknown[]]>) await unchanged(c,()=>expect(run(sql,params)).rejects.toMatchObject({code:"42501"}));
 const p={version:"contractor-principal.v1",sessionId:f.session};
 await unchanged(c,()=>expect(new ContractorApplication(c.runtime).command(p,invite(tenant))).rejects.toMatchObject({code:"FORBIDDEN"}));
 await unchanged(c,()=>expect(new SiteExtraApplication(c.runtime).log(p,randomUUID(),{version:"log-site-extra.v1",commandId:randomUUID(),description:"Fictional",note:"Fictional"})).rejects.toMatchObject({code:"EXTRA_FORBIDDEN"}));
 await unchanged(c,()=>expect(new ContractorApplication(c.runtime).command(p,{...invite(tenant),contractorAgreementActive:true,plan:_plan})).rejects.toMatchObject({code:"INVALID_COMMAND"}));
 await track(f,"contractor");
 await unchanged(c,()=>expect(new ContractorApplication(c.runtime).command(p,invite(tenant))).rejects.toMatchObject({code:"FORBIDDEN"}));
});
it("site-origin guard refuses agreement loss, preserves historical rows, and leaves prior replay unchanged",async()=>{
 const f=await fixture(c),repo=new ExtraRepository(c.runtime),raw=raise(f),first=await repo.raiseExtra(f.ctx,raw);
 expect(await repo.raiseExtra(f.ctx,raw)).toEqual(first);
 await ownerTx(c,f.p.tenantId,db=>db.$client.query("INSERT INTO app.contractor_agreement_status_revision(tenant_id,id,assignment_id,revision,status,schema_version,environment,fictional_source) SELECT tenant_id,$2,assignment_id,revision+1,'inactive',schema_version,environment,$3 FROM app.contractor_agreement_status_revision WHERE tenant_id=$1 ORDER BY revision DESC LIMIT 1",[f.p.tenantId,randomUUID(),`fictional-fixture:${randomUUID()}`]));
 const before=await snapshot(c.admin);
 await expect(withTenant(c.runtime,f.ctx,db=>db.$client.query("INSERT INTO app.extra_origin(tenant_id,kind,job_track) VALUES($1,'site_user','contractor')",[f.p.tenantId]))).rejects.toMatchObject({code:"42501"});
 expect(await snapshot(c.admin)).toEqual(before);
 await unchanged(c,()=>expect(repo.raiseExtra(f.ctx,raise(f))).rejects.toThrow());
 await unchanged(c,()=>expect(repo.raiseExtra(f.ctx,raw)).resolves.toEqual(first));
 const retained=await withTenant(c.runtime,f.ctx,db=>db.$client.query("SELECT count(*)::int n FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2",[f.p.tenantId,first.variationId]));
 expect(retained.rows[0].n).toBe(1);
});
it("cross-tenant context cannot borrow an active contractor agreement",async()=>{
 const a=await startSession(c),b=await startSession(c);await track(a,"small_builder");
 await unchanged(c,()=>expect(withTenant(c.runtime,testTenantContext(a.p.tenantId),db=>db.$client.query("INSERT INTO app.extra_origin(tenant_id,kind,job_track) VALUES($1,'site_user','contractor')",[b.p.tenantId]))).rejects.toMatchObject({code:"42501"}));
});
it("new guards grant no callable agreement-write bypass",async()=>{
 for(const name of ["mon8_require_operative_agreement(uuid)","mon8_operative_write_guard()"]){
  const row=(await c.admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') runtime,has_function_privilege('jobguard_identity',$1,'EXECUTE') identity,has_function_privilege('jobguard_infrastructure',$1,'EXECUTE') infrastructure",[`app.${name}`])).rows[0];
  expect(row).toEqual({runtime:false,identity:false,infrastructure:false});
 }
});

it("a write waiting behind suspension observes the committed latest status",async()=>{
 const f=await startSession(c),writer=await c.admin.connect();
 try {
  await writer.query("BEGIN");await writer.query("SELECT set_config('app.tenant_id',$1,true)",[f.p.tenantId]);
  await writer.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))",[f.p.tenantId]);
  const pending=ownerTx(c,f.p.tenantId,db=>db.$client.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) SELECT tenant_id,$2,account_id,identity_user_id,'operative' FROM app.membership WHERE tenant_id=$1 AND id=$3",[f.p.tenantId,randomUUID(),f.p.membershipId])).catch(error=>error);
  let waiting=false;
  for(let i=0;i<200;i++){
   waiting=(await c.admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) waiting")).rows[0].waiting;
   if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
  }
  expect(waiting).toBe(true);
  await writer.query("INSERT INTO app.contractor_agreement_status_revision(tenant_id,id,assignment_id,revision,status,schema_version,environment,fictional_source) SELECT tenant_id,$2,assignment_id,revision+1,'suspended',schema_version,environment,$3 FROM app.contractor_agreement_status_revision WHERE tenant_id=$1 ORDER BY revision DESC LIMIT 1",[f.p.tenantId,randomUUID(),`fictional-fixture:${randomUUID()}`]);
  await writer.query("COMMIT");expect(await pending).toMatchObject({code:"42501",message:"FORBIDDEN"});
 }finally{await writer.query("ROLLBACK");writer.release();}
});
