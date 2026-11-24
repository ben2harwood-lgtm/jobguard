// QW-1 photos on variations. Real PostgreSQL only; fixture shape reused from customer-variation-approval.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { priceVariation } from "@jobguard/core";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, FINAL_CHECK_ACTOR, FINAL_CHECK_USER, type FinalCheckFixture } from "./final-check-fixture.js";
import { insertPricedVariation, insertVariationProposal } from "../src/variation-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { workTenant } from "./job-work-state-fixtures.js";
let f: FinalCheckFixture;
beforeAll(async()=>{vi.stubEnv("JOBGUARD_ENV","synthetic_demo");f=await createFinalCheckFixture();},120000);
afterAll(async()=>{await closeFinalCheckFixture(f);vi.unstubAllEnvs();});
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
async function identity(sql:string,args:unknown[]) {
 const db=await f.admin.connect();
 try {await db.query("BEGIN");await db.query("SET LOCAL ROLE jobguard_identity");const r=await db.query(sql,args);await db.query("COMMIT");return r;}
 catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
}

let photoCount=0;
async function photo(tenantId:string,jobId:string,scopeItemId:string,type="variation_photo") {
 const e=randomUUID(),v=randomUUID(),sha=hash(`fictional-photo-${++photoCount}`);
 await workTenant(f.admin,tenantId,async db=>{
  await db.query(`INSERT INTO app.evidence_upload(tenant_id,id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_received_at,server_verified_at)
   VALUES($1,$2::uuid,$3,$4,$2::text,$5,'image/jpeg',100,'standard_evidence',clock_timestamp()+interval '1 day','verified',$6,clock_timestamp(),clock_timestamp())`,[tenantId,e,jobId,scopeItemId,sha,v]);
  await db.query(`INSERT INTO app.evidence_object(tenant_id,id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
   VALUES($1,$2::uuid,$2::uuid,$3,$4,'original',$7,$2::text,$5,$6,80,'image/jpeg','standard_evidence',clock_timestamp(),clock_timestamp())`,[tenantId,e,jobId,scopeItemId,v,sha,type]);
 });
 return {evidenceId:e,sha256:sha,versionId:v};
}
async function fixture(signedDeltaPence=50000,photosBeforePricing=0) {
 const a=await seedFinalCheckJob(f),variationId=randomUUID();
 // A builder-logged extra on a live, unlocked job: photos can still be taken.
 await withTenant(f.runtime,a.context,db=>insertVariationProposal(db,a.tenantId,{version:"variation-proposal.v1",id:variationId,jobId:a.jobId,scopeItemId:variationId,existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text",captureText:"Fictional extra socket",description:"Fictional extra socket",suggestion:null}));
 const row=(await f.admin.query("SELECT * FROM app.variation WHERE tenant_id=$1 AND id=$2",[a.tenantId,variationId])).rows[0];
 for(let n=0;n<photosBeforePricing;n++)await photo(a.tenantId,a.jobId,row.scope_item_id);
 const priced=priceVariation({id:randomUUID(),variationId,previous:null,proposal:{version:"variation-proposal.v1",id:variationId,jobId:a.jobId,scopeItemId:row.scope_item_id,existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text",captureText:row.description,description:row.description,suggestion:null},description:row.description,contentHash:"e".repeat(64),confirmed:{quantity:"1",unit:"item",unitRatePence:Math.abs(signedDeltaPence),direction:signedDeltaPence<0?"omission":"addition",confirmedByMembershipId:FINAL_CHECK_ACTOR,rateProvenance:{kind:"human_entered",sourceRef:"synthetic://builder-entered",sourceHash:"8".repeat(64),rateVersion:"builder-price-v1"}}});
 await withTenant(f.runtime,a.context,db=>insertPricedVariation(db,a.tenantId,priced));
 const customer=(await f.admin.query("SELECT b.customer_id FROM app.job_party_current pc JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(pc.tenant_id,pc.job_id,pc.binding_id) WHERE pc.tenant_id=$1 AND pc.job_id=$2",[a.tenantId,a.jobId])).rows[0].customer_id as string;
 await f.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES('fictional-extra-builder@fixture.invalid',$1) ON CONFLICT DO NOTHING",[FINAL_CHECK_USER]);
 await f.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[FINAL_CHECK_USER,a.tenantId,FINAL_CHECK_ACTOR]);
 const builderDigest=hash(randomUUID()), linkDigest=hash(randomUUID()), sessionDigest=hash(randomUUID());
 await f.admin.query("INSERT INTO identity.session(id,user_id,token_digest,csrf_token,expires_at,environment) VALUES($1,$2,$3,'fictional-csrf',clock_timestamp()+interval '1 hour','synthetic_demo')",[randomUUID(),FINAL_CHECK_USER,builderDigest]);
 const path=`customer-signin-reference.v1:${a.tenantId}/${a.jobId}/${customer}/${"a".repeat(43)}`;
 const grant=(await identity("SELECT identity.customer_portal_issue($1,$2,$3,$4,$5,$6) id",[a.tenantId,builderDigest,a.jobId,customer,linkDigest,path])).rows[0].id;
 await identity("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,'redeem')",[a.tenantId,a.jobId,customer,linkDigest,sessionDigest]);
 const revision=(await f.admin.query("SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.jobId])).rows[0].revision;
 const command={version:"customer-portal-approval.v1",commandId:randomUUID(),jobId:a.jobId,expectedJobRevision:revision,target:{kind:"variation",id:variationId,revision:priced.revision,hash:priced.contentHash,amount:{pence:priced.signedDeltaPence,currency:"GBP"}}};
 return {...a,customer,sessionDigest,builderDigest,grant,priced,variationId,command};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
const run=(a:Fixture,command:unknown=a.command,overrides:Partial<Fixture>={})=>{const x={...a,...overrides};return identity("SELECT identity.customer_variation($1,$2,$3,$4,$5::jsonb) result",[x.tenantId,x.jobId,x.customer,x.sessionDigest,command===null?null:JSON.stringify(command)]);};
const approvals=async(a:Fixture)=>(await f.admin.query("SELECT a.*,p.customer_session_id,p.customer_command_hash FROM app.variation_approval a LEFT JOIN app.customer_variation_approval p ON(p.tenant_id,p.variation_approval_id)=(a.tenant_id,a.id) WHERE a.tenant_id=$1 AND a.job_id=$2",[a.tenantId,a.jobId])).rows;
const claims=async(a:Fixture)=>(await f.admin.query("SELECT revision,claimed_net_pence,reviewer_ref FROM app.recovery_claim_revision WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows;
const refused={code:"42501",message:"CUSTOMER_REFUSED"};
const links=async(a:Fixture)=>(await f.admin.query("SELECT p.revision_id,p.evidence_id,p.position,p.sha256 FROM app.variation_revision_photo p WHERE p.tenant_id=$1 AND p.job_id=$2 ORDER BY p.revision_id,p.position",[a.tenantId,a.jobId])).rows;
const scopeOf=async(a:Fixture)=>(await f.admin.query("SELECT scope_item_id FROM app.variation WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.variationId])).rows[0].scope_item_id as string;
const download=(a:Fixture,evidence:string,overrides:Partial<Fixture>={})=>{const x={...a,...overrides};return identity("SELECT identity.customer_variation_photo($1,$2,$3,$4,$5) result",[x.tenantId,x.jobId,x.customer,x.sessionDigest,evidence]);};
const withPhotos=(a:Fixture,photos:string[])=>({...a.command,target:{...a.command.target,photos}});

it("pricing freezes the extra's verified photos in order; the customer sees them and must approve exactly them",async()=>{
 const a=await fixture(50000,2),linked=await links(a);
 expect(linked.map(row=>row.position)).toEqual([1,2]);
 expect(linked.every(row=>row.revision_id===a.priced.id)).toBe(true);
 const read=(await run(a,null)).rows[0].result;
 expect(read.variations[0].photos.map((p:{sha256:string})=>p.sha256)).toEqual(linked.map(row=>row.sha256));
 expect(read.variations[0].photos[0]).toEqual({evidenceId:linked[0].evidence_id,sha256:linked[0].sha256,receivedAt:expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u)});
 await expect(run(a)).rejects.toMatchObject({code:"42501",message:"PHOTOS_CHANGED"});
 await expect(run(a,withPhotos(a,[linked[0].sha256]))).rejects.toMatchObject({code:"42501",message:"PHOTOS_CHANGED"});
 await expect(run(a,withPhotos(a,[linked[1].sha256,linked[0].sha256]))).rejects.toMatchObject({code:"42501",message:"PHOTOS_CHANGED"});
 expect(await approvals(a)).toEqual([]);
 const exact=withPhotos(a,linked.map(row=>row.sha256));
 await run(a,exact);await run(a,exact);
 expect(await approvals(a)).toHaveLength(1);
});
it("a photo added after pricing stays off the priced revision and appears only on the next revision",async()=>{
 const a=await fixture(0,1),late=await photo(a.tenantId,a.jobId,await scopeOf(a));
 expect((await links(a)).map(row=>row.evidence_id)).not.toContain(late.evidenceId);
 const next={...a.priced,id:randomUUID(),revision:2,previousRevisionId:a.priced.id,unitRatePence:51000,signedDeltaPence:51000,contentHash:"f".repeat(64)};
 await withTenant(f.runtime,a.context,db=>insertPricedVariation(db,a.tenantId,next));
 const second=(await links(a)).filter(row=>row.revision_id===next.id);
 expect(second.map(row=>row.position)).toEqual([1,2]);expect(second[1].evidence_id).toBe(late.evidenceId);
});
it("links at most six photos, ignores invalidated, unverified and other evidence types",async()=>{
 const a=await fixture(50000,7);
 expect((await links(a)).map(row=>row.position)).toEqual([1,2,3,4,5,6]);
 const b=await fixture(0,0),scope=await scopeOf(b);
 const bad=await photo(b.tenantId,b.jobId,scope),other=await photo(b.tenantId,b.jobId,scope,"completion_photo"),good=await photo(b.tenantId,b.jobId,scope);
 await workTenant(f.admin,b.tenantId,db=>db.query("INSERT INTO app.evidence_invalidation(tenant_id,id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[b.tenantId,randomUUID(),bad.evidenceId,FINAL_CHECK_ACTOR]));
 const next={...b.priced,id:randomUUID(),revision:2,previousRevisionId:b.priced.id,unitRatePence:100,signedDeltaPence:100,contentHash:"e".repeat(64)};
 await withTenant(f.runtime,b.context,db=>insertPricedVariation(db,b.tenantId,next));
 expect((await links(b)).map(row=>row.evidence_id)).toEqual([good.evidenceId]);void other;
});
it("links are immutable and the runtime cannot read another tenant's links",async()=>{
 const a=await fixture(50000,1),b=await fixture(50000,1);
 await expect(withTenant(f.runtime,a.context,db=>db.$client.query("UPDATE app.variation_revision_photo SET position=2 WHERE tenant_id=$1",[a.tenantId]))).rejects.toThrow();
 await expect(withTenant(f.runtime,a.context,db=>db.$client.query("DELETE FROM app.variation_revision_photo WHERE tenant_id=$1",[a.tenantId]))).rejects.toThrow();
 const seen=await withTenant(f.runtime,a.context,async db=>(await db.$client.query("SELECT tenant_id FROM app.variation_revision_photo")).rows);
 expect(seen.length).toBeGreaterThan(0);expect(seen.every(row=>row.tenant_id===a.tenantId)).toBe(true);void b;
 const policy=(await f.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.variation_revision_photo'::regclass")).rows[0];
 expect(policy).toEqual({relrowsecurity:true,relforcerowsecurity:true});
 for(const role of ["jobguard_runtime","jobguard_infrastructure"])expect((await f.admin.query("SELECT has_function_privilege($1,'identity.customer_variation_photo(uuid,uuid,uuid,text,uuid)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
 expect((await f.admin.query("SELECT has_table_privilege('jobguard_identity','app.variation_revision_photo','SELECT,INSERT,UPDATE,DELETE') allowed")).rows[0].allowed).toBe(false);
});
it("the customer download returns only a linked photo on its own job",async()=>{
 const a=await fixture(50000,1),b=await fixture(50000,1),[linked]=await links(a),[foreign]=await links(b);
 const unlinked=await photo(a.tenantId,a.jobId,await scopeOf(a));
 const ok=(await download(a,linked.evidence_id)).rows[0].result;
 expect(ok).toMatchObject({version:"customer-variation-photo.v1",objectKey:linked.evidence_id,contentType:"image/jpeg"});
 await expect(download(a,unlinked.evidenceId)).rejects.toMatchObject(refused);
 await expect(download(a,foreign.evidence_id)).rejects.toMatchObject(refused);
 await expect(download(a,foreign.evidence_id,{tenantId:b.tenantId,jobId:b.jobId})).rejects.toMatchObject(refused);
 await expect(download(a,linked.evidence_id,{sessionDigest:a.builderDigest})).rejects.toMatchObject(refused);
 await expect(download(a,randomUUID())).rejects.toMatchObject(refused);
});
it("an extra with no photos approves exactly as before",async()=>{
 const a=await fixture();expect(await links(a)).toEqual([]);
 expect((await run(a,null)).rows[0].result.variations[0].photos).toEqual([]);
 await run(a);expect(await approvals(a)).toHaveLength(1);
});
it("refuses malformed photo lists",async()=>{
 const a=await fixture();
 for(const photos of ["x",[1],["F".repeat(64)],Array(7).fill("a".repeat(64))])await expect(run(a,{...a.command,target:{...a.command.target,photos}})).rejects.toMatchObject(refused);
 expect(await approvals(a)).toEqual([]);
});
