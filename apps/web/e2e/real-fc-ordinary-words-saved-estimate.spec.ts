import { expect, test, type Page } from "@playwright/test";
import { startWatchdogJob } from "./helpers/capture-journey";

// Explicit phone viewport, real controls and server persistence; no seeded catches or completion.
test.setTimeout(720_000);

async function click(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled(); await button.click();
}

const scenarios = [
  { note: "Customer asked for an extra heated towel rail while we were on site. Agreed 180 pounds. Fitted it today.", message: "Hi, yes please go ahead and fit the heated towel rail as well. 180 pounds is fine. Thanks.", description: "heated towel rail", estimate: 18000 },
  { note: "Painted the kitchen ceiling as an extra, customer asked for it. Estimated extra: £150", message: "Please paint the kitchen ceiling.", description: "kitchen ceiling", estimate: 15000 },
];
test("ordinary words survive the authorised saved reveal with £180.00 and one finding", async ({ page }, info) => {
  if (info.project.name === "mobile-360") await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  await page.getByRole("link", { name: "Start my own practice firm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  for (const [index,scenario] of scenarios.entries()) {
    if (index > 0) await page.goto("/classic");
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
    await notes.getByLabel("Note", { exact: true }).fill(scenario.note);
    await notes.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(notes.getByTestId("diary-entry")).toContainText(scenario.note);
    await page.reload();
    await expect(messages.getByTestId("customer-message")).toContainText(scenario.message);
    await expect(notes.getByTestId("diary-entry")).toContainText(scenario.note);
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
    // Reopen the saved job after persisted completion.
    await page.goto(`/jobs/${jobId}#quote`);
    await click(page, "Load the saved final check");
    await expect(page.getByTestId("final-check-status")).toContainText("found 1 thing");
    const items = page.getByTestId("final-check-item");
    await expect(items).toHaveCount(1);
    await expect(items).toContainText(scenario.description);
    await expect(items).not.toContainText("painted walls");
    // The real endpoint is the assertion boundary; no fabricated completion or
    // dependency on the separate screen-wording piece.
    const read = async () => {
      const response = await page.request.get(`/api/jobs/${jobId}/final-check`);
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    };
    const saved = await read();
    expect(saved.state).toBe("completed");
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]).toMatchObject({ description: scenario.description, estimatedValuePence: scenario.estimate, variationId: null });
    expect(saved.items[0].evidence).toHaveLength(2);
    expect(saved.items[0].evidence.map((source: { source: string }) => source.source).sort()).toEqual(["customer_message_text", "job_diary_text"]);
    expect(new Set(saved.items[0].evidence.map((source: { id: string }) => source.id)).size).toBe(2);
    await page.reload();
    expect(await read()).toEqual(saved);
    await click(page, "Load the saved final check");
    const confirmation = page.waitForResponse(r => r.url().endsWith(`/api/jobs/${jobId}/final-check/catches`) && r.request().method() === "POST");
    await items.getByRole("button", { name: "Yes — this was extra work", exact: true }).click();
    const confirmedResponse = await confirmation;
    expect(confirmedResponse.ok(), `catch HTTP ${confirmedResponse.status()}`).toBe(true);
    // Take the new catch's identity from the saved variations; reading this page response body can hang.
    const created = (await (await page.request.get(`/api/jobs/${jobId}/variations`)).json()).variations;
    expect(created).toHaveLength(1);
    const confirmed = { variationId: created[0].id as string };
    const revealed = await read();
    expect(revealed.items).toHaveLength(1);
    expect(revealed.items[0]).toMatchObject({ signalId: saved.items[0].signalId, estimatedValuePence: scenario.estimate, disposition: "confirmed_extra", variationId: confirmed.variationId });
    const variations = await (await page.request.get(`/api/jobs/${jobId}/variations`)).json();
    expect(variations.variations).toHaveLength(1);
    expect(variations.variations[0]).toMatchObject({ id: confirmed.variationId, state: "draft", currentRevisionId: null, revisions: [] });
    await page.reload();
    expect(await read()).toEqual(revealed);
    expect((await (await page.request.get(`/api/jobs/${jobId}/variations`)).json()).variations).toEqual(variations.variations);
    await click(page, "Load the saved final check");
    await expect(items.getByRole("listitem")).toHaveCount(2);
  }
});
