// CH4-U work-state controls and linked-job offer. Synthetic only; runs in CI.
import { createHash, createHmac, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test, type Page } from "@playwright/test";
import { activateMeterJob } from "../../../packages/db/test/meter-journey-fixtures.js";
import { meterCompany } from "../../../packages/db/test/meter-persistence-fixtures.js";
import { subscriptionConsentText } from "../../../packages/core/src/subscription-plan-view.js";
import { insertPhoto, seedWorkJob, type WorkFixture } from "../../../packages/db/test/job-work-state-fixtures.js";
import { prepareLockJob } from "./helpers/final-account-lock-journey";
import { prepareInvoiceFinalCheck } from "./helpers/customer-invoice-journey";

const LINKED = "Start a linked job for this customer and site";
const E2E_RUNTIME_URL = "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo";
const panel = (page: Page) => page.getByTestId("job-work-state");
async function click(page: Page, name: string) {
  const button = panel(page).getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled(); await button.click();
  await expect(panel(page)).toHaveAttribute("aria-busy", "false");
}
const eventIds = (page: Page) => panel(page).getByTestId("work-state-event").evaluateAll(items => items.map(item => `${item.getAttribute("data-kind")}:${item.getAttribute("data-event-id")}`));

async function acceptSolo(fixture: WorkFixture, tenantId: string, digest: string) {
  const anchorDay = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric" }).format(new Date()));
  const commandTerms = { plan: "Solo", cadence: "monthly", anchorDay, termsVersion: "subscription_terms_v1", catalogueVersion: "subscription_pricing_policy_v4", maximumPence: 4900, expectedRevision: 0 };
  const canonical = JSON.stringify(Object.fromEntries(Object.entries({ tenantId, ...commandTerms, consentText: subscriptionConsentText }).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
  const db = await fixture.runtime.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    await db.query("SELECT app.mon2_command($1,$2,$3,$4::jsonb)", [tenantId, digest, randomUUID(), JSON.stringify({ version: "subscription-command.v1", kind: "accept", ...commandTerms, contentHash: createHash("sha256").update(canonical).digest("hex") })]);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

test("resume and unlocked reopen persist, retry exactly after an unknown outcome, and refuse the Solo cap", async ({ page, context }) => {
  const admin = new Pool({ host: "127.0.0.1", port: 55432, database: "jobguard_synthetic_demo", user: "postgres", password: "sbox-e2e-owner", max: 1 });
  const runtime = new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 });
  const fixture = { admin, runtime } as WorkFixture;
  try {
    const account = await meterCompany(fixture), token = randomUUID();
    const digest = createHmac("sha256", "sbox-only-identity-hmac-secret-32-bytes").update(`session:${token}`).digest("hex");
    await admin.query("UPDATE identity.session SET token_digest=$1 WHERE id=$2", [digest, account.sessionId]);
    await acceptSolo(fixture, account.tenantId, digest);
    await activateMeterJob(fixture, account);
    await context.addCookies([{ name: "jobguard_session", value: token, url: "http://127.0.0.1:3000" }]);
    const jobId = account.jobId;
    await page.goto(`/jobs/${jobId}#site-work`);
    await expect(panel(page).getByTestId("work-state")).toHaveText("Work under way");

  // The real browser request commits, but its successful response is lost at
  // the client boundary. Avoid route.fetch(): it issues a second API-context
  // request rather than exercising the button's original browser transport.
  const commandPath = `/api/jobs/${jobId}/work-state`;
  const resumeCommands: unknown[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname !== commandPath || request.method() !== "POST") return;
    const body = request.postDataJSON() as { action?: string };
    if (body.action === "resume") resumeCommands.push(body);
  });
  await page.evaluate(path => {
    const nativeFetch = window.fetch.bind(window);
    let loseResume = true;
    window.fetch = async (input, init) => {
      const response = await nativeFetch(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as { action?: string } : null;
      if (loseResume && new URL(url, window.location.href).pathname === path && body?.action === "resume" && response.status === 201) {
        loseResume = false;
        await response.arrayBuffer();
        throw new TypeError("Synthetic unknown outcome");
      }
      return response;
    };
  }, commandPath);
  await click(page, "Resume site work");
  await expect(panel(page).getByRole("alert")).toContainText("The result is unknown");
  await click(page, "Retry the same action");
  expect(resumeCommands).toHaveLength(2);
  expect(resumeCommands[1]).toEqual(resumeCommands[0]);
  await expect(panel(page).getByTestId("work-state-revision")).toHaveText("1");
  await expect(panel(page).getByTestId("work-state-event").last()).toContainText("Site work resumed");
  const resumed = await eventIds(page);
  expect(resumed.map(item => item.split(":")[0])).toEqual(["resumed"]);
  await page.reload();
  await expect.poll(() => eventIds(page)).toEqual(resumed);
  await expect(panel(page).getByTestId("work-state-revision")).toHaveText("1");

  await click(page, "Finished on site");
  await expect(panel(page).getByTestId("work-state")).toHaveText("Finished on site");
  await click(page, "Cancel finished on site");
  await expect(panel(page).getByTestId("work-state")).toHaveText("Work under way");

  await expect(panel(page).getByRole("button", { name: "Close job", exact: true })).toBeDisabled();
  await panel(page).getByLabel("Reason").selectOption("abandoned");
  await panel(page).getByLabel("Note (required)").fill("Fictional customer stopped the work");
  await click(page, "Close job");
  await expect(panel(page).getByTestId("work-state")).toHaveText("Closed");
  await click(page, "Reopen job");
  await expect(panel(page).getByTestId("work-state")).toHaveText("Work under way");
  await expect(panel(page).getByTestId("work-state-event").last()).toContainText("Job reopened");

  // Close again, fill the six Solo places with distinct synthetic jobs, then prove
  // the seventh place is refused through the saved-job Reopen button.
  await panel(page).getByLabel("Note (required)").fill("Fictional pause before the cap");
  await click(page, "Close job");
  const beforeCap = await eventIds(page);
  const revisionBeforeCap = await panel(page).getByTestId("work-state-revision").textContent();
    const tenantId = (await admin.query("SELECT tenant_id FROM app.job WHERE id=$1", [jobId])).rows[0].tenant_id as string;
    for (let i = 0; i < 6; i++) {
      const counted = await seedWorkJob(fixture, tenantId);
      await activateMeterJob(fixture, counted);
      await insertPhoto(fixture, counted, "now");
    }
  await click(page, "Reopen job");
  await expect(panel(page).getByRole("alert")).toContainText("Move to Builder");
  await expect(panel(page).getByTestId("work-state")).toHaveText("Closed");
  await expect(panel(page).getByTestId("work-state-revision")).toHaveText(revisionBeforeCap!);
  await expect.poll(() => eventIds(page)).toEqual(beforeCap);
  await page.reload();
  await expect.poll(() => eventIds(page)).toEqual(beforeCap);

  const second = await context.newPage();
  await second.goto(`/jobs/${jobId}#site-work`);
  await expect.poll(() => eventIds(second)).toEqual(beforeCap);

  // A stale revision is refused and records nothing.
  const stale = await page.request.post(`/api/jobs/${jobId}/work-state`, { data: { version: "job-work-state-command.v1", commandId: randomUUID(), expectedRevision: 0, action: "finish" } });
  expect(stale.status()).toBe(409);
  await page.reload();
  await expect.poll(() => eventIds(page)).toEqual(beforeCap);

  // Layout: no sideways scroll on this viewport and 44px actions.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const box = await panel(page).getByRole("button", { name: "Load saved site work", exact: true }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  } finally {
    await runtime.end();
    await admin.end();
  }
});

test("after lock, new site work is refused and the screen offers a linked job", async ({ page }) => {
  const { jobId, account } = await prepareLockJob(page);
  await prepareInvoiceFinalCheck(page, jobId, account);
  await page.goto(`/jobs/${jobId}#site-work`);
  await expect(panel(page).getByTestId("linked-job-offer")).toContainText(LINKED);
  const before = await eventIds(page);
  const { scopeItemId } = await (await page.request.get(`/api/jobs/${jobId}/proof`)).json();
  const refused = await page.request.post(`/api/jobs/${jobId}/proof`, { data: { version: "practice-proof-command.v1", commandId: randomUUID(), action: "select_generated", fixture: "completion-photo", scopeItemId } });
  expect(refused.ok()).toBe(false);
  expect(await refused.text()).toContain("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  await page.reload();
  await expect(panel(page).getByTestId("linked-job-offer")).toContainText(LINKED);
  await expect.poll(() => eventIds(page)).toEqual(before);
});
