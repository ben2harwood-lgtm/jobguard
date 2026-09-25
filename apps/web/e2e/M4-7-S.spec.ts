import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { PracticeFeedResponse } from "@jobguard/api/practice-feed-contracts";
import { openReview } from "./helpers/capture-journey";

test.setTimeout(240_000);
const banner = "Practice sandbox — synthetic data; nothing is sent or charged";
const panel = (page: Page) => page.getByRole("region", { name: "Practice receipts", exact: true });
const endpoint = (jobId: string) => `/api/jobs/${jobId}/practice-feed`;

async function createJob(page: Page) {
  await openReview(page);
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) {
    await page.getByRole("button", { name: `Accept ${name}`, exact: true }).click();
  }
  await page.getByRole("button", { name: "Dismiss Replace shelves", exact: true }).click();
  await page.getByLabel("Dismissal reason Replace shelves").fill("Not needed for this fictional job");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");
  await page.getByRole("button", { name: "Confirm scope", exact: true }).click();
  const workspace = page.locator("#captured-job-workspace");
  await expect(workspace).toBeVisible();
  const jobId = await workspace.getAttribute("data-job-id");
  expect(jobId).toBeTruthy();
  await expect(page.getByTestId("practice-feed-state")).toHaveText("Not connected");
  await expect(panel(page).getByText("No practice movements recorded yet.", { exact: true })).toBeVisible();
  return jobId!;
}

async function read(page: Page, jobId: string): Promise<PracticeFeedResponse> {
  const response = await page.request.get(endpoint(jobId));
  expect(response.ok()).toBe(true);
  return response.json() as Promise<PracticeFeedResponse>;
}

async function clickCommand(page: Page, jobId: string, name: string): Promise<PracticeFeedResponse> {
  const response = page.waitForResponse(result => new URL(result.url()).pathname === endpoint(jobId) && result.request().method() === "POST");
  await panel(page).getByRole("button", { name, exact: true }).click();
  const result = await response;
  expect(result.ok()).toBe(true);
  const body = await result.json() as PracticeFeedResponse;
  expect(body.environment).toBe("synthetic_demo");
  expect(body.realExternalActions).toBe(0);
  await expect(panel(page)).toHaveAttribute("aria-busy", "false");
  return body;
}

async function advance(page: Page, jobId: string, scenario: string) {
  await page.getByLabel("Generated receipt scenario", { exact: true }).selectOption(scenario);
  return clickCommand(page, jobId, "Advance practice executor");
}

async function sources(page: Page, view: PracticeFeedResponse) {
  const details = page.getByTestId("practice-receipt-sources");
  if (await details.getAttribute("open") === null) await details.getByText("Practice receipt details and sources", { exact: true }).click();
  await expect(page.getByTestId("receipt-job-id")).toHaveText(view.jobId);
  await expect(page.getByTestId("practice-account-id")).toHaveText(view.accountId ?? "No account yet");
  await expect(page.getByTestId("practice-feed-revision")).toHaveText(String(view.revision));
  await expect(page.getByTestId("receipt-movement-id")).toHaveText(view.movements.map(movement => movement.id));
  await expect(page.getByTestId("receipt-underlying-id")).toHaveText(view.movements.map(movement => movement.underlyingMovementId));
  await expect(page.getByTestId("receipt-event-id")).toHaveText(view.movements.flatMap(movement => movement.eventIds));
  await expect(page.getByTestId("receipt-source-hash")).toHaveText(view.movements.flatMap(movement => movement.sourceHashes));
}

async function uiChecks(page: Page) {
  await expect(page.getByText(banner, { exact: true })).toHaveCount(1);
  await expect(panel(page).getByText(/bank-verified|TrueLayer|OAuth|Stripe|GoCardless/iu)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  for (const control of await panel(page).locator("button:visible, select:visible, summary:visible").all()) {
    const bounds = await control.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
}

async function reenterFromJobs(page: Page, view: PracticeFeedResponse) {
  await page.reload();
  await sources(page, view);
  await page.goto("/");
  await page.locator(`a[href="/jobs/${view.jobId}"]`).click();
  await sources(page, view);
  await uiChecks(page);
}

async function sameSession(browser: Browser, context: BrowserContext, jobId: string, baseURL: string) {
  const second = await browser.newContext({ baseURL, storageState: await context.storageState() });
  const page = await second.newPage();
  await page.goto(`/jobs/${jobId}#practice-receipts`);
  return { context: second, page };
}

test("records pending and settled facts, reconciles representation duplicates, and keeps facts after disconnect", async ({ page, browser, context }, testInfo) => {
  const jobId = await createJob(page);
  const connect = panel(page).getByRole("button", { name: "Connect practice feed", exact: true });
  await connect.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(connect).toBeFocused();
  expect(await connect.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await clickCommand(page, jobId, "Connect practice feed");
  await expect(page.getByTestId("practice-feed-state")).toHaveText("Connected");
  let view = await advance(page, jobId, "pending_384");
  await expect(page.getByTestId("movement-gross")).toHaveText("£384.00");
  await expect(page.getByTestId("movement-state")).toHaveText("Pending — cannot qualify");
  await expect(page.getByTestId("movement-allocation-state")).toHaveText("Ineligible for allocation");
  await expect(page.getByTestId("allocated-eligible-net")).toHaveText("£0.00");
  expect(view.movements).toHaveLength(1);
  const movementId = view.movements[0]!.underlyingMovementId;
  await page.reload();
  await expect(page.getByTestId("movement-state")).toHaveText("Pending — cannot qualify");
  await sources(page, view);
  view = await advance(page, jobId, "settled_384");
  await expect(page.getByTestId("movement-state")).toHaveText("Simulated settled movement");
  await expect(page.getByTestId("allocated-eligible-net")).toHaveText("£0.00");
  for (const scenario of ["replay_event", "page_overlap", "alternate_representation"]) {
    view = await advance(page, jobId, scenario);
    expect(view.movements).toHaveLength(1);
    expect(view.movements[0]!.underlyingMovementId).toBe(movementId);
    await expect(page.getByTestId("underlying-movement-count")).toHaveText("1");
  }
  view = await advance(page, jobId, "unknown_duplicate");
  await expect(page.getByTestId("possible-duplicate-state")).toHaveText("Possible duplicate movement — review needed");
  expect(view.movements.every(movement => !movement.eligibleForAllocation)).toBe(true);
  await expect(page.getByTestId("movement-allocation-state")).toHaveText("Ineligible for allocation");
  await expect(page.getByTestId("allocated-eligible-net")).toHaveText("£0.00");
  const firstPageResponse = await page.request.get(`${endpoint(jobId)}?limit=1`);
  expect(firstPageResponse.ok()).toBe(true);
  const firstPage = await firstPageResponse.json() as PracticeFeedResponse;
  expect(firstPage.movements).toHaveLength(1);
  expect(firstPage.nextCursor).not.toBeNull();
  const nextPageResponse = await page.request.get(`${endpoint(jobId)}?limit=1&cursor=${firstPage.nextCursor}`);
  expect(nextPageResponse.ok()).toBe(true);
  const nextPage = await nextPageResponse.json() as PracticeFeedResponse;
  expect(nextPage.movements).toHaveLength(1);
  expect(nextPage.movements[0]!.id).not.toBe(firstPage.movements[0]!.id);
  const repeatedPage = await page.request.get(`${endpoint(jobId)}?limit=1&cursor=${firstPage.nextCursor}`);
  expect(await repeatedPage.json()).toEqual(nextPage);
  await page.reload();
  await expect(page.getByTestId("possible-duplicate-state")).toBeVisible();
  await sources(page, view);
  view = await clickCommand(page, jobId, "Reconcile generated duplicate");
  expect(view.movements).toHaveLength(1);
  expect(view.movements[0]!.underlyingMovementId).toBe(movementId);
  await expect(page.getByTestId("possible-duplicate-state")).toHaveCount(0);
  await expect(page.getByTestId("allocated-eligible-net")).toHaveText("£0.00");
  const retainedMovement = structuredClone(view.movements);
  view = await clickCommand(page, jobId, "Disconnect practice feed");
  await expect(page.getByTestId("practice-feed-state")).toHaveText("Disconnected");
  expect(view.movements).toEqual(retainedMovement);
  expect(view.realExternalActions).toBe(0);
  const stopped = await page.request.post(endpoint(jobId), { data: { version: "practice-feed-command.v1", commandId: crypto.randomUUID(), expectedRevision: view.revision, action: "advance", scenario: "settled_384" } });
  expect(stopped.status()).toBeGreaterThanOrEqual(400);
  expect(await read(page, jobId)).toEqual(view);
  await reenterFromJobs(page, view);
  const other = await sameSession(browser, context, jobId, new URL(page.url()).origin);
  await sources(other.page, view);
  await expect(other.page.getByTestId("practice-feed-state")).toHaveText("Disconnected");
  await other.context.close();
  await panel(page).screenshot({ path: `test-results/M4-7-S-${testInfo.project.name}.png` });
});

test("rejects forged receipt authority, preserves command identity, and makes concurrent stale writes visible", async ({ page, browser, context }) => {
  const jobId = await createJob(page);
  let view = await clickCommand(page, jobId, "Connect practice feed");
  view = await advance(page, jobId, "pending_384");
  const base = { version: "practice-feed-command.v1", commandId: crypto.randomUUID(), expectedRevision: view.revision, action: "advance", scenario: "settled_384" };
  const forgeries = [
    { amountPence: 38400 }, { grossPence: 38400, state: "settled" },
    { tenantId: crypto.randomUUID() }, { requested_tenant_id: crypto.randomUUID() }, { accountId: crypto.randomUUID() },
    { eventId: "forged-event", signature: "not-a-server-event" },
    { event: { accountId: view.accountId, grossPence: 38400, state: "settled" } },
    { environment: "production_billing" }, { environment: "pilot_no_charge" },
  ];
  for (const forged of forgeries) {
    const response = await page.request.post(endpoint(jobId), { data: { ...base, commandId: crypto.randomUUID(), ...forged } });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
    expect(await read(page, jobId)).toEqual(view);
  }
  for (const query of ["tenantId=forged", "accountId=forged", "cursor=-1", "limit=0", "environment=production_billing"]) {
    expect((await page.request.get(`${endpoint(jobId)}?${query}`)).status()).toBe(400);
  }
  await page.reload();
  await expect(page.getByTestId("movement-state")).toHaveText("Pending — cannot qualify");
  await sources(page, view);

  const copied = await sameSession(browser, context, jobId, new URL(page.url()).origin);
  await expect(copied.page.getByTestId("movement-state")).toHaveText("Pending — cannot qualify");
  const idempotentCommand = { ...base, commandId: crypto.randomUUID() };
  const original = await page.request.post(endpoint(jobId), { data: idempotentCommand });
  expect(original.ok()).toBe(true);
  view = await original.json() as PracticeFeedResponse;
  const replay = await page.request.post(endpoint(jobId), { data: idempotentCommand });
  expect(replay.ok()).toBe(true);
  expect(await replay.json()).toEqual(view);
  const changedReplay = await page.request.post(endpoint(jobId), { data: { ...idempotentCommand, scenario: "unknown_duplicate" } });
  expect(changedReplay.status()).toBe(409);
  expect(await read(page, jobId)).toEqual(view);

  await copied.page.getByLabel("Generated receipt scenario", { exact: true }).selectOption("settled_384");
  await panel(copied.page).getByRole("button", { name: "Advance practice executor", exact: true }).click();
  const alert = panel(copied.page).getByRole("alert");
  await expect(alert).toBeFocused();
  await expect(alert).toContainText("Load its saved state before trying again.");
  await panel(copied.page).getByRole("button", { name: "Load saved practice receipts", exact: true }).click();
  await expect(copied.page.getByTestId("movement-state")).toHaveText("Simulated settled movement");
  await sources(copied.page, view);
  const racingCommands = [page, copied.page].map((client, index) => client.request.post(endpoint(jobId), {
    data: { version: "practice-feed-command.v1", commandId: crypto.randomUUID(), expectedRevision: view.revision, action: "advance", scenario: index === 0 ? "page_overlap" : "alternate_representation" },
  }));
  const responses = await Promise.all(racingCommands);
  expect(responses.map(response => response.status()).sort()).toEqual([200, 409]);
  view = await read(page, jobId);
  expect(view.movements).toHaveLength(1);
  expect(view.movements[0]!.allocatedEligibleNetPence).toBe(0);
  await copied.context.close();

  const outsider = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const outsiderPage = await outsider.newPage();
  expect((await outsiderPage.request.get(endpoint(jobId))).status()).toBe(401);
  await outsiderPage.goto("/");
  await outsiderPage.getByRole("button", { name: "Start the demo", exact: true }).click();
  await outsiderPage.getByRole("button", { name: "Skip tour", exact: true }).click();
  const denied = await outsiderPage.request.get(endpoint(jobId));
  expect([403, 404]).toContain(denied.status());
  expect(await denied.text()).not.toContain(view.accountId!);
  const deniedWrite = await outsiderPage.request.post(endpoint(jobId), { data: { version: "practice-feed-command.v1", commandId: crypto.randomUUID(), expectedRevision: view.revision, action: "disconnect" } });
  expect([403, 404]).toContain(deniedWrite.status());
  await outsiderPage.goto(`/jobs/${jobId}#practice-receipts`);
  await expect(outsiderPage.getByTestId("receipt-movement-id")).toHaveCount(0);
  await outsider.close();
  expect(await read(page, jobId)).toEqual(view);
  await reenterFromJobs(page, view);
});

test("shows transport errors and reloads authoritative facts without inventing settlement", async ({ page }) => {
  const jobId = await createJob(page);
  await clickCommand(page, jobId, "Connect practice feed");
  const view = await advance(page, jobId, "pending_384");
  // The only browser network fault is an aborted transport, never an intercepted success body.
  let releaseFault!: () => void;
  const faultGate = new Promise<void>(resolve => { releaseFault = resolve; });
  await page.route(`**${endpoint(jobId)}`, async route => { await faultGate; await route.abort("failed"); });
  await page.reload();
  try {
    await expect(panel(page).getByRole("status")).toHaveText("Loading practice receipts…");
  } finally {
    releaseFault();
  }
  const alert = panel(page).getByRole("alert");
  await expect(alert).toContainText("Practice receipts could not load.");
  await expect(alert).toBeFocused();
  await expect(page.getByTestId("movement-state")).toHaveCount(0);
  await uiChecks(page);
  await page.unroute(`**${endpoint(jobId)}`);
  await panel(page).getByRole("button", { name: "Load saved practice receipts", exact: true }).click();
  await expect(page.getByTestId("movement-state")).toHaveText("Pending — cannot qualify");
  await page.route(`**${endpoint(jobId)}`, route => route.request().method() === "POST" ? route.abort("failed") : route.continue());
  await page.getByLabel("Generated receipt scenario", { exact: true }).selectOption("settled_384");
  await panel(page).getByRole("button", { name: "Advance practice executor", exact: true }).click();
  await expect(alert).toBeFocused();
  await expect(page.getByTestId("movement-state")).toHaveText("Pending — cannot qualify");
  await expect(page.getByTestId("allocated-eligible-net")).toHaveText("£0.00");
  await page.unroute(`**${endpoint(jobId)}`);
  expect(await read(page, jobId)).toEqual(view);
  await reenterFromJobs(page, view);
});
