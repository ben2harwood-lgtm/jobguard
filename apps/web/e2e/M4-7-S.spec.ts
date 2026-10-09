import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { openReview } from "./helpers/capture-journey";
import { issueInvoice, recordThroughUi } from "./helpers/customer-invoice-journey";

// M4-7-S synthetic settled movement facts. The browser tests run the production Next build against the real PostgreSQL
// database through the same application services as the deployment. Fault injection below only aborts transport.
test.setTimeout(360_000);
const BANNER = "Practice sandbox — synthetic data; nothing is sent or charged";
const MISSING = "No practice movement of this amount has arrived yet.";
const V = (page: Page, id: string, value: string) => expect(page.getByTestId(id)).toHaveText(value);
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const panel = (page: Page) => page.locator("#practice-receipts");
const card = (page: Page, key: string) => panel(page).locator(`[data-testid="practice-movement"][data-movement-key="${key}"]`);
const feedPath = (jobId: string) => `/api/jobs/${jobId}/practice-feed`;
const body = (revision: number, extra: Record<string, unknown>) => ({ version: "practice-feed-command.v1", commandId: crypto.randomUUID(), expectedRevision: revision, ...extra });
const STEPS = { pending: "Pending event", settled: "Settlement event", replay: "Replay of the settlement event", page_overlap: "Overlapping page (pending and settled)",
  alternate_representation: "Same money as a statement line", unknown_duplicate: "Unidentified possible duplicate" } as const;

async function createJob(page: Page) {
  await openReview(page);
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) await page.getByRole("button", { name: `Accept ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Dismiss Replace shelves", exact: true }).click();
  await page.getByLabel("Dismissal reason Replace shelves").fill("Not needed");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");
  await page.getByRole("button", { name: "Confirm scope", exact: true }).click();
  await expect(page.locator("#captured-job-workspace")).toBeVisible();
  return (await page.locator("#captured-job-workspace").getAttribute("data-job-id"))!;
}
async function ready(page: Page) { await expect(page.getByRole("heading", { name: "Practice receipts", exact: true })).toBeVisible(); await expect(panel(page)).toBeVisible(); await expect(panel(page)).toHaveAttribute("aria-busy", "false"); await expect(page.getByTestId("practice-feed-state")).toBeVisible(); }
async function revision(page: Page, expected: number) { await expect(page.getByTestId("practice-feed-revision")).toHaveText(String(expected)); await expect(panel(page)).toHaveAttribute("aria-busy", "false"); }
async function advance(page: Page, key: string, step: keyof typeof STEPS, expectedRevision: number) {
  await page.getByLabel("Generated movement", { exact: true }).selectOption({ value: key });
  await page.getByLabel("Generated event", { exact: true }).selectOption({ label: STEPS[step] });
  await button(page, "Advance practice executor").click();
  await revision(page, expectedRevision);
}
async function saved(page: Page, jobId: string) {
  const response = await page.request.get(feedPath(jobId)); expect(response.status()).toBe(200); return response.json();
}
async function refused(page: Page, jobId: string, data: unknown, status: number, code: string, headers?: Record<string, string>) {
  const response = await page.request.post(feedPath(jobId), { data, ...(headers ? { headers } : {}) });
  expect(response.status(), await response.text()).toBe(status);
  expect(await response.json()).toEqual({ version: "practice-feed-error.v1", code });
}
// C7: sandbox banner once, no horizontal overflow, every panel button at least 44x44 CSS px.
async function layout(page: Page) {
  await expect(page.getByText(BANNER, { exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  for (const control of await panel(page).locator("button:visible, select:visible, summary:visible").all()) {
    const box = await control.boundingBox();
    expect(box, "a visible control has a box").not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
  }
}
// C7: reach the primary action with the keyboard alone and require a visible focus indicator on it.
async function keyboardAdvance(page: Page) {
  const movement = page.getByLabel("Generated movement", { exact: true }), event = page.getByLabel("Generated event", { exact: true }), advanceButton = button(page, "Advance practice executor");
  await movement.focus(); await page.keyboard.press("Tab"); await expect(event).toBeFocused(); await page.keyboard.press("Tab"); await expect(advanceButton).toBeFocused();
  expect(await advanceButton.evaluate((element) => { const style = getComputedStyle(element); return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0; })).toBe(true);
}
function contextOptions(testInfo: TestInfo) {
  const { viewport, baseURL } = testInfo.project.use;
  return { baseURL: baseURL ?? "http://127.0.0.1:3000", ...(viewport ? { viewport } : {}) };
}
// C1: a SECOND browser context reuses A's storageState to read saved facts; a context without a session is refused.
async function secondContextReads(browser: Browser, context: BrowserContext, testInfo: TestInfo, jobId: string, check: (json: any, view: Page) => Promise<void>) {
  const cookie = (await context.cookies()).filter((item) => item.name === "jg_session"); expect(cookie).toHaveLength(1);
  const options = contextOptions(testInfo);
  const stranger = await browser.newContext(options), second = await browser.newContext({ ...options, storageState: await context.storageState() });
  try {
    expect((await stranger.request.get(feedPath(jobId))).status()).toBe(401);
    const json = await (await second.request.get(feedPath(jobId))).json();
    const view = await second.newPage(); await view.goto(`/jobs/${jobId}`);
    await expect(view.locator("#captured-job-workspace")).toHaveAttribute("data-job-id", jobId); await ready(view);
    await check(json, view);
  } finally { await second.close(); await stranger.close(); }
}
// C7 asks to "open the job from Jobs". Captured practice jobs are by design not listed on the Jobs home, so (Ben's decision) this is met by
// going to Jobs and reopening the saved job on a fresh navigation, plus the second browser context above.
async function reopenFromJobs(page: Page, jobId: string) {
  await page.goto("/"); await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
  await page.goto(`/jobs/${jobId}`); await expect(page.locator("#captured-job-workspace")).toHaveAttribute("data-job-id", jobId); await ready(page);
}

test("a NEW stranger session cannot snapshot or connect a captured job before its creator touches the feed", async ({ page, context, browser }, testInfo) => {
  // Capture creates the binding, but reviewing proposals does not read/register the feed.
  const captureResponse = page.waitForResponse(response => response.url().endsWith("/api/jobs/capture") && response.request().method() === "POST");
  await openReview(page);
  const captured = await captureResponse; expect(captured.status()).toBe(201);
  const { jobId } = await captured.json(); expect(jobId).toBeTruthy();
  const stranger = await browser.newContext(contextOptions(testInfo));
  try {
    expect((await stranger.request.post("/api/session")).status()).toBe(200);
    const aCookie = (await context.cookies()).find(cookie => cookie.name === "jg_session")!;
    const bCookie = (await stranger.cookies()).find(cookie => cookie.name === "jg_session")!;
    expect(bCookie.value).not.toBe(aCookie.value);
    const missing = await stranger.request.get(feedPath(crypto.randomUUID()));
    const snapshot = await stranger.request.get(feedPath(jobId));
    expect(snapshot.status()).toBe(404); expect(await snapshot.json()).toEqual(await missing.json());
    expect(await snapshot.json()).toEqual({ version: "practice-feed-error.v1", code: "NOT_FOUND" });
    const connect = await stranger.request.post(feedPath(jobId), { data: body(0, { action: "connect" }) });
    expect(connect.status()).toBe(404); expect(await connect.json()).toEqual({ version: "practice-feed-error.v1", code: "NOT_FOUND" });
    const untouched = await saved(page, jobId);
    expect(untouched).toMatchObject({ revision: 0, accountId: null, feedState: "not_connected", eventCount: 0, movements: [], receipts: [] });
    const ownerConnect = await page.request.post(feedPath(jobId), { data: body(0, { action: "connect" }) });
    expect(ownerConnect.status()).toBe(200);
    const state = await ownerConnect.json(); expect(state).toMatchObject({ revision: 1, feedState: "connected", eventCount: 0 });
    expect((await stranger.request.get(feedPath(jobId))).status()).toBe(404);
    expect(await saved(page, jobId)).toEqual(state);
    const second = await browser.newContext({ ...contextOptions(testInfo), storageState: await context.storageState() });
    try { const persisted = await second.request.get(feedPath(jobId)); expect(persisted.status()).toBe(200); expect(await persisted.json()).toEqual(state); }
    finally { await second.close(); }
  } finally { await stranger.close(); }
});

test("£384: pending cannot qualify, settled stays unallocated, only a matched receipt qualifies, disconnect keeps history", async ({ page, context, browser }, testInfo) => {
  const { jobId } = await issueInvoice(page);
  await recordThroughUi(page, "384.00");
  await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 936.00", { timeout: 30_000 });
  await button(page, "Load saved practice receipts").click(); await ready(page);

  // Before connecting: the receipt is the builder's own record and cannot qualify; the money labels are pounds, never pence.
  await V(page, "practice-feed-state", "Not connected"); await V(page, "practice-feed-consent", "Not given");
  await V(page, "receipt-amount", "£384.00");
  await V(page, "receipt-qualification", "Builder-attested only — cannot qualify yet"); await V(page, "receipt-hint", MISSING);
  await expect(button(page, "Match £384.00 receipt to its settled movement")).toBeDisabled();
  await V(page, "allocated-eligible-net", "£0.00"); await V(page, "practice-feed-real-external-actions", "0");

  await button(page, "Connect practice feed").click(); await revision(page, 1);
  await V(page, "practice-feed-state", "Connected"); await V(page, "practice-feed-consent", "Read generated movements only");
  await keyboardAdvance(page);
  await page.keyboard.press("Enter"); await revision(page, 2);   // keyboard-only: the default generated event is the pending £384

  // A pending £384 shows "Pending — cannot qualify", is never allocated, and cannot verify the receipt.
  await expect(card(page, "receipt-384").getByTestId("movement-gross")).toHaveText("£384.00");
  await expect(card(page, "receipt-384").getByTestId("movement-state")).toHaveText("Pending — cannot qualify");
  await expect(panel(page).getByText("Pending — cannot qualify", { exact: true })).toBeVisible();
  await V(page, "allocated-eligible-net", "£0.00");
  await V(page, "receipt-qualification", "Builder-attested only — cannot qualify yet");
  await V(page, "receipt-hint", "The matching movement is still pending, so this receipt cannot qualify yet.");
  await expect(button(page, "Match £384.00 receipt to its settled movement")).toBeDisabled();
  const pendingView = await saved(page, jobId);
  const paymentId = pendingView.receipts[0].paymentId as string;
  await refused(page, jobId, body(pendingView.revision, { action: "match_receipt", movement: "receipt-384", paymentId }), 409, "PRACTICE_FEED_MOVEMENT_NOT_SETTLED");
  await page.reload(); await ready(page);
  await expect(card(page, "receipt-384").getByTestId("movement-state")).toHaveText("Pending — cannot qualify");

  // Once settled it shows "Simulated settled movement" with allocated-eligible-net still £0.00.
  await advance(page, "receipt-384", "settled", 3);
  await expect(card(page, "receipt-384").getByTestId("movement-state")).toHaveText("Simulated settled movement");
  await expect(panel(page).getByText("Simulated settled movement", { exact: true })).toBeVisible();
  await V(page, "allocated-eligible-net", "£0.00");
  await expect(card(page, "receipt-384").getByTestId("movement-allocated-net")).toHaveText("£0.00");
  await expect(card(page, "receipt-384").getByTestId("movement-allocation-note")).toHaveText("Ready for a separate allocation review — nothing allocated");
  // Settlement alone does not qualify the builder's receipt: it is ready to match, not matched.
  await V(page, "receipt-qualification", "Builder-attested only — cannot qualify yet");
  await V(page, "receipt-hint", "A settled simulated movement of this exact amount is ready to match.");

  // Replays, overlapping pages, a known alternate representation and a late pending event all keep ONE movement.
  let expected = 3;
  for (const step of ["replay", "page_overlap", "alternate_representation", "pending"] as const) {
    await advance(page, "receipt-384", step, ++expected);
    await V(page, "underlying-movement-count", "1"); await expect(panel(page).getByTestId("practice-movement")).toHaveCount(1);
    await expect(card(page, "receipt-384").getByTestId("movement-state")).toHaveText("Simulated settled movement");
  }
  await V(page, "practice-feed-event-count", "3");
  await expect(page.getByTestId("receipt-event-id")).toHaveText(["pending-receipt-384", "settled-receipt-384", "statement-receipt-384"]);
  await expect(page.getByTestId("receipt-source-hash")).toHaveCount(3);

  // Matching the settled movement is what makes the builder-attested receipt qualify. It still allocates nothing.
  const match = button(page, "Match £384.00 receipt to its settled movement"); await expect(match).toBeEnabled();
  await match.click(); await revision(page, ++expected);
  await V(page, "receipt-qualification", "Qualifies — verified by a simulated settled movement");
  await V(page, "receipt-hint", "Matched to a simulated settled movement. Nothing has been allocated.");
  await V(page, "receipt-matched-movement", "receipt-384");
  await V(page, "allocated-eligible-net", "£0.00");
  // Settlement and a matched receipt opened and landed nothing: the job still has no recovery case at all.
  expect(await (await page.request.get(`/api/jobs/${jobId}/recovery-cases`)).json()).toMatchObject({ cases: [], realExternalActions: 0 });
  await expect(match).toHaveCount(0);
  const matchedView = await saved(page, jobId);
  expect(matchedView.receipts[0].assessment).toMatchObject({ status: "qualifies", reason: "matched", matchedMovementKey: "receipt-384" });
  expect(matchedView.allocatedEligibleNetPence).toBe(0);
  await layout(page);

  // A duplicate that arrives AFTER the match holds the receipt: the saved match is history, but it cannot be reported as qualifying
  // until a human reconciles the duplicate. Reconciling restores it without a new match.
  await advance(page, "receipt-384", "unknown_duplicate", ++expected);
  await expect(panel(page).getByText("Possible duplicate movement — review needed", { exact: true })).toBeVisible();
  await V(page, "receipt-qualification", "Builder-attested only — cannot qualify yet");
  await V(page, "receipt-hint", "The matching movement is held as a possible duplicate, so this receipt cannot qualify until it is reconciled. The saved match is kept.");
  await V(page, "receipt-matched-movement", "receipt-384");
  expect((await saved(page, jobId)).receipts[0].assessment).toMatchObject({ status: "attested_only", reason: "duplicate_held", matchedMovementKey: "receipt-384" });
  await page.reload(); await ready(page);
  await V(page, "receipt-qualification", "Builder-attested only — cannot qualify yet");
  await button(page, "Reconcile generated duplicate").click(); await revision(page, ++expected);
  await expect(panel(page).getByText("Possible duplicate movement — review needed", { exact: true })).toHaveCount(0);
  await V(page, "receipt-qualification", "Qualifies — verified by a simulated settled movement");
  await V(page, "allocated-eligible-net", "£0.00");

  // Persistence: reload, reopen from Jobs and a second browser context all read the same saved facts and source identity.
  await page.reload(); await ready(page);
  await V(page, "receipt-qualification", "Qualifies — verified by a simulated settled movement");
  await reopenFromJobs(page, jobId);
  await V(page, "receipt-qualification", "Qualifies — verified by a simulated settled movement");
  await expect(card(page, "receipt-384").getByTestId("movement-state")).toHaveText("Simulated settled movement");
  await expect(page.getByTestId("receipt-job-id")).toHaveText(jobId);
  await expect(page.getByTestId("practice-account-id")).toHaveText(matchedView.accountId);
  await expect(page.getByTestId("receipt-movement-id")).toHaveText(`${matchedView.accountId}:receipt-384`);
  await secondContextReads(browser, context, testInfo, jobId, async (json, view) => {
    expect(json).toMatchObject({ accountId: matchedView.accountId, feedState: "connected", revision: expected, allocatedEligibleNetPence: 0 });
    expect(json.movements[0]).toMatchObject({ id: `${matchedView.accountId}:receipt-384`, state: "settled", grossPence: 38_400 });
    await V(view, "receipt-qualification", "Qualifies — verified by a simulated settled movement"); await V(view, "allocated-eligible-net", "£0.00");
  });

  // Disconnect keeps history and stops everything else.
  await button(page, "Disconnect practice feed").click(); await revision(page, ++expected);
  await V(page, "practice-feed-state", "Disconnected"); await V(page, "practice-feed-consent", "Revoked");
  await expect(card(page, "receipt-384").getByTestId("movement-state")).toHaveText("Simulated settled movement");
  await V(page, "receipt-qualification", "Qualifies — verified by a simulated settled movement");
  await expect(button(page, "Advance practice executor")).toHaveCount(0); await expect(button(page, "Disconnect practice feed")).toHaveCount(0);
  await expect(page.getByText("New events and matches are stopped. Past movement facts and their source history remain available.", { exact: true })).toBeVisible();
  await refused(page, jobId, body(expected, { action: "advance", movement: "receipt-3000", step: "settled" }), 409, "PRACTICE_FEED_DISCONNECTED");
  await refused(page, jobId, body(expected, { action: "disconnect" }), 409, "PRACTICE_FEED_DISCONNECTED");
  await page.reload(); await ready(page);
  await V(page, "practice-feed-state", "Disconnected");
  await expect(card(page, "receipt-384").getByTestId("movement-state")).toHaveText("Simulated settled movement"); await V(page, "practice-feed-event-count", "4");
  await secondContextReads(browser, context, testInfo, jobId, async (json, view) => {
    expect(json).toMatchObject({ feedState: "disconnected", consent: { revokedAtRevision: expected }, movementCount: 1 });
    await V(view, "practice-feed-state", "Disconnected");
  });
  await layout(page);
  await page.screenshot({ path: `test-results/M4-7-S-${testInfo.project.name}.png`, fullPage: true });
});

test("holds an unknown duplicate for review, then shows every fixed generated movement in exact pounds", async ({ page, context, browser }, testInfo) => {
  const jobId = await createJob(page); await ready(page);
  await button(page, "Connect practice feed").click(); await revision(page, 1);
  await advance(page, "receipt-3000", "settled", 2);
  await expect(card(page, "receipt-3000").getByTestId("movement-gross")).toHaveText("£3,000.00");
  await advance(page, "receipt-3000", "unknown_duplicate", 3);
  // The unknown duplicate is its own held movement and blocks its settled sibling until a human reconciles it.
  await expect(panel(page).getByText("Possible duplicate movement — review needed", { exact: true })).toBeVisible();
  await expect(panel(page).getByTestId("practice-movement")).toHaveCount(2);
  await expect(card(page, "receipt-3000").first().getByTestId("movement-allocation-note")).toHaveText("Held until its possible duplicate is reconciled");
  await expect(panel(page).locator('[data-movement-state="possible_duplicate"]').getByTestId("movement-allocation-note")).toHaveText("Held — ineligible for allocation until reconciled");
  await V(page, "underlying-movement-count", "1"); await V(page, "allocated-eligible-net", "£0.00");
  await layout(page);
  await page.reload(); await ready(page);
  await expect(panel(page).getByText("Possible duplicate movement — review needed", { exact: true })).toBeVisible();
  await button(page, "Reconcile generated duplicate").click(); await revision(page, 4);
  await expect(panel(page).getByText("Possible duplicate movement — review needed", { exact: true })).toHaveCount(0);
  await expect(panel(page).getByTestId("practice-movement")).toHaveCount(1);
  await expect(card(page, "receipt-3000").getByTestId("movement-state")).toHaveText("Simulated settled movement");
  await expect(card(page, "receipt-3000").getByTestId("movement-allocation-note")).toHaveText("Ready for a separate allocation review — nothing allocated");
  await V(page, "practice-feed-event-count", "2"); await V(page, "allocated-eligible-net", "£0.00");
  await refused(page, jobId, body(4, { action: "reconcile_duplicate", movement: "receipt-3000" }), 409, "PRACTICE_FEED_DUPLICATE_NOT_FOUND");

  // The remaining fixed movements, through the real route, then read back in catalogue order.
  let current = 4;
  for (const key of ["receipt-384", "receipt-41280", "receipt-24000", "receipt-17280", "receipt-960", "supplier-refund-540"]) {
    const response = await page.request.post(feedPath(jobId), { data: body(current++, { action: "advance", movement: key, step: "settled" }) });
    expect(response.status(), await response.text()).toBe(200);
  }
  await page.reload(); await ready(page);
  await expect(panel(page).getByTestId("practice-movement")).toHaveCount(7);
  await expect(panel(page).getByTestId("practice-movement").evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.movementKey)))
    .resolves.toEqual(["receipt-384", "receipt-3000", "receipt-41280", "receipt-24000", "receipt-17280", "receipt-960", "supplier-refund-540"]);
  await expect(panel(page).getByTestId("movement-gross")).toHaveText(["£384.00", "£3,000.00", "£41,280.00", "£24,000.00", "£17,280.00", "£960.00", "£540.00"]);
  await expect(panel(page).getByTestId("movement-state")).toHaveText(Array(7).fill("Simulated settled movement"));
  await expect(panel(page).getByTestId("movement-allocated-net")).toHaveText(Array(7).fill("£0.00"));
  await expect(card(page, "supplier-refund-540").getByRole("heading", { name: "Fictional supplier refund", exact: true })).toBeVisible();
  await expect(card(page, "receipt-24000").getByRole("heading", { name: "Fictional customer receipt", exact: true })).toBeVisible();
  await V(page, "underlying-movement-count", "7"); await V(page, "allocated-eligible-net", "£0.00");
  await layout(page);
  await secondContextReads(browser, context, testInfo, jobId, async (json, view) => {
    expect(json.movements.map((item: any) => item.grossPence)).toEqual([38_400, 300_000, 4_128_000, 2_400_000, 1_728_000, 96_000, 54_000]);
    expect(json.movements.every((item: any) => item.allocatedEligibleNetPence === 0)).toBe(true);
    await expect(view.getByTestId("practice-movement")).toHaveCount(7);
  });
  await reopenFromJobs(page, jobId); await expect(panel(page).getByTestId("practice-movement")).toHaveCount(7);
  await page.screenshot({ path: `test-results/M4-7-S-catalogue-${testInfo.project.name}.png`, fullPage: true });
});

test("refuses forged, unauthorised and conflicting requests, and persists nothing from them", async ({ page, context, browser }, testInfo) => {
  const jobId = await createJob(page); await ready(page);
  // Creation-time ownership refuses another server-issued practice session BEFORE anything is connected:
  // it can neither read the job's receipts nor connect the feed first.
  const early = await browser.newContext(contextOptions(testInfo));
  expect((await early.request.post("/api/session")).status()).toBe(200);
  try {
    const read = await early.request.get(feedPath(jobId)); expect(read.status()).toBe(404); expect(await read.json()).toEqual({ version: "practice-feed-error.v1", code: "NOT_FOUND" });
    const connect = await early.request.post(feedPath(jobId), { data: body(0, { action: "connect" }) });
    expect(connect.status()).toBe(404); expect(await connect.json()).toEqual({ version: "practice-feed-error.v1", code: "NOT_FOUND" });
  } finally { await early.close(); }
  await V(page, "practice-feed-state", "Not connected");
  await button(page, "Connect practice feed").click(); await revision(page, 1);
  const first = await saved(page, jobId);
  // Forged authority: amounts, states, identities, environments and accounts are never accepted from a browser.
  for (const forged of [
    { amountPence: 38_400 }, { grossPence: 99_999_999 }, { state: "settled" }, { settled: true }, { eventId: "settled-receipt-384" }, { tenantId: crypto.randomUUID() },
    { accountId: crypto.randomUUID() }, { environment: "production_billing" }, { environment: "pilot_no_charge" }, { eligibleForAllocation: true }, { allocatedEligibleNetPence: 38_400 },
  ]) await refused(page, jobId, body(1, { action: "advance", movement: "receipt-384", step: "settled", ...forged }), 400, "INVALID_COMMAND");
  for (const invalid of [
    { action: "advance", movement: "receipt-385", step: "settled" }, { action: "advance", movement: "receipt-384", step: "refund" }, { action: "advance", movement: "receipt-384" },
    { action: "match_receipt", movement: "supplier-refund-540", paymentId: crypto.randomUUID() }, { action: "match_receipt", movement: "receipt-384", paymentId: "not-a-uuid" }, { action: "wire_money" },
  ]) await refused(page, jobId, body(1, invalid), 400, "INVALID_COMMAND");
  const malformed = await page.request.post(feedPath(jobId), { data: "{not json", headers: { "content-type": "application/json" } });
  expect(malformed.status()).toBe(400); expect(await malformed.json()).toEqual({ version: "practice-feed-error.v1", code: "INVALID_COMMAND" });
  // A client cannot choose its tenant, and an ambiguous query fails closed.
  await refused(page, jobId, body(1, { action: "disconnect" }), 403, "TENANT_FORBIDDEN", { "x-tenant-id": crypto.randomUUID() });
  const ambiguous = await page.request.get(`${feedPath(jobId)}?limit=1&limit=2`); expect(ambiguous.status()).toBe(400);
  expect((await page.request.get(`${feedPath(jobId)}?limit=0`)).status()).toBe(400);
  // A command that does not match the saved revision is a typed conflict; a receipt for nothing is refused; replays are idempotent.
  await refused(page, jobId, body(0, { action: "advance", movement: "receipt-384", step: "settled" }), 409, "PRACTICE_FEED_STALE_REVISION");
  await refused(page, jobId, body(1, { action: "match_receipt", movement: "receipt-384", paymentId: crypto.randomUUID() }), 409, "PRACTICE_FEED_RECEIPT_MISMATCH");
  await refused(page, jobId, body(1, { action: "advance", movement: "receipt-960", step: "unknown_duplicate" }), 409, "PRACTICE_FEED_SETTLEMENT_REQUIRED");
  const same = body(1, { action: "advance", movement: "receipt-960", step: "settled" });
  const [a, b] = await Promise.all([page.request.post(feedPath(jobId), { data: same }), page.request.post(feedPath(jobId), { data: same })]);
  expect([a.status(), b.status()]).toEqual([200, 200]); expect(await a.json()).toEqual(await b.json());
  await refused(page, jobId, { ...same, step: "pending" }, 409, "IDEMPOTENCY_PAYLOAD_CONFLICT");
  // Two clients racing from one revision produce one effect and one typed stale-revision conflict.
  const race = await Promise.all([1, 2].map((n) => page.request.post(feedPath(jobId), { data: body(2, { action: "advance", movement: n === 1 ? "receipt-384" : "receipt-3000", step: "settled" }) })));
  expect(race.map((response) => response.status()).sort()).toEqual([200, 409]);
  const after = await saved(page, jobId);
  expect(after.revision).toBe(3); expect(after.eventCount).toBe(2); expect(after.allocatedEligibleNetPence).toBe(0);
  expect(after.movements.map((item: any) => item.grossPence).sort((x: number, y: number) => x - y)).toHaveLength(2);
  expect(first.revision).toBe(1);

  // A stranger without the practice session, and another practice session, are refused; neither can read or change the saved feed.
  const stranger = await browser.newContext(contextOptions(testInfo));
  const otherSession = await browser.newContext(contextOptions(testInfo));
  expect((await otherSession.request.post("/api/session")).status()).toBe(200);
  const unissued = await browser.newContext(contextOptions(testInfo));
  await unissued.addCookies([{ name: "jg_session", value: crypto.randomUUID(), domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  try {
    for (const outsider of [stranger, otherSession, unissued]) {
      const expectedStatus = outsider === otherSession ? 404 : 401;
      expect((await outsider.request.get(feedPath(jobId))).status()).toBe(expectedStatus);
      expect((await outsider.request.post(feedPath(jobId), { data: body(after.revision, { action: "disconnect" }) })).status()).toBe(expectedStatus);
    }
  } finally { await stranger.close(); await otherSession.close(); await unissued.close(); }
  expect((await saved(page, jobId)).feedState).toBe("connected");
  await secondContextReads(browser, context, testInfo, jobId, async (json) => { expect(json).toMatchObject({ revision: 3, eventCount: 2, feedState: "connected" }); });
});

test("pauses further changes until the saved state is read after an unknown transport result", async ({ page }, testInfo) => {
  const jobId = await createJob(page); await ready(page);
  await button(page, "Connect practice feed").click(); await revision(page, 1);
  let writes = 0, reads = 0, blockReads = false;
  // Fault injection aborts transport only; no successful business response is faked.
  const route = new RegExp(`/api/jobs/${jobId}/practice-feed(\\?.*)?$`);
  await page.route(route, async (request) => {
    if (request.request().method() === "POST") { writes++; await request.abort("failed"); }
    else if (blockReads) { reads++; await request.abort("failed"); }
    else await request.continue();
  });
  await button(page, "Advance practice executor").click();
  const unknown = "The result is unknown. Read the saved practice feed before doing anything else.";
  await expect(panel(page).getByRole("alert")).toHaveText(unknown); await expect(panel(page).getByRole("alert")).toBeFocused();
  await expect(button(page, "Advance practice executor")).toBeDisabled(); await expect(button(page, "Disconnect practice feed")).toBeDisabled();
  await expect(page.getByLabel("Generated movement", { exact: true })).toBeDisabled();
  expect(writes).toBe(1);
  // Reading the saved state ALSO fails: the pause must survive (and must not claim that nothing was changed).
  blockReads = true;
  await button(page, "Load saved practice receipts").click();
  await expect.poll(() => reads).toBeGreaterThan(0);
  await expect(panel(page).getByRole("alert")).toContainText("Changes stay paused until it is read.");
  await expect(panel(page).getByRole("alert")).not.toContainText("Nothing was changed");
  await expect(button(page, "Advance practice executor")).toBeDisabled(); await expect(button(page, "Disconnect practice feed")).toBeDisabled();
  await expect(page.getByLabel("Generated movement", { exact: true })).toBeDisabled(); await expect(page.getByLabel("Generated event", { exact: true })).toBeDisabled();
  await button(page, "Load saved practice receipts").click();
  await expect(button(page, "Advance practice executor")).toBeDisabled();
  expect(writes).toBe(1);
  // Only a successful read of the saved state lifts the pause.
  blockReads = false; await page.unroute(route);
  await button(page, "Load saved practice receipts").click(); await ready(page);
  await expect(panel(page).getByRole("alert")).toHaveCount(0);
  await V(page, "practice-feed-state", "Connected"); await revision(page, 1); await expect(panel(page).getByTestId("practice-movement")).toHaveCount(0);
  await expect(button(page, "Advance practice executor")).toBeEnabled();
  await layout(page);
  await page.screenshot({ path: `test-results/M4-7-S-fault-${testInfo.project.name}.png`, fullPage: true });
});
