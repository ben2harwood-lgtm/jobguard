import { expect, test, type Page } from "@playwright/test";
import { startWatchdogJob } from "./helpers/capture-journey";

// Run headless in mobile-360 and desktop with at most two workers. No seeded catches or mocked responses.
test.setTimeout(360_000);
const request = "can you also paint the hallway ceiling? Happy to pay extra";
const diary = "Painted the hallway ceiling as asked, three hours extra, about 150 pounds";
async function click(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled(); await button.click();
}

test("own blank-firm job finds omitted hallway work and confirms only a draft extra", async ({ page }) => {
  await page.goto("/practice-company?name=Fictional%20Alex");
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  await click(page, "＋ Start a new job");
  await page.getByLabel("Work details").fill("JOB: Fictional blue room\nITEM: Paint walls | £200.00");
  await click(page, "Make my draft");
  await click(page, "Check and edit my draft");
  await click(page, "Save customer and site");
  // Scope confirmation must wait for the normal save to reload its persisted binding.
  await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
  await expect(page.getByTestId("party-site")).toHaveText("14 Fictional Street, London, SW1A 1AA");
  await expect(page.getByRole("form", { name: "Customer and site details" }).getByText(/^Saved at /u)).toBeVisible();
  await click(page, "Accept Paint walls");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  await click(page, "Confirm scope");
  await click(page, "Price the work");
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
  await expect(page.locator(".quote-line")).toHaveCount(1);
  await expect(page.getByLabel("Quantity Paint walls", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("Unit Paint walls", { exact: true })).toHaveValue("item");
  await expect(page.getByLabel("Unit rate Paint walls", { exact: true })).toHaveValue("200.00");
  await expect(page.getByTestId("quote-net")).toHaveText("GBP 200.00");
  const coverage = page.getByRole("region", { name: "Coverage diff" });
  await expect(coverage).toContainText("Unpriced captured scope: 0");
  await expect(coverage).toContainText("Blocking questions: 0");
  await expect(page.getByRole("button", { name: "Preview immutable quote", exact: true })).toBeEnabled();
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
  }, { timeout: 180_000, intervals: [1000, 3000, 5000] }).toContain("found 1 thing");
  const item = page.getByTestId("final-check-item").filter({ hasText: "hallway ceiling" });
  await expect(item).toHaveCount(1);
  await expect(item.getByRole("listitem")).toHaveCount(2);
  await page.reload();
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Yes — this was extra work", exact: true }).click();
  await expect(item.getByTestId("final-check-disposition")).toContainText("added to your extras as a draft");
  const saved = await page.request.get(`/api/jobs/${jobId}/variations`);
  expect(saved.ok()).toBe(true);
  const variations = (await saved.json()).variations;
  const catches = variations.filter((v: { description: string }) => v.description === "hallway ceiling");
  expect(catches).toHaveLength(1);
  expect(catches[0]).toMatchObject({ state: "draft", currentRevisionId: null });
  await page.reload();
  const draft = page.getByTestId(`variation-${catches[0].id}`);
  await expect(draft).toContainText("hallway ceiling");
  await expect(draft.getByRole("button", { name: "Change price", exact: true })).toBeVisible();
  await expect(draft.getByRole("button", { name: "Approve exact revision", exact: true })).toHaveCount(0);
});
