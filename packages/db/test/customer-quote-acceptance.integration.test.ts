import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration, type Cluster } from "./contractor-practice-session-fixtures.js";
import { migrate } from "../src/migrate.js";
import { snapshot } from "./contractor-entitlement-fixtures.js";
import { QuoteRepository, QuoteDeliveryRepository, QuoteAcceptanceRepository } from "../src/index.js";
import { UserCommandDispatcher } from "../src/commands.js";
import { IssueQuoteMutation } from "../src/quote-document-repository.js";
import { renderQuotePdf } from "@jobguard/core";
import { testTenantContext } from "./tenant-context-test-utils.js";
const own = "0388_customer_quote_acceptance.sql";
const hmac = (v: string) => createHmac("sha256", "fictional-customer-secret-at-least-32-bytes").update(v).digest("hex");
let c: Cluster;
beforeAll(async()=>{c=await startBeforeMigration(own); const before=await snapshot(c.admin);await applyMigration(c,own);expect(await snapshot(c.admin)).toEqual({...before,"app.customer_quote_approval":[]});await migrate(c.admin);await migrate(c.admin);expect(await snapshot(c.admin)).toEqual({...before,"app.customer_quote_approval":[]});},120000);
afterAll(async()=>{await c?.close();});
async function identityQuery(sql: string, args: unknown[]) {
  const db = await c.admin.connect();
  try { await db.query("BEGIN"); await db.query("SET LOCAL ROLE jobguard_identity"); const result = await db.query(sql, args); await db.query("COMMIT"); return result; }
  catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}
async function world(role = "owner") {
  const tenant = randomUUID(), account = randomUUID(), member = randomUUID(), user = randomUUID(), job = randomUUID(), session = randomUUID(), token = randomBytes(32).toString("base64url"), digest = hmac(token);
  await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await c.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${user}@fixture.invalid`, user]);
  await c.admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional builder')", [tenant, account]);
  await c.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,$5)", [tenant, member, account, user, role]);
  await c.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user, tenant, member]);
  await c.admin.query("INSERT INTO identity.session(id,user_id,token_digest,csrf_token,expires_at,environment) VALUES($1,$2,$3,'fictional-csrf-token',clock_timestamp()+interval '1 hour','synthetic_demo')", [session, user, digest]);
  await c.admin.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'Fictional portal job')", [tenant, job]);
  const party = (await c.admin.query("SELECT b.* FROM app.job_party_current pc JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(pc.tenant_id,pc.job_id,pc.binding_id) WHERE pc.tenant_id=$1 AND pc.job_id=$2", [tenant, job])).rows[0]!;
  return { tenant, account, member, job, customer: party.customer_id as string, revision: party.customer_revision_id as string, binding: party.id as string, digest, token };
}
type World = Awaited<ReturnType<typeof world>>;
async function issue(w: World) {
  const token = randomBytes(32).toString("base64url"), digest = hmac(`customer-link:${token}`), path = `/customer/sign-in#${w.tenant}/${w.job}/${w.customer}/${token}`;
  const grant = (await identityQuery("SELECT identity.customer_portal_issue($1,$2,$3,$4,$5,$6) id", [w.tenant, w.digest, w.job, w.customer, digest, path])).rows[0].id as string;
  return { grant, digest, path, sessionDigest: hmac(randomUUID()) };
}
const use = (w: World, k: Awaited<ReturnType<typeof issue>>, operation = "redeem", changes: Partial<World> = {}) => {
  const x = { ...w, ...changes };
  return identityQuery("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,$6) result", [x.tenant, x.job, x.customer, operation === "redeem" ? k.digest : k.sessionDigest, k.sessionDigest, operation]);
};

const refused={code:"42501",message:"CUSTOMER_REFUSED"};
async function ready(existing?: World) {
 const w=existing??await world(),context=testTenantContext(w.tenant),scope=randomUUID(),revision=randomUUID();
 await c.admin.query("UPDATE app.job SET status='quoting',revision=1 WHERE tenant_id=$1 AND id=$2",[w.tenant,w.job]);
 await c.admin.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')",[w.tenant,scope,w.job]);
 await c.admin.query("INSERT INTO app.scope_revision(tenant_id,id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional work','1','item',10000,10000)",[w.tenant,revision,w.job,scope]);
 await new QuoteRepository(c.admin).saveDraft(context,{jobId:w.job,draftId:randomUUID(),expectedRevision:0,currency:"GBP",taxPolicyVersion:"candidate_m1_standard_v1",blockingQuestions:[],effectiveAt:new Date(),actorRef:w.member,lines:[{id:randomUUID(),scopeItemId:scope,scopeRevisionId:revision,description:"Fictional work",origin:"captured",included:true,exclusionReason:null,quantity:"1",unit:"item",unitRatePence:10000,discountPercent:"0",taxTreatment:"standard_rate_20",rateProvenance:"entered",category:"Work",region:null}]});
 const delivery=new QuoteDeliveryRepository(c.admin),p=await delivery.preview(context,w.job,"practice-customer@example.invalid");
 const outboxActionId=randomUUID();
 await new UserCommandDispatcher(c.admin).dispatch(context,{version:"command.v1",commandId:randomUUID(),commandType:"quote.send",semanticKey:`quote-send:${p.documentId}`,actorMembershipId:w.member,subjectType:"quote_document",subjectRef:p.documentId,authorizationId:randomUUID(),action:{actionType:"quote.send",recipient:JSON.stringify(["practice-customer@example.invalid"]),contentHash:p.hash,aggregateRevision:p.document.documentVersion,amountPence:null,currency:null,policyVersion:"free-quote-send.v1",expiresAt:new Date(Date.now()+3600000)}},new IssueQuoteMutation({tenantId:w.tenant,jobId:w.job,documentId:p.documentId,outboxActionId,recipients:["practice-customer@example.invalid"],immutableContent:new TextDecoder().decode(renderQuotePdf(p.document))}));
 const k=await issue(w);
 await use(w,k);
 const job=(await c.admin.query("SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2",[w.tenant,w.job])).rows[0];
 const cmd={version:"customer-quote-acceptance.v1",commandId:randomUUID(),jobId:w.job,expectedJobRevision:job.revision,target:{kind:"quote",id:p.documentId,revision:p.document.documentVersion,hash:p.hash}};
 return {w,k,cmd,context};
}
type Ready=Awaited<ReturnType<typeof ready>>;
const quote=(f:Ready,cmd:unknown=f.cmd,w=f.w,digest=f.k.sessionDigest)=>identityQuery("SELECT identity.customer_portal_quote($1,$2,$3,$4,$5::jsonb) result",[w.tenant,w.job,w.customer,digest,JSON.stringify(cmd)]);
it("concurrent replay creates one immutable customer acceptance, one event and one audit; downstream reads the customer actor",async()=>{
 const f=await ready();
 const read=(await quote(f,{version:"customer-quote-read.v1",jobId:f.w.job})).rows[0].result;
 expect(read.quote).toMatchObject({id:f.cmd.target.id,revision:f.cmd.target.revision,hash:f.cmd.target.hash});
 const results=await Promise.all([quote(f),quote(f)]);expect(results[0].rows).toEqual(results[1].rows);
 const acceptance=(await c.admin.query("SELECT * FROM app.quote_acceptance WHERE tenant_id=$1 AND job_id=$2",[f.w.tenant,f.w.job])).rows;
 expect(acceptance).toHaveLength(1);expect(acceptance[0]).toMatchObject({acceptance_kind:"customer_authenticated",actor_membership_id:null,document_hash:f.cmd.target.hash,accepted_total_pence:"12000"});
 expect((await c.admin.query("SELECT count(*)::int n FROM app.acceptance_event WHERE tenant_id=$1 AND job_id=$2",[f.w.tenant,f.w.job])).rows[0].n).toBe(1);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='quote.acceptance.customer_authenticated'",[f.w.tenant])).rows[0].n).toBe(1);
 expect((await new QuoteAcceptanceRepository(c.admin).view(f.context,f.w.job)).activeAcceptance?.actor).toBe("Customer (authenticated)");
 const audit=JSON.stringify((await c.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='quote.acceptance.customer_authenticated'",[f.w.tenant])).rows);expect(audit).not.toMatch(/@|token|Fictional|practice-customer/);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.journal WHERE tenant_id=$1",[f.w.tenant])).rows[0].n).toBe(0);
});
it.each(["stale","hash","document_revision","another_quote","tenant","job","customer","forged","expired","closed","revoked","superseded","party"])("refuses %s without an approval",async kind=>{
 const f=await ready();let w=f.w,digest=f.k.sessionDigest;const cmd=structuredClone(f.cmd);
 if(kind==="stale")cmd.expectedJobRevision++;
 if(kind==="hash")cmd.target.hash="0".repeat(64);
 if(kind==="document_revision")cmd.target.revision++;
 if(kind==="another_quote")cmd.target=(await ready()).cmd.target;
 if(kind==="tenant")w={...w,tenant:randomUUID()};
 if(kind==="job")w={...w,job:randomUUID()};
 if(kind==="customer")w={...w,customer:randomUUID()};
 if(kind==="forged")digest=hmac("forged");
 if(kind==="expired")await c.admin.query("UPDATE app.customer_portal_session SET issued_at=issued_at-interval '2 hours',expires_at=expires_at-interval '2 hours' WHERE tenant_id=$1",[w.tenant]);
 if(kind==="closed")await use(w,f.k,"signout");
 if(kind==="revoked")await identityQuery("SELECT identity.customer_portal_revoke($1,$2,$3,$4)",[w.tenant,w.digest,w.job,f.k.grant]);
 if(kind==="party")await c.admin.query("INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) SELECT tenant_id,$2,customer_id,revision+1,payload FROM app.customer_revision WHERE tenant_id=$1 AND id=$3",[w.tenant,randomUUID(),w.revision]);
 if(kind==="superseded")await c.admin.query("INSERT INTO app.acceptance_event(id,tenant_id,job_id,document_id,document_version,document_hash,kind,actor_membership_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6,'superseded',$7,clock_timestamp())",[randomUUID(),w.tenant,w.job,cmd.target.id,cmd.target.revision,cmd.target.hash,w.member]);
 await expect(quote(f,cmd,w,digest)).rejects.toMatchObject(refused);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.quote_acceptance WHERE tenant_id=$1 AND job_id=$2",[f.w.tenant,f.w.job])).rows[0].n).toBe(0);
});
it("changed-payload replay refuses, and signout refuses even an exact replay",async()=>{
 const f=await ready();await quote(f);await expect(quote(f,{...f.cmd,target:{...f.cmd.target,hash:"0".repeat(64)}})).rejects.toMatchObject(refused);
 await use(f.w,f.k,"signout");await expect(quote(f)).rejects.toMatchObject(refused);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.customer_quote_approval WHERE tenant_id=$1",[f.w.tenant])).rows[0].n).toBe(1);
});
it("only the checked identity routine has access; runtime cannot forge acceptance or read portal provenance",async()=>{
 const f=await ready();await quote(f);
 for(const role of ["jobguard_runtime","jobguard_identity","jobguard_infrastructure"])expect((await c.admin.query("SELECT has_table_privilege($1,'app.customer_quote_approval','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed",[role])).rows[0].allowed).toBe(false);
 const keys=(await c.admin.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='app.customer_quote_approval'::regclass AND contype='f'")).rows.map(r=>r.definition);
 expect(keys).toContain("FOREIGN KEY (tenant_id, job_id, customer_id, session_id) REFERENCES app.customer_portal_session(tenant_id, job_id, customer_id, id)");
 const r=(await c.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid='app.customer_quote_approval'::regclass")).rows[0];expect(r).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:"jobguard_migration"});
 for(const role of ["jobguard_runtime","jobguard_infrastructure"])expect((await c.admin.query("SELECT has_function_privilege($1,'identity.customer_portal_quote(uuid,uuid,uuid,text,jsonb)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
 await expect(c.admin.query("UPDATE app.customer_quote_approval SET result='{}' WHERE tenant_id=$1",[f.w.tenant])).rejects.toThrow();
});
it("a new working quote revision invalidates the old issued quote even when the job revision is unchanged",async()=>{
 const f=await ready(),repo=new QuoteRepository(c.admin),v=await repo.readWorkspace(f.context,f.w.job);
 await repo.saveDraft(f.context,{jobId:f.w.job,draftId:v.draft!.id,expectedRevision:v.draft!.revision,currency:"GBP",taxPolicyVersion:"candidate_m1_standard_v1",effectiveAt:new Date(),actorRef:f.w.member,lines:v.revisions.at(-1)!.lines});
 await expect(quote(f)).rejects.toMatchObject(refused);
 expect((await quote(f,{version:"customer-quote-read.v1",jobId:f.w.job})).rows[0].result.quote).toBeNull();
});
it("a fresh command cannot duplicate an existing active acceptance",async()=>{
 const f=await ready();await quote(f);await expect(quote(f,{...f.cmd,commandId:randomUUID()})).rejects.toMatchObject(refused);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.quote_acceptance WHERE tenant_id=$1 AND job_id=$2",[f.w.tenant,f.w.job])).rows[0].n).toBe(1);
});
it("cancellation permits a fresh exact acceptance and preserves sequence/lineage; an old replay never recreates it",async()=>{
 const f=await ready(),first=(await quote(f)).rows[0].result;
 const {RecordQuoteDispositionMutation}=await import("../src/acceptance-repository.js");
 const input={version:"quote-disposition.v1",eventId:randomUUID(),jobId:f.w.job,documentId:f.cmd.target.id,documentVersion:f.cmd.target.revision,documentHash:f.cmd.target.hash,expectedJobRevision:f.cmd.expectedJobRevision+1,kind:"acceptance_cancelled",occurredAt:new Date().toISOString()};
 await new UserCommandDispatcher(c.admin).dispatch(f.context,{version:"command.v1",commandId:randomUUID(),commandType:"quote.acceptance_cancelled",semanticKey:`cancel:${first.acceptanceId}`,actorMembershipId:f.w.member,subjectType:"quote_document",subjectRef:f.cmd.target.id,action:{actionType:"quote.acceptance_cancelled",recipient:null,contentHash:f.cmd.target.hash,aggregateRevision:f.cmd.target.revision,amountPence:null,currency:null,policyVersion:"quote-disposition.v1",expiresAt:new Date(Date.now()+3600000)}},new RecordQuoteDispositionMutation(f.w.tenant,input));
 expect((await quote(f)).rows[0].result).toEqual(first);
 const second=(await quote(f,{...f.cmd,commandId:randomUUID(),expectedJobRevision:f.cmd.expectedJobRevision+2})).rows[0].result;
 expect(second.acceptanceId).not.toBe(first.acceptanceId);
 const sequences=(await c.admin.query("SELECT acceptance_sequence,replaces_acceptance_id FROM app.quote_acceptance_sequence WHERE tenant_id=$1 AND job_id=$2 ORDER BY acceptance_sequence",[f.w.tenant,f.w.job])).rows;
 expect(sequences).toEqual([{acceptance_sequence:1,replaces_acceptance_id:null},{acceptance_sequence:2,replaces_acceptance_id:first.acceptanceId}]);
});
it("database rollback removes the customer approval, accepted state, sequence and audit together",async()=>{
 const f=await ready(),before=await snapshot(c.admin),db=await c.admin.connect();
 try {await db.query("BEGIN");await db.query("SET LOCAL ROLE jobguard_identity");await db.query("SELECT identity.customer_portal_quote($1,$2,$3,$4,$5::jsonb)",[f.w.tenant,f.w.job,f.w.customer,f.k.sessionDigest,JSON.stringify(f.cmd)]);await db.query("ROLLBACK");}
 finally{await db.query("ROLLBACK");db.release();}
 expect(await snapshot(c.admin)).toEqual(before);
});
it.each(["extra","nullRevision","nullJobRevision","extraTarget"])("direct SQL refuses malformed %s intent",async kind=>{
 const f=await ready();const cmd=kind==="extra"?{...f.cmd,tenantId:f.w.tenant}:kind==="nullRevision"?{...f.cmd,target:{...f.cmd.target,revision:null}}:kind==="nullJobRevision"?{...f.cmd,expectedJobRevision:null}:{...f.cmd,target:{...f.cmd.target,amount:0}};
 await expect(quote(f,cmd)).rejects.toMatchObject(refused);
});

it("a real quote from another job in the same tenant cannot be accepted through this job's session",async()=>{
 const f=await ready(),job=randomUUID();await c.admin.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'Other fictional job')",[f.w.tenant,job]);
 const party=(await c.admin.query("SELECT b.* FROM app.job_party_current pc JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(pc.tenant_id,pc.job_id,pc.binding_id) WHERE pc.tenant_id=$1 AND pc.job_id=$2",[f.w.tenant,job])).rows[0];
 const other=await ready({...f.w,job,customer:party.customer_id,revision:party.customer_revision_id,binding:party.id});
 await expect(quote(f,{...f.cmd,target:other.cmd.target})).rejects.toMatchObject(refused);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.quote_acceptance WHERE tenant_id=$1",[f.w.tenant])).rows[0].n).toBe(0);
});
