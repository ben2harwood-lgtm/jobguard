import { expect, test, type Page } from "@playwright/test";
import { startWatchdogJob } from "./helpers/capture-journey";

// Run headless in mobile-360 and desktop with at most two workers. No seeded catches or mocked responses.
test.setTimeout(360_000);
const request = "Please paint the kitchen ceiling as an extra.";
const diary = "Painted the kitchen ceiling as an extra, customer asked for it. Estimated extra: £150";
async function click(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled(); await button.click();
}

test("paid main bill still flags an approved unbilled catch on Today and overview", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile-360") await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/practice-company?name=Fictional%20Alex");
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  await click(page, "＋ Start a new job");
  await page.getByLabel("Work details").fill("JOB: Fictional decorating\nITEM: Paint walls | £200.00");
  await click(page, "Make my draft");
  await click(page, "Check and edit my draft");
  await click(page, "Save customer and site");
  await click(page, "Accept Paint walls");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  await click(page, "Confirm scope");
  await click(page, "Price the work");
  await startWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  // Reopen the saved job so the site-work and Final Check panels load current state (as REAL-OWN-JOB-TO-PAID does).
  await page.goto(`/jobs/${jobId}#quote`);

  const messages = page.getByTestId("customer-messages");
  await messages.getByLabel("Made-up customer name").fill("Fictional Alex");
  await messages.getByLabel("Message", { exact: true }).fill(request);
  await messages.getByRole("button", { name: "Save message", exact: true }).click();
  await expect(messages.getByTestId("customer-message")).toContainText(request);
  const notes = page.getByTestId("job-diary");
  await notes.getByLabel("Note", { exact: true }).fill(diary);
  await notes.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(notes.getByTestId("diary-entry")).toContainText(diary);
  await expect(page.getByTestId("final-check-item")).toHaveCount(0);

  // Use the existing generated proof controls, without adding evidence fixtures.
  await click(page, "Attach generated practice image");
  await click(page, "Check file integrity");
  await click(page, "Complete this stage");
  await expect(page.getByTestId("stage-status")).toHaveText("Complete");
  await click(page, "Finished on site");
  await expect(page.getByTestId("work-state")).toHaveText("Finished on site");
  await click(page, "Build final account");
  const panel = page.getByTestId("final-account-lock");
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account review");
  const complete = panel.getByRole("button", { name: "Complete final account", exact: true });
  const dispositions = panel.getByRole("combobox");
  for (let index = 0; index < await dispositions.count(); index++) {
    await dispositions.nth(index).selectOption("done");
    await expect(panel).toHaveAttribute("aria-busy", "false");
  }
  const terms = panel.getByRole("button", { name: "Accept final check terms", exact: true });
  if (await terms.isEnabled()) await terms.click();
  await expect(panel).toHaveAttribute("aria-busy", "false");
  // Known stale account state belongs to REAL-OWN-JOB-TO-PAID.
  if (!(await complete.isEnabled())) await click(page, "Rebuild from approved sources");
  await expect(complete).toBeEnabled(); await complete.click();
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");
  await click(page, "Load the saved final check");
  await click(page, "Run the final check (practice)");
  await expect.poll(async () => {
    await click(page, "Load the saved final check");
    return page.getByTestId("final-check-status").textContent();
  }, { timeout: 180_000, intervals: [1000, 3000, 5000] }).toMatch(/found [1-9]/u);
  const item = page.getByTestId("final-check-item").filter({ hasText: "kitchen ceiling" });
  await expect(item).toHaveCount(1);
  await expect(item.getByRole("listitem")).toHaveCount(2);
  await page.reload();
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Yes — this was extra work", exact: true }).click();
  await expect(item.getByTestId("final-check-disposition")).toContainText("added to your extras as a draft");
  const saved = await page.request.get(`/api/jobs/${jobId}/variations`);
  expect(saved.ok()).toBe(true);
  const variations = (await saved.json()).variations;
  const catches = variations.filter((v: { description: string }) => v.description === "kitchen ceiling");
  expect(catches).toHaveLength(1);
  expect(catches[0]).toMatchObject({ state: "draft", currentRevisionId: null });
  await page.reload();
  const draft = page.getByTestId(`variation-${catches[0].id}`);
  await expect(draft).toContainText("kitchen ceiling");
  await expect(draft.getByRole("button", { name: "Change price", exact: true })).toBeVisible();
  await expect(draft.getByRole("button", { name: "Approve exact revision", exact: true })).toHaveCount(0);

  // Issue and pay the original locked account without treating its payment as
  // coverage of the ceiling's later commercial revision.
  const account = async () => {
    const response = await page.request.get(`/api/jobs/${jobId}/final-account`);
    expect(response.ok()).toBe(true); return (await response.json()).account;
  };
  const issue = async (invoiceKind: "final" | "supplementary") => {
    const current = await account();
    const response = await page.request.post(`/api/jobs/${jobId}/final-account/lock`, { data: {
      version: "lock-bound-invoice.issue.v1", commandId: crypto.randomUUID(), invoiceKind,
      finalAccountRevisionId: current.id, expectedSourceHash: current.sourceHash,
      recipient: "fictional@example.invalid", issuedOn: "2026-11-11",
    } });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).invoices;
  };
  const main = (await issue("final"))[0];
  await draft.getByRole("button", { name: "Change price", exact: true }).click();
  await draft.getByLabel(/New price/u).fill("150.00");
  await draft.getByRole("button", { name: "Save new proposed revision", exact: true }).click();
  await expect(draft).toContainText("Price revision 1 · £150.00");
  await draft.getByRole("button", { name: "Approve exact revision", exact: true }).click();
  await expect(draft).toContainText("Approved immutable commercial fact");
  const paid = await page.request.post(`/api/jobs/${jobId}/customer-invoices/${main.id}/receipts`, { data: {
    version: "practice-customer-receipt.record.v1", commandId: crypto.randomUUID(), invoiceId: main.id,
    paidOn: "2026-11-11", amountPence: main.totalPence, method: "bank_transfer", reference: "Fictional main bill",
  } });
  expect(paid.ok(), await paid.text()).toBe(true);
  const href = `/jobs/${jobId}/work#variation-${catches[0].id}`;
  for (const route of ["/today", `/jobs/${jobId}/overview`]) {
    await page.goto(route);
    await expect(page.getByText(/£150.00 net approved extra not yet invoiced/u).first()).toBeVisible();
    const link = page.locator(`a[href="${href}"]`).first();
    await expect(link).toBeVisible(); await link.click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}/work#variation-${catches[0].id}$`));
    await expect(page.getByTestId(`variation-${catches[0].id}`)).toBeVisible();
  }
  // Existing command assembles the descendant account; the supplementary command
  // binds its exact source. Neither an amount match nor the main receipt suffices.
  const rebuilt = await page.request.post(`/api/jobs/${jobId}/final-account`, { data: { version: "final-account.assemble.v1", commandId: crypto.randomUUID() } });
  expect(rebuilt.ok(), await rebuilt.text()).toBe(true);
  const invoices = await issue("supplementary");
  expect(invoices.find((row: { id: string }) => row.id !== main.id).netPence).toBe(15000);
  const valueResponse = await page.request.get(`/api/jobs/${jobId}/value`);
  expect(valueResponse.ok()).toBe(true);
  const value = await valueResponse.json();
  expect(value.catchAttention).toEqual([]);
  expect(value.foundAfterLock.map((row: { id: string }) => row.id)).toEqual([catches[0].id]);
  for (const route of ["/today", `/jobs/${jobId}/overview`]) {
    await page.goto(route);
    await expect(page.getByText("Loading job checks…")).toHaveCount(0);
    await expect(page.getByText(/£150.00 net approved extra not yet invoiced/u)).toHaveCount(0);
  }
});

