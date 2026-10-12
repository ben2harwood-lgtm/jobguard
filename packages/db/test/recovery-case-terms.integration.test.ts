// Written first; NOT RUN (sandbox cannot start PostgreSQL / a browser).
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { recoveryCaseTermsHash } from "@jobguard/core";
import { DEMO_TENANT_ID as T, DEMO_MEMBERSHIP_ID as M, DEMO_IDENTITY_USER_ID as U, RecoveryCaseTermsRepository, RecoveryCaseRepository, RecoveryMessageRepository, EvidencePackRepository, PracticeActivationRepository, PracticeInvoiceRepository, FinalAccountCommandService, prepareActivationFixtureV3, migrate, withTenant, verifyAuditChain, executeAuthorizedCommercialAction } from "../src/index.js";
import { freePort, closeTestPools } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
const context=testTenantContext(T),actor={membershipId:M,identityUserId:U},messageActor={membershipId:M,actorRef:`membership:${M}`};
let pg:EmbeddedPostgres,admin:Pool,runtime:Pool,dir:string,port:number,job:string,unbound:string,invoice:string,unboundInvoice:string,supplierRefs:string[];
const original=process.env.JOBGUARD_ENV;
const command=(caseId:string,commandId=randomUUID())=>({version:"recovery-case-terms-command.v1",action:"approve",commandId,caseId,termsVersion:"synthetic_recovery_fee_terms.v1",feePolicyVersion:"reference_fee_policy_v3",eligibilityPolicyVersion:"reference_recovery_eligibility_policy_v3",termsHash:recoveryCaseTermsHash(caseId)});
const hash=(text:string)=>createHash("sha256").update(text).digest("hex");
const tables=["recovery_case_terms_approval","decision","decision_resolution","action_authorization","command_receipt","recovery_message","recovery_message_event","recovery_message_approval","recovery_message_sink","action_outbox","audit_event"];
async function counts(){return Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`,[T])).rows[0].n])));}
async function newCase(type="withheld_customer_payment",target=job){
 if(type==="withheld_customer_payment"&&target===job)return (await new RecoveryCaseRepository(runtime).command(context,job,{version:"recovery-case-command.v1",action:"open",commandId:randomUUID(),caseType:type,claimedNetPence:32000,counterparty:"Fictional customer",book:"builder_customer",sourceType:"customer_invoice",sourceRefs:[invoice]},actor)).id;
 const id=randomUUID();await admin.query(`INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs) VALUES($1,$2,$3,32000,'GBP',$5,0,true,$4,'Fictional party','builder_customer','customer_invoice',$6)`,[id,T,target,type,type==="prevention"?"prevented":"identified",JSON.stringify(type==="merchant_overcharge"?supplierRefs:[target===unbound?unboundInvoice:invoice])]);
 await admin.query(`INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,1,32000,'GBP','fixture-owner',$5)`,[randomUUID(),T,target,id,hash(id)]);
 await admin.query(`INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,1,$5,NULL,$6,'fixture-owner',$7,$8)`,[randomUUID(),T,target,id,type==="prevention"?"prevent":"opened",type==="prevention"?"prevented":"identified",randomUUID(),hash(id)]);return id;
}
async function member(role:string,state="active"){
 const id=randomUUID(),identity=randomUUID();await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[identity]);
 await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role,revoked_at,expires_at) SELECT $1,tenant_id,account_id,$2,$3,CASE WHEN $4='revoked' THEN clock_timestamp() END,CASE WHEN $4='expired' THEN clock_timestamp()-interval '1 second' END FROM app.membership WHERE tenant_id=$5 AND id=$6`,[id,identity,role,state,T,M]);return {membershipId:id,identityUserId:identity};
}
async function handMade(db:PoolClient,caseId:string,memberId:string,over:Record<string,unknown>={}){
 const c=randomUUID(),d=randomUUID(),r=randomUUID(),a=randomUUID(),action=over.action??"recovery.terms.approve";
 await db.query(`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'recovery.terms.approve',$3,$4,'processing',$5)`,[c,T,`hand-made:${c}`,hash(c),memberId]);
 await db.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'recovery_case',$3,$4)",[d,T,over.caseId??caseId,action]);
 await db.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)",[r,T,d,memberId]);
 await db.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,content_hash,aggregate_revision,policy_version,expires_at,revoked_at) VALUES($1,$2,$3,$4,$5,$6,$7,1,'reference_fee_policy_v3',$8,$9)`,[a,T,d,r,memberId,action,over.hash??recoveryCaseTermsHash(caseId),over.expired?new Date("2000-01-01"):new Date("2099-01-01"),over.revoked?new Date():null]);return {c,a};
}
const direct=(db:PoolClient,caseId:string,memberId:string,ids:{c:string;a:string},tenant=T,target=job)=>db.query("SELECT * FROM app.approve_recovery_case_terms($1,$2,$3,$4,$5,$6,$7)",[tenant,randomUUID(),target,caseId,memberId,ids.c,ids.a]);
async function attached(caseId:string){const repo=new EvidencePackRepository(runtime),pack=await repo.generate(context,caseId,{commandId:randomUUID()},messageActor.actorRef);await repo.approveAttachment(context,caseId,pack.id,{commandId:randomUUID(),expectedManifestHash:pack.manifestHash,expectedContentHash:pack.contentHash},messageActor.actorRef);return pack;}
async function preview(caseId:string){const repo=new RecoveryMessageRepository(runtime),s=await repo.read(context,caseId);return repo.preview(context,caseId,{version:"recovery-message-preview.v1",commandId:randomUUID(),expectedCaseRevision:s.readiness.caseRevision,packId:s.readiness.packId!},messageActor);}
const approveMessage=(v:NonNullable<Awaited<ReturnType<RecoveryMessageRepository["read"]>>["latest"]>)=>({version:"recovery-message-command.v1",action:"approve",commandId:randomUUID(),messageId:v.id,expectedRevision:v.revision,recipient:v.message.recipient,body:v.message.body,amountPence:v.message.amountPence,packId:v.message.packId,contentHash:v.message.contentHash});
async function removeFixtureTerms(caseId:string){const db=await admin.connect();try{await db.query("BEGIN");await db.query("SET LOCAL session_replication_role=replica");await db.query("DELETE FROM app.recovery_case_terms_approval WHERE tenant_id=$1 AND case_id=$2",[T,caseId]);await db.query("COMMIT");}finally{db.release();}}
async function proofFixture(owner:Pool,j:string){
 const scope=(await owner.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 LIMIT 1",[T,j])).rows[0].id as string,upload=randomUUID(),evidence=randomUUID();
 const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNioAAAAASUVORK5CYII=","base64"),digest=createHash("sha256").update(bytes).digest("hex");
 await withTenant(owner,context,async db=>{
 await db.$client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at) VALUES($1,$2,$3,$4,'terms/proof',$5,'image/png',$6,'standard_evidence','verified','terms-proof-v1',clock_timestamp(),clock_timestamp()+interval '1 hour')",[upload,T,j,scope,digest,bytes.length]);
 await db.$client.query("INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes) VALUES($1,$2,$3,$4,'terms/proof','terms-proof-v1','synthetic_demo','image/png',$5)",[T,upload,j,scope,bytes]);
 await db.$client.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,$5,'original','site_photo','terms/proof','terms-proof-v1',$6,$7,'image/png','standard_evidence',clock_timestamp(),clock_timestamp())",[evidence,T,upload,j,scope,digest,bytes.length]);
 });
}
async function supplierFixture(){
 const merchant=randomUUID(),sku=randomUUID(),rate=randomUUID(),scope=(await admin.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 LIMIT 1",[T,job])).rows[0].id,refs=[rate];
 await withTenant(admin,context,async db=>{
 await db.$client.query("INSERT INTO app.merchant(id,tenant_id,name) VALUES($1,$2,'Fictional supplier')",[merchant,T]);await db.$client.query("INSERT INTO app.merchant_sku(id,tenant_id,merchant_id,sku,description,base_unit) VALUES($1,$2,$3,'CH7-320','Fixture materials','each')",[sku,T,merchant]);await db.$client.query("INSERT INTO app.material_rate_revision(id,tenant_id,merchant_id,sku_id,version,price_pence,currency,price_unit,tax_basis,effective_from,source_label) VALUES($1,$2,$3,$4,1,2000,'GBP','each','net','2026-10-01','CH7 agreement')",[rate,T,merchant,sku]);await db.$client.query("INSERT INTO app.material_requirement(id,tenant_id,job_id,scope_item_id,sku_id,quantity_decimal,unit,revision) VALUES($1,$2,$3,$4,$5,'40','each',1)",[randomUUID(),T,job,scope,sku]);
 for(const type of ["invoice","delivery"]){const id=randomUUID();refs.push(id);await db.$client.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,document_number,content_hash,status) VALUES($1,$2,$3,'Fictional supplier',$4,$5,$6,'ready')",[id,T,job,type,'CH7-'+type,hash(type)]);await db.$client.query("INSERT INTO app.supplier_document_version(id,tenant_id,job_id,document_id,version,media_type,byte_length,content_hash,page_count) VALUES($1,$2,$3,$4,1,'text/plain',1,$5,1)",[randomUUID(),T,job,id,hash(type)]);}
 });return refs;
}
beforeAll(async()=>{
 process.env.JOBGUARD_ENV="synthetic_demo";dir=await mkdtemp(join(tmpdir(),"ch7-terms-"));port=await freePort(58400,200);
 pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});await pg.initialise();await pg.start();
 admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic",database:"postgres"});await migrate(admin);
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[T]);await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[U]);const account=randomUUID();await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional builder')",[account,T]);await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[M,T,account,U]);
 await admin.query("CREATE ROLE terms_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO terms_login");
 runtime=new Pool({host:"127.0.0.1",port,user:"terms_login",password:"synthetic",database:"postgres",max:4});
 job=await prepareActivationFixtureV3(admin,context,"CH7 terms",1880000,runtime);await new PracticeActivationRepository(runtime).start(context,job,{commandId:randomUUID(),scenario:"no_charge"});
 await proofFixture(admin,job);
 supplierRefs=await supplierFixture();
 const final=await new FinalAccountCommandService(runtime).assemble(context,{version:"final-account.assemble.v1",commandId:randomUUID(),jobId:job,actorMembershipId:M});
 invoice=(await new PracticeInvoiceRepository(runtime).issue(context,{jobId:job,finalAccountRevisionId:final.id,actorMembershipId:M,commandId:randomUUID(),recipient:"practice-customer@example.invalid",issuedOn:"2026-10-12"})).id;
 unbound=await prepareActivationFixtureV3(admin,context,"No-policy control",1880000,runtime);await new PracticeActivationRepository(runtime).start(context,unbound,{commandId:randomUUID(),scenario:"no_charge"});await proofFixture(admin,unbound);
 const controlFinal=await new FinalAccountCommandService(runtime).assemble(context,{version:"final-account.assemble.v1",commandId:randomUUID(),jobId:unbound,actorMembershipId:M});unboundInvoice=(await new PracticeInvoiceRepository(runtime).issue(context,{jobId:unbound,finalAccountRevisionId:controlFinal.id,actorMembershipId:M,commandId:randomUUID(),recipient:"practice-customer@example.invalid",issuedOn:"2026-10-12"})).id;
 // Privileged negative-fixture setup only: construct the historical no-policy shape; all pursuit calls below still run as runtime.
 const fixtureClient=await admin.connect();try{await fixtureClient.query("BEGIN");await fixtureClient.query("SET LOCAL session_replication_role=replica");await fixtureClient.query("UPDATE app.job SET fee_policy_version=NULL,baseline_quote_version_id=NULL,accepted_net_value_pence=NULL WHERE tenant_id=$1 AND id=$2",[T,unbound]);await fixtureClient.query("COMMIT");}finally{fixtureClient.release();}
});
afterAll(async()=>{if(original===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=original;await closeTestPools(runtime,admin);await pg?.stop();if(dir)await rm(dir,{recursive:true,force:true});});
it("[T1] stores exact owner approval, one dispatcher authorization and two audit events; fresh connection reads it",async()=>{
 const id=await newCase(),input=command(id),repo=new RecoveryCaseTermsRepository(runtime),before=await counts(),view=await repo.approve(context,job,input,actor);
 const after=await counts();for(const table of ["recovery_case_terms_approval","decision","decision_resolution","action_authorization","command_receipt"])expect(after[table]-before[table]).toBe(1);expect(after.audit_event-before.audit_event).toBe(2);
 expect(view).toMatchObject({caseId:id,jobId:job,actorMembershipId:M,commandId:input.commandId,termsHash:recoveryCaseTermsHash(id),policyStatus:"proposed",environment:"synthetic_demo",realExternalActions:0});
 const stored=(await admin.query("SELECT * FROM app.recovery_case_terms_approval WHERE tenant_id=$1 AND id=$2",[T,view.id])).rows[0];expect(stored.terms_hash.trim()).toBe(view.termsHash);expect(stored.authorization_id).toBe(view.authorizationId);
 expect((await admin.query("SELECT status FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2",[T,input.commandId])).rows[0].status).toBe("succeeded");
 const fresh=new Pool({host:"127.0.0.1",port,user:"terms_login",password:"synthetic",database:"postgres"});try{expect(await new RecoveryCaseTermsRepository(fresh).read(context,job,id)).toEqual(view);}finally{await fresh.end();}
});
// membership.role is unconstrained varchar(40): test each known product role plus an arbitrary schema-valid value.
it.each(["admin","estimator","foreman","operative","finance","read_only","supervisor","surveyor","commercial_manager","client_approver","member","arbitrary_schema_role"])("[T2] dispatcher refuses non-owner %s with zero writes",async role=>{
 const who=await member(role),id=await newCase(),before=await counts();await expect(new RecoveryCaseTermsRepository(runtime).approve(context,job,command(id),who)).rejects.toMatchObject({code:"RECOVERY_TERMS_FORBIDDEN"});expect(await counts()).toEqual(before);
});
it.each(["revoked","expired"])("[T2] dispatcher refuses %s owner with zero writes",async state=>{const who=await member("owner",state),id=await newCase(),before=await counts();await expect(new RecoveryCaseTermsRepository(runtime).approve(context,job,command(id),who)).rejects.toMatchObject({code:"RECOVERY_TERMS_FORBIDDEN"});expect(await counts()).toEqual(before);});
it.each([["member","active"],["owner","revoked"],["owner","expired"]])("[T2] direct runtime forged exact inputs refuse %s/%s and roll back everything",async(role,state)=>{
 const who=await member(role,state),id=await newCase(),before=await counts();await expect(withTenant(runtime,context,async db=>{const inputs=await handMade(db.$client,id,who.membershipId);return direct(db.$client,id,who.membershipId,inputs);})).rejects.toMatchObject({code:"42501",message:"RECOVERY_TERMS_AUTHORIZATION_INVALID"});expect(await counts()).toEqual(before);
});
it("[T2] direct active-owner positive control accepts the same hand-made inputs; runtime cannot INSERT",async()=>{
 const id=await newCase();const result=await withTenant(runtime,context,async db=>direct(db.$client,id,M,await handMade(db.$client,id,M)));expect(result.rows[0].case_id).toBe(id);
 await expect(withTenant(runtime,context,db=>db.$client.query("INSERT INTO app.recovery_case_terms_approval SELECT * FROM app.recovery_case_terms_approval LIMIT 1"))).rejects.toMatchObject({code:"42501"});
});
it.each(["merchant_overcharge","duplicate_supplier_payment","prevention"])("[T3] refuses %s with no writes",async type=>{const id=await newCase(type),before=await counts();await expect(new RecoveryCaseTermsRepository(runtime).approve(context,job,command(id),actor)).rejects.toMatchObject({code:"RECOVERY_TERMS_NOT_APPLICABLE"});expect(await counts()).toEqual(before);});
it("[T3] wrong job, missing/foreign case and unbound policy fail without existence leak or writes",async()=>{
 const id=await newCase(),other=await newCase("withheld_customer_payment",unbound),repo=new RecoveryCaseTermsRepository(runtime),before=await counts();
 for(const [path,c,code] of [[unbound,id,"RECOVERY_TERMS_CASE_NOT_FOUND"],[job,randomUUID(),"RECOVERY_TERMS_CASE_NOT_FOUND"],[unbound,other,"RECOVERY_TERMS_POLICY_MISMATCH"]])await expect(repo.approve(context,path!,command(c!),actor)).rejects.toMatchObject({code});expect(await counts()).toEqual(before);
});
it.each([{caseId:randomUUID()},{hash:"b".repeat(64)},{action:"another.action"},{expired:true},{revoked:true}])("[T3] rejects inexact direct authorization %j and rolls back",async over=>{const id=await newCase(),before=await counts();await expect(withTenant(runtime,context,async db=>direct(db.$client,id,M,await handMade(db.$client,id,M,over)))).rejects.toMatchObject({code:"42501",message:"RECOVERY_TERMS_AUTHORIZATION_INVALID"});expect(await counts()).toEqual(before);});
it("[T3] direct tenant mismatch refuses 42501",async()=>{await expect(withTenant(runtime,context,db=>direct(db.$client,randomUUID(),M,{c:randomUUID(),a:randomUUID()},randomUUID()))).rejects.toMatchObject({code:"42501"});});
it("[T4] identical, semantic and uppercase replays return the same approval; changed body and owner conflict",async()=>{
 const id=await newCase(),input=command(id),repo=new RecoveryCaseTermsRepository(runtime),view=await repo.approve(context,job,input,actor),before=await counts();
 for(const raw of [input,{...input,commandId:randomUUID()},{...input,commandId:input.commandId.toUpperCase(),caseId:id.toUpperCase()}])expect(await repo.approve(context,job.toUpperCase(),raw,actor)).toEqual(view);
 await expect(repo.approve(context,unbound,input,actor)).rejects.toMatchObject({code:"RECOVERY_TERMS_CASE_NOT_FOUND"});expect(await counts()).toEqual(before);
 const otherCase=await newCase(),afterSetup=await counts();await expect(repo.approve(context,job,command(otherCase,input.commandId),actor)).rejects.toMatchObject({code:"RECOVERY_TERMS_COMMAND_CONFLICT"});expect(await counts()).toEqual(afterSetup);
 const second=await member("owner");await expect(repo.approve(context,job,command(id),second)).rejects.toMatchObject({code:"RECOVERY_TERMS_COMMAND_CONFLICT"});expect(await counts()).toEqual(afterSetup);
 await expect(withTenant(runtime,context,async db=>direct(db.$client,id,M,await handMade(db.$client,id,M)))).rejects.toMatchObject({message:"RECOVERY_TERMS_ALREADY_APPROVED"});expect(before.recovery_case_terms_approval).toBe(afterSetup.recovery_case_terms_approval);
});
it("[T4] two different active owners racing leave one approval and a typed conflict",async()=>{
 const id=await newCase(),other=await member("owner"),repo=new RecoveryCaseTermsRepository(runtime);const results=await Promise.allSettled([repo.approve(context,job,command(id),actor),repo.approve(context,job,command(id),other)]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(results.find(r=>r.status==="rejected")).toMatchObject({reason:{code:"RECOVERY_TERMS_COMMAND_CONFLICT"}});expect((await admin.query("SELECT count(*)::int n FROM app.recovery_case_terms_approval WHERE tenant_id=$1 AND case_id=$2",[T,id])).rows[0].n).toBe(1);
});
it("[T5] preview refusal writes nothing; [T6] approval then preview/approve/deliver succeeds unchanged",async()=>{
 const id=await newCase();await attached(id);const before=await counts();await expect(preview(id)).rejects.toMatchObject({code:"RECOVERY_TERMS_NOT_APPROVED"});expect(await counts()).toEqual(before);
 await new RecoveryCaseTermsRepository(runtime).approve(context,job,command(id),actor);const repo=new RecoveryMessageRepository(runtime),v=(await preview(id)).latest!;expect(v.status).toBe("previewed");const queued=await repo.command(context,id,approveMessage(v),messageActor);expect(queued.latest!.status).toBe("queued");
 const delivered=await repo.command(context,id,{version:"recovery-message-command.v1",action:"advance",commandId:randomUUID(),messageId:v.id,expectedRevision:queued.latest!.revision,outcome:"success"},messageActor);expect(delivered.latest!.status).toBe("simulated_delivery");expect(delivered.sinkCount).toBe(1);
});
it("[T5] raw runtime writes on all three chase tables hit their added terms triggers",async()=>{
 // Build otherwise-valid message inputs through the product, then remove only the test terms via a privileged replica setup.
 const id=await newCase();await attached(id);await new RecoveryCaseTermsRepository(runtime).approve(context,job,command(id),actor);const repo=new RecoveryMessageRepository(runtime),v=(await preview(id)).latest!;
 const queued=await repo.command(context,id,approveMessage(v),messageActor);await removeFixtureTerms(id);const before=await counts();
 // The message is the newest preview and its approval is pending. For the preview control temporarily cancel that outbox in rolled-back setup, so the old effect guard permits it.
 await expect(withTenant(runtime,context,async db=>{await db.$client.query("UPDATE app.action_outbox SET status='cancelled' WHERE tenant_id=$1 AND id=$2",[T,queued.latest!.approval!.outboxActionId]);return db.$client.query(`INSERT INTO app.recovery_message SELECT gen_random_uuid(),tenant_id,job_id,case_id,case_sequence+1,pack_id,pack_revision,manifest_hash,attachment_hash,attachment_approval_id,gen_random_uuid(),request_hash,case_type,case_revision,amount_pence,currency,sender,recipient,body,policy_version,content_hash,immutable_content,actor_membership_id,environment,created_at FROM app.recovery_message WHERE tenant_id=$1 AND id=$2`,[T,v.id]);})).rejects.toMatchObject({code:"23514",message:"RECOVERY_TERMS_NOT_APPROVED"});
 await expect(withTenant(runtime,context,db=>db.$client.query("INSERT INTO app.recovery_message_approval SELECT * FROM app.recovery_message_approval WHERE tenant_id=$1 AND message_id=$2",[T,v.id]))).rejects.toMatchObject({code:"23514",message:"RECOVERY_TERMS_NOT_APPROVED"});
 // Put the already approved outbox in the executor's otherwise-valid state inside the rejected transaction.
 await expect(withTenant(runtime,context,async db=>{await db.$client.query("UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[T,queued.latest!.approval!.outboxActionId]);return db.$client.query(`INSERT INTO app.recovery_message_sink(id,tenant_id,job_id,case_id,message_id,outbox_action_id,recipient,body,content_hash,attachment_hash,provider_reference,environment,real_external_actions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'raw','synthetic_demo',0)`,[randomUUID(),T,job,id,v.id,queued.latest!.approval!.outboxActionId,v.message.recipient,v.message.body,v.message.contentHash,v.message.attachmentHash]);})).rejects.toMatchObject({code:"23514",message:"RECOVERY_TERMS_NOT_APPROVED"});
 expect(await counts()).toEqual(before);
 expect((await counts()).recovery_message_sink).toBe(before.recovery_message_sink);
});
it("[T6] controls: non-withheld and no-policy cases require no terms",async()=>{
 for(const [type,target] of [["merchant_overcharge",job],["withheld_customer_payment",unbound]]){const id=await newCase(type,target);await attached(id);expect((await preview(id)).latest!.status).toBe("previewed");expect((await withTenant(runtime,context,db=>db.$client.query("SELECT app.recovery_case_terms_approved($1,$2,$3) ok",[T,target,id]))).rows[0].ok).toBe(true);}
});
it("[T7] tenant B cannot read or approve A, and A approval cannot satisfy B's same-UUID case guard",async()=>{
 const id=await newCase(),repo=new RecoveryCaseTermsRepository(runtime);await repo.approve(context,job,command(id),actor);const b=randomUUID(),bj=randomUUID(),bm=randomUUID(),bu=randomUUID(),account=randomUUID();await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[b]);await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[bu]);const ctx=testTenantContext(b);
 await withTenant(admin,ctx,async db=>{
 await db.$client.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Tenant B fixture')",[account,b]);await db.$client.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[bm,b,account,bu]);
 // Adversarial SQL fixture, not a product activation: B reuses A's case UUID, with its own job/policy and no approval.
 await db.$client.query("INSERT INTO app.job(id,tenant_id,title,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence) VALUES($1,$2,'Tenant B guard fixture','imported',100000,'reference_fee_policy_v3',1500)",[bj,b]);
 await db.$client.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs) VALUES($1,$2,$3,32000,'GBP','identified',0,true,'withheld_customer_payment','Fictional party','builder_customer','customer_invoice','[]')",[id,b,bj]);
 await db.$client.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,1,32000,'GBP','fixture-owner',$5)",[randomUUID(),b,bj,id,hash(id)]);
 await db.$client.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,1,'opened',NULL,'identified','fixture-owner',$5,$6)",[randomUUID(),b,bj,id,randomUUID(),hash(id)]);
 });const before=await counts();
 expect(await repo.read(ctx,job,id)).toBeNull();expect((await withTenant(runtime,ctx,db=>db.$client.query("SELECT * FROM app.recovery_case_terms_approval"))).rows).toEqual([]);
 expect((await withTenant(runtime,ctx,db=>db.$client.query("SELECT app.recovery_case_terms_approved($1,$2,$3) ok",[b,bj,id]))).rows[0].ok).toBe(false);
 await expect(repo.approve(ctx,job,command(id),{membershipId:bm,identityUserId:bu})).rejects.toMatchObject({code:"RECOVERY_TERMS_CASE_NOT_FOUND"});
 await expect(repo.approve(context,job,command(id),{membershipId:bm,identityUserId:bu})).rejects.toMatchObject({code:"RECOVERY_TERMS_FORBIDDEN"});
 await expect(repo.approve(context,bj,command(id),actor)).rejects.toMatchObject({code:"RECOVERY_TERMS_CASE_NOT_FOUND"});expect(await counts()).toEqual(before);
 expect((await runtime.query("SELECT * FROM app.recovery_case_terms_approval")).rows).toEqual([]);
});
it("[T8] two approval audit events share transaction time and the chain verifies",async()=>{
 const id=await newCase(),input=command(id);await new RecoveryCaseTermsRepository(runtime).approve(context,job,input,actor);
 const times=(await admin.query(`SELECT e.event_type,e.occurred_at=a.approved_at same FROM app.audit_event e JOIN app.recovery_case_terms_approval a ON a.tenant_id=e.tenant_id AND a.command_id=$2 WHERE e.tenant_id=$1 AND e.payload->'references'->>'commandId'=$2::text`,[T,input.commandId])).rows;expect(times).toHaveLength(2);expect(times.every(r=>r.same)).toBe(true);
 const rows=(await admin.query(`SELECT id,tenant_id AS "tenantId",sequence::int,version,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,trim(payload_hash) AS "payloadHash",trim(previous_hash) AS "previousHash",trim(event_hash) AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`,[T])).rows;expect(()=>verifyAuditChain(rows)).not.toThrow();
});
it("[T9] actual catalog financial counts stay unchanged and terms authorization cannot execute another action",async()=>{
 const id=await newCase();const names=(await admin.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind='r' AND c.relname ~ '(fee|ledger|journal|obligation|settlement|collection|refund|landing|outbox|sink)' ORDER BY 1`)).rows.map(r=>r.relname as string);
 const snapshot=async()=>Object.fromEntries(await Promise.all(names.map(async name=>[name,(await admin.query(`SELECT count(*)::int n FROM app.${name} WHERE tenant_id=$1`,[T])).rows[0].n])));const before=await snapshot();const view=await new RecoveryCaseTermsRepository(runtime).approve(context,job,command(id),actor);expect(await snapshot()).toEqual(before);
 await expect(withTenant(runtime,context,db=>executeAuthorizedCommercialAction(db,view.authorizationId,{actionType:"another.action",recipient:null,contentHash:view.termsHash,aggregateRevision:1,amountPence:null,currency:null,policyVersion:"reference_fee_policy_v3",expiresAt:new Date("2099-01-01")},async()=>undefined))).rejects.toMatchObject({code:"AUTHORIZATION_INVALID"});
});
it("[T10] pinned time, immutable rows and narrow table grants",async()=>{
 const id=await newCase(),view=await new RecoveryCaseTermsRepository(runtime).approve(context,job,command(id),actor);
 for(const role of ["jobguard_runtime","jobguard_migration"]){const db=await admin.connect();try{for(const sql of ["UPDATE app.recovery_case_terms_approval SET approved_at='2000-01-01' WHERE tenant_id=$1 AND id=$2","DELETE FROM app.recovery_case_terms_approval WHERE tenant_id=$1 AND id=$2"]){await db.query("BEGIN");await db.query(`SET LOCAL ROLE ${role}`);await db.query("SELECT set_config('app.tenant_id',$1,true)",[T]);await expect(db.query(sql,[T,view.id])).rejects.toMatchObject({code:role==="jobguard_runtime"?"42501":"55000"});await db.query("ROLLBACK");}}finally{db.release();}}
 for(const role of ["jobguard_infrastructure","jobguard_identity"])for(const privilege of ["SELECT","INSERT","UPDATE","DELETE"])expect((await admin.query("SELECT has_table_privilege($1,'app.recovery_case_terms_approval',$2) ok",[role,privilege])).rows[0].ok).toBe(false);
 expect(await new RecoveryCaseTermsRepository(runtime).read(context,job,id)).toEqual(view);
 for(const supplied of ["2000-01-01T00:00:00Z","2099-01-01T00:00:00Z"]){const c=await newCase();await withTenant(admin,context,async db=>{const ids=await handMade(db.$client,c,M);await db.$client.query("SET LOCAL ROLE jobguard_migration");const result=await db.$client.query(`INSERT INTO app.recovery_case_terms_approval(id,tenant_id,job_id,case_id,terms_version,fee_policy_version,eligibility_policy_version,policy_status,environment,terms_hash,actor_membership_id,command_id,authorization_id,approved_at) VALUES($1,$2,$3,$4,'synthetic_recovery_fee_terms.v1','reference_fee_policy_v3','reference_recovery_eligibility_policy_v3','proposed','synthetic_demo',$5,$6,$7,$8,$9) RETURNING approved_at=transaction_timestamp() pinned`,[randomUUID(),T,job,c,recoveryCaseTermsHash(c),M,ids.c,ids.a,supplied]);expect(result.rows[0].pinned).toBe(true);});}
});
it("[T3] v1-bound job refuses terms (historical policy control)",async()=>{
 const j=randomUUID();await admin.query("INSERT INTO app.job(id,tenant_id,title,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence) VALUES($1,$2,'Historical v1 fixture','imported',100000,'reference_fee_policy_v1',1500)",[j,T]);const id=await newCase("withheld_customer_payment",j),before=await counts();await expect(new RecoveryCaseTermsRepository(runtime).approve(context,j,command(id),actor)).rejects.toMatchObject({code:"RECOVERY_TERMS_POLICY_MISMATCH"});expect(await counts()).toEqual(before);
});
it.each([{policy_status:"approved"},{environment:"production_billing"},{fee_policy_version:"reference_fee_policy_v1"},{terms_hash:"b".repeat(64)}])("[T3] migration owner cannot store non-reference terms %j",async over=>{
 const id=await newCase(),before=await counts();await expect(withTenant(admin,context,async db=>{const ids=await handMade(db.$client,id,M);await db.$client.query("SET LOCAL ROLE jobguard_migration");return db.$client.query(`INSERT INTO app.recovery_case_terms_approval(id,tenant_id,job_id,case_id,terms_version,fee_policy_version,eligibility_policy_version,policy_status,environment,terms_hash,actor_membership_id,command_id,authorization_id) VALUES($1,$2,$3,$4,'synthetic_recovery_fee_terms.v1',$5,'reference_recovery_eligibility_policy_v3',$6,$7,$8,$9,$10,$11)`,[randomUUID(),T,job,id,over.fee_policy_version??"reference_fee_policy_v3",over.policy_status??"proposed",over.environment??"synthetic_demo",over.terms_hash??recoveryCaseTermsHash(id),M,ids.c,ids.a]);})).rejects.toMatchObject({code:"23514"});expect(await counts()).toEqual(before);
});
it("[T7] even the migration owner cannot mislink tenant/job/case identity",async()=>{
 const id=await newCase();await expect(withTenant(admin,context,async db=>{const ids=await handMade(db.$client,id,M);await db.$client.query("SET LOCAL ROLE jobguard_migration");return db.$client.query(`INSERT INTO app.recovery_case_terms_approval(id,tenant_id,job_id,case_id,terms_version,fee_policy_version,eligibility_policy_version,policy_status,environment,terms_hash,actor_membership_id,command_id,authorization_id) VALUES($1,$2,$3,$4,'synthetic_recovery_fee_terms.v1','reference_fee_policy_v3','reference_recovery_eligibility_policy_v3','proposed','synthetic_demo',$5,$6,$7,$8)`,[randomUUID(),T,unbound,id,recoveryCaseTermsHash(id),M,ids.c,ids.a]);})).rejects.toMatchObject({code:"23503"});
});
it("[T10] routine timestamps are pinned inside PostgreSQL, never a supplied date",async()=>{
 const id=await newCase();await withTenant(runtime,context,async db=>{const ids=await handMade(db.$client,id,M);const r=await direct(db.$client,id,M,ids);expect((await db.$client.query("SELECT approved_at=transaction_timestamp() pinned FROM app.recovery_case_terms_approval WHERE tenant_id=$1 AND id=$2",[T,r.rows[0].id])).rows[0].pinned).toBe(true);});
});
it("[T9] terms authorization cannot approve a recovery message",async()=>{
 const id=await newCase();await attached(id);const terms=await new RecoveryCaseTermsRepository(runtime).approve(context,job,command(id),actor),repo=new RecoveryMessageRepository(runtime),v=(await preview(id)).latest!,queued=await repo.command(context,id,approveMessage(v),messageActor),before=await counts();
 await expect(withTenant(runtime,context,db=>db.$client.query("INSERT INTO app.recovery_message_approval(tenant_id,job_id,case_id,message_id,authorization_id,outbox_action_id,environment) VALUES($1,$2,$3,$4,$5,$6,'synthetic_demo')",[T,job,id,v.id,terms.authorizationId,queued.latest!.approval!.outboxActionId]))).rejects.toMatchObject({code:"23514",message:"RECOVERY_MESSAGE_AUTHORIZATION_INVALID"});expect(await counts()).toEqual(before);
});
