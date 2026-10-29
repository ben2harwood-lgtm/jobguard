import { randomUUID } from "node:crypto";
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
  await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
  await db.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'Fictional customer job')", [tenant, job]);
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
 const admin = new Pool({ connectionString: process.env.E2E_ADMIN_DATABASE_URL });
 const customerContext = await browser.newContext();
 try {
  await page.goto("/sign-in");
  await page.getByLabel("Fictional email address").fill(`portal-builder-${randomUUID()}@practice.invalid`);
  await page.getByRole("button", { name: "Request code", exact: true }).click();
  const code = await page.getByTestId("fixture-code").textContent();
  await page.getByLabel("Eight-digit code").fill(code!); await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("heading", { name: "Signed in", exact: true })).toBeVisible();
  const session = await page.evaluate(async () => (await fetch("/api/auth/session")).json());
  const tenant = session.memberships[0].tenantId as string, fixture = await seedJob(admin, tenant);
  await seedQuote(admin,tenant,fixture.job,session.memberships[0].id,session.principal.id);
  const issued = await api(page, "issue", { version: "customer-link-issue.v1", tenantId: tenant, jobId: fixture.job, customerId: fixture.customer }, session.csrfToken);
  expect(issued.status).toBe(200);
  const outbox = (await admin.query("SELECT o.immutable_content,o.adapter,o.recipient FROM app.customer_portal_grant g JOIN app.action_outbox o ON(o.tenant_id,o.id)=(g.tenant_id,g.outbox_id) WHERE g.tenant_id=$1 AND g.id=$2", [tenant, issued.body.grantId])).rows[0];
  expect(outbox).toMatchObject({ adapter: "fake_email", recipient: "portal@example.invalid" });
  const tab = await customerContext.newPage(); await tab.goto(`${baseURL}${outbox.immutable_content}`);
  await expect(tab.getByRole("button", { name: "Sign in", exact: true })).toBeVisible(); expect(tab.url()).not.toContain("#");
  await tab.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(tab.getByText("You are signed in to this job.", { exact: true })).toBeVisible();
  const cookie = (await customerContext.cookies()).find(c => c.name === "jobguard_customer")!;
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", expires: -1 });
  expect((await api(tab, "read", { version: "customer-read.v1", jobId: fixture.job })).status).toBe(200);
  expect((await api(tab, "read", { version: "customer-read.v1", jobId: randomUUID() })).status).toBe(401);
  expect(await tab.evaluate(async () => (await fetch("/api/jobs")).status)).toBe(401);
  const [tenantId, jobId, customerId, token] = outbox.immutable_content.split("#")[1].split("/");
  expect((await api(tab, "signin", { version: "customer-signin.v1", tenantId, jobId, customerId, token })).status).toBe(401);
  await tab.getByRole("link",{name:"Review your quote"}).click();
  await expect(tab.getByText("Fictional work: 1 item — £100.00")).toBeVisible();
  const view=(await api(tab,"quote",{version:"customer-quote-read.v1",jobId:fixture.job})).body;
  const command={version:"customer-quote-acceptance.v1",commandId:randomUUID(),jobId:fixture.job,expectedJobRevision:view.jobRevision,target:{kind:"quote",id:view.quote.id,revision:view.quote.revision,hash:view.quote.hash}};
  expect((await api(tab,"quote-accept",{...command,expectedJobRevision:view.jobRevision+1})).status).toBe(401);
  expect((await api(tab,"quote-accept",{...command,target:{...command.target,hash:"0".repeat(64)}})).status).toBe(401);
  const sent=tab.waitForRequest(request=>request.url().endsWith("/api/customer-portal/quote-accept")&&request.method()==="POST");
  await tab.getByRole("button",{name:"Accept this quote",exact:true}).click();
  const acceptedCommand=(await sent).postDataJSON();
  await expect(tab.getByText("You accepted this quote.",{exact:true})).toBeVisible();
  expect((await api(tab,"quote-accept",acceptedCommand)).status).toBe(200);
  expect((await api(tab,"quote-accept",{...acceptedCommand,target:{...acceptedCommand.target,hash:"0".repeat(64)}})).status).toBe(401);
  const accepted=(await admin.query("SELECT acceptance_kind,actor_membership_id,document_hash FROM app.quote_acceptance WHERE tenant_id=$1 AND job_id=$2",[tenant,fixture.job])).rows;
  expect(accepted).toEqual([{acceptance_kind:"customer_authenticated",actor_membership_id:null,document_hash:view.quote.hash}]);
  await tab.goto("/customer/sign-in");
  await tab.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(tab.getByText("You are signed out.", { exact: true })).toBeVisible();
  expect((await customerContext.cookies()).find(c => c.name === "jobguard_customer")).toBeUndefined();
  await customerContext.addCookies([cookie]);
  expect((await api(tab, "read", { version: "customer-read.v1", jobId: fixture.job })).status).toBe(401);
 } finally { await customerContext.close(); await admin.end(); }
 const fresh = await browser.newContext();
 try { const tab = await fresh.newPage(); await tab.goto("/customer/sign-in"); expect((await api(tab, "read", { version: "customer-read.v1", jobId: randomUUID() })).status).toBe(401); }
 finally { await fresh.close(); }
});
