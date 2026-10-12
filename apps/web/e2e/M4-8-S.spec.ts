import { expect, test, type Page } from "@playwright/test";
import { recoveryAllocationViewV1 } from "../../api/src/recovery-allocation.contracts";
import { allocationDatabase, allocateThroughUi, allocationPanel, allocationPath, post, readAllocations, readyAllocations, recovery18800, refused } from "./helpers/recovery-allocation-journey";

// NOT RUN (sandbox cannot start PostgreSQL / a browser). Both mobile-360 and desktop run these real-route journeys.
test.setTimeout(360_000);
const value = (page: Page, id: string, expected: string) => expect(allocationPanel(page).getByTestId(id)).toHaveText(expected);
const stable = (row: Awaited<ReturnType<typeof readAllocations>>["allocations"][number]) => {
  const { held: _held, reversedPence: _reversed, ...original } = row; return original;
};
async function allocateBoth(page: Page) {
  const fixture = await recovery18800(page);
  await allocateThroughUi(page, fixture.cases[0]!, "384.00", "£384.00 = £320.00 net + £64.00 tax");
  await allocateThroughUi(page, fixture.cases[1]!, "3000.00", "£3,000.00 = £2,500.00 net + £500.00 tax");
  await value(page, "recovery-gross-movements", "£3,384.00");
  await value(page, "eligible-net", "£2,820.00"); await value(page, "allocated-tax", "£564.00");
  return fixture;
}

test("DW1 persists exact approved allocations and source identities across reload, Jobs navigation and a second context", async ({ page, browser, context }, testInfo) => {
  const fixture = await allocateBoth(page), saved = await readAllocations(page, fixture.jobId);
  expect(saved.allocations).toHaveLength(2);
  const persisted = await allocationDatabase(fixture.jobId);
  expect(persisted.allocated).toHaveLength(2);
  for (const source of fixture.cases) {
    const allocation = saved.allocations.find(row => row.caseId === source.caseId)!;
    expect(allocation).toMatchObject({ paymentId: source.paymentId, evidenceId: source.evidenceId, invoiceId: fixture.invoiceId, grossPence: source.grossPence, eligibleNetPence: source.claimedNetPence, held: false, reversedPence: 0 });
    expect(allocation.taxPence).toBe(source.grossPence - source.claimedNetPence);
    expect(persisted.allocated.find(row => row.id === allocation.id)).toMatchObject({ case_id: source.caseId, payment_id: source.paymentId,
      invoice_id: fixture.invoiceId, movement_id: allocation.movementId, evidence_id: source.evidenceId, object_version_id: allocation.objectVersionId,
      policy_version: allocation.policyVersion, reviewer_ref: allocation.reviewerRef, authorization_id: allocation.authorizationId,
      gross_pence: String(source.grossPence), eligible_net_pence: String(source.claimedNetPence), tax_pence: String(source.grossPence - source.claimedNetPence) });
    expect(allocation.movementId).toMatch(/^[a-f0-9-]{36}$/u); expect(allocation.authorizationId).toMatch(/^[a-f0-9-]{36}$/u);
    expect(allocation.evidenceHash).toMatch(/^[a-f0-9]{64}$/u); expect(allocation.movementHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(allocation.objectVersionId.length).toBeGreaterThan(0); expect(allocation.policyVersion.length).toBeGreaterThan(0);
    expect(allocation.reviewerRef).toMatch(/^membership:[a-f0-9-]{36}$/u);
    const article = allocationPanel(page).locator(`[data-allocation-id="${allocation.id}"]`);
    await article.getByText("Allocation evidence", { exact: true }).click();
    for (const identity of [allocation.movementId, allocation.evidenceId, allocation.objectVersionId, allocation.policyVersion, allocation.reviewerRef, allocation.authorizationId]) await expect(article).toContainText(identity);
  }
  expect(saved.lines.length).toBeGreaterThan(0);
  for (const row of saved.lines) { expect(row.gross.numerator).toMatch(/^-?\d+$/u); expect(row.net.denominator).toMatch(/^\d+$/u); }
  await page.reload(); await readyAllocations(page); await value(page, "eligible-net", "£2,820.00");
  expect((await readAllocations(page, fixture.jobId)).allocations).toEqual(saved.allocations);
  // Captured jobs use the previously accepted Jobs substitute: Jobs, then a new saved-job URL navigation.
  await page.goto("/"); await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
  await page.goto(`/jobs/${fixture.jobId}#recovery-allocations`); await readyAllocations(page);
  await value(page, "allocated-tax", "£564.00");
  const options = {
    ...(testInfo.project.use.viewport === undefined ? {} : { viewport: testInfo.project.use.viewport }),
    ...(testInfo.project.use.baseURL === undefined ? {} : { baseURL: testInfo.project.use.baseURL }),
  };
  const authorized = await browser.newContext({ ...options, storageState: await context.storageState() });
  const stranger = await browser.newContext(options);
  try {
    expect((await stranger.request.get(allocationPath(fixture.jobId))).status()).toBe(401);
    const next = await authorized.newPage(); await next.goto(`/jobs/${fixture.jobId}#recovery-allocations`); await readyAllocations(next);
    await value(next, "eligible-net", "£2,820.00");
    expect((await readAllocations(next, fixture.jobId)).allocations).toEqual(saved.allocations);
  } finally { await authorized.close(); await stranger.close(); }
  for (const control of await allocationPanel(page).locator("button:visible,select:visible,input:visible,summary:visible").all()) {
    const box = await control.boundingBox(); expect(box).not.toBeNull(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByText("Practice sandbox — synthetic data; nothing is sent or charged", { exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: `test-results/M4-8-S-${testInfo.project.name}.png`, fullPage: true });
});

test("DW4 appends an approved reversal, reopens case 2 and keeps the original source facts", async ({ page }) => {
  const fixture = await allocateBoth(page), saved = await readAllocations(page, fixture.jobId), second = fixture.cases[1]!;
  const databaseBefore = await allocationDatabase(fixture.jobId);
  const feedBefore = await (await page.request.get(`/api/jobs/${fixture.jobId}/practice-feed`)).json();
  await post(page, `${fixture.receiptPath}/reversals`, { version: "practice-customer-receipt.reverse.v1", commandId: crypto.randomUUID(), invoiceId: fixture.invoiceId, paymentId: second.paymentId, reason: "Correct a fictional duplicate receipt" });
  await allocationPanel(page).getByRole("button", { name: "Load saved allocations", exact: true }).click(); await readyAllocations(page);
  const allocation = saved.allocations.find(row => row.caseId === second.caseId)!;
  const article = allocationPanel(page).locator(`[data-allocation-id="${allocation.id}"]`);
  await article.getByRole("button", { name: "Review allocation reversal", exact: true }).click();
  await expect(allocationPanel(page).getByTestId("allocation-review-split")).toHaveText("£3,000.00 = £2,500.00 net + £500.00 tax");
  await allocationPanel(page).getByRole("button", { name: "Approve exact allocation reversal", exact: true }).click();
  await value(page, "eligible-net", "£320.00"); await value(page, "allocated-tax", "£64.00");
  await value(page, "customer-invoice-balance", "£22,176.00"); await value(page, "case-2-state", "Reopened — £2,500.00 outstanding");
  await value(page, "fee-execution-state", "Paused — recovery changed");
  const after = await readAllocations(page, fixture.jobId);
  expect(after.allocations.map(stable)).toEqual(saved.allocations.map(stable));
  expect((await allocationDatabase(fixture.jobId)).originals).toEqual(databaseBefore.originals);
  expect(after.allocations.find(row => row.id === allocation.id)?.reversedPence).toBe(300000);
  expect(after.lines.filter(row => row.reversesId !== null).length).toBeGreaterThan(0);
  for (const row of after.lines.filter(row => row.reversesId !== null)) expect(saved.lines.some(original => original.id === row.reversesId)).toBe(true);
  const feedAfter = await (await page.request.get(`/api/jobs/${fixture.jobId}/practice-feed`)).json();
  expect(feedAfter.movements).toEqual(feedBefore.movements);
  await page.reload(); await readyAllocations(page); await value(page, "customer-invoice-balance", "£22,176.00");
});

test("DW5 invalidates only claim 2 proof without changing receipts, allocated rows or invoice balance", async ({ page }) => {
  const fixture = await allocateBoth(page), saved = await readAllocations(page, fixture.jobId);
  await post(page, `/api/jobs/${fixture.jobId}/proof`, { version: "practice-proof-command.v1", action: "invalidate", commandId: crypto.randomUUID(), evidenceId: fixture.cases[1]!.evidenceId, reasonCode: "wrong_subject" });
  await allocationPanel(page).getByRole("button", { name: "Load saved allocations", exact: true }).click(); await readyAllocations(page);
  await value(page, "recovery-gross-movements", "£3,384.00"); await value(page, "customer-invoice-balance", "£19,176.00");
  const after = await readAllocations(page, fixture.jobId);
  expect(after.allocations.map(stable)).toEqual(saved.allocations.map(stable));
  expect(after.allocations.find(row => row.caseId === fixture.cases[1]!.caseId)?.held).toBe(true);
  expect(after.allocations.find(row => row.caseId === fixture.cases[0]!.caseId)?.held).toBe(false);
  expect(after.receipts).toEqual(saved.receipts); expect(after.lines).toEqual(saved.lines);
  await expect(allocationPanel(page).getByTestId("allocation-held")).toHaveCount(1);
  // Q3 remains held: do not assert a founder-unapproved eligible/tax display while held.
});

test("DW3 refuses unavailable cash with a focused error; concurrent alternate approvals and replay conserve the receipt", async ({ page }) => {
  const fixture = await recovery18800(page), source = fixture.cases[0]!, panel = allocationPanel(page);
  await panel.getByLabel("Recovery case", { exact: true }).selectOption(source.caseId);
  await panel.getByLabel("Matched receipt", { exact: true }).selectOption(source.paymentId);
  await panel.getByLabel("Verified recovery evidence", { exact: true }).selectOption(source.evidenceId);
  await panel.getByLabel("Allocation gross (£)", { exact: true }).fill("390.00");
  await panel.getByRole("button", { name: "Review receipt allocation", exact: true }).click();
  await expect(panel.getByTestId("recovery-allocation-error")).toContainText("exceeds"); await expect(panel.getByTestId("recovery-allocation-error")).toBeFocused();
  let saved = await readAllocations(page, fixture.jobId); expect(saved.allocations).toHaveLength(0);
  const command = (target = source) => ({ version: "recovery-allocation-command.v1", action: "review", commandId: crypto.randomUUID(), caseId: target.caseId, paymentId: source.paymentId, evidenceId: target.evidenceId, expectedCaseRevision: saved.cases.find(row => row.caseId === target.caseId)!.revision, grossPence: 38400 });
  await refused(page.request.post(allocationPath(fixture.jobId), { data: { ...command(), reviewerRef: "forged" } }), 400, "INVALID_COMMAND");
  await refused(page.request.post(allocationPath(fixture.jobId), { data: command(), headers: { "x-tenant-id": crypto.randomUUID() } }), 403, "TENANT_FORBIDDEN");
  const { DEMO_TENANT_ID } = await import("@jobguard/db");
  const otherJob = await post(page, "/api/jobs/capture", { contractVersion: "job_capture_v1", requested_tenant_id: DEMO_TENANT_ID,
    captureId: crypto.randomUUID(), source: { kind: "text", text: "JOB: Other fictional job\nITEM: Clean site | £100.00" }, fixtureId: "deterministic-local-v1" });
  const otherCase = await post(page, `/api/jobs/${otherJob.jobId}/recovery-cases`, { version: "recovery-case-command.v1", action: "open", commandId: crypto.randomUUID(),
    caseType: "withheld_customer_payment", claimedNetPence: 32000, counterparty: "Fictional customer", book: "builder_customer", sourceType: "customer_invoice",
    sourceRefs: ["Generated customer invoice INV-18800"], expectedRevision: 0 });
  await refused(page.request.post(allocationPath(fixture.jobId), { data: { ...command(), caseId: otherCase.affectedCaseId } }), 404, "ALLOCATION_NOT_FOUND");
  // Tamper with one outbound command, then continue the actual request: the screen renders the server's genuine wrong-job refusal.
  await panel.getByLabel("Allocation gross (£)", { exact: true }).fill("384.00");
  const scopedRoute = `**${allocationPath(fixture.jobId)}`;
  await page.route(scopedRoute, async route => { if (route.request().method() !== "POST") return route.continue();
    await route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), caseId: otherCase.affectedCaseId }) }); });
  await panel.getByRole("button", { name: "Review receipt allocation", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("ALLOCATION_NOT_FOUND"); await expect(panel.getByRole("alert")).toBeFocused();
  await page.unroute(scopedRoute);
  const reviewA = command(), reviewB = command(fixture.cases[1]!);
  const a = recoveryAllocationViewV1.parse(await post(page, allocationPath(fixture.jobId), reviewA));
  const b = recoveryAllocationViewV1.parse(await post(page, allocationPath(fixture.jobId), reviewB));
  const approveA = { ...reviewA, action: "allocate", commandId: crypto.randomUUID(), approvalHash: a.review!.approvalHash };
  const approveB = { ...reviewB, action: "allocate", commandId: crypto.randomUUID(), approvalHash: b.review!.approvalHash };
  const responses = await Promise.all([page.request.post(allocationPath(fixture.jobId), { data: approveA }), page.request.post(allocationPath(fixture.jobId), { data: approveB })]);
  expect(responses.map(response => response.status()).sort()).toEqual([200, 409]);
  const winning = responses[0]!.status() === 200 ? approveA : approveB;
  const first = recoveryAllocationViewV1.parse(await (responses[0]!.status() === 200 ? responses[0]! : responses[1]!).json());
  const replay = recoveryAllocationViewV1.parse(await post(page, allocationPath(fixture.jobId), winning));
  expect(replay).toEqual(first);
  await refused(page.request.post(allocationPath(fixture.jobId), { data: { ...winning, grossPence: 38394 } }), 409, "ALLOCATION_IDEMPOTENCY_CONFLICT");
  saved = await readAllocations(page, fixture.jobId); expect(saved.allocations).toHaveLength(1); expect(saved.allocations[0]?.grossPence).toBe(38400);
  expect(saved.receipts.find(row => row.paymentId === source.paymentId)?.availablePence).toBe(0);
});

test("pauses after unknown command and failed refresh until a successful saved-state read", async ({ page }) => {
  const fixture = await recovery18800(page), source = fixture.cases[0]!, panel = allocationPanel(page);
  await panel.getByLabel("Recovery case", { exact: true }).selectOption(source.caseId);
  await panel.getByLabel("Matched receipt", { exact: true }).selectOption(source.paymentId);
  await panel.getByLabel("Verified recovery evidence", { exact: true }).selectOption(source.evidenceId);
  await panel.getByLabel("Allocation gross (£)", { exact: true }).fill("384.00");
  let writes = 0, blockRead = false;
  const pattern = `**${allocationPath(fixture.jobId)}`;
  // Fault injection aborts transport only; successful business replies remain real.
  await page.route(pattern, async route => {
    if (route.request().method() === "POST") { writes++; await route.abort("failed"); }
    else if (blockRead) await route.abort("failed"); else await route.continue();
  });
  await panel.getByRole("button", { name: "Review receipt allocation", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("result is unknown"); await expect(panel.getByRole("alert")).toBeFocused();
  await expect(panel.getByLabel("Recovery case", { exact: true })).toBeDisabled(); expect(writes).toBe(1);
  blockRead = true; await panel.getByRole("button", { name: "Load saved allocations", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Changes stay paused"); await expect(panel.getByLabel("Allocation gross (£)", { exact: true })).toBeDisabled();
  blockRead = false; await page.unroute(pattern); await panel.getByRole("button", { name: "Load saved allocations", exact: true }).click(); await readyAllocations(page);
  await expect(panel.getByRole("alert")).toHaveCount(0); await expect(panel.getByRole("button", { name: "Review receipt allocation", exact: true })).toBeEnabled();
  expect(writes).toBe(1); expect((await readAllocations(page, fixture.jobId)).allocations).toHaveLength(0);
});

test("B2/B6 selects an issued credit note and preserves its source through exact reversal approval", async ({ page }) => {
  const fixture = await allocateBoth(page), before = await readAllocations(page, fixture.jobId);
  const databaseBefore = await allocationDatabase(fixture.jobId);
  const allocated = before.allocations.find(row => row.caseId === fixture.cases[1]!.caseId)!;
  const creditPath = `/api/jobs/${fixture.jobId}/customer-invoices/${fixture.invoiceId}/credit-notes`;
  const credit = { invoiceId: fixture.invoiceId, netPence: 50000, reason: "Fictional credit against recovered work" };
  const preview = await post(page, `${creditPath}/preview`, { version: "practice-credit-note.preview.v1", ...credit });
  expect(preview).toMatchObject({ netPence: -50000, taxPence: -10000, totalPence: -60000 });
  const issued = await post(page, creditPath, { version: "practice-credit-note.issue.v1", commandId: crypto.randomUUID(), ...credit, previewHash: preview.previewHash });
  const creditId = issued.credits.at(-1).id as string;
  await allocationPanel(page).getByRole("button", { name: "Load saved allocations", exact: true }).click(); await readyAllocations(page);
  const sources = (await readAllocations(page, fixture.jobId)).reversalSources;
  expect(sources).toContainEqual({ allocationId: allocated.id, sourceId: creditId, kind: "credit_note", availableGrossPence: 60000 });
  const article = allocationPanel(page).locator(`[data-allocation-id="${allocated.id}"]`);
  await article.getByLabel("Recorded reversal source", { exact: true }).selectOption(`credit_note:${creditId}`);
  await article.getByRole("button", { name: "Review allocation reversal", exact: true }).click();
  await expect(allocationPanel(page).getByTestId("allocation-review-split")).toHaveText("£600.00 = £500.00 net + £100.00 tax");
  const sent = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith(`${allocationPath(fixture.jobId)}/reversals`));
  await allocationPanel(page).getByRole("button", { name: "Approve exact allocation reversal", exact: true }).click();
  expect((await sent).postDataJSON()).toMatchObject({ action: "reverse", allocationId: allocated.id, creditNoteId: creditId, grossPence: 60000 });
  await value(page, "eligible-net", "£2,320.00"); await value(page, "allocated-tax", "£464.00");
  const after = await readAllocations(page, fixture.jobId);
  expect(after.allocations.map(stable)).toEqual(before.allocations.map(stable));
  expect(after.allocations.find(row => row.id === allocated.id)?.reversedPence).toBe(60000);
  expect((await allocationDatabase(fixture.jobId)).originals).toEqual(databaseBefore.originals);
  expect(after.receipts.map(({ availablePence: _available, ...original }) => original)).toEqual(before.receipts.map(({ availablePence: _available, ...original }) => original));
  expect(after.reversalSources.filter(source => source.sourceId === creditId && source.availableGrossPence > 0)).toHaveLength(0);
});
