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
  const issued = await api(page, "issue", { version: "customer-link-issue.v1", tenantId: tenant, jobId: fixture.job, customerId: fixture.customer }, session.csrfToken);
  expect(issued.status).toBe(200);
  const outbox = (await admin.query("SELECT o.immutable_content,o.adapter,o.recipient FROM app.customer_portal_grant g JOIN app.action_outbox o ON(o.tenant_id,o.id)=(g.tenant_id,g.outbox_id) WHERE g.tenant_id=$1 AND g.id=$2", [tenant, issued.body.grantId])).rows[0];
  expect(outbox).toMatchObject({ adapter: "fake_email", recipient: "portal@example.invalid" });
  const tab = await customerContext.newPage(); await tab.goto(`${baseURL}${outbox.immutable_content}`);
  await expect(tab.getByRole("button", { name: "Sign in", exact: true })).toBeVisible(); expect(tab.url()).not.toContain("#");
  await tab.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(tab.getByText("You are signed in to this job.", { exact: true })).toBeVisible();
  // Owner-connected synthetic lifecycle fixture only; message/evidence rows are created by SV-7A.
  await admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','legacy_synthetic_live_fixture') ON CONFLICT DO NOTHING", [tenant, fixture.job]);
  await admin.query("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2", [tenant, fixture.job]);
  await tab.getByLabel("Message", { exact: true }).fill("I agree, perhaps £500? This is only a fictional message.");
  await tab.getByRole("button", { name: "Save message", exact: true }).click();
  await expect(tab.getByRole("status")).toHaveText("Message saved for your builder with its evidence.");
  const saved = (await admin.query("SELECT s.id,e.evidence_type,e.object_version_id,e.sha256,convert_from(o.bytes,'UTF8') text FROM app.customer_message_source s JOIN app.job_source_original o ON(o.tenant_id,o.source_id)=(s.tenant_id,s.id) JOIN app.evidence_object e ON(e.tenant_id,e.id)=(s.tenant_id,s.evidence_id) WHERE s.tenant_id=$1 AND s.job_id=$2", [tenant, fixture.job])).rows;
  expect(saved).toHaveLength(1); expect(saved[0]).toMatchObject({text: "I agree, perhaps £500? This is only a fictional message.", evidence_type: "customer_message_text"});
  expect(saved[0].sha256).toMatch(/^[a-f0-9]{64}$/u); expect(saved[0].object_version_id).toBeTruthy();
  expect((await api(tab, "messages", {version: "customer-portal-message.v1", jobId: randomUUID(), commandId: randomUUID(), text: "Foreign job"})).status).toBe(401);
  const cookie = (await customerContext.cookies()).find(c => c.name === "jobguard_customer")!;
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", expires: -1 });
  expect((await api(tab, "read", { version: "customer-read.v1", jobId: fixture.job })).status).toBe(200);
  expect((await api(tab, "read", { version: "customer-read.v1", jobId: randomUUID() })).status).toBe(401);
  expect(await tab.evaluate(async () => (await fetch("/api/jobs")).status)).toBe(401);
  const [tenantId, jobId, customerId, token] = outbox.immutable_content.split("#")[1].split("/");
  expect((await api(tab, "signin", { version: "customer-signin.v1", tenantId, jobId, customerId, token })).status).toBe(401);
  await tab.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(tab.getByText("You are signed out.", { exact: true })).toBeVisible();
  expect((await customerContext.cookies()).find(c => c.name === "jobguard_customer")).toBeUndefined();
  await customerContext.addCookies([cookie]);
  expect((await api(tab, "read", { version: "customer-read.v1", jobId: fixture.job })).status).toBe(401);
 } finally { await customerContext.close(); await admin.end(); }
 const fresh = await browser.newContext();
 try { const tab = await fresh.newPage(); await tab.goto("/customer/sign-in"); expect((await api(tab, "read", { version: "customer-read.v1", jobId: randomUUID() })).status).toBe(401); }
 finally { await fresh.close(); }
});
