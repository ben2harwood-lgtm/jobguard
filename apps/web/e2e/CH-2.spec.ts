import { expect, test, type Page } from "@playwright/test";
import { openQuotingWatchdogJob, startWatchdogJob } from "./helpers/capture-journey";
import { enterQuote, jsonResult } from "./helpers/customer-invoice-journey";
test.setTimeout(300_000);
const beforeLive = "Switch this job live to use the watchdog — it's free until work starts on site.";
const primaryActions = ["Preview proposed order", "Import generated document", "Match recorded sources", "Check confirmed supplier facts", "Record generated readiness scenario", "Seed relevance scenario", "Attach generated practice image"];
async function assertSandbox(page: Page) {
  await expect(page.getByText("Practice sandbox — synthetic data; nothing is sent or charged", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}
async function assertReadable(page: Page) {
  await enterQuote(page);
  await expect(page.getByTestId("order-proposed-net")).toHaveText("£200.00");
  await expect(page.getByTestId("goods-receipt-count")).toHaveText("1");
  await expect(page.getByTestId("total-to-check")).toHaveText("£90.00");
  await expect(page.getByTestId("stage-status")).toHaveText("Complete");
  await expect(page.getByTestId("real-external-actions")).toHaveText("0");
  await assertSandbox(page);
}
test("watchdog panels require the persisted live state and retain authoritative inputs across clients", async ({ page, browser }, info) => {
  await openQuotingWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  const initial = await jsonResult(page.request.get(`/api/jobs/${jobId}`), "Read quoting job");
  expect(initial.job.status).toBe("quoting");
  expect(initial.environment).toBe("synthetic_demo");
  const scopeIds = initial.job.scopeIdentityIds;
  for (const name of primaryActions) {
    const action = page.getByRole("button", { name, exact: true });
    await expect(action).toBeDisabled();
    await expect(action.locator('xpath=ancestor::div[@data-testid="watchdog-panel"]')).toContainText(beforeLive);
  }
  await assertSandbox(page);
  // Quoting inputs remain available; the order does not.
  await page.getByLabel("SKU", { exact: true }).fill(`CH2-${info.project.name}-${jobId.slice(0, 8)}`);
  await page.getByRole("button", { name: "Save agreed price and material", exact: true }).click();
  await expect(page.getByTestId("required-material-net")).toHaveText("£200.00");
  const readinessId = crypto.randomUUID(), readiness = { version: "readiness-plan.v1", commandId: readinessId, scenarioNow: "2026-03-27T09:00:00.000Z" };
  const refused = await page.request.post(`/api/jobs/${jobId}/readiness/plan`, { data: readiness });
  expect(refused.status()).toBe(409); expect(await refused.json()).toEqual({ code: "JOB_NOT_LIVE" });
  const forged = await page.request.post(`/api/jobs/${jobId}/readiness/plan`, { data: { ...readiness, status: "live", watchdogActive: true } });
  expect(forged.ok()).toBe(false);
  expect((await jsonResult(page.request.get(`/api/jobs/${jobId}/readiness`), "Refused plan has no snapshot")).snapshot).toBeNull();
  const nonMember = await page.request.get(`/api/jobs/${jobId}?requested_tenant_id=33333333-3333-4333-8333-333333333333`);
  expect(nonMember.status()).toBe(403);
  await startWatchdogJob(page);
  const live = await jsonResult(page.request.get(`/api/jobs/${jobId}`), "Read live job");
  expect(live.job.status).toBe("live"); expect(live.job.scopeIdentityIds).toEqual(scopeIds);
  for (const name of primaryActions) await expect(page.getByRole("button", { name, exact: true })).toBeEnabled();
  // A refusal reserves no command identity. Replay succeeds once after live.
  const recorded = await jsonResult(page.request.post(`/api/jobs/${jobId}/readiness/plan`, { data: readiness }), "Retry refused command after live");
  const replay = await jsonResult(page.request.post(`/api/jobs/${jobId}/readiness/plan`, { data: readiness }), "Replay plan");
  expect(replay).toEqual(recorded);
  const changed = await page.request.post(`/api/jobs/${jobId}/readiness/plan`, { data: { ...readiness, resolved: true } });
  expect(changed.status()).toBe(409); expect((await changed.json()).code).toBe("IDEMPOTENCY_CONFLICT");
  // Keyboard focus and touch target of an enabled primary action.
  const preview = page.getByRole("button", { name: "Preview proposed order", exact: true });
  await preview.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab"); await expect(preview).toBeFocused();
  expect(await preview.evaluate(e => getComputedStyle(e).outlineStyle)).not.toBe("none");
  const box = await preview.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
  await page.getByLabel("Order unit price (£)", { exact: true }).fill("20.00");
  await preview.press("Enter"); await expect(page.getByTestId("order-proposed-net")).toHaveText("£200.00");
  const docs = page.locator("#supplier-documents"), picker = docs.locator("select").first();
  await picker.selectOption("materials-B-delivery"); await page.getByRole("button", { name: "Import generated document", exact: true }).click();
  await expect(page.getByTestId("delivery-accepted")).toHaveText("8 each");
  await picker.selectOption("materials-B-invoice"); await page.getByRole("button", { name: "Import generated document", exact: true }).click();
  await docs.getByRole("button", { name: "Confirm supplier document", exact: true }).click();
  await page.getByRole("button", { name: "Match recorded sources", exact: true }).click();
  await expect(page.getByTestId("match-state")).toHaveText("Matched to recorded sources");
  await page.getByRole("button", { name: "Check confirmed supplier facts", exact: true }).click();
  await expect(page.getByTestId("total-to-check")).toHaveText("£90.00");
  await page.getByRole("button", { name: "Seed relevance scenario", exact: true }).click();
  await expect(page.getByTestId("inbox-mandatory-decision-count")).toHaveText("2");
  await page.getByRole("button", { name: "Attach generated practice image", exact: true }).click();
  await page.getByRole("button", { name: "Check file integrity", exact: true }).click();
  await page.getByRole("button", { name: "Complete this stage", exact: true }).click();
  const proof = await jsonResult(page.request.get(`/api/jobs/${jobId}/proof`), "Read persisted proof");
  expect(proof.scopeItemId).toBe(scopeIds[0]); expect(proof.upload.state).toBe("verified"); expect(proof.realExternalActions).toBe(0);
  await page.reload(); await assertReadable(page);
  await page.goto("/");
  await page.locator(`a[href="/jobs/${jobId}"]`).first().click();
  await assertReadable(page);
  const secondContext = await browser.newContext({ storageState: await page.context().storageState() });
  const second = await secondContext.newPage(); await second.goto(`/jobs/${jobId}#work-proof`);
  await assertReadable(second);
  const persisted = await jsonResult(second.request.get(`/api/jobs/${jobId}`), "Second client source identity");
  expect(persisted.job.scopeIdentityIds).toEqual(scopeIds);
  expect((await jsonResult(second.request.get(`/api/jobs/${jobId}/proof`), "Second client proof")).upload.id).toBe(proof.upload.id);
  await page.screenshot({ path: `test-results/CH-2-${info.project.name}.png`, fullPage: true });
  await secondContext.close();
});
