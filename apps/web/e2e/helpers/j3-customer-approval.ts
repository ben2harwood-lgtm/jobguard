import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, type Browser, type Page } from "@playwright/test";
import { jsonResult } from "./customer-invoice-journey";

const tenantId = "11111111-1111-4111-8111-111111111111";
export type PricedCatch = { id: string; description: string; currentRevisionId: string; revisions: { id: string; revision: number; contentHash: string; signedDeltaPence: number }[] };

/** Only identity membership is fixture setup. Every job, catch, customer link and
 * customer approval is produced by its normal writer. Customer cookies never
 * enter the builder context. No approval/claim/settlement rows are seeded. */
export async function approveJ3Catches(page: Page, browser: Browser, jobId: string, catches: PricedCatch[]) {
 const admin = new Pool({ connectionString: process.env.E2E_ADMIN_DATABASE_URL, max: 1 });
 const issuer = await page.context().newPage();
 const customerContext = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: page.viewportSize() });
 try {
  await issuer.goto("/sign-in");
  await issuer.getByLabel("Fictional email address").fill(`j3-owner-${randomUUID()}@practice.invalid`);
  await issuer.getByRole("button", { name: "Request code", exact: true }).click();
  await issuer.getByLabel("Eight-digit code").fill((await issuer.getByTestId("fixture-code").innerText()).trim());
  await issuer.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(issuer.getByRole("heading", { name: "Signed in", exact: true })).toBeVisible();
  const session = await jsonResult(page.request.get("/api/auth/session"), "Read signed-in link issuer");
  // The practice job's tenant is fixed by the existing demo bootstrap, whereas
  // code sign-in creates a fresh fictional business. Establish only the test
  // issuer's owner membership; do not move or recreate the captured job.
  const db = await admin.connect();
  try {
   await db.query("BEGIN");
   await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
   const account = (await db.query("SELECT account_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [tenantId, "d1500000-0000-4000-8000-000000000003"])).rows[0];
   expect(account, "Demo bootstrap must provide its owner account").toBeDefined();
   await db.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [randomUUID(), tenantId, account.account_id, session.principal.id]);
   await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
  const parties = await jsonResult(page.request.get(`/api/jobs/${jobId}/parties`), "Read captured customer");
  const customerId = parties.currentIds.customerId;
  const customer = await customerContext.newPage();
  for (const subject of [jobId, randomUUID()]) {
   const refused = await customerContext.request.post("/api/customer-portal/variations/read", { data: { version: "customer-variations-read.v1", jobId: subject }, headers: { origin: new URL(page.url()).origin } });
   expect(refused.status()).toBe(401);
  }
  // One review link contains both priced catches. Reissuing a second link in
  // the same minute is correctly rate-limited and would revoke the first.
  const issued = await issuer.evaluate(async input => {
    const response = await fetch("/api/customer-portal/issue", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": input.csrfToken }, body: JSON.stringify({ version: "customer-link-issue.v1", tenantId: input.tenantId, jobId: input.jobId, customerId: input.customerId }) });
    return { status: response.status, body: await response.json() };
   }, { csrfToken: session.csrfToken, tenantId, jobId, customerId });
   expect(issued.status, "Builder authorizes the customer link through the real route").toBe(200);
   // Fake delivery transport: read the exact durable outbox artifact, as the
   // existing customer-extra-approval journey does. No provider is contacted.
   const outbox = (await admin.query("SELECT o.immutable_content FROM app.customer_portal_grant g JOIN app.action_outbox o ON(o.tenant_id,o.id)=(g.tenant_id,g.outbox_id) WHERE g.tenant_id=$1 AND g.id=$2", [tenantId, issued.body.grantId])).rows[0];
   await customer.goto(outbox.immutable_content);
   await customer.getByRole("button", { name: "Sign in", exact: true }).click();
   await customer.getByRole("link", { name: "Review extras", exact: true }).click();
  for (const item of catches) {
   const section = customer.locator("section").filter({ has: customer.getByRole("heading", { name: item.description, exact: true }) });
   const revision = item.revisions.find(row => row.id === item.currentRevisionId)!;
   await expect(section).toContainText(revision.contentHash);
   await section.getByRole("button", { name: `Approve revision ${revision.revision} for +£${(revision.signedDeltaPence / 100).toFixed(2)}`, exact: true }).click();
   await expect(section.getByText("Approved · authenticated customer", { exact: true })).toBeVisible();
   await customer.reload();
   await expect(section.getByText("Approved · authenticated customer", { exact: true })).toBeVisible();
  }
  const view = await jsonResult(page.request.get(`/api/jobs/${jobId}/variations`), "Read customer-approved catches");
  for (const item of catches) expect(view.variations.find((row: { id: string }) => row.id === item.id).revisions.at(-1)).toMatchObject({ approved: true, approvalMethod: "customer_authenticated" });
  expect((await page.context().cookies()).some(cookie => cookie.name === "jobguard_customer")).toBe(false);
  expect((await customerContext.cookies()).some(cookie => cookie.name === "jg_session" || cookie.name === "jobguard_session")).toBe(false);
 } finally { await customerContext.close(); await issuer.close(); await admin.end(); }
}
