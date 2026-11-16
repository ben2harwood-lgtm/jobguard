// Real fictional-company sessions, PostgreSQL fixtures and import commands. No successful import mocks.
import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { closeTestPools } from "../../../packages/db/test/pool-test-utils.js";
import { meterCompany } from "../../../packages/db/test/meter-persistence-fixtures.js";
import { historicalAgreement } from "../../../packages/db/test/subscription-persistence-fixtures.js";
import { activateMeterJob } from "../../../packages/db/test/meter-journey-fixtures.js";
import { insertPhoto, seedWorkJob, type WorkFixture } from "../../../packages/db/test/job-work-state-fixtures.js";

const adminUrl = "postgresql://postgres:sbox-e2e-owner@127.0.0.1:55432/jobguard_synthetic_demo";
const runtimeUrl = "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo";
test.setTimeout(180_000);
let f: WorkFixture;
test.beforeAll(() => { f = { admin: new Pool({ connectionString: adminUrl, max: 1 }), runtime: new Pool({ connectionString: runtimeUrl, max: 1 }) } as WorkFixture; });
test.afterAll(() => closeTestPools(f.runtime, f.admin));

test("explicit B binds both meter reads and the company import; a company change clears its preview", async ({ page, context, baseURL }) => {
  const a = await meterCompany(f), b = await meterCompany(f);
  await historicalAgreement(f, a, "Builder"); await historicalAgreement(f, b, "Solo");
  await activateMeterJob(f, a); await insertPhoto(f, a, "now");
  const bJobs = [b];
  for (let i = 0; i < 3; i++) bJobs.push({ ...b, ...await seedWorkJob(f, b.tenantId) });
  for (const job of bJobs) { await activateMeterJob(f, job); await insertPhoto(f, job, "now"); }
  // Extend the existing fictional identity fixture to one user authorised in A and B.
  const userId = (await f.admin.query("SELECT user_id FROM identity.session WHERE id=$1", [a.sessionId])).rows[0].user_id;
  const membershipId = randomUUID();
  await f.admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
    SELECT $1,tenant_id,account_id,$2,'owner' FROM app.membership WHERE id=$3`, [membershipId, userId, b.actorId]);
  await f.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [userId, b.tenantId, membershipId]);
  const token = randomUUID();
  const digest = createHmac("sha256", "sbox-only-identity-hmac-secret-32-bytes").update(`session:${token}`).digest("hex");
  await f.admin.query("UPDATE identity.session SET token_digest=$1 WHERE id=$2", [digest, a.sessionId]);
  await context.addCookies([{ name: "jobguard_session", value: token, url: baseURL! }]);
  const requests: { path: string; tenant: string | undefined }[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/meter/")) requests.push({ path, tenant: request.headers()["x-tenant-id"] });
  });
  await page.goto("/meter");
  await expect(page.getByLabel("Company", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Choose a company to continue.");
  expect(requests).toEqual([]);
  await page.getByLabel("Company", { exact: true }).selectOption(b.tenantId);
  await expect(page.getByTestId("jobs-on-the-go")).toHaveText("4 of 4 jobs on the go");
  await expect(page.getByTestId("next-job-price")).toContainText("£20 a month");
  await expect(page.getByTestId("meter-job-row")).toHaveCount(4);
  for (const job of bJobs) await expect(page.getByRole("main")).toContainText(job.jobId);
  await expect(page.getByRole("region", { name: "Selected company", exact: true })).toContainText("Company: Fictional CH-4");
  expect(requests.map(request => request.path).sort()).toEqual(["/api/meter/current", "/api/meter/current/jobs"]);
  expect(requests.every(request => request.tenant === b.tenantId)).toBe(true);
  // Delay genuine A responses, switch to B, then release A. Equal dates must not bind tenants.
  let releaseA!: () => void;
  const held = new Promise<void>(resolve => { releaseA = resolve; });
  let delayed = 0;
  const meterRoute = /\/api\/meter\/current(?:\/jobs)?$/u;
  await page.route(meterRoute, async route => {
    if (route.request().headers()["x-tenant-id"] !== a.tenantId) return route.continue();
    const response = await route.fetch(); delayed++; await held;
    await route.fulfill({ response });
  });
  await page.getByLabel("Company", { exact: true }).selectOption(a.tenantId);
  await expect(page.getByTestId("jobs-on-the-go")).toHaveCount(0);
  await expect.poll(() => delayed).toBe(2);
  await page.getByLabel("Company", { exact: true }).selectOption(b.tenantId);
  await expect(page.getByTestId("jobs-on-the-go")).toHaveText("4 of 4 jobs on the go");
  releaseA(); await page.unrouteAll({ behavior: "wait" });
  await expect(page.getByTestId("jobs-on-the-go")).toHaveText("4 of 4 jobs on the go");
  await expect(page.getByRole("main")).not.toContainText(a.jobId);
  requests.length = 0;
  await page.goto(`/meter/jobs/${b.jobId}/imports`);
  await expect(page.getByRole("status")).toHaveText("Choose a company to continue.");
  expect(requests).toEqual([]);
  await page.getByLabel("Company", { exact: true }).selectOption(b.tenantId);
  await page.getByRole("button", { name: "Preview import", exact: true }).click();
  await expect(page.getByRole("region", { name: "Import preview" })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByLabel("Company", { exact: true }).selectOption(a.tenantId);
  await expect(page.getByRole("region", { name: "Import preview" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm import", exact: true })).toHaveCount(0);
  await page.getByLabel("Company", { exact: true }).selectOption(b.tenantId);
  await page.getByRole("button", { name: "Preview import", exact: true }).click();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm import", exact: true }).click();
  await expect(page.getByRole("region", { name: "Imported job" })).toBeVisible();
  await page.getByRole("button", { name: "Check imported catch", exact: true }).click();
  // The existing catch gate may refuse; the attempted command must still be for B.
  await expect.poll(() => requests.filter(request => request.path.endsWith("/catch")).length).toBe(1);
  for (const action of ["source", "read", "preview", "adopt", "catch"]) {
    expect(requests.some(request => request.path.endsWith(`/${action}`) && request.tenant === b.tenantId)).toBe(true);
  }
  await expect(page.getByRole("link", { name: "Open saved import", exact: true })).toHaveAttribute("href", new RegExp(`tenant=${b.tenantId}$`));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
