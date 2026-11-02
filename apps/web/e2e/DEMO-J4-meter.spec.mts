// Real PostgreSQL, real company session and real checked work commands. Synthetic only.
// Owner fixtures supply started jobs (as MON1-J does); every crossing below is a real admission.
import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";
import { closeTestPools } from "../../../packages/db/test/pool-test-utils.js";
import { meterCompany } from "../../../packages/db/test/meter-persistence-fixtures.js";
import { historicalAgreement } from "../../../packages/db/test/subscription-persistence-fixtures.js";
import { activateMeterJob } from "../../../packages/db/test/meter-journey-fixtures.js";
import { insertPhoto, seedWorkJob, type WorkFixture } from "../../../packages/db/test/job-work-state-fixtures.js";

const E2E_ADMIN_DATABASE_URL = "postgresql://postgres:sbox-e2e-owner@127.0.0.1:55432/jobguard_synthetic_demo";
const E2E_RUNTIME_URL = "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo";
const E2E_AUTH_CODE_SECRET = "sbox-only-identity-hmac-secret-32-bytes";
test.setTimeout(180_000);
let f: WorkFixture;
test.beforeAll(() => { f = { admin: new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 2 }), runtime: new Pool({ connectionString: E2E_RUNTIME_URL, max: 2 }) } as WorkFixture; });
test.afterAll(() => closeTestPools(f.runtime, f.admin));

async function company(context: BrowserContext, baseURL: string) {
  const a = await meterCompany(f), token = randomUUID();
  const digest = createHmac("sha256", E2E_AUTH_CODE_SECRET).update(`session:${token}`).digest("hex");
  await f.admin.query("UPDATE identity.session SET token_digest=$1 WHERE id=$2", [digest, a.sessionId]);
  await context.addCookies([{ name: "jobguard_session", value: token, url: baseURL }]);
  return { ...a, digest };
}
async function meter(page: Page, count: string) {
  await page.goto("/meter");
  await expect(page.getByRole("main").getByTestId("jobs-on-the-go")).toHaveText(count);
}

test("DEMO-J4 saved reference profiles reproduce the MON-2 figures and the DM-10 crossing", async ({ page, context, baseURL }) => {
  await company(context, baseURL!);
  await page.goto("/demo-s");
  await page.getByRole("button", { name: "Choose meter selection", exact: true }).click();
  const check = async () => {
    const preview = page.getByRole("region", { name: "Meter reference profiles" });
    for (const [id, amount] of [["DM-01", "£348.00"], ["DM-02", "£828.00"], ["DM-03", "£89.00"], ["DM-04", "£79.00"], ["DM-05", "£169.00"], ["DM-06", "£49.00"], ["DM-07", "£49.00"], ["DM-08", "£62.33"], ["DM-09", "£69.65"], ["DM-10", "£169.00"]]) {
      await expect(preview.getByText(`${id}: ${amount}`, { exact: true })).toBeVisible();
    }
    await expect(preview.getByText("2026-04-01: 13 places — Within grace. No track change.", { exact: true })).toBeVisible();
    await expect(preview.getByText("2026-04-02: 14 places — track_review_due immediately. No track change.", { exact: true })).toBeVisible();
    await expect(preview).toContainText("not issued statements or settled payments");
  };
  await check();
  await page.reload();
  await check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("DEMO-J4 crossing Builder's grace place by a real command raises track_review_due at once and blocks nothing", async ({ page, context, baseURL }) => {
  const a = await company(context, baseURL!);
  await historicalAgreement(f, a, "Builder");
  await activateMeterJob(f, a); await insertPhoto(f, a, "now");
  for (let i = 0; i < 11; i++) { const job = await seedWorkJob(f, a.tenantId); await activateMeterJob(f, job); await insertPhoto(f, job, "now"); }
  await meter(page, "12 of 7 jobs on the go");
  await expect(page.getByTestId("track-review-due")).toHaveCount(0);

  const session = await (await page.request.get("/api/auth/session")).json();
  const admit = async () => {
    const job = await seedWorkJob(f, a.tenantId); await activateMeterJob(f, job);
    const send = async (data: Record<string, unknown>) => {
      const response = await page.request.post(`/api/meter/jobs/${job.jobId}/work-state`, {
        headers: { origin: new URL(page.url()).origin, "x-csrf-token": session.csrfToken, "x-tenant-id": a.tenantId },
        data: { version: "job-work-state-command.v1", commandId: randomUUID(), ...data } });
      expect(response.status(), await response.text()).toBe(201);
      return response.json();
    };
    const closed = await send({ expectedRevision: 0, action: "close", reason: "other", note: "Fictional pause before admission" });
    await send({ expectedRevision: 1, action: "reopen", closeEventId: closed.events[0].id });
    await insertPhoto(f, job, "now");
  };
  const decisions = async () => (await f.admin.query("SELECT id FROM app.decision WHERE tenant_id=$1 AND action_type='subscription.track_review'", [a.tenantId])).rows;

  // Thirteen is the grace place: no review yet.
  await admit();
  await meter(page, "13 of 7 jobs on the go");
  await expect(page.getByRole("main")).toContainText("Today's count reaches the grace place.");
  await expect(page.getByTestId("track-review-due")).toHaveCount(0);
  expect(await decisions()).toEqual([]);

  // Fourteen crosses it: raised immediately, before any billing period ends.
  await admit();
  await meter(page, "14 of 7 jobs on the go");
  const raised = await decisions();
  expect(raised).toHaveLength(1);
  await expect(page.getByTestId("track-review-due")).toContainText("track_review_due");
  await expect(page.getByTestId("track-review-due")).toContainText(raised[0].id);
  await expect(page.getByTestId("next-job-price")).toHaveText("Further places stay within the monthly maximum and raise an account review.");
  await page.reload();
  await expect(page.getByTestId("track-review-due")).toContainText(raised[0].id);

  // Fifteen to seventeen stay admitted, with the same one Decision and no plan, track or period change.
  for (const n of [15, 16, 17]) { await admit(); await meter(page, `${n} of 7 jobs on the go`); }
  expect(await decisions()).toEqual(raised);
  const money = (await f.admin.query(`SELECT (SELECT coalesce(jsonb_agg(plan),'[]') FROM app.subscription_agreement_revision WHERE tenant_id=$1) plans,
    (SELECT count(*)::int FROM app.subscription_period WHERE tenant_id=$1) periods,
    (SELECT count(*)::int FROM app.job_commercial_track WHERE tenant_id=$1 AND job_track<>'small_builder') moved`, [a.tenantId])).rows[0];
  expect(money).toEqual({ plans: ["Builder"], periods: 0, moved: 0 });
  await page.goto("/plans");
  await expect(page.getByRole("main")).toContainText("Builder");
  await expect(page.getByRole("main")).toContainText("£169");

  // Another company cannot read this Decision.
  const other = await meterCompany(f);
  const foreign = await page.request.get("/api/meter/current", { headers: { "x-tenant-id": other.tenantId, "x-csrf-token": session.csrfToken } });
  expect(foreign.status()).toBe(403);
  expect(await foreign.text()).not.toContain(raised[0].id);
});
