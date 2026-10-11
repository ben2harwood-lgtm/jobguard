import { expect, test, type Page } from "@playwright/test";
import { openLiveWatchdogJob, openQuotingWatchdogJob, startWatchdogJob } from "./helpers/capture-journey";
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
  // Quoting inputs remain available before live. The order form only renders once a
  // material and agreed price exist, so save them first; then every primary action is disabled.
  await page.getByLabel("SKU", { exact: true }).fill(`CH2-${info.project.name}-${jobId.slice(0, 8)}`);
  await page.getByRole("button", { name: "Save agreed price and material", exact: true }).click();
  await expect(page.getByTestId("required-material-net")).toHaveText("£200.00");
  for (const name of primaryActions) {
    const action = page.getByRole("button", { name, exact: true });
    await expect(action).toBeDisabled();
    await expect(action.locator('xpath=ancestor::div[@data-testid="watchdog-panel"]')).toContainText(beforeLive);
  }
  await assertSandbox(page);
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
  const changedKind = await page.request.post(`/api/jobs/${jobId}/readiness/advance`, { data: { version: "readiness-clock.v1", commandId: readinessId, scenarioNow: readiness.scenarioNow } });
  expect(changedKind.status()).toBe(409); expect(await changedKind.json()).toEqual({ code: "IDEMPOTENCY_CONFLICT" });
  const otherPage = await page.context().newPage();
  const ownedJobs = await jsonResult(otherPage.request.get("/api/jobs?tenantId=11111111-1111-4111-8111-111111111111"), "Read this session's home jobs");
  const ownedLive = ownedJobs.jobs.find((job: { title: string }) => job.title === seededJobs[0].title);
  expect(ownedLive).toBeDefined();
  // This context is already signed in: reopen its session-owned live job directly.
  await otherPage.goto(`/jobs/${ownedLive.id}`);
  await expect(otherPage.getByTestId("job-status")).toHaveText(seededJobs[0].label);
  const otherJobId = (await otherPage.getByTestId("job-id").textContent())!;
  expect(otherJobId).toBe(ownedLive.id);
  expect((await jsonResult(otherPage.request.get(`/api/jobs/${otherJobId}`), "Read second live job")).job.status).toBe("live");
  expect(otherJobId).not.toBe(jobId);
  const changedJob = await page.request.post(`/api/jobs/${otherJobId}/readiness/plan`, { data: readiness });
  expect(changedJob.status()).toBe(409); expect(await changedJob.json()).toEqual({ code: "IDEMPOTENCY_CONFLICT" });
  await otherPage.close();
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
  // The demo's Jobs list shows only its seeded jobs, so a captured job is reopened by deep link.
  await page.goto(`/jobs/${jobId}`);
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

// The Jobs list shows the demo's seeded jobs only: a captured job has its own "Continue this job" flow and
// is reopened by deep link above. These two seeded jobs are reached through their actual Jobs links.
const seededJobs = [
  { title: "Kitchen extension", label: "Work under way", status: "live" },
  { title: "Loft conversion", label: "Quote being prepared", status: "quoting" },
] as const;
async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start the demo", exact: true }).click();
  const skip = page.getByRole("button", { name: "Skip tour", exact: true });
  await skip.waitFor({ state: "visible" }); await skip.click();
}
for (const recipe of seededJobs) {
  test(`${recipe.title} reopens through its Jobs link and the persisted ${recipe.status} state decides the watchdog`, async ({ page, browser }) => {
    await signIn(page);
    const home = await jsonResult(page.request.get("/api/jobs?tenantId=11111111-1111-4111-8111-111111111111"), "Read session-owned Jobs links");
    const owned = home.jobs.find((job: { title: string }) => job.title === recipe.title);
    expect(owned).toBeDefined();
    const seeded = { ...recipe, id: owned.id as string };
    expect(seeded.id).toMatch(/^[a-f0-9-]{36}$/u);
    const link = page.getByRole("article").filter({ hasText: seeded.title }).locator(`a[href="/jobs/${seeded.id}"]`);
    await expect(link).toBeVisible(); await link.click();
    await page.waitForURL(`**/jobs/${seeded.id}`);
    await expect(page.getByTestId("job-status")).toHaveText(seeded.label);
    await expect(page.getByTestId("job-id")).toHaveText(seeded.id);
    const read = async (client: Page, step: string) => (await jsonResult(client.request.get(`/api/jobs/${seeded.id}`), step)).job;
    const persisted = await read(page, "Read persisted lifecycle");
    expect(persisted.status).toBe(seeded.status); expect(persisted.id).toBe(seeded.id);
    if (seeded.status !== "live") {
      // A real write attempt is refused and leaves the job and its inputs exactly as they were.
      const refused = await page.request.post(`/api/jobs/${seeded.id}/readiness/plan`, { data: { version: "readiness-plan.v1", commandId: crypto.randomUUID(), scenarioNow: "2026-03-27T09:00:00.000Z" } });
      expect(refused.status()).toBe(409); expect(await refused.json()).toEqual({ code: "JOB_NOT_LIVE" });
      expect((await jsonResult(page.request.get(`/api/jobs/${seeded.id}/readiness`), "Refused plan has no snapshot")).snapshot).toBeNull();
      expect(await read(page, "Job unchanged by the refusal")).toEqual(persisted);
    }
    await page.reload();
    await expect(page.getByTestId("job-status")).toHaveText(seeded.label);
    const secondContext = await browser.newContext({ storageState: await page.context().storageState() });
    const second = await secondContext.newPage(); await second.goto(`/jobs/${seeded.id}`);
    await expect(second.getByTestId("job-status")).toHaveText(seeded.label);
    expect(await read(second, "Second client lifecycle")).toEqual(persisted);
    await secondContext.close();
  });
}

// CH-2 Done-when, through the shared application/web boundary: a replayed command returns the response it FIRST gave. Each of the three
// live-only proof actions is replayed after the job has moved on (the file finalised, the stage completed, the proof invalidated,
// which opens a newer Decision), and none of them is answered from today's state or refused because the Decision changed.
test("proof commands replay the response they first gave, after later finalisation, completion and invalidation", async ({ page }) => {
  await openLiveWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  const view = await jsonResult(page.request.get(`/api/jobs/${jobId}/proof`), "Read proof");
  const version = "practice-proof-command.v1";
  const post = (body: object) => page.request.post(`/api/jobs/${jobId}/proof`, { data: body });
  const run = (body: object, step: string) => jsonResult(post(body), step);
  const select = { version, action: "select_generated", commandId: crypto.randomUUID(), scopeItemId: view.scopeItemId, fixture: "completion-photo" };
  const selected = await run(select, "Select a generated file");
  expect(selected.upload.state).toBe("pending");
  const finalize = { version, action: "finalize", commandId: crypto.randomUUID(), uploadId: selected.upload.id, objectVersionId: selected.upload.objectVersionId };
  const finalized = await run(finalize, "Finalise the file");
  expect(finalized.upload.state).toBe("verified");
  const complete = { version, action: "complete", commandId: crypto.randomUUID(), evidenceId: finalized.upload.evidenceId, scopeItemId: view.scopeItemId };
  const completed = await run(complete, "Complete the stage");
  expect(completed.completion).not.toBeNull();
  // The job moves on: invalidating the proof records rework and opens a newer Decision.
  const invalidated = await run({ version, action: "invalidate", commandId: crypto.randomUUID(), evidenceId: finalized.upload.evidenceId, reasonCode: "verification_invalid" }, "Invalidate the proof");
  expect(invalidated.completion.reviewRequired).toBe(true);
  expect(invalidated.decisionId).not.toBe(completed.decisionId);
  // Each command, unchanged, returns exactly what it first returned.
  expect(await run(select, "Replay select"), "select_generated replay").toEqual(selected);
  expect(await run(finalize, "Replay finalise"), "finalize replay").toEqual(finalized);
  expect(await run(complete, "Replay complete"), "complete replay").toEqual(completed);
  // The same id with a different request is a conflict, never a replay.
  for (const [name, changed] of [["select_generated", { ...select, scopeItemId: crypto.randomUUID() }], ["finalize", { ...finalize, objectVersionId: "another-version" }], ["complete", { ...complete, scopeItemId: crypto.randomUUID() }]] as const) {
    const refused = await post(changed);
    expect(refused.status(), `${name} with a changed request`).toBe(409);
  }
  // Nothing was added by the replays, and the persisted state is what the invalidation left.
  const after = await jsonResult(page.request.get(`/api/jobs/${jobId}/proof`), "Read proof after replays");
  expect(after.upload.id).toBe(selected.upload.id); expect(after.completion.id).toBe(completed.completion.id); expect(after.realExternalActions).toBe(0);
});
