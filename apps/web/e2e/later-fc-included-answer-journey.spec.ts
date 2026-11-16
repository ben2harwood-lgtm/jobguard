import { expect, test, type Page } from "@playwright/test";
import { startWatchdogJob } from "./helpers/capture-journey";
import type { FinalCheckRead } from "../app/ui/final-check-reveal-view";

// SV-5 inclusion slice: real practice commands and worker, no seeded findings.
async function click(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
}

test("ordinary £900 job: Already included persists against the exact locked painting line without commercial effects", async ({ page }, info) => {
  test.setTimeout(360_000);
  expect(page.viewportSize()).toEqual(info.project.name === "mobile-360"
    ? { width: 360, height: 800 } : { width: 1280, height: 800 });
  let jobId = "";
  const read = async (suffix: string) => {
    const response = await page.request.get(`/api/jobs/${jobId}/${suffix}`);
    expect(response.ok(), `${suffix}: ${response.status()} ${await response.text()}`).toBe(true);
    return response.json();
  };
  await page.goto("/practice-company");
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  await click(page, "＋ Start a new job");
  await page.getByLabel("Work details").fill("Paint the hall, stairs and landing for Mr Example at 9 Notreal Road, two coats, woodwork in gloss, should be about 900 quid, four days.");
  await click(page, "Make my draft"); await click(page, "Check and edit my draft");
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
  await click(page, "Save customer and site");
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
  await click(page, "Confirm scope"); await click(page, "Price the work");
  const rates = page.getByRole("textbox", { name: /^Unit rate /u });
  await expect(rates.first()).toBeVisible();
  await expect(rates).toHaveCount(2);
  await page.getByLabel("Unit rate Paint the hall, stairs and landing, two coats", { exact: true }).fill("900.00");
  await page.getByLabel("Unit rate woodwork in gloss", { exact: true }).fill("0.00");
  await expect(page.getByTestId("quote-net")).toHaveText("GBP 900.00");
  await startWatchdogJob(page);
  jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  // Reopen the saved job so the site-work and Final Check panels load current state (as REAL-OWN-JOB-TO-PAID does).
  await page.goto(`/jobs/${jobId}/work#quote`);

  await click(page, "Attach generated practice image");
  await click(page, "Check file integrity");
  await click(page, "Complete this stage");
  await expect(page.getByTestId("stage-status")).toHaveText("Complete");
  await click(page, "Finished on site");
  await expect(page.getByTestId("work-state")).toHaveText("Finished on site");
  await click(page, "Build final account");
  const panel = page.getByTestId("final-account-lock");
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account review");
  const dispositions = panel.getByRole("combobox");
  await expect(dispositions).toHaveCount(2);
  for (let index = 0; index < await dispositions.count(); index++) {
    await dispositions.nth(index).selectOption("done");
    await expect(panel).toHaveAttribute("aria-busy", "false");
  }
  const terms = panel.getByRole("button", { name: "Accept final check terms", exact: true });
  if (await terms.isEnabled()) await terms.click();
  await expect(panel).toHaveAttribute("aria-busy", "false");
  const complete = panel.getByRole("button", { name: "Complete final account", exact: true });
  if (!(await complete.isEnabled())) {
    await click(page, "Rebuild from approved sources");
    await expect(panel).toHaveAttribute("aria-busy", "false");
  }
  await expect(complete).toBeEnabled();
  await complete.click();
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");

  // Poll the actual GET loaded by the screen, rather than a newer independent read.
  const checkPanel = page.getByTestId("final-check-reveal");
  const loadCheck = async () => {
    await expect(checkPanel).toHaveAttribute("aria-busy", "false");
    const loaded = page.waitForResponse(response => response.url().endsWith(`/api/jobs/${jobId}/final-check`)
      && response.request().method() === "GET");
    await click(page, "Load the saved final check");
    const response = await loaded;
    expect(response.ok(), await response.text()).toBe(true);
    const saved = await response.json() as FinalCheckRead;
    await expect(checkPanel).toHaveAttribute("aria-busy", "false");
    return saved;
  };
  const initial = await loadCheck();
  expect(initial.state, "A failed source is a journey failure").not.toBe("failed");
  if (initial.state === "pending") await click(page, "Run the final check (practice)");
  await expect.poll(async () => (await loadCheck()).state,
    { timeout: 180_000, intervals: [3000] }).not.toBe("pending");
  const before = await loadCheck();
  expect(before.state, "All saved sources must complete successfully").toBe("completed");
  const photos = before.items.filter(item => item.description === "painted walls");
  expect(photos).toHaveLength(1);
  const photo = photos[0]!;
  expect(photo.disposition).toBeNull();
  expect(photo.answer).toBeNull();
  expect(photo.variationId).toBeNull();
  expect(photo.evidence?.length).toBeGreaterThan(0);
  const lines = (before.lockedLines ?? []).filter(line => line.kind === "baseline"
    && line.description === "Paint the hall, stairs and landing, two coats");
  expect(lines).toHaveLength(1);
  const line = lines[0]!;
  const commercial = async () => {
    const account = await read("final-account");
    const lock = (await read("final-account/lock")).lock;
    const variations = await read("variations");
    const cases = await read("recovery-cases");
    const fees = await read("payment-fees");
    expect(variations.variations).toEqual([]);
    expect(cases.cases).toEqual([]);
    expect(fees.statements).toEqual([]);
    expect(fees.standingAuthority).toBeNull();
    expect(fees.realExternalActions).toBe(0);
    expect(account.account.totals.net).toEqual({ pence: 90000, currency: "GBP" });
    return { account, lock, variations, cases, fees };
  };
  const snapshot = await commercial();
  expect(snapshot.lock).toMatchObject({ id: before.lockId,
    finalAccountRevisionId: snapshot.account.account.id, sourceHash: snapshot.account.account.sourceHash });
  expect(snapshot.lock.snapshot.lines).toContainEqual(expect.objectContaining({ id: line.id, scopeItemId: line.scopeItemId }));
  expect(snapshot.account.account.lines).toContainEqual(expect.objectContaining({
    scopeItemId: line.scopeItemId, description: line.description, kind: "baseline",
  }));
  // Bind the actual finding to the generated, verified completion photo in the bill's proof.
  for (const evidence of photo.evidence ?? []) {
    expect(evidence).toMatchObject({ source: "completion_photo", evidenceAfterLock: false,
      objectVersionId: expect.any(String), sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) });
    expect(snapshot.account.account.proof).toContainEqual(expect.objectContaining({
      evidenceId: evidence.id, evidenceType: "completion_photo",
      objectVersionId: evidence.objectVersionId, sha256: evidence.sha256,
    }));
    expect(Number.isNaN(Date.parse(evidence.receivedAt))).toBe(false);
    expect(Date.parse(evidence.receivedAt)).toBeLessThanOrEqual(Date.parse(snapshot.lock.lockedAt));
  }
  const row = page.getByTestId("final-check-item").and(page.locator(`[data-signal-id="${photo.signalId}"]`));
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("heading", { name: photo.description, exact: true })).toBeVisible();
  await expect(row.getByRole("list", { name: "Evidence and dates" }).getByRole("listitem")).toHaveCount(photo.evidence!.length);
  await row.getByLabel("Or answer", { exact: true }).selectOption({ label: "Already included" });
  await expect(row.getByRole("button", { name: "Save answer", exact: true })).toBeDisabled();

  const command = { version: "final-check.disposition.v1", commandId: crypto.randomUUID(),
    lockId: before.lockId, runId: before.runId, signalId: photo.signalId,
    expectedSignalRevision: photo.signalRevision, answer: "already_included", referenceId: line.id };
  const path = `/api/jobs/${jobId}/final-check/dispositions`;
  const malformed = await page.request.post(path, { data: { ...command, referenceId: "not-a-uuid" } });
  expect(malformed.status()).toBe(400);
  expect(await malformed.json()).toMatchObject({ code: "INVALID_FINAL_CHECK_INPUT" });
  const foreign = await page.request.post(path, { data: { ...command, referenceId: crypto.randomUUID() } });
  expect(foreign.status()).toBe(403);
  expect(await foreign.json()).toMatchObject({ code: "FINAL_CHECK_FORBIDDEN" });
  expect(await commercial()).toEqual(snapshot);
  expect(await loadCheck()).toEqual(before);

  await row.getByLabel("Which locked line?", { exact: true }).selectOption(line.id);
  const posted = page.waitForResponse(response => response.url().endsWith(path) && response.request().method() === "POST");
  await row.getByRole("button", { name: "Save answer", exact: true }).click();
  const response = await posted;
  expect(response.status(), await response.text()).toBe(201);
  const sent = response.request().postDataJSON();
  expect(sent).toEqual({ ...command, commandId: expect.any(String) });
  const result = await response.json();
  expect(result).toMatchObject({ signalId: photo.signalId, runId: before.runId, lockId: before.lockId,
    dispositionId: expect.any(String), disposition: "already_included" });
  const answered = async () => {
    const saved = await loadCheck();
    expect(saved.state).toBe("completed");
    expect(saved.lockId).toBe(before.lockId);
    expect(saved.runId).toBe(before.runId);
    expect(saved.lockedLines).toEqual(before.lockedLines);
    expect(saved.items.map(item => item.signalId)).toEqual(before.items.map(item => item.signalId));
    expect(saved.items.find(item => item.signalId === photo.signalId)).toMatchObject({
      signalId: photo.signalId, evidence: photo.evidence, answer: "already_included",
      disposition: "already_included", dispositionId: result.dispositionId, variationId: null,
    });
    for (const item of before.items.filter(item => item.signalId !== photo.signalId)) {
      expect(saved.items.find(entry => entry.signalId === item.signalId)).toEqual(item);
    }
    await expect(row.getByTestId("final-check-disposition")).toHaveText("Your answer: Already included in a locked line");
    await expect(row.getByRole("button", { name: "Yes — this was extra work", exact: true })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Save answer", exact: true })).toHaveCount(0);
    expect(await commercial()).toEqual(snapshot);
    return saved;
  };
  const savedAnswer = await answered();
  const replay = await page.request.post(path, { data: sent });
  expect(replay.status()).toBe(201);
  expect(await replay.json()).toEqual(result);
  // The saved receipt binds the exact reference, not merely the answer label.
  const changedReplay = await page.request.post(path, { data: { ...sent, referenceId: crypto.randomUUID() } });
  expect(changedReplay.status()).toBe(409);
  expect(await changedReplay.json()).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  await page.reload();
  expect(await answered()).toEqual(savedAnswer);
  await info.attach("saved-inclusion-and-commercial-snapshot", { contentType: "application/json",
    body: JSON.stringify({ before, line, sent, result, savedAnswer, commercial: snapshot }, null, 2) });
});
