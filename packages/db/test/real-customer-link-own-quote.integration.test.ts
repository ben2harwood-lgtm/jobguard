import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { renderQuotePdf } from "@jobguard/core";
import { startBeforeMigration, applyMigration, type Cluster } from "./contractor-practice-session-fixtures.js";
import { migrate } from "../src/migrate.js";
import { customerSigninLink } from "../src/outbox.js";
import { startBlankPracticeCompany } from "../src/blank-practice-company.js";
import { authenticatePracticeSession } from "../src/practice-session.js";
import { CaptureApplication } from "../../../apps/api/src/capture/capture.application.js";
import { ShadowDemoGuideApplication } from "../../../apps/api/src/shadow-demo-guide.application.js";
import { ShadowDemoGuideRepository } from "../src/shadow-demo-guide-repository.js";
import { QuoteRepository } from "../src/quote-repository.js";
import { QuoteDeliveryRepository } from "../src/quote-delivery-repository.js";
import { IssueQuoteMutation } from "../src/quote-document-repository.js";
import { UserCommandDispatcher } from "../src/commands.js";
import { verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership } from "../src/tenant-context.js";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";

const own = "0733_real_customer_link_own_quote.sql";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const refused = { code: "42501", message: "CUSTOMER_REFUSED" };
let c: Cluster;
async function authority() {
 return (await c.admin.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,
  p.proowner::regrole::text owner,p.proacl::text,p.prosecdef,p.proconfig
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE (n.nspname='app' AND p.proname IN ('demo_issue_customer_link','customer_portal_current'))
   OR (n.nspname='identity' AND p.proname IN ('customer_portal_use','customer_portal_quote'))
  ORDER BY n.nspname,p.proname`)).rows;
}
beforeAll(async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 c = await startBeforeMigration(own);
 const before = await authority();
 await applyMigration(c, own); await migrate(c.admin); await migrate(c.admin);
 expect(await authority()).toEqual(before);
}, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

async function identity(sql: string, values: unknown[]) {
 const db = await c.admin.connect();
 try {
  await db.query("BEGIN"); await db.query("SET LOCAL statement_timeout='10s'");
  await db.query("SET LOCAL ROLE jobguard_identity");
  const result = await db.query(sql, values); await db.query("COMMIT"); return result;
 } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}
async function ready() {
 const session = await startBlankPracticeCompany(c.runtime, { version: "blank-practice-company.v1", action: "start" });
 const auth = await authenticatePracticeSession(c.runtime, session), t = auth.context.tenantId;
 const captured = await new CaptureApplication(c.runtime, session).capture({ contractVersion: "job_capture_v1", requested_tenant_id: t,
  captureId: randomUUID(), source: { kind: "text", text: "JOB: Fictional blue room\nITEM: Paint walls | £200.00" }, fixtureId: "deterministic-local-v1" });
 const j = captured.jobId, scope = captured.proposal.lines[0]!.scopeItemId, revision = randomUUID();
 const db = await c.admin.connect();
 try {
  await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [t]);
  await db.query("UPDATE app.job SET status='quoting',revision=greatest(revision,1) WHERE tenant_id=$1 AND id=$2", [t,j]);
  await db.query("UPDATE app.scope_identity SET state='confirmed' WHERE tenant_id=$1 AND id=$2", [t,scope]);
  await db.query("INSERT INTO app.scope_revision(tenant_id,id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Paint walls','1','item',20000,20000)", [t,revision,j,scope]);
  await seedSyntheticPartyFixture(db,t,j); await db.query("COMMIT");
 } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
 const party = (await c.admin.query("SELECT b.* FROM app.job_party_current pc JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(pc.tenant_id,pc.job_id,pc.binding_id) WHERE pc.tenant_id=$1 AND pc.job_id=$2", [t,j])).rows[0];
 const draftId = randomUUID(), quotes = new QuoteRepository(c.runtime);
 const lines = [{ id: randomUUID(), scopeItemId: scope, scopeRevisionId: revision, description: "Paint walls", origin: "captured", included: true, exclusionReason: null,
  quantity: "1", unit: "item", unitRatePence: 20000, discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: null, region: null }];
 const save = (expectedRevision: number) => quotes.saveDraft(auth.context, { jobId: j, draftId, expectedRevision, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1", lines, effectiveAt: new Date(), actorRef: auth.membershipId });
 await save(0);
 const delivery = new QuoteDeliveryRepository(c.runtime), p = await delivery.preview(auth.context,j,"practice-customer@example.invalid");
 await send(auth.context,auth.membershipId,t,j,p);
 return { session,auth,t,j,party,p,save,draftId,delivery };
}
async function send(context: Parameters<QuoteDeliveryRepository["preview"]>[0], actor: string, t: string, j: string, p: Awaited<ReturnType<QuoteDeliveryRepository["preview"]>>) {
 await new UserCommandDispatcher(c.runtime).dispatch(context, { version: "command.v1", commandId: randomUUID(), commandType: "quote.send", semanticKey: `quote-send:${p.documentId}`,
  actorMembershipId: actor, subjectType: "quote_document", subjectRef: p.documentId, authorizationId: randomUUID(), action: { actionType: "quote.send", recipient: JSON.stringify([p.document.customer.email]), contentHash: p.hash, aggregateRevision: p.document.documentVersion,
   amountPence: null, currency: null, policyVersion: "free-quote-send.v1", expiresAt: new Date(Date.now()+3600000) } },
  new IssueQuoteMutation({ tenantId: t, jobId: j, documentId: p.documentId, outboxActionId: randomUUID(), recipients: [p.document.customer.email], immutableContent: new TextDecoder().decode(renderQuotePdf(p.document)) }));
}
type World = Awaited<ReturnType<typeof ready>>;
const issue = (w: World) => new ShadowDemoGuideApplication(c.runtime,w.session,"synthetic_demo").issueCustomerLink(w.j,
 { version: "shadow-guide-customer-link.v1", customerId: w.party.customer_id, documentId: w.p.documentId }, hash);
function credential(path: string) {
 const [t,j,customer,token] = path.split("#")[1]!.split("/") as [string,string,string,string];
 return { t,j,customer,token,digest:hash(`customer-link:${token}`),sessionDigest:hash(randomUUID()) };
}
type Link = ReturnType<typeof credential>;
const use = (k: Link, operation = "redeem") => identity("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,$6) result", [k.t,k.j,k.customer,operation==="redeem"?k.digest:k.sessionDigest,k.sessionDigest,operation]);
const read = (k: Link) => identity("SELECT identity.customer_portal_quote($1,$2,$3,$4,$5::jsonb) result", [k.t,k.j,k.customer,k.sessionDigest,JSON.stringify({version:"customer-quote-read.v1",jobId:k.j})]);
async function acceptance(w: World) {
 return {version:"customer-quote-acceptance.v1",commandId:randomUUID(),jobId:w.j,
  expectedJobRevision:(await c.admin.query("SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2",[w.t,w.j])).rows[0].revision,
  target:{kind:"quote",id:w.p.documentId,revision:w.p.document.documentVersion,hash:w.p.hash}};
}
const accept = (k: Link, cmd: unknown) => identity("SELECT identity.customer_portal_quote($1,$2,$3,$4,$5::jsonb) result", [k.t,k.j,k.customer,k.sessionDigest,JSON.stringify(cmd)]);
async function noEffects(w: World) {
 for (const table of ["quote_acceptance","job_activation","journal"]) {
  expect((await c.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1${table==="journal"?"":" AND job_id=$2"}`,table==="journal"?[w.t]:[w.t,w.j])).rows[0].n).toBe(0);
 }
}
it("binds one-use redemption to the exact stored blank-firm quote and replays one acceptance/audit effect", async () => {
 const w = await ready(), issued = await issue(w), k = credential(issued.path);
 const grant = (await c.admin.query("SELECT * FROM app.customer_portal_grant WHERE tenant_id=$1 AND job_id=$2",[w.t,w.j])).rows[0];
 expect(grant.quote_document_id).toBe(w.p.documentId);
 expect(JSON.stringify(grant)).not.toContain(k.token);
 const delivery = (await c.admin.query("SELECT immutable_content FROM app.action_outbox WHERE tenant_id=$1 AND id=$2",[w.t,grant.outbox_id])).rows[0];
 expect(customerSigninLink(delivery.immutable_content,hash)).toBe(issued.path);
 await use(k); await expect(use(k)).rejects.toMatchObject(refused);
 const view = (await read(k)).rows[0].result;
 expect(view.quote).toMatchObject({id:w.p.documentId,hash:w.p.hash,document:w.p.document});
 const cmd = await acceptance(w), responses = await Promise.all([accept(k,cmd),accept(k,cmd)]);
 expect(responses[0].rows).toEqual(responses[1].rows);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.quote_acceptance WHERE tenant_id=$1 AND job_id=$2",[w.t,w.j])).rows[0].n).toBe(1);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='quote.acceptance.customer_authenticated' AND subject_ref=$2",[w.t,w.p.documentId])).rows[0].n).toBe(1);
 await expect(accept(k,{...cmd,commandId:randomUUID()})).rejects.toMatchObject(refused);
 for (const table of ["action_outbox","audit_event"]) {
  expect(JSON.stringify((await c.admin.query(`SELECT row_to_json(x) FROM app.${table} x WHERE tenant_id=$1`,[w.t])).rows)).not.toContain(k.token);
 }
});
it.each(["before redemption","after page loaded"])("refuses edited drafts %s without substituting the issued document", async when => {
 const w = await ready(), k = credential((await issue(w)).path), cmd = await acceptance(w);
 if (when==="after page loaded") { await use(k); expect((await read(k)).rows[0].result.quote.id).toBe(w.p.documentId); }
 await w.save(1);
 if (when==="before redemption") await expect(use(k)).rejects.toMatchObject(refused);
 else { await expect(read(k)).rejects.toMatchObject(refused); await expect(accept(k,cmd)).rejects.toMatchObject(refused); }
 await noEffects(w);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.customer_portal_grant WHERE tenant_id=$1 AND job_id=$2",[w.t,w.j])).rows[0].n).toBe(1);
});
it("a replacement issued document makes the old bound link refuse", async () => {
 const w = await ready(), k = credential((await issue(w)).path);
 const replacement = await w.delivery.preview(w.auth.context,w.j,"replacement@example.invalid");
 await send(w.auth.context,w.auth.membershipId,w.t,w.j,replacement);
 expect(replacement.documentId).not.toBe(w.p.documentId);
 await expect(use(k)).rejects.toMatchObject(refused); await noEffects(w);
});
it.each(["forged","party","other firm","expired","reset","revoked","rate"])("refuses %s with no commercial effects or additional grant", async attack => {
 const w = await ready(), k = credential((await issue(w)).path);
 if (attack==="forged") k.digest=hash("forged");
 if (attack==="party") k.customer=randomUUID();
 if (attack==="other firm") {
  const other = await ready();
  await expect(new ShadowDemoGuideRepository(c.runtime).issueCustomerLink(other.auth.context,w.j,w.party.customer_id,other.auth.digest,hash(randomUUID()),`customer-quote-signin-reference.v1:${other.t}/${w.j}/${w.party.customer_id}/${w.p.documentId}/${"a".repeat(43)}`)).rejects.toMatchObject({code:"42501"});
 } else if (attack==="expired") await c.admin.query("UPDATE app.customer_portal_grant SET issued_at=issued_at-interval '1 hour',expires_at=expires_at-interval '1 hour' WHERE tenant_id=$1 AND job_id=$2",[w.t,w.j]);
 else if (attack==="reset") await startBlankPracticeCompany(c.runtime,{version:"blank-practice-company.v1",action:"reset"},w.session);
 else if (attack==="revoked") await c.admin.query("UPDATE app.customer_portal_grant SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND job_id=$2",[w.t,w.j]);
 else if (attack==="rate") await expect(issue(w)).rejects.toMatchObject({message:"CUSTOMER_LINK_RATE_LIMITED"});
 if (!["other firm","rate"].includes(attack)) await expect(use(k)).rejects.toMatchObject(refused);
 await noEffects(w);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.customer_portal_grant WHERE tenant_id=$1 AND job_id=$2",[w.t,w.j])).rows[0].n).toBe(1);
});
it("an edited customer revision invalidates a loaded page and its acceptance", async () => {
 const w=await ready(),k=credential((await issue(w)).path),cmd=await acceptance(w); await use(k); await read(k);
 await c.admin.query("INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) SELECT tenant_id,$2,customer_id,revision+1,payload FROM app.customer_revision WHERE tenant_id=$1 AND id=$3",[w.t,randomUUID(),w.party.customer_revision_id]);
 await expect(read(k)).rejects.toMatchObject(refused); await expect(accept(k,cmd)).rejects.toMatchObject(refused); await noEffects(w);
});
it("redemption waits for a quote edit and rechecks the committed draft", async () => {
 const w=await ready(),k=credential((await issue(w)).path),db=await c.admin.connect();
 try {
  await db.query("BEGIN");
  await db.query("SELECT 1 FROM app.quote_draft WHERE tenant_id=$1 AND job_id=$2 FOR UPDATE",[w.t,w.j]);
  const pending=use(k).then(()=>"accepted",error=>(error as Error).message);
  // Observe an actual wait rather than depending on a timing-only sleep.
  await vi.waitFor(async()=>expect((await c.admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%identity.customer_portal_use%' AND pid<>pg_backend_pid() AND state='active'")).rows[0].n).toBeGreaterThan(0));
  await db.query("UPDATE app.quote_draft SET current_revision_id=NULL WHERE tenant_id=$1 AND job_id=$2",[w.t,w.j]);
  await db.query("COMMIT"); expect(await pending).toBe("CUSTOMER_REFUSED");
 } finally { await db.query("ROLLBACK"); db.release(); }
 await noEffects(w);
});
it("keeps FORCE RLS and runtime grants unchanged and enforces the tenant/job document FK", async () => {
 expect((await c.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.customer_portal_grant'::regclass")).rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true});
 for (const role of ["jobguard_runtime","jobguard_identity","jobguard_infrastructure"]) {
  expect((await c.admin.query("SELECT has_table_privilege($1,'app.customer_portal_grant','SELECT,INSERT,UPDATE,DELETE') allowed",[role])).rows[0].allowed).toBe(false);
 }
 const w=await ready(),other=await ready(); await issue(w);
 await expect(c.admin.query("UPDATE app.customer_portal_grant SET quote_document_id=$3 WHERE tenant_id=$1 AND job_id=$2",[w.t,w.j,other.p.documentId])).rejects.toMatchObject({code:"23503"});
});
it("redemption rechecks practice revocation after waiting for a reset", async () => {
 const w=await ready(),k=credential((await issue(w)).path),db=await c.admin.connect();
 try {
  await db.query("BEGIN");
  await db.query("SELECT 1 FROM control_plane.practice_session WHERE token_digest=$1 FOR UPDATE",[w.auth.digest]);
  const pending=use(k).then(()=>"accepted",error=>(error as Error).message);
  await vi.waitFor(async()=>expect((await c.admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%identity.customer_portal_use%' AND pid<>pg_backend_pid() AND state='active'")).rows[0].n).toBeGreaterThan(0));
  await db.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[w.auth.digest]);
  await db.query("COMMIT"); expect(await pending).toBe("CUSTOMER_REFUSED");
 } finally { await db.query("ROLLBACK"); db.release(); }
 await noEffects(w);
});
it("legacy unbound sessions still read the issued quote", async () => {
 const principal = { tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() };
 const t=principal.tenantId,j=randomUUID(),account=randomUUID(),builder=randomBytes(32).toString("hex");
 await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[t]);
 await c.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[principal.identityUserId]);
 await c.admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional company')",[t,account]);
 await c.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[t,principal.membershipId,account,principal.identityUserId]);
 await c.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)",[principal.identityUserId,t,principal.membershipId]);
 await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)",[`${principal.identityUserId}@fictional.invalid`,principal.identityUserId]);
 await c.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')",[randomUUID(),principal.identityUserId,builder]);
 const context=verifiedTenantContextFromMembership(principal as AuthenticatedMembership,{kind:"real",credential:builder});
 const scope=randomUUID(),revision=randomUUID();
 await c.admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional profile quote','quoting')",[t,j]);
 await withTenant(c.runtime,context,async db=>{
  await db.$client.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')",[t,scope,j]);
  await db.$client.query("INSERT INTO app.scope_revision(tenant_id,id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional cabinet','1','item',20000,20000)",[t,revision,j,scope]);
 });
 await new QuoteRepository(c.runtime).saveDraft(context,{jobId:j,draftId:randomUUID(),expectedRevision:0,currency:"GBP",taxPolicyVersion:"candidate_m1_standard_v1",effectiveAt:new Date(),actorRef:principal.membershipId,
  lines:[{id:randomUUID(),scopeItemId:scope,scopeRevisionId:revision,description:"Fictional cabinet",origin:"captured",included:true,exclusionReason:null,quantity:"1",unit:"item",unitRatePence:20000,discountPercent:"0",taxTreatment:"standard_rate_20",rateProvenance:"entered",category:null,region:null}]});
 const delivery=new QuoteDeliveryRepository(c.runtime),p=await delivery.preview(context,j,"practice-customer@example.invalid");
 await send(context,principal.membershipId,t,j,p);
 const bytes=await delivery.pdf(context,j,p.documentId);
 const customer=(await c.admin.query("SELECT b.customer_id FROM app.job_party_current pc JOIN app.job_party_binding b ON(b.tenant_id,b.id)=(pc.tenant_id,pc.binding_id) WHERE pc.tenant_id=$1 AND pc.job_id=$2",[t,j])).rows[0].customer_id;
 const token=randomBytes(32).toString("base64url"),k=credential(`/customer/sign-in#${t}/${j}/${customer}/${token}`);
 await identity("SELECT identity.customer_portal_issue($1,$2,$3,$4,$5,$6)",[t,builder,j,customer,k.digest,`customer-signin-reference.v1:${t}/${j}/${customer}/${randomBytes(32).toString("base64url")}`]);
 await use(k);
 expect((await read(k)).rows[0].result.quote.document.issuer).toEqual(p.document.issuer);
 expect(await delivery.pdf(context,j,p.documentId)).toEqual(bytes);
});
it("fresh migration preserves the prepared post-lock issuer, legacy grants and one-use customer sessions", async () => {
 const {createFinalCheckFixture,closeFinalCheckFixture}=await import("./final-check-fixture.js");
 const {guideFixture}=await import("./shadow-demo-guide-fixture.js");
 const fresh=await createFinalCheckFixture();
 try {
  const locked=await guideFixture(fresh).locked();
  const issued=await new ShadowDemoGuideApplication(fresh.runtime,locked.sessionId,"synthetic_demo").issueCustomerLink(locked.jobId,{version:"shadow-guide-customer-link.v1",customerId:locked.customer},hash);
  const k=credential(issued.path);
  const grant=(await fresh.admin.query("SELECT * FROM app.customer_portal_grant WHERE tenant_id=$1 AND job_id=$2",[k.t,k.j])).rows[0];
  expect(grant.quote_document_id).toBeNull();
  await fresh.admin.query("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,'redeem')",[k.t,k.j,k.customer,k.digest,k.sessionDigest]);
  await expect(fresh.admin.query("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,'redeem')",[k.t,k.j,k.customer,k.digest,k.sessionDigest])).rejects.toMatchObject(refused);
  await fresh.admin.query("SELECT identity.customer_portal_use($1,$2,$3,$4,NULL,'resolve')",[k.t,k.j,k.customer,k.sessionDigest]);
  expect(fresh.logs.join("\n")).not.toContain(k.token);
 } finally { await closeFinalCheckFixture(fresh); }
},240_000);
