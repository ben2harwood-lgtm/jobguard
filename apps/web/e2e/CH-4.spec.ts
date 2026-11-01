// CH4-U work-state controls and linked-job offer. Synthetic only; runs in CI.
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test, type Page } from "@playwright/test";
import { ch4Company, capturedCompanyJob } from "./helpers/ch4-company-fixture";
import { subscriptionConsentText } from "../../../packages/core/src/subscription-plan-view.js";
import { type WorkFixture } from "../../../packages/db/test/job-work-state-fixtures.js";
import { prepareLockJob } from "./helpers/final-account-lock-journey";
import { prepareInvoiceFinalCheck } from "./helpers/customer-invoice-journey";

test.setTimeout(180_000);

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
  const runtime = new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 });
  const fixture = { runtime } as WorkFixture;
  try {
    const { JobWorkStateRepository } = await import("@jobguard/db");
    const company = await ch4Company(runtime);
    await acceptSolo(fixture, company.tenantId, company.digest);
    const job = await capturedCompanyJob(company), { jobId } = job;
    await context.addCookies([{ name: "jobguard_session", value: company.sessionToken, url: "http://127.0.0.1:3000" }]);
    const jobUrl = `/jobs/${jobId}?company=${company.tenantId}#site-work`;
    const credentials = { "x-tenant-id": company.tenantId, "x-csrf-token": company.csrfToken, origin: "http://127.0.0.1:3000" };
    await page.goto(jobUrl);
    await expect(page.locator("#captured-job-workspace")).toHaveAttribute("data-job-id", jobId);
    await expect(page.getByRole("heading", { name: job.title, exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Captured scope" })).toContainText(job.title);
    await expect(panel(page).getByTestId("work-state")).toHaveText("Work under way");

  // The real browser request commits, but its successful response is lost at
  // the client boundary. Avoid route.fetch(): it issues a second API-context
  // request rather than exercising the button's original browser transport.
  const commandPath = `/api/meter/jobs/${jobId}/work-state`;
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
  await expect(panel(page).getByTestId("work-state-event").last()).toContainText("Abandoned: Fictional customer stopped the work");
  const closed = await eventIds(page);
  expect(closed.map(item => item.split(":")[0])).toEqual(["resumed", "finished_on_site", "finished_cancelled", "closed"]);
  await page.reload();
  await expect.poll(() => eventIds(page)).toEqual(closed);
  await expect(panel(page).getByTestId("work-state-event").last()).toContainText("Abandoned: Fictional customer stopped the work");
  await click(page, "Reopen job");
  await expect(panel(page).getByTestId("work-state")).toHaveText("Work under way");
  await expect(panel(page).getByTestId("work-state-event").last()).toContainText("Job reopened");

  // Close again, fill the six Solo places with distinct synthetic jobs, then prove
  // the seventh place is refused through the saved-job Reopen button.
  await panel(page).getByLabel("Note (required)").fill("Fictional pause before the cap");
  await click(page, "Close job");
  const beforeCap = await eventIds(page);
  expect(beforeCap.map(item => item.split(":")[0])).toEqual(["resumed", "finished_on_site", "finished_cancelled", "closed", "reopened", "closed"]);
  const revisionBeforeCap = await panel(page).getByTestId("work-state-revision").textContent();
    for (let i = 0; i < 6; i++) {
      const counted = await capturedCompanyJob(company);
      await new JobWorkStateRepository(runtime).resume(company.context, counted.jobId, company.actorId, {
        version: "job-work-state-command.v1", commandId: randomUUID(), expectedRevision: 0, action: "resume",
      });
    }
  await click(page, "Reopen job");
  await expect(panel(page).getByRole("alert")).toContainText("Move to Builder");
  await expect(panel(page).getByTestId("work-state")).toHaveText("Closed");
  await expect(panel(page).getByTestId("work-state-revision")).toHaveText(revisionBeforeCap!);
  await expect.poll(() => eventIds(page)).toEqual(beforeCap);
  await page.reload();
  await expect.poll(() => eventIds(page)).toEqual(beforeCap);

  const second = await context.newPage();
  await second.goto(jobUrl);
  await expect.poll(() => eventIds(second)).toEqual(beforeCap);

  // A stale revision is refused and records nothing.
  const stale = await page.request.post(commandPath, { headers: credentials, data: { version: "job-work-state-command.v1", commandId: randomUUID(), expectedRevision: 0, action: "finish" } });
  expect(stale.status()).toBe(409);
  await page.reload();
  await expect.poll(() => eventIds(page)).toEqual(beforeCap);

  // Company reads and writes keep their current-session/tenant/CSRF boundaries.
  const foreign = await ch4Company(runtime), foreignJob = await capturedCompanyJob(foreign);
  expect((await page.request.get(`/api/meter/jobs/${foreignJob.jobId}/work-state`, { headers: credentials })).status()).toBe(404);
  expect((await page.request.get(commandPath, { headers: { ...credentials, "x-tenant-id": foreign.tenantId } })).status()).toBe(403);
  expect((await page.request.post(commandPath, { headers: { ...credentials, "x-csrf-token": "x".repeat(24) }, data: resumeCommands[0] })).status()).toBe(403);
  await second.goto(`/jobs/${foreignJob.jobId}?company=${company.tenantId}`);
  await expect(second.getByRole("heading", { name: "You cannot open this job" })).toBeVisible();
  await expect(panel(second)).toHaveCount(0);

  // Layout: no sideways scroll on this viewport and 44px actions.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const box = await panel(page).getByRole("button", { name: "Load saved site work", exact: true }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  } finally {
    await runtime.end();
  }
});

test("locked close can reopen for invoicing while new site work still requires a linked job", async ({ page }) => {
  const { jobId, account } = await prepareLockJob(page);
  await prepareInvoiceFinalCheck(page, jobId, account);
  await page.goto(`/jobs/${jobId}#site-work`);
  await expect(panel(page).getByTestId("linked-job-offer")).toContainText(LINKED);
  const workPath = `/api/jobs/${jobId}/work-state`;
  const original = await (await page.request.get(workPath)).json();
  await panel(page).getByLabel("Reason").selectOption("completed_outside_jobguard");
  await panel(page).getByLabel("Note (required)").fill("Fictional post-lock administration");
  await click(page, "Close job");
  await expect(panel(page).getByTestId("work-state")).toHaveText("Closed");
  await expect(panel(page).getByTestId("work-state-event").last()).toContainText("Completed outside JobGuard: Fictional post-lock administration");
  const issue = () => page.request.post(`/api/jobs/${jobId}/customer-invoices`, { data: {
    version: "practice-customer-invoice.issue.v1", commandId: randomUUID(), finalAccountRevisionId: account.id,
    expectedSourceHash: account.sourceHash, recipient: "practice-customer@example.invalid", issuedOn: "2026-11-01",
  } });
  const closedInvoice = await issue();
  expect(closedInvoice.ok()).toBe(false);
  expect(await closedInvoice.text()).toContain("JOB_WORK_CLOSED");
  await page.reload();
  await expect(panel(page).getByTestId("work-state")).toHaveText("Closed");
  await click(page, "Reopen job");
  await expect(panel(page).getByTestId("work-state")).toHaveText("Work under way");
  const reopened = await (await page.request.get(workPath)).json();
  expect(reopened.lock).toEqual(original.lock);
  expect(reopened.events.map((event: { kind: string }) => event.kind)).toEqual([
    ...original.events.map((event: { kind: string }) => event.kind), "closed", "reopened",
  ]);
  await expect(panel(page).getByRole("button", { name: "Resume site work", exact: true })).toBeDisabled();
  const invoice = await issue();
  expect(invoice.ok(), await invoice.text()).toBe(true);
  const before = await eventIds(page);
  const { scopeItemId } = await (await page.request.get(`/api/jobs/${jobId}/proof`)).json();
  const refused = await page.request.post(`/api/jobs/${jobId}/proof`, { data: { version: "practice-proof-command.v1", commandId: randomUUID(), action: "select_generated", fixture: "completion-photo", scopeItemId } });
  expect(refused.ok()).toBe(false);
  expect(await refused.text()).toContain("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  await page.reload();
  await expect(panel(page).getByTestId("linked-job-offer")).toContainText(LINKED);
  await expect.poll(() => eventIds(page)).toEqual(before);
});
