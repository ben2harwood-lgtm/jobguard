// Real PostgreSQL + company cookies. Only the accepted job, proof and draft are prepared.
// Lock, trial end, run request and completed reveal are never fixture results.
import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";
import { FinalAccountCommandService } from "../../../packages/db/src/final-account-repository.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../../../packages/db/src/tenant-context.js";
import { exactTarget, preparedTrialFixture } from "../../../packages/db/test/free-first-job-lifecycle-fixtures.js";
import { seedWorkJob, workTenant, type WorkFixture } from "../../../packages/db/test/job-work-state-fixtures.js";
import { generatePracticePng } from "../../../packages/db/src/practice-proof-image.js";
import { closeTestPools } from "../../../packages/db/test/pool-test-utils.js";
const admin = new Pool({ connectionString: "postgresql://postgres:sbox-e2e-owner@127.0.0.1:55432/jobguard_synthetic_demo", max: 2 });
const runtime = new Pool({ connectionString: "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo", max: 2 });
const f = { admin, runtime } as WorkFixture;
test.setTimeout(180_000);
test.afterAll(() => closeTestPools(runtime, admin));
async function prepared(context: BrowserContext, baseURL: string, withTrial = true) {
 const a = await preparedTrialFixture(f, {
  description: "painted walls", proofBytes: generatePracticePng(), withTrial,
 });
 const user = (await admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId])).rows[0].identity_user_id;
 const bound = verifiedTenantContextFromMembership({ tenantId: a.tenantId, membershipId: a.actorId, identityUserId: user } as AuthenticatedMembership, { kind: "real", credential: a.digest });
 const draft = await new FinalAccountCommandService(runtime).assemble(bound, { version: "final-account.assemble.v1", commandId: randomUUID(), jobId: a.jobId, actorMembershipId: a.actorId, expectedRevision: 0 });
 const token = randomUUID(), digest = createHmac("sha256", "sbox-only-identity-hmac-secret-32-bytes").update(`session:${token}`).digest("hex");
 await admin.query("UPDATE identity.session SET token_digest=$1 WHERE id=$2", [digest, a.sessionId]);
 await context.addCookies([{ name: "jobguard_session", value: token, url: baseURL }]);
 const second = await seedWorkJob(f, a.tenantId); await exactTarget(f, { ...a, jobId: second.jobId });
 return { ...a, draft, second: second.jobId };
}
async function accessibleLayout(page: Page) {
 for (const control of await page.locator("button:visible, select:visible, main a:visible").all()) {
  const box = await control.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
 }
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
const click = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();
async function bind(page: Page, a: Awaited<ReturnType<typeof prepared>>) {
 await page.goto("/demo-s"); await click(page, "Choose trial selection");
 await page.getByRole("link", { name: "Open guided first-job trial", exact: true }).click();
 await page.getByLabel("First accepted job reference").fill(a.jobId); await page.getByLabel("Second accepted job reference").fill(a.second);
 await click(page, "Bind fictional jobs"); await expect(page.getByTestId("trial-missing")).toContainText("Final Check");
 return page.url();
}
const money = async (tenant: string) => (await admin.query(`SELECT
 (SELECT count(*) FROM app.success_fee_journal WHERE tenant_id=$1)::int fees,
 (SELECT count(*) FROM app.customer_invoice WHERE tenant_id=$1)::int invoices,
 (SELECT count(*) FROM app.subscription_period WHERE tenant_id=$1)::int periods,
 (SELECT count(*) FROM app.platform_fee_collection_command WHERE tenant_id=$1)::int collections,
 (SELECT count(*) FROM app.platform_statement WHERE tenant_id=$1)::int statements`, [tenant])).rows[0];

test("DT-02 prepared first job locks, ends trial and completes saved zero check without money effects", async ({ page, context, baseURL, browser }) => {
 const a = await prepared(context, baseURL!), before = await money(a.tenantId);
 const ordinaryContext = await browser.newContext();
 const ordinary = await prepared(ordinaryContext, baseURL!, false);
 expect((await admin.query("SELECT count(*)::int n FROM app.trial_start WHERE tenant_id=$1", [ordinary.tenantId])).rows).toEqual([{ n: 0 }]);
 expect(a.draft.totals).toEqual(ordinary.draft.totals);
 const ordinaryPage = await ordinaryContext.newPage();
 await ordinaryPage.goto(`/demo-s/trial/final-account?${new URLSearchParams({ tenantId: ordinary.tenantId, runId: randomUUID(), jobId: ordinary.jobId })}`);
 await expect(ordinaryPage.getByTestId("trial-final-net")).toHaveText("Final net £1000.00 · VAT £200.00 · Gross £1200.00");
 await ordinaryContext.close();
 const guide = await bind(page, a);
 await page.getByRole("link", { name: "Open first job final account and Final Check" }).click();
 await expect(page.getByTestId("trial-final-net")).toHaveText("Final net £1000.00 · VAT £200.00 · Gross £1200.00");
 await expect(page.getByRole("region", { name: "Saved final check" })).toHaveCount(0);
 await accessibleLayout(page);
 await expect(page.getByRole("button", { name: "Complete final account", exact: true })).toBeDisabled();
 const session = await (await page.request.get("/api/auth/session")).json();
 const send = (action: string, input: Record<string, unknown> = {}) => page.request.post(`/api/jobs/${a.jobId}/trial-final-check`, { headers: { origin: new URL(page.url()).origin, "x-tenant-id": a.tenantId, "x-csrf-token": session.csrfToken }, data: { action, input: { version: "company-final-check.v1", jobId: a.jobId, ...input } } });
 const lock = { commandId: randomUUID(), finalAccountRevisionId: a.draft.id, expectedRevision: a.draft.revision, declarationVersion: "final_account_declaration.v1" };
 expect((await send("lock", lock)).ok()).toBe(false);
 expect((await admin.query("SELECT count(*)::int n FROM app.trial_end_source WHERE tenant_id=$1", [a.tenantId])).rows).toEqual([{ n: 0 }]);
 await page.getByLabel("Disposition painted walls").selectOption("done");
 await expect(page.getByLabel("Disposition painted walls")).toHaveValue("done");
 await click(page, "Accept final check terms"); await expect(page.getByRole("button", { name: "Accept final check terms", exact: true })).toBeDisabled();
 const publicBefore = await (await send("read")).json();
 expect(await (await send("reveal")).json()).toEqual({ state: "unlocked", items: [] });
 await workTenant(admin, a.tenantId, db => db.query(`INSERT INTO app.shadow_commercial_signal
  (tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
  VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),'Held fictional signal without evidence','low','held_for_final_check')`, [a.tenantId, a.jobId, randomUUID(), randomUUID()]));
 expect(await (await send("read")).json()).toEqual(publicBefore);
 expect(await (await send("reveal")).json()).toEqual({ state: "unlocked", items: [] });
 expect((await send("requestRun")).ok()).toBe(false);
 let successfulLock: Record<string, unknown> | undefined;
 page.on("request", request => {
  if (request.url().endsWith(`/api/jobs/${a.jobId}/trial-final-check`) && request.method() === "POST") {
   const body = request.postDataJSON(); if (body.action === "lock") successfulLock = body.input;
  }
 });
 await click(page, "Complete final account");
 await expect(page.getByText(/Final account completed · Lock/)).toBeVisible();
 // Replay the actual successful command, then confirm it creates no second lock/end.
 const recorded = (await admin.query("SELECT id FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0];
 expect(recorded.id).toBeTruthy();
 expect(successfulLock).toBeTruthy();
 const replay = await send("lock", successfulLock!); expect(replay.status()).toBe(200);
 expect((await replay.json()).id).toBe(recorded.id);
 await click(page, "Run the final check (practice)");
 await expect(async () => {
  await click(page, "Load saved final account and check");
  await expect(page.getByTestId("final-check-status")).toHaveText("JobGuard's final check found nothing missing from your bill.");
 }).toPass({ timeout: 90_000, intervals: [1000, 3000] });
 await page.reload(); await expect(page.getByTestId("final-check-status")).toHaveText("JobGuard's final check found nothing missing from your bill.");
 await accessibleLayout(page);
 await page.getByRole("link", { name: "Back to guided trial" }).click();
 await expect(page.getByTestId("trial-outcome")).toContainText("Trial ended by lock");
 await expect(page.getByTestId("trial-missing")).not.toContainText("Final Check"); await expect(page.getByTestId("trial-missing")).toContainText("Pro-ration");
 await click(page, "Save source report"); await page.reload();
 await expect(page.getByTestId("trial-outcome")).toContainText("Trial ended by lock");
 await expect(page.getByTestId("trial-missing")).not.toContainText("Final Check");
 expect(await money(a.tenantId)).toEqual(before);
 expect((await admin.query("SELECT count(*)::int n FROM app.trial_end_source WHERE tenant_id=$1 AND kind='lock'", [a.tenantId])).rows).toEqual([{ n: 1 }]);
 await page.goto(guide); await expect(page.getByTestId("trial-outcome")).toContainText("Trial ended by lock");
});

test("foreign and removed company members cannot read, reveal or lock and learn no job facts", async ({ page, context, baseURL }) => {
 const a = await prepared(context, baseURL!), b = await prepared(context, baseURL!);
 await page.goto("/demo-s");
 const session = await (await page.request.get("/api/auth/session")).json();
 const send = (tenant: string, jobId: string, action: string) => page.request.post(`/api/jobs/${jobId}/trial-final-check`, { headers: { origin: new URL(page.url()).origin, "x-tenant-id": tenant, "x-csrf-token": session.csrfToken }, data: { action, input: { version: "company-final-check.v1", jobId, ...(action === "lock" ? { commandId: randomUUID(), finalAccountRevisionId: a.draft.id, expectedRevision: a.draft.revision, declarationVersion: "final_account_declaration.v1" } : {}) } } });
 for (const action of ["read", "reveal", "lock"]) {
  const response = await send(b.tenantId, a.jobId, action); expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({ code: "COMPANY_FINAL_CHECK_FORBIDDEN" });
 }
 await workTenant(admin, b.tenantId, db => db.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [b.tenantId, b.actorId]));
 for (const action of ["read", "reveal", "lock"]) expect((await send(b.tenantId, b.jobId, action)).ok()).toBe(false);
 expect((await admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=ANY($1::uuid[])", [[a.tenantId, b.tenantId]])).rows).toEqual([{ n: 0 }]);
 expect((await admin.query("SELECT count(*)::int n FROM app.trial_end_source WHERE tenant_id=ANY($1::uuid[])", [[a.tenantId, b.tenantId]])).rows).toEqual([{ n: 0 }]);
});
