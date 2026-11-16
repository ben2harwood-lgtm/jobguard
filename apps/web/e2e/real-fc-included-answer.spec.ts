import { expect, test, type Page } from "@playwright/test";
import { startWatchdogJob } from "./helpers/capture-journey";

// Real practice controls, saved sources and dispositions. No mocked catch or completion.
test.setTimeout(720_000);
async function click(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled(); await button.click();
}
const scenario = {
  note: "Customer asked for an extra heated towel rail while we were on site. Agreed 180 pounds. Fitted it today.",
  message: "Hi, yes please go ahead and fit the heated towel rail as well. 180 pounds is fine. Thanks.",
  description: "heated towel rail",
};
test("No — included saves the photo answer without dismissing a separate extra", async ({ page }, info) => {
  let jobId="";
  const read = async () => {
    const response = await page.request.get(`/api/jobs/${jobId}/final-check`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  if (info.project.name === "mobile-360") expect(page.viewportSize()?.width).toBe(360);
  await page.goto("/practice-company");
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();

    await click(page, "＋ Start a new job");
    await page.getByLabel("Work details").fill("Paint the hall, stairs and landing for Mr Example at 9 Notreal Road, two coats, woodwork in gloss, should be about 900 quid, four days.");
    await click(page,"Make my draft"); await click(page,"Check and edit my draft");
    await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();

    jobId = new URL(page.url()).pathname.split("/").at(-1)!;
    const quantities = page.getByRole("textbox", { name: /^Quantity /u });
    for (let i = 0; i < await quantities.count(); i++) await quantities.nth(i).fill("1");
    const units = page.getByRole("textbox", { name: /^Unit /u });
    for (let i = 0; i < await units.count(); i++) await units.nth(i).fill("item");
    const questions = page.getByRole("textbox", { name: /^Answer /u });
    for (let i = 0; i < await questions.count(); i++) await questions.nth(i).fill("Fictional decorating job, four days, £900 for the agreed work; builder removes waste.");
    await page.getByLabel("Customer name", { exact: true }).fill("Mr Example");
    await page.getByLabel("Premises address", { exact: true }).fill("9 Notreal Road");
    await page.getByLabel("Town", { exact: true }).fill("Exampleton");
    await page.getByLabel("UK postcode", { exact: true }).fill("SW1A 1AA");
    await click(page,"Save customer and site");
    await expect(page.getByTestId("party-customer")).toHaveText("Mr Example");
    await expect(page.getByTestId("party-site")).toHaveText("9 Notreal Road, Exampleton, SW1A 1AA");
    const parties = await page.request.get(`/api/jobs/${jobId}/parties`);
    expect(parties.ok()).toBe(true);
    expect((await parties.json()).current).toMatchObject({
      bindingId: expect.any(String), customer: { name: "Mr Example" },
      site: { addressLines: ["9 Notreal Road"], town: "Exampleton", postcode: "SW1A 1AA" },
    });
    const reviewLines = page.locator(".review-line");
    await expect(reviewLines.first()).toBeVisible();
    for (const line of await reviewLines.all()) {
      await line.getByRole("button", { name: /^Accept /u }).click();
      await expect(line.locator(".review-line-head strong")).toHaveText("accepted");
    }
    await click(page,"Confirm scope"); await click(page,"Price the work");
    const rates = page.getByRole("textbox", { name: /^Unit rate /u });
    await expect(rates.first()).toBeVisible();
    for (let i = 0; i < await rates.count(); i++) await rates.nth(i).fill(i === 0 ? "900.00" : "0.00");
    await startWatchdogJob(page);
    jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
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
    const initial = await read();
    expect(initial.state).not.toBe("failed");
    if (initial.state !== "completed") await click(page, "Run the final check (practice)");
    await expect.poll(async () => {
      await click(page, "Load the saved final check");
      await expect(checkPanel).toHaveAttribute("aria-busy", "false");
      const saved = await read();
      expect(saved.state).not.toBe("failed");
      return saved.state;
    }, { timeout: 180_000, intervals: [1000, 3000, 5000] }).toBe("completed");
    // Reopen the saved job after persisted completion.
    await page.goto(`/jobs/${jobId}#quote`);
    await click(page, "Load the saved final check");
    await expect(page.getByTestId("final-check-status")).toContainText("found 2 things");
    const items = page.getByTestId("final-check-item");
    await expect(items).toHaveCount(2);
    const before = await read();
    expect(before.state).toBe("completed");
    expect(before.items).toHaveLength(2);
    // The matcher remains strict. The builder, not an inferred area synonym,
    // decides that this generated photo belongs to the agreed hall painting.
    const photos = before.items.filter((item: { description: string }) => item.description === "painted walls");
    const extras = before.items.filter((item: { description: string }) => item.description === scenario.description);
    expect(photos).toHaveLength(1); expect(extras).toHaveLength(1);
    const photo = photos[0], extra = extras[0];
    expect(photo.signalId).not.toBe(extra.signalId);
    for (const item of [photo, extra]) {
      expect(item.disposition).toBeNull();
      expect(item.variationId).toBeNull();
    }
    const photoRow = items.filter({ has: page.getByRole("heading", { name: "painted walls", exact: true }) });
    const extraRow = items.filter({ has: page.getByRole("heading", { name: scenario.description, exact: true }) });
    await expect(photoRow).toHaveCount(1); await expect(extraRow).toHaveCount(1);
    await expect(photoRow).toHaveAttribute("data-signal-id", photo.signalId);
    await expect(extraRow).toHaveAttribute("data-signal-id", extra.signalId);
    const lines = before.lockedLines.filter((line: { kind: string; description: string }) =>
      line.kind === "baseline" && /^Paint the hall, stairs and landing(?:, two coats)?$/iu.test(line.description));
    expect(lines).toHaveLength(1);
    const line = lines[0];
    const accountResponse = await page.request.get(`/api/jobs/${jobId}/final-account`);
    expect(accountResponse.ok()).toBe(true);
    const accountBefore = await accountResponse.json();
    const variationsBefore = await page.request.get(`/api/jobs/${jobId}/variations`);
    expect(variationsBefore.ok()).toBe(true);
    expect((await variationsBefore.json()).variations).toEqual([]);
    // Current UI calls the "No — included" answer "Already included".
    await photoRow.getByLabel("Or answer", { exact: true }).selectOption("already_included");
    await photoRow.getByLabel("Which locked line?", { exact: true }).selectOption(line.id);
    const posted = page.waitForResponse(response => response.url().endsWith(`/api/jobs/${jobId}/final-check/dispositions`) && response.request().method() === "POST");
    await photoRow.getByRole("button", { name: "Save answer", exact: true }).click();
    const response = await posted;
    expect(response.ok(), await response.text()).toBe(true);
    expect(response.request().postDataJSON()).toMatchObject({
      answer: "already_included", referenceId: line.id, signalId: photo.signalId,
      lockId: before.lockId, runId: before.runId, expectedSignalRevision: photo.signalRevision,
    });
    await expect(photoRow.getByTestId("final-check-disposition")).toHaveText("Your answer: Already included in a locked line");
    await page.reload(); await click(page, "Load the saved final check");
    await expect(items).toHaveCount(2);
    await expect(photoRow).toHaveAttribute("data-signal-id", photo.signalId);
    await expect(photoRow.getByTestId("final-check-disposition")).toHaveText("Your answer: Already included in a locked line");
    await expect(extraRow).toHaveAttribute("data-signal-id", extra.signalId);
    await expect(extraRow.getByTestId("final-check-disposition")).toHaveCount(0);
    await expect(extraRow.getByRole("button", { name: "Yes — this was extra work", exact: true })).toBeEnabled();
    const after = await read();
    expect(after.state).toBe("completed");
    expect(after.items).toHaveLength(2);
    expect(after.items.find((item: { signalId: string }) => item.signalId === photo.signalId)).toMatchObject({
      signalId: photo.signalId, description: "painted walls", disposition: "already_included", variationId: null,
    });
    expect(after.items.find((item: { signalId: string }) => item.signalId === extra.signalId)).toEqual(extra);
    const variations = await page.request.get(`/api/jobs/${jobId}/variations`);
    expect(variations.ok()).toBe(true); expect((await variations.json()).variations).toEqual([]);
    const accountAfter = await page.request.get(`/api/jobs/${jobId}/final-account`);
    expect(accountAfter.ok()).toBe(true); expect(await accountAfter.json()).toEqual(accountBefore);
});
