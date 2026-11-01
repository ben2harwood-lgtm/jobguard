// Real PostgreSQL, real company session and real commands driven through the browser. Synthetic only.
// Owner fixtures supply only what has no public producer yet: two accepted company
// jobs and the reference identity. The trial start, card, terms and ends are all real commands.
import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";
import { closeTestPools } from "../../../packages/db/test/pool-test-utils.js";
import { exactTarget } from "../../../packages/db/test/free-first-job-lifecycle-fixtures.js";
import { meterCompany, verifyBusiness, type TrialCompany } from "../../../packages/db/test/free-first-job-admission-fixtures.js";
import { seedWorkJob, type WorkFixture } from "../../../packages/db/test/job-work-state-fixtures.js";
const E2E_ADMIN_DATABASE_URL = "postgresql://postgres:sbox-e2e-owner@127.0.0.1:55432/jobguard_synthetic_demo";
const E2E_RUNTIME_URL = "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo";
const E2E_AUTH_CODE_SECRET = "sbox-only-identity-hmac-secret-32-bytes";

test.setTimeout(120_000);
let f: WorkFixture;
test.beforeAll(() => { f = { admin: new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 2 }), runtime: new Pool({ connectionString: E2E_RUNTIME_URL, max: 2 }) } as WorkFixture; });
test.afterAll(() => closeTestPools(f.runtime, f.admin));

const facts = async (tenantId: string) => (await f.admin.query(`SELECT
  (SELECT count(*)::int FROM app.trial_start WHERE tenant_id=$1) starts,
  (SELECT count(*)::int FROM app.job_activation WHERE tenant_id=$1) activations,
  (SELECT count(*)::int FROM app.trial_identity_key_claim WHERE tenant_id=$1) keys,
  (SELECT coalesce(jsonb_agg(kind ORDER BY kind),'[]') FROM app.trial_end_source WHERE tenant_id=$1) ends,
  (SELECT coalesce(jsonb_agg(admission_kind ORDER BY admission_kind),'[]') FROM app.trial_admission WHERE tenant_id=$1) admissions`, [tenantId])).rows[0];

async function company(context: BrowserContext, baseURL: string, verified = true) {
  const a: TrialCompany = await meterCompany(f), token = randomUUID();
  const digest = createHmac("sha256", E2E_AUTH_CODE_SECRET).update(`session:${token}`).digest("hex");
  await f.admin.query("UPDATE identity.session SET token_digest=$1 WHERE id=$2", [digest, a.sessionId]);
  const owner = { ...a, digest };
  if (verified) await verifyBusiness(f, owner);
  await exactTarget(f, owner);
  const second = await seedWorkJob(f, a.tenantId);
  await exactTarget(f, { ...owner, jobId: second.jobId });
  await context.addCookies([{ name: "jobguard_session", value: token, url: baseURL }]);
  return { tenantId: a.tenantId, first: a.jobId, second: second.jobId };
}
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const alert = (page: Page) => page.getByRole("main").getByRole("alert");
async function openGuide(page: Page) {
  await page.goto("/demo-s");
  await button(page, "Choose trial selection").click();
  await page.getByRole("link", { name: "Open guided first-job trial", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Guided first-job trial" })).toBeVisible();
}
async function bind(page: Page, first: string, second: string) {
  await page.getByLabel("First accepted job reference").fill(first);
  await page.getByLabel("Second accepted job reference").fill(second);
  await button(page, "Bind fictional jobs").click();
  await expect(page.getByRole("region", { name: "Source report" })).toBeVisible();
}
const outcome = (page: Page) => page.getByTestId("trial-outcome");
async function start(page: Page) {
  await expect(outcome(page)).toContainText("No saved trial start");
  await expect(page.getByTestId("trial-missing")).toContainText("First activation");
  await button(page, "Skip for now").click();
  await expect(outcome(page)).toContainText("Trial active");
  await expect(page.getByTestId("trial-missing")).not.toContainText("First activation");
}

test("DEMO-J5 first activation, refused second job, card, terms, second activation ending the trial, saved report and reset", async ({ page, context, baseURL }) => {
  const { tenantId, first, second } = await company(context, baseURL!);
  await openGuide(page);
  const guide = page.url();
  await expect(page.getByRole("main")).toContainText("[BEN TO SUPPLY]");
  await bind(page, first, second);
  await start(page);
  expect(await facts(tenantId)).toMatchObject({ starts: 1, activations: 1, ends: [], admissions: ["first"] });
  expect((await facts(tenantId)).keys).toBeGreaterThan(0);
  await expect(page.getByText(/Controlled day-90 preview: ended at /)).toBeVisible();

  await button(page, "Try second job without a card").click();
  await expect(alert(page)).toContainText("Add a card");
  expect(await facts(tenantId)).toMatchObject({ starts: 1, activations: 1, ends: [], admissions: ["first"] });

  await button(page, "Add a card").click();
  await expect(button(page, "Complete fictional card setup")).toBeEnabled();
  await expect(button(page, "Add a card")).toBeDisabled();
  await page.reload();
  await button(page, "Complete fictional card setup").click();
  await expect(page.getByText("Simulated card on file.")).toBeVisible();

  await button(page, "Switch second job live").click();
  await expect(alert(page)).toContainText("Accept monthly terms");
  expect(await facts(tenantId)).toMatchObject({ activations: 1, ends: [] });
  await page.reload();
  await expect(outcome(page)).toContainText("Trial active");

  await page.getByRole("link", { name: "Accepted subscription terms and saved periods" }).click();
  await page.getByLabel("Plan", { exact: true }).selectOption("Builder");
  await page.getByRole("checkbox").check();
  await button(page, "Accept monthly terms").click();
  await expect(button(page, "Accept monthly terms")).toHaveCount(0);

  await page.goto(guide);
  await button(page, "Switch second job live").click();
  await expect(outcome(page)).toContainText("Trial ended by second activation");
  expect(await facts(tenantId)).toMatchObject({ starts: 1, activations: 2, ends: ["second_activation"], admissions: ["first", "second"] });
  await expect(page.getByTestId("trial-missing")).toContainText("Final Check");
  await expect(page.getByTestId("trial-missing")).toContainText("Pro-ration");
  await expect(page.getByText("Stored subscription agreements: 1")).toBeVisible();

  await button(page, "Save source report").click();
  await expect(page).toHaveURL(/snapshotId=/);
  await page.reload();
  await expect(outcome(page)).toContainText("Trial ended by second activation");

  // Reset archives this run; the same jobs carry over and cannot earn a second trial.
  await page.getByRole("link", { name: "Archive and reset in chooser" }).click();
  await button(page, "Reset selection").click();
  await expect(page.getByRole("link", { name: "Open archived selection", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open guided first-job trial", exact: true }).click();
  await page.getByLabel("First accepted job reference").fill(second);
  await page.getByLabel("Second accepted job reference").fill(first);
  await button(page, "Bind fictional jobs").click();
  await expect(alert(page)).toHaveText("DEMO_COMMAND_CONFLICT");
  await bind(page, first, second);
  await expect(outcome(page)).toContainText("Trial ended by second activation");
  await expect(button(page, "Skip for now")).toHaveCount(0);
  expect(await facts(tenantId)).toMatchObject({ starts: 1, activations: 2, ends: ["second_activation"] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("DEMO-J5 closing the first job ends the trial and it stays ended after reload", async ({ page, context, baseURL }) => {
  const { tenantId, first, second } = await company(context, baseURL!);
  await openGuide(page);
  await bind(page, first, second);
  await start(page);
  await button(page, "Close first job").click();
  await expect(outcome(page)).toContainText("Trial ended by close");
  expect(await facts(tenantId)).toMatchObject({ starts: 1, activations: 1, ends: ["close"] });
  await expect(button(page, "Close first job")).toHaveCount(0);
  await page.reload();
  await expect(outcome(page)).toContainText("Trial ended by close");
});

test("DEMO-J5 without an approved identity nothing is offered and no trial starts", async ({ page, context, baseURL }) => {
  const { tenantId, first, second } = await company(context, baseURL!, false);
  await openGuide(page);
  await bind(page, first, second);
  await expect(button(page, "Skip for now")).toHaveCount(0);
  await expect(outcome(page)).toContainText("No saved trial start");
  expect(await facts(tenantId)).toMatchObject({ starts: 0, activations: 0, keys: 0 });
});
