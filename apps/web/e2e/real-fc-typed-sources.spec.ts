import { expect, test, type Page } from "@playwright/test";
import { startWatchdogJob } from "./helpers/capture-journey";

// Explicit phone viewport, real controls and server persistence; no seeded catches or completion.
test.setTimeout(360_000);
test.use({ viewport: { width: 390, height: 844 } });
const request = "Please paint the hallway ceiling as an extra.";
const diary = "also painted the hallway ceiling, customer asked";
async function click(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled(); await button.click();
}

const scenarios = [
  { name: "ordinary typed hallway evidence finishes the check and permits an invoice", note: diary, message: request, found: true },
  { name: "explicit estimated hallway work permits a practice invoice", note: diary + ". Estimated extra 150 pounds.", message: request, found: true },
  { name: "message-only unpriced hallway work permits a practice invoice", note: null, message: request, found: true },
  { name: "case and punctuation variants permit a practice invoice", note: "ALSO PAINTED THE HALLWAY CEILING, CUSTOMER ASKED!", message: "CAN YOU ALSO PAINT THE HALLWAY CEILING?", found: true },
  { name: "readable unrelated originals finish with nothing found and permit an invoice", note: "Weather was sunny today.", message: "Thanks for the update.", found: false },
];
for (const scenario of scenarios) test(scenario.name, async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Start my own practice firm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  await click(page, "＋ Start a new job");
  await page.getByLabel("Work details").fill("JOB: Fictional blue room\nITEM: Paint walls | £200.00");
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
  await messages.getByLabel("Message", { exact: true }).fill(scenario.message);
  await messages.getByRole("button", { name: "Save message", exact: true }).click();
  await expect(messages.getByTestId("customer-message")).toContainText(scenario.message);
  const notes = page.getByTestId("job-diary");
  if (scenario.note !== null) {
    await notes.getByLabel("Note", { exact: true }).fill(scenario.note);
    await notes.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(notes.getByTestId("diary-entry")).toContainText(scenario.note);
  }
  await page.reload();
  await expect(messages.getByTestId("customer-message")).toContainText(scenario.message);
  if (scenario.note !== null) await expect(notes.getByTestId("diary-entry")).toContainText(scenario.note);
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
  const checkPanel = page.getByTestId("final-check-reveal");
  await expect(checkPanel).toHaveAttribute("aria-busy", "false");
  const initial = await (await page.request.get(`/api/jobs/${jobId}/final-check`)).json();
  expect(initial.state).not.toBe("failed");
  if (initial.state !== "completed") await click(page, "Run the final check (practice)");
  await expect.poll(async () => {
    await click(page, "Load the saved final check");
    await expect(checkPanel).toHaveAttribute("aria-busy", "false");
    const saved = await (await page.request.get(`/api/jobs/${jobId}/final-check`)).json();
    expect(saved.state).not.toBe("failed");
    return saved.state;
  }, { timeout: 180_000, intervals: [1000, 3000, 5000] }).toBe("completed");
  // Reload the saved job after persisted completion to refresh the existing invoice guard.
  await page.goto(`/jobs/${jobId}#quote`);
  await click(page, "Load the saved final check");
  await expect(page.getByTestId("final-check-status")).toContainText(scenario.found ? "found 1 thing" : "found nothing missing");
  const items = page.getByTestId("final-check-item");
  await expect(items).toHaveCount(scenario.found ? 1 : 0);
  if (scenario.found) {
    await expect(items).toContainText("hallway ceiling");
    await expect(items.getByRole("listitem")).toHaveCount(scenario.note === null ? 1 : 2);
  }
  const issued = page.waitForResponse(r => r.url().endsWith(`/api/jobs/${jobId}/customer-invoices`) && r.request().method() === "POST");
  await click(page, "Issue and simulate this invoice");
  const response = await issued;
  expect(response.ok(), await response.text()).toBe(true);
  const balance = await page.getByTestId("invoice-balance").textContent();
  expect(balance).toBe("GBP 240.00");
  await test.info().attach("displayed-outstanding-balance", { body: JSON.stringify({ jobId, viewport: page.viewportSize(), balance }), contentType: "application/json" });
  await page.getByTestId("uiwire12-receipt-amount").fill(balance!.replace("GBP ", ""));
  await page.getByTestId("uiwire12-receipt-reference").fill("Fictional typed-source receipt");
  await click(page, "Record practice receipt");
  await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 0.00");
  await expect(page.getByTestId("customer-payment-status")).toHaveText("Paid");
  await page.reload();
  await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 0.00");
  await expect(page.getByTestId("customer-payment-status")).toHaveText("Paid");
  const invoices = await page.request.get(`/api/jobs/${jobId}/customer-invoices`);
  expect(invoices.ok()).toBe(true);
  expect((await invoices.json()).invoices).toHaveLength(1);
});
