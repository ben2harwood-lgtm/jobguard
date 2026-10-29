// Real PostgreSQL CI only; no mocked proof of sessions, tenant boundaries, claims or concurrency.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { priceVariation } from "@jobguard/core";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, availableFinalCheck, FINAL_CHECK_ACTOR, FINAL_CHECK_USER, type FinalCheckFixture } from "./final-check-fixture.js";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { insertPricedVariation } from "../src/variation-repository.js";
import { withTenant } from "../src/tenant-context.js";
let f: FinalCheckFixture;
beforeAll(async()=>{f=await createFinalCheckFixture();},120000);
afterAll(async()=>closeFinalCheckFixture(f));
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
async function identity(sql:string,args:unknown[]) {
 const db=await f.admin.connect();
 try {await db.query("BEGIN");await db.query("SET LOCAL ROLE jobguard_identity");const r=await db.query(sql,args);await db.query("COMMIT");return r;}
 catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
}
async function fixture() {
 const a=await seedFinalCheckJob(f), revealed=await availableFinalCheck(f,a);
 const {variationId}=await new FinalCheckRepository(f.runtime).confirmCatch(a.context,a.jobId,a.digest,{version:"final-check.catch.v1",commandId:randomUUID(),lockId:revealed.lockId,runId:revealed.runId,signalId:revealed.signalId,expectedSignalRevision:1}) as {variationId:string};
 const row=(await f.admin.query("SELECT * FROM app.variation WHERE tenant_id=$1 AND id=$2",[a.tenantId,variationId])).rows[0];
 const priced=priceVariation({id:randomUUID(),variationId,previous:null,proposal:{version:"variation-proposal.v1",id:variationId,jobId:a.jobId,scopeItemId:row.scope_item_id,existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text",captureText:row.description,description:row.description,suggestion:null},description:row.description,contentHash:"e".repeat(64),confirmed:{quantity:"1",unit:"item",unitRatePence:50000,direction:"addition",confirmedByMembershipId:FINAL_CHECK_ACTOR,rateProvenance:{kind:"human_entered",sourceRef:"synthetic://builder-entered",sourceHash:"8".repeat(64),rateVersion:"builder-price-v1"}}});
 await withTenant(f.runtime,a.context,db=>insertPricedVariation(db,a.tenantId,priced));
 const customer=(await f.admin.query("SELECT b.customer_id FROM app.job_party_current pc JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(pc.tenant_id,pc.job_id,pc.binding_id) WHERE pc.tenant_id=$1 AND pc.job_id=$2",[a.tenantId,a.jobId])).rows[0].customer_id as string;
 await f.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES('fictional-extra-builder@fixture.invalid',$1) ON CONFLICT DO NOTHING",[FINAL_CHECK_USER]);
 await f.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[FINAL_CHECK_USER,a.tenantId,FINAL_CHECK_ACTOR]);
 const builderDigest=hash(randomUUID()), linkDigest=hash(randomUUID()), sessionDigest=hash(randomUUID());
 await f.admin.query("INSERT INTO identity.session(id,user_id,token_digest,csrf_token,expires_at,environment) VALUES($1,$2,$3,'fictional-csrf',clock_timestamp()+interval '1 hour','synthetic_demo')",[randomUUID(),FINAL_CHECK_USER,builderDigest]);
 const path=`/customer/sign-in#${a.tenantId}/${a.jobId}/${customer}/${"a".repeat(43)}`;
 const grant=(await identity("SELECT identity.customer_portal_issue($1,$2,$3,$4,$5,$6) id",[a.tenantId,builderDigest,a.jobId,customer,linkDigest,path])).rows[0].id;
 await identity("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,'redeem')",[a.tenantId,a.jobId,customer,linkDigest,sessionDigest]);
 const revision=(await f.admin.query("SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.jobId])).rows[0].revision;
 const command={version:"customer-portal-approval.v1",commandId:randomUUID(),jobId:a.jobId,expectedJobRevision:revision,target:{kind:"variation",id:variationId,revision:priced.revision,hash:priced.contentHash,amount:{pence:priced.signedDeltaPence,currency:"GBP"}}};
 return {...a,customer,sessionDigest,builderDigest,grant,priced,variationId,command};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
const run=(a:Fixture,command:unknown=a.command,overrides:Partial<Fixture>={})=>{const x={...a,...overrides};return identity("SELECT identity.customer_variation($1,$2,$3,$4,$5::jsonb) result",[x.tenantId,x.jobId,x.customer,x.sessionDigest,command===null?null:JSON.stringify(command)]);};
const approvals=async(a:Fixture)=>(await f.admin.query("SELECT * FROM app.variation_approval WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows;
const claims=async(a:Fixture)=>(await f.admin.query("SELECT revision,claimed_net_pence,reviewer_ref FROM app.recovery_claim_revision WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows;
const refused={code:"42501",message:"CUSTOMER_REFUSED"};
it("concurrent replay records one customer approval and 0282 claim revision 1 at exactly the approved amount",async()=>{
 const a=await fixture();expect(await claims(a)).toEqual([]);
 const read=(await run(a,null)).rows[0].result;
 expect(read.variations).toEqual([expect.objectContaining({id:a.variationId,revision:1,amount:{pence:50000,currency:"GBP"},approved:false})]);
 const [first,second]=await Promise.all([run(a),run(a)]);expect(first.rows).toEqual(second.rows);
 const rows=await approvals(a);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({method:"customer_authenticated",actor_membership_id:null,evidence_id:null,content_hash:a.priced.contentHash,signed_delta_pence:"50000"});
 expect(await claims(a)).toEqual([{revision:1,claimed_net_pence:"50000",reviewer_ref:`customer-session:${rows[0].customer_session_id}`}]);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='customer_portal.variation_approved'",[a.tenantId,a.command.commandId])).rows[0].n).toBe(1);
 const audit=(await f.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2",[a.tenantId,a.command.commandId])).rows;
 expect(JSON.stringify(audit)).not.toMatch(/email|token|Fictional|description/);
});
it.each(["amount","hash","revision","jobRevision","wrongJob","wrongTenant","wrongCustomer","builder","revoked","expired"])("refuses %s without approval or claim",async kind=>{
 const a=await fixture(),command=structuredClone(a.command),override:Partial<Fixture>={};
 if(kind==="amount")command.target.amount.pence++;
 if(kind==="hash")command.target.hash="f".repeat(64);
 if(kind==="revision")command.target.revision++;
 if(kind==="jobRevision")command.expectedJobRevision++;
 if(kind==="wrongJob")override.jobId=randomUUID();
 if(kind==="wrongTenant")override.tenantId=randomUUID();
 if(kind==="wrongCustomer")override.customer=randomUUID();
 if(kind==="builder")override.sessionDigest=a.builderDigest;
 if(kind==="revoked")await identity("SELECT identity.customer_portal_revoke($1,$2,$3,$4)",[a.tenantId,a.builderDigest,a.jobId,a.grant]);
 if(kind==="expired")await f.admin.query("UPDATE app.customer_portal_session SET issued_at=issued_at-interval '2 hours',expires_at=expires_at-interval '2 hours' WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId]);
 await expect(run(a,command,override)).rejects.toMatchObject(refused);expect(await approvals(a)).toEqual([]);expect(await claims(a)).toEqual([]);
});
it("changed payload under a successful command cannot replay, and another command cannot approve the same revision twice",async()=>{
 const a=await fixture();await run(a);
 await expect(run(a,{...a.command,target:{...a.command.target,amount:{pence:1,currency:"GBP"}}})).rejects.toMatchObject(refused);
 await expect(run(a,{...a.command,commandId:randomUUID()})).rejects.toMatchObject(refused);
 await identity("SELECT identity.customer_portal_revoke($1,$2,$3,$4)",[a.tenantId,a.builderDigest,a.jobId,a.grant]);
 await expect(run(a)).rejects.toMatchObject(refused);expect(await approvals(a)).toHaveLength(1);expect(await claims(a)).toHaveLength(1);
});
it("a newly priced revision makes the displayed old revision stale",async()=>{
 const a=await fixture();await withTenant(f.runtime,a.context,db=>insertPricedVariation(db,a.tenantId,{...a.priced,id:randomUUID(),revision:2,previousRevisionId:a.priced.id,signedDeltaPence:51000,contentHash:"f".repeat(64)}));
 await expect(run(a)).rejects.toMatchObject(refused);expect(await claims(a)).toEqual([]);
});
it("raw runtime INSERT cannot manufacture customer provenance; identity has only the checked routine",async()=>{
 const a=await fixture();const sid=(await f.admin.query("SELECT id FROM app.customer_portal_session WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].id;
 await expect(withTenant(f.runtime,a.context,db=>db.$client.query("INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,approved_at,customer_session_id,customer_command_hash) VALUES($1,$2,$3,$4,$5,1,$6,50000,'customer_authenticated',clock_timestamp(),$7,$6)",[randomUUID(),a.tenantId,a.jobId,a.variationId,a.priced.id,a.priced.contentHash,sid]))).rejects.toMatchObject(refused);
 for(const role of ["jobguard_runtime","jobguard_infrastructure"])expect((await f.admin.query("SELECT has_function_privilege($1,'identity.customer_variation(uuid,uuid,uuid,text,jsonb)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
 expect((await f.admin.query("SELECT has_table_privilege('jobguard_identity','app.variation_approval','SELECT,INSERT,UPDATE,DELETE') allowed")).rows[0].allowed).toBe(false);
});
it("another real job's revision cannot be approved or replayed through this customer's session",async()=>{
 const a=await fixture(),b=await fixture();
 await expect(run(a,{...a.command,target:b.command.target})).rejects.toMatchObject(refused);
 await expect(run(a,b.command)).rejects.toMatchObject(refused);
 expect(await approvals(a)).toEqual([]);expect(await approvals(b)).toEqual([]);
});
it("a signed omission stays negative and creates no positive catch claim",async()=>{
 const a=await fixture();
 await withTenant(f.runtime,a.context,db=>insertPricedVariation(db,a.tenantId,{...a.priced,id:randomUUID(),revision:2,previousRevisionId:a.priced.id,signedDeltaPence:-5000,contentHash:"f".repeat(64)}));
 const command={...a.command,target:{...a.command.target,revision:2,hash:"f".repeat(64),amount:{pence:-5000,currency:"GBP"}}};
 await run(a,command);expect((await approvals(a))[0]).toMatchObject({signed_delta_pence:"-5000",method:"customer_authenticated"});expect(await claims(a)).toEqual([]);
});
it("an existing foreign tenant/job cannot use this tenant's customer session",async()=>{
 const a=await fixture(),tenant=randomUUID(),job=randomUUID();
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[tenant]);
 await f.admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional foreign tenant','live')",[tenant,job]);
 const customer=(await f.admin.query("SELECT b.customer_id FROM app.job_party_current pc JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(pc.tenant_id,pc.job_id,pc.binding_id) WHERE pc.tenant_id=$1 AND pc.job_id=$2",[tenant,job])).rows[0].customer_id;
 await expect(run(a,{...a.command,jobId:job},{tenantId:tenant,jobId:job,customer})).rejects.toMatchObject(refused);expect(await approvals(a)).toEqual([]);
});
it("expiry while waiting for the source-effect lock cannot approve or create a claim",async()=>{
 const a=await fixture(),blocker=await f.admin.connect();
 await blocker.query("BEGIN");await blocker.query("SELECT app.lock_recovery_message_sources($1)",[a.tenantId]);
 // Exact one-hour check remains intact; only the remaining valid lifetime is shortened in this fixture.
 await f.admin.query("WITH ts AS MATERIALIZED (SELECT clock_timestamp()+interval '2 seconds' deadline) UPDATE app.customer_portal_session SET issued_at=ts.deadline-interval '1 hour',expires_at=ts.deadline FROM ts WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId]);
 const pending=run(a).then(value=>({value}),error=>({error}));
 try {
  let waiting=false;
  for(let attempt=0;attempt<50;attempt++){
   waiting=(await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE 'SELECT identity.customer_variation%') waiting")).rows[0].waiting;
   if(waiting)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  expect(waiting).toBe(true);
  await new Promise(resolve=>setTimeout(resolve,2100));
 }finally{await blocker.query("ROLLBACK");blocker.release();}
 expect(await pending).toMatchObject({error:refused});expect(await approvals(a)).toEqual([]);expect(await claims(a)).toEqual([]);
});
