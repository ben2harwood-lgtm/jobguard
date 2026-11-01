import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { finishDispositionsAndTerms, prepareLockJob } from "./helpers/final-account-lock-journey";
import { enterQuote, recordThroughUi } from "./helpers/customer-invoice-journey";
import { get, post } from "./helpers/recovery-sources";

// DEMO-A1's remaining five scenarios. Both configured projects run each test
// from a new practice session/job. Setup and outcomes use HTTP/UI only: even
// Final Check completion belongs to the real scheduled worker, never SQL setup.
test.setTimeout(300_000);
const path = (jobId: string, resource: string) => `/api/jobs/${jobId}/${resource}`;
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const money = (pence: number) => `GBP ${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function checkedJob(page: Page, extra = false) {
  const fixture = await prepareLockJob(page), { jobId, account } = fixture;
  await post(page, path(jobId, "final-account/terms"), {
    version: "final-check-terms.accept.v1", commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1",
  });
  if (extra) {
    // This exact fictional original has the existing reviewed practice decoder.
    await post(page, path(jobId, "diary"), {
      version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: "Fitted outside tap.",
    });
    expect((await get(page, path(jobId, "diary"))).entries).toHaveLength(1);
  }
  await finishDispositionsAndTerms(page);
  await button(page, "Complete final account").click();
  await expect.poll(async () => (await get(page, path(jobId, "final-account/lock"))).lock?.finalAccountRevisionId).toBe(account.id);
  // Discovery runs once per minute. No completion certificate is manufactured.
  await expect.poll(async () => (await get(page, path(jobId, "final-check"))).state,
    { timeout: 180_000, intervals: [5_000] }).toBe("completed");
  const check = await get(page, path(jobId, "final-check"));
  expect(check.items).toHaveLength(extra ? 1 : 0);
  if (extra) expect(check.items[0].description).toContain("outside tap");
  await page.goto(`/jobs/${jobId}#final-check`);
  await expect(page.getByTestId("final-check-reveal")).toHaveAttribute("aria-busy", "false");
  return { ...fixture, check };
}

async function zeroRecovery(page: Page, jobId: string) {
  const cases = await get(page, path(jobId, "recovery-cases"));
  expect(cases.realExternalActions).toBe(0);
  for (const row of cases.cases) expect(row).toMatchObject({ landedNetPence: 0, approvedLandedNetPence: 0,
    feeJobLiabilityPence: 0, feeObligationsPostedPence: 0, feeCompensationsPostedPence: 0 });
  const history = await get(page, path(jobId, "success-fee-attribution"));
  expect(history).toMatchObject({ productionEnabled: false, realExternalActions: 0, revisions: [] });
  expect((await get(page, path(jobId, "recovery-allocations"))).allocations).toEqual([]);
}

async function freshInvoice(page: Page) {
  const { jobId, account } = await checkedJob(page);
  const issued = await post(page, path(jobId, "customer-invoices"), {
    version: "practice-customer-invoice.issue.v1", commandId: randomUUID(), finalAccountRevisionId: account.id,
    expectedSourceHash: account.sourceHash, recipient: "fictional@example.invalid", issuedOn: "2026-10-31",
  });
  expect(issued.invoices).toHaveLength(1);
  const invoice = issued.invoices[0];
  expect(invoice.balancePence).toBe(invoice.totalPence);
  expect(invoice.totalPence).toBeGreaterThan(50000);
  await page.reload(); await enterQuote(page);
  await expect(button(page, "Record practice receipt")).toBeEnabled();
  return { jobId, invoice, receiptPath: path(jobId, `customer-invoices/${invoice.id}/receipts`) };
}

async function incompleteShadowReport(page: Page, jobId: string) {
  const report = await get(page, path(jobId, "shadow-demo"));
  expect(report).toMatchObject({ status: "incomplete", realExternalActions: 0, assessments: [] });
  expect(report.customerApproval).toEqual({ state: "awaiting_customer", approvals: [] });
  expect(report.invoices.invoices).toEqual([]);
  await page.goto(`/demo-s/shadow-30000?jobId=${jobId}`);
  await button(page, "Load saved J3 evidence").click();
  const saved = page.getByRole("region", { name: "Saved shadow journey report" });
  await expect(saved.getByText("Incomplete. Step 6: awaiting customer approval. No fee is charged.", { exact: true })).toBeVisible();
  await expect(saved).toContainText("No fee is charged");
  await expect(saved).toContainText("No invoice issued");
}

test("DEMO-S evidence after lock: late intake is honestly refused, never added to the locked check", async ({ page }) => {
  const { jobId, check } = await checkedJob(page);
  const locked = await get(page, path(jobId, "final-account/lock"));
  const before = await get(page, path(jobId, "diary"));
  await page.goto(`/jobs/${jobId}#job-diary`);
  const diary = page.getByTestId("job-diary");
  await expect(diary).toHaveAttribute("aria-busy", "false");
  await diary.getByLabel("Note", { exact: true }).fill("Fitted outside tap.");
  const refused = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(path(jobId, "diary")));
  await diary.getByRole("button", { name: "Save note", exact: true }).click();
  const response = await refused;
  expect(response.status()).toBe(422);
  expect(await response.json()).toMatchObject({ code: "POST_LOCK_WORK_REQUIRES_LINKED_JOB", realExternalActions: 0 });
  await expect(diary.getByRole("alert")).toContainText("final account is locked");
  await expect(diary.getByLabel("Note", { exact: true })).toHaveValue("Fitted outside tap.");
  await page.reload();
  expect(await get(page, path(jobId, "diary"))).toEqual(before);
  expect(await get(page, path(jobId, "final-check"))).toEqual(check);
  expect(await get(page, path(jobId, "final-account/lock"))).toEqual(locked);
  await expect(page.getByTestId("final-check-post-lock")).toHaveCount(0);
  await zeroRecovery(page, jobId);
  // Remaining blocker: late-source import/display is not ready; this proves the
  // current refusal, not the plan's eventual usable, permanently fee-free item.
});

test("DEMO-S disputed attribution: an unmatched included claim persists as disputed with no fee", async ({ page }) => {
  const { jobId, check } = await checkedJob(page, true), signal = check.items[0];
  const command = { version: "final-check.disposition.v1", commandId: randomUUID(), lockId: check.lockId,
    runId: check.runId, signalId: signal.signalId, expectedSignalRevision: signal.signalRevision,
    answer: "already_included", referenceId: null };
  // Public command permits an unmatched claim; the browser picker requires a
  // named line. Do not invent a line reference just to get through the form.
  const disputed = await post(page, path(jobId, "final-check/dispositions"), command);
  expect(disputed.disposition).toBe("attribution_disputed");
  expect(await post(page, path(jobId, "final-check/dispositions"), command)).toEqual(disputed);
  const queue = await get(page, path(jobId, "final-check/disputes"));
  expect(queue).toEqual([expect.objectContaining({ signalId: signal.signalId, lockId: check.lockId, answer: "already_included" })]);
  await page.reload();
  await expect(page.getByTestId("final-check-disposition")).toHaveText("Your answer: Disputed: paused with no fee until an independent review exists");
  await expect(page.getByTestId("final-check-disputes")).toContainText("1 answer is disputed: paused with no fee");
  expect((await get(page, path(jobId, "recovery-cases"))).cases).toEqual([]);
  await zeroRecovery(page, jobId);
  expect(await get(page, path(jobId, "final-check/disputes"))).toEqual(queue);
});

test("DEMO-S unpaid catches: a real revealed catch stays unpaid and fee-free at the customer-approval blocker", async ({ page }) => {
  const { jobId, check } = await checkedJob(page, true), signal = check.items[0];
  const command = { version: "final-check.catch.v1", commandId: randomUUID(), lockId: check.lockId,
    runId: check.runId, signalId: signal.signalId, expectedSignalRevision: signal.signalRevision };
  const caught = await post(page, path(jobId, "final-check/catches"), command);
  expect(await post(page, path(jobId, "final-check/catches"), command)).toEqual(caught);
  expect(caught).toMatchObject({ disposition: "confirmed_extra", variationId: command.commandId });
  const revised = await post(page, path(jobId, "variations"), {
    version: "variation-command.v1", action: "revise", variationId: caught.variationId, revisionId: randomUUID(),
    expectedRevisionId: null, description: "Fictional outside tap", price: { quantity: "1", unit: "item", unitRatePence: 50000, direction: "addition" },
  });
  expect(revised.variations).toHaveLength(1);
  expect(revised.variations[0]).toMatchObject({ id: caught.variationId, state: "priced" });
  expect(revised.variations[0].revisions[0]).toMatchObject({ signedDeltaPence: 50000, approved: false });
  await page.reload();
  expect((await get(page, path(jobId, "variations"))).variations).toEqual(revised.variations);
  await expect(page.getByTestId("final-check-disposition")).toContainText("nothing is charged until your customer approves");
  await zeroRecovery(page, jobId);
  await incompleteShadowReport(page, jobId);
  // Remaining blocker: authenticated customer approval and the downstream
  // invoiced/settled catch are not ready. A priced proposal is never payment.
});

test("DEMO-S partial and duplicate receipts: one command reduces the balance once and never qualifies as settlement", async ({ page }) => {
  const { jobId, invoice, receiptPath } = await freshInvoice(page);
  const command = { version: "practice-customer-receipt.record.v1", commandId: randomUUID(), invoiceId: invoice.id,
    paidOn: "2026-10-31", amountPence: 50000, method: "bank_transfer", reference: "Fictional partial receipt" };
  const first = await post(page, receiptPath, command);
  expect(first.receipts).toHaveLength(1);
  expect(first.invoice).toMatchObject({ balancePence: invoice.totalPence - 50000, paidPence: 50000 });
  const replay = await post(page, receiptPath, command);
  expect(replay).toEqual(first);
  expect((await page.request.post(receiptPath, { data: { ...command, amountPence: 50001 } })).status()).toBe(409);
  await page.reload(); await enterQuote(page);
  await expect(page.getByTestId("customer-payment-status")).toHaveText("Part paid");
  await expect(page.getByTestId("invoice-balance")).toHaveText(money(invoice.totalPence - 50000));
  await expect(page.getByTestId("uiwire12-receipt-history")).toHaveCount(1);
  await expect(page.getByTestId("eligible-recovery-principal")).toHaveText("GBP 0.00");
  expect(await get(page, receiptPath)).toEqual(first);
  await zeroRecovery(page, jobId);
});

test("DEMO-S unknown outcomes: a committed receipt with a lost reply pauses changes and reconciles to one saved receipt", async ({ page }) => {
  const { jobId, invoice, receiptPath } = await freshInvoice(page);
  const commands: Record<string, unknown>[] = [];
  await page.route(`**${receiptPath}`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    commands.push(route.request().postDataJSON());
    // Deliver the real request and commit, then lose only the transport reply.
    const response = await route.fetch();
    expect(response.ok(), await response.text()).toBe(true);
    await route.abort("failed");
  });
  await recordThroughUi(page, "500.00");
  await expect(page.getByText("Further receipt changes are paused because the last result is unknown. Read the saved history before leaving this page.", { exact: true })).toBeVisible();
  await expect(button(page, "Record practice receipt")).toBeDisabled();
  expect(commands).toHaveLength(1);
  await page.unroute(`**${receiptPath}`);
  await button(page, "Refresh receipt history").click();
  await expect(page.getByTestId("uiwire12-receipt-history")).toHaveCount(1);
  // This screen conservatively retains the pause after a read. It does not
  // silently retry with a new identity or claim that a missing reply failed.
  await expect(button(page, "Record practice receipt")).toBeDisabled();
  const saved = await get(page, receiptPath);
  expect(saved.receipts).toHaveLength(1);
  expect(saved.invoice.balancePence).toBe(invoice.totalPence - 50000);
  expect(await post(page, receiptPath, commands[0])).toEqual(saved);
  await page.reload(); await enterQuote(page);
  await expect(page.getByTestId("uiwire12-receipt-history")).toHaveCount(1);
  await expect(page.getByTestId("invoice-balance")).toHaveText(money(invoice.totalPence - 50000));
  await expect(page.getByTestId("eligible-recovery-principal")).toHaveText("GBP 0.00");
  expect(await get(page, receiptPath)).toEqual(saved);
  expect(commands).toHaveLength(1);
  await zeroRecovery(page, jobId);
});
