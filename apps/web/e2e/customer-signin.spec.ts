import type { OutboundAdapter } from "@jobguard/db";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { E2E_RUNTIME_URL, E2E_AUTH_CODE_SECRET } from "./global-setup";
import { createHmac, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test, type Page } from "@playwright/test";
const api = (page: Page, action: string, body: unknown, csrf?: string) => page.evaluate(async ({ action, body, csrf }) => {
 const response = await fetch(`/api/customer-portal/${action}`, { method: "POST", headers: { "Content-Type": "application/json", ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: JSON.stringify(body) });
 return { status: response.status, body: await response.json() };
}, { action, body, csrf });
/** Owner-connected, fictional CI fixture. No product endpoint can create these rows directly. */
async function seedJob(admin: Pool, tenant: string) {
 const job = randomUUID(), customer = randomUUID(), cr = randomUUID(), site = randomUUID(), sr = randomUUID(), binding = randomUUID();
 const db = await admin.connect();
 try {
  await db.query("BEGIN"); await db.query("SET LOCAL session_replication_role='replica'"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
  await db.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional customer job','live')", [tenant, job]);
  await db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')",[tenant,job]);
  await db.query("INSERT INTO app.customer(tenant_id,id) VALUES($1,$2)", [tenant, customer]);
  await db.query("INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) VALUES($1,$2,$3,1,$4)", [tenant, cr, customer, { version: "customer.v1", name: "Fictional customer", type: "person", email: "portal@example.invalid" }]);
  await db.query("INSERT INTO app.site(tenant_id,id) VALUES($1,$2)", [tenant, site]);
  await db.query("INSERT INTO app.site_revision(tenant_id,id,site_id,revision,payload,match_key) VALUES($1,$2,$3,1,$4,'[]')", [tenant, sr, site, { version: "site.v1", addressLines: ["1 Fictional Road"], town: "London", postcode: "SW1A 1AA" }]);
  await db.query("INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance) VALUES($1,$2,$3,0,$4,$5,$4,$5,$6,$7,'backfilled_synthetic_fixture')", [tenant, binding, job, customer, cr, site, sr]);
  await db.query("INSERT INTO app.job_party_current(tenant_id,job_id,binding_id) VALUES($1,$2,$3)", [tenant, job, binding]);
  await db.query("COMMIT"); return { job, customer };
 } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}
/** Uses the existing domain/command writers to make a synthetic issued quote, never a provider. */
async function seedQuote(admin: Pool, tenant: string, job: string, member: string, user: string) {
 const nativeImport=new Function("specifier","return import(specifier)") as (specifier:string)=>Promise<any>;
 const db=await nativeImport("@jobguard/db") as typeof import("@jobguard/db");
 const core=await nativeImport("@jobguard/core") as typeof import("@jobguard/core");
 const context=db.verifiedTenantContextFromMembership({identityUserId:user,tenantId:tenant,membershipId:member} as Parameters<typeof db.verifiedTenantContextFromMembership>[0]);
 const scope=randomUUID(),revision=randomUUID();
 await admin.query("UPDATE app.job SET status='quoting',revision=1 WHERE tenant_id=$1 AND id=$2",[tenant,job]);
 await admin.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')",[tenant,scope,job]);
 await admin.query("INSERT INTO app.scope_revision(tenant_id,id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional work','1','item',10000,10000)",[tenant,revision,job,scope]);
 await new db.QuoteRepository(admin).saveDraft(context,{jobId:job,draftId:randomUUID(),expectedRevision:0,currency:"GBP",taxPolicyVersion:"candidate_m1_standard_v1",blockingQuestions:[],effectiveAt:new Date(),actorRef:member,lines:[{id:randomUUID(),scopeItemId:scope,scopeRevisionId:revision,description:"Fictional work",origin:"captured",included:true,exclusionReason:null,quantity:"1",unit:"item",unitRatePence:10000,discountPercent:"0",taxTreatment:"standard_rate_20",rateProvenance:"entered",category:"Work",region:null}]});
 const preview=await new db.QuoteDeliveryRepository(admin).preview(context,job,"portal@example.invalid");
 await new db.UserCommandDispatcher(admin).dispatch(context,{version:"command.v1",commandId:randomUUID(),commandType:"quote.send",semanticKey:`quote-send:${preview.documentId}`,actorMembershipId:member,subjectType:"quote_document",subjectRef:preview.documentId,authorizationId:randomUUID(),action:{actionType:"quote.send",recipient:JSON.stringify(["portal@example.invalid"]),contentHash:preview.hash,aggregateRevision:preview.document.documentVersion,amountPence:null,currency:null,policyVersion:"free-quote-send.v1",expiresAt:new Date(Date.now()+3600000)}},new db.IssueQuoteMutation({tenantId:tenant,jobId:job,documentId:preview.documentId,outboxActionId:randomUUID(),recipients:["portal@example.invalid"],immutableContent:new TextDecoder().decode(core.renderQuotePdf(preview.document))}));
}
test("emailed fictional link signs into exactly one job with a browser-session cookie, rejects replay and signs out", async ({ page, browser, baseURL }) => {
 const nativeImport = new Function("specifier", "return import(specifier)") as (specifier:string) => Promise<typeof import("@jobguard/db")>;
 const { customerSigninLink, ActionExecutor, verifiedTenantContextForQueuedJob } = await nativeImport(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
 const admin = new Pool({ connectionString: process.env.E2E_ADMIN_DATABASE_URL });
 const runtime = new Pool({ connectionString: E2E_RUNTIME_URL });
 const customerContext = await browser.newContext();
 try {
  await page.goto("/sign-in");
  await page.getByRole("main").getByLabel("Fictional email address").fill(`portal-builder-${randomUUID()}@practice.invalid`);
  await page.getByRole("main").getByRole("button", { name: "Request code", exact: true }).click();
  const code = await page.getByRole("main").getByTestId("fixture-code").textContent();
  await page.getByRole("main").getByLabel("Eight-digit code").fill(code!); await page.getByRole("main").getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("main").getByRole("heading", { name: "Signed in", exact: true })).toBeVisible();
  const session = await page.evaluate(async () => (await fetch("/api/auth/session")).json());
  const tenant = session.memberships[0].tenantId as string, fixture = await seedJob(admin, tenant);
  await seedQuote(admin,tenant,fixture.job,session.memberships[0].id,session.principal.id);
  // Synthetic owner fixture: an existing verified stage, never a portal-created completion.
  const scope = randomUUID(), evidence = randomUUID(), evidenceLink = randomUUID(), completion = randomUUID(), objectVersion = randomUUID();
  const stageDb = await admin.connect();
  try {
   await stageDb.query("BEGIN"); await stageDb.query("SET LOCAL session_replication_role='replica'"); await stageDb.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
  await stageDb.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')", [tenant,scope,fixture.job]);
  await stageDb.query(`INSERT INTO app.evidence_upload(tenant_id,id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_received_at,server_verified_at)
    VALUES($1,$2::uuid,$3,$4,$2::text,$5,'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day','verified',$6,clock_timestamp(),clock_timestamp())`, [tenant,evidence,fixture.job,scope,"a".repeat(64),objectVersion]);
  await stageDb.query(`INSERT INTO app.evidence_object(tenant_id,id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
    VALUES($1,$2::uuid,$2::uuid,$3,$4,'original','pre_cover_photo',$2::text,$5,$6,80,'image/png','standard_evidence',clock_timestamp(),clock_timestamp())`, [tenant,evidence,fixture.job,scope,objectVersion,"a".repeat(64)]);
  await stageDb.query("INSERT INTO app.evidence_link(tenant_id,id,evidence_id,job_id,scope_item_id,required_evidence_type) VALUES($1,$2,$3,$4,$5,'pre_cover_photo')", [tenant,evidenceLink,evidence,fixture.job,scope]);
  await stageDb.query("INSERT INTO app.stage_completion(tenant_id,id,job_id,scope_item_id,stage,evidence_link_id,command_id) VALUES($1,$2,$3,$4,'Fictional pre-cover stage',$5,$6)", [tenant,completion,fixture.job,scope,evidenceLink,randomUUID()]);
   await stageDb.query("COMMIT");
  } catch(error) { await stageDb.query("ROLLBACK"); throw error; } finally { stageDb.release(); }
  const issued = await api(page, "issue", { version: "customer-link-issue.v1", tenantId: tenant, jobId: fixture.job, customerId: fixture.customer }, session.csrfToken);
  expect(issued.status).toBe(200);
  const outbox = (await admin.query("SELECT o.id,o.immutable_content,o.adapter,o.recipient FROM app.customer_portal_grant g JOIN app.action_outbox o ON(o.tenant_id,o.id)=(g.tenant_id,g.outbox_id) WHERE g.tenant_id=$1 AND g.id=$2", [tenant, issued.body.grantId])).rows[0];
  expect(outbox).toMatchObject({ adapter: "fake_email", recipient: "portal@example.invalid" });
  const digest = (value:string) => createHmac("sha256",E2E_AUTH_CODE_SECRET).update(value).digest("hex");
  let deliveredLink = "", deliveries = 0;
  const adapter:OutboundAdapter = {name:"fake_email",supportsProviderDeduplication:false,deliver:async (_action,link)=>{deliveredLink=link!;deliveries++;return {kind:"succeeded",providerReference:"fictional-portal-email"};},reconcile:async()=>"unknown"};
  const context = verifiedTenantContextForQueuedJob(tenant);
  const executor = new ActionExecutor(runtime,new Map([[adapter.name,adapter]]),{emit:()=>undefined},digest);
  await executor.execute(context,outbox.id);await executor.execute(context,outbox.id);
  expect(deliveries).toBe(1);expect(deliveredLink).toBe(customerSigninLink(outbox.immutable_content,digest));
  expect(outbox.immutable_content).not.toContain(deliveredLink.split("/").at(-1)!);
  const tab = await customerContext.newPage(); await tab.goto(`${baseURL}${deliveredLink}`);
  await expect(tab.getByRole("main").getByRole("button", { name: "Sign in", exact: true })).toBeVisible(); expect(tab.url()).not.toContain("#");
  await tab.getByRole("main").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(tab.getByRole("main").getByText("You are signed in to this job.", { exact: true })).toBeVisible();
  const cookie = (await customerContext.cookies()).find(c => c.name === "jobguard_customer")!;
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", expires: -1 });
  expect((await api(tab, "read", { version: "customer-read.v1", jobId: fixture.job })).status).toBe(200);
  expect((await api(tab, "read", { version: "customer-read.v1", jobId: randomUUID() })).status).toBe(401);
  expect(await tab.evaluate(async () => (await fetch("/api/jobs")).status)).toBe(401);
  const [tenantId, jobId, customerId, token] = deliveredLink.split("#")[1]!.split("/");
  expect((await api(tab, "signin", { version: "customer-signin.v1", tenantId, jobId, customerId, token })).status).toBe(401);
  const stageLink = await tab.getByRole("link", {name:"Review recorded stages"}).getAttribute("href");
  expect(stageLink).toBe(`/customer/jobs/${fixture.job}`);
  const quoteTab=await customerContext.newPage();
  await quoteTab.goto((await tab.getByRole("link",{name:"Review your quote"}).getAttribute("href"))!);
  await expect(quoteTab.getByText("Fictional work: 1 item — £100.00")).toBeVisible();
  await expect(quoteTab.getByRole("region",{name:"Domestic cancellation-notice kit"})).toContainText("synthetic template, not reviewed (D06 v2)");
  await expect(quoteTab.getByRole("region",{name:"Domestic cancellation-notice kit"})).toContainText("Practice cancellation request");
  const view=(await api(quoteTab,"quote",{version:"customer-quote-read.v1",jobId:fixture.job})).body;
  const command={version:"customer-quote-acceptance.v1",commandId:randomUUID(),jobId:fixture.job,expectedJobRevision:view.jobRevision,target:{kind:"quote",id:view.quote.id,revision:view.quote.revision,hash:view.quote.hash}};
  expect((await api(quoteTab,"quote-accept",{...command,expectedJobRevision:view.jobRevision+1})).status).toBe(401);
  expect((await api(quoteTab,"quote-accept",{...command,target:{...command.target,hash:"0".repeat(64)}})).status).toBe(401);
  const sent=quoteTab.waitForRequest(request=>request.url().endsWith("/api/customer-portal/quote-accept")&&request.method()==="POST");
  await quoteTab.getByRole("button",{name:"Accept this quote",exact:true}).click();
  const acceptedCommand=(await sent).postDataJSON();
  await expect(quoteTab.getByText("You accepted this quote.",{exact:true})).toBeVisible();
  expect((await api(quoteTab,"quote-accept",acceptedCommand)).status).toBe(200);
  expect((await api(quoteTab,"quote-accept",{...acceptedCommand,target:{...acceptedCommand.target,hash:"0".repeat(64)}})).status).toBe(401);
  const accepted=(await admin.query("SELECT acceptance_kind,actor_membership_id,document_hash FROM app.quote_acceptance WHERE tenant_id=$1 AND job_id=$2",[tenant,fixture.job])).rows;
  expect(accepted).toEqual([{acceptance_kind:"customer_authenticated",actor_membership_id:null,document_hash:view.quote.hash}]);
  await quoteTab.close();
  // Owner-connected synthetic lifecycle fixture only; message/evidence rows are created by SV-7A.
  const lifecycle = await admin.connect();
  try {
    await lifecycle.query("BEGIN");
    await lifecycle.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
    await lifecycle.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','legacy_synthetic_live_fixture') ON CONFLICT DO NOTHING", [tenant, fixture.job]);
    await lifecycle.query("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2", [tenant, fixture.job]);
    await lifecycle.query("COMMIT");
  } finally { lifecycle.release(); }
  await tab.getByLabel("Message", { exact: true }).fill("I agree, perhaps £500? This is only a fictional message.");
  await tab.getByRole("button", { name: "Save message", exact: true }).click();
  await expect(tab.getByRole("status")).toHaveText("Message saved for your builder with its evidence.");
  const saved = (await admin.query("SELECT s.id,e.evidence_type,e.object_version_id,e.sha256,convert_from(o.bytes,'UTF8') text FROM app.customer_message_source s JOIN app.job_source_original o ON(o.tenant_id,o.source_id)=(s.tenant_id,s.id) JOIN app.evidence_object e ON(e.tenant_id,e.id)=(s.tenant_id,s.evidence_id) WHERE s.tenant_id=$1 AND s.job_id=$2", [tenant, fixture.job])).rows;
  expect(saved).toHaveLength(1); expect(saved[0]).toMatchObject({text: "I agree, perhaps £500? This is only a fictional message.", evidence_type: "customer_message_text"});
  expect(saved[0].sha256).toMatch(/^[a-f0-9]{64}$/u); expect(saved[0].object_version_id).toBeTruthy();
  expect((await api(tab, "messages", {version: "customer-portal-message.v1", jobId: randomUUID(), commandId: randomUUID(), text: "Foreign job"})).status).toBe(401);
  await tab.goto(stageLink!);
  await expect(tab.getByRole("heading", {name:"Fictional pre-cover stage"})).toBeVisible();
  await expect(tab.getByText(objectVersion,{exact:true})).toBeVisible();
  await tab.getByRole("button", {name:"Acknowledge this recorded completion"}).click();
  await expect(tab.getByText("Historical acknowledgement recorded.")).toBeVisible();
  const invalidationDb = await admin.connect();
  try {
   await invalidationDb.query("BEGIN"); await invalidationDb.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
  await invalidationDb.query("INSERT INTO app.evidence_invalidation(tenant_id,id,evidence_id,actor_membership_id,reason_code) SELECT $1,$2,$3,id,'verification_invalid' FROM app.membership WHERE tenant_id=$1 AND role='owner' LIMIT 1",[tenant,randomUUID(),evidence]);
   await invalidationDb.query("COMMIT");
  } catch(error) { await invalidationDb.query("ROLLBACK"); throw error; } finally { invalidationDb.release(); }
  await tab.reload();
  await expect(tab.getByText(/Fresh review required\./)).toBeVisible();
  await expect(tab.getByText("Historical acknowledgement recorded.")).toBeVisible();
  await expect(tab.getByRole("button", {name:"Acknowledge this recorded completion"})).toHaveCount(0);
  expect((await admin.query("SELECT count(*)::int n FROM app.customer_stage_acknowledgement WHERE tenant_id=$1 AND completion_id=$2",[tenant,completion])).rows[0].n).toBe(1);
  await tab.getByRole("link", {name:"Customer sign-in and sign-out"}).click();
  await tab.getByRole("main").getByRole("button", { name: "Sign out", exact: true }).click(); await expect(tab.getByRole("main").getByText("You are signed out.", { exact: true })).toBeVisible();
  expect((await customerContext.cookies()).find(c => c.name === "jobguard_customer")).toBeUndefined();
  await customerContext.addCookies([cookie]);
  expect((await api(tab, "read", { version: "customer-read.v1", jobId: fixture.job })).status).toBe(401);
 } finally { await customerContext.close(); await runtime.end(); await admin.end(); }
 const fresh = await browser.newContext();
 try { const tab = await fresh.newPage(); await tab.goto("/customer/sign-in"); expect((await api(tab, "read", { version: "customer-read.v1", jobId: randomUUID() })).status).toBe(401); }
 finally { await fresh.close(); }
});
