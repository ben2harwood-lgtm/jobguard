import { expect, test, type Locator, type Page } from "@playwright/test";
import { openCaptureDesigned } from "./helpers/capture-journey-designed";

test("DUI-2: accept, start, record proof and approve an exact extra on one own job", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await openCaptureDesigned(page);
  const button = (name: string, root: Locator | Page = page) =>
    root.getByRole("button", { name, exact: true });
  const click = (name: string) => button(name).click();
  const width = page.viewportSize()!.width;

  async function checkDesigned(control: Locator) {
    await expect(control).toBeVisible();
    await expect(control.locator("xpath=ancestor::*[contains(concat(' ',normalize-space(@class),' '),' jgd-legacy ')]")).toHaveCount(0);
    await expect(control).toHaveClass(/\bbtn\b/u);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const box = (await control.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }

  async function screenshot(name: string, anchor: Locator) {
    if (!process.env.DUI_2_SCREENSHOTS) return;
    await anchor.evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - 64));
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: "disabled", style: "nextjs-portal { visibility: hidden; }" });
  }

  const scope = ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"];
  await page.getByLabel("Work details").fill([
    "JOB: Practice decorating", ...scope.map((line, i) => `ITEM: ${line} | £${i === 4 ? 100 : 200}.00`),
    "ITEM: Replace shelves", "QUESTION: Confirm disposal",
  ].join("\n"));
  await click("Make my draft");
  await click("Check and edit my draft");
  await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+\/work$/u);
  const jobId = new URL(page.url()).pathname.split("/")[2]!;
  const jobPath = `/jobs/${jobId}`;
  const apiPath = `/api${jobPath}`;
  const workspace = page.getByTestId("workspace-job-id");
  const read = async (suffix: string) => {
    const response = await page.request.get(apiPath + suffix);
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  await click("Save customer and site");
  await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
  for (const name of scope) await click(`Accept ${name}`);
  await click("Dismiss Replace shelves");
  await page.getByLabel("Dismissal reason Replace shelves").fill("Outside this fictional job");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  await click("Confirm scope");
  await click("Price the work");
  await expect(workspace).toHaveAttribute("data-job-id", jobId);
  await click("Save draft revision");
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await expect(page.getByTestId("quote-net")).toHaveText("GBP 900.00");
  await expect(page.getByTestId("quote-vat")).toHaveText("GBP 180.00");
  await expect(page.getByTestId("quote-gross")).toHaveText("GBP 1,080.00");
  await click("Preview this quote");
  const send = button("Simulate sending this quote");
  const recipient = page.getByLabel("Confirmed recipient", { exact: true });
  const exactRecipient = await recipient.inputValue();
  await recipient.fill("changed@example.invalid");
  await send.click();
  await expect(workspace.getByText("Stale approval blocked", { exact: true })).toBeVisible();
  await expect(page.getByTestId("quote-delivery")).toHaveText("Not queued");
  await recipient.fill(exactRecipient);
  await send.click();
  const delivery = page.getByTestId("quote-delivery");
  await expect(delivery).toHaveText(/^(Queued — not sent|Simulated delivery — nothing sent)$/u);
  if (await delivery.textContent() === "Queued — not sent") await click("Continue fake worker");
  await expect(delivery).toHaveText("Simulated delivery — nothing sent");
  const issued = await read("/quotes/delivery");
  expect(issued).toMatchObject({ quoteRevision: 1, documentVersion: 1, status: "simulated_delivery" });

  const acceptance = workspace.getByRole("region", { name: "Record customer acceptance", exact: true });
  const record = button("Record practice acceptance", acceptance);
  await checkDesigned(record);
  await expect(acceptance).toContainText("Exact terms: document v1 · £1,080.00");
  await screenshot("acceptance", acceptance);
  await record.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(record).toBeFocused();
  await expect(record).toHaveCSS("outline-width", "3px");
  await record.press("Enter");
  const start = button("Start this practice job", workspace.getByRole("region", { name: "Start accepted practice job" }));
  await expect(start).toBeEnabled();
  expect((await read("/proposal")).status).toBe("accepted");
  expect((await read("/quotes/activation")).activation).toBeNull();
  const accepted = (await read("/quotes/acceptance")).activeAcceptance;
  expect(accepted).toMatchObject({ documentId: issued.documentId, documentHash: issued.contentHash, documentVersion: 1, netPence: 90000, totalPence: 108000 });

  await page.goto(`${jobPath}/overview`);
  await page.getByRole("button", { name: /Start the job/u }).click();
  await expect(page).toHaveURL(`${jobPath}/work#quote`);
  await checkDesigned(start);
  await screenshot("switch-live", workspace.getByRole("region", { name: "Start accepted practice job" }));
  await start.click();
  await expect(page.getByTestId("accepted-net")).toHaveText("£900.00");
  await expect(button("Cancel pre-live acceptance")).toBeDisabled();
  const live = await read("/proposal");
  expect(live).toMatchObject({ jobId, status: "live" });
  expect((await read("/quotes/activation")).activation).toMatchObject({ acceptedNetPence: 90000, acceptedDocumentVersion: 1 });

  await page.goto(`${jobPath}#work-proof`);
  await expect(page).toHaveURL(`${jobPath}/work#work-proof`);
  const proof = workspace.getByRole("region", { name: "Proof of the work" });
  await checkDesigned(button("Attach generated practice image", proof));
  await expect(button("Complete this stage", proof)).toBeDisabled();
  await click("Attach generated practice image");
  await expect(page.getByTestId("proof-state")).toHaveText("Uploading");
  await click("Check file integrity");
  await click("Complete this stage");
  await expect(page.getByTestId("stage-status")).toHaveText("Complete");
  expect(await read("/proof")).toMatchObject({ jobId, upload: { state: "verified" }, completion: { reviewRequired: false }, realExternalActions: 0 });
  await screenshot("work-proof", proof);

  await page.goto(`${jobPath}#variations-title`);
  await expect(page).toHaveURL(`${jobPath}/work#variations-title`);
  const extras = workspace.getByRole("region", { name: "Extra work and omissions" });
  await checkDesigned(button("Add proposed variation", extras));
  const description = "Fit an extra shelf";
  await extras.getByLabel("Description", { exact: true }).fill(description);
  await extras.getByLabel("Variation price (£, optional)").fill("125.00");
  await click("Add proposed variation");
  await expect(extras.getByRole("heading", { name: description, exact: true })).toBeVisible();
  const original = (await read("/variations")).variations.find((item: { description: string }) => item.description === description);
  const card = extras.getByTestId(`variation-${original.id}`);
  const approve = button("Approve exact revision", card);
  await checkDesigned(approve);
  await expect(extras.getByTestId("pending-extras")).toHaveText("£125.00");
  await expect(extras.getByTestId("approved-additions")).toHaveText("£0.00");

  const refusal = extras.getByText("This variation could not be changed. Reload and review the current revision.", { exact: true });
  // Exercise the same browser error surface for a refused approval and for a genuine stale revision.
  await page.route(`**${apiPath}/variations`, async route => {
    if (route.request().method() === "POST") await route.fulfill({ status: 503, json: { code: "DATABASE_UNAVAILABLE" } });
    else await route.continue();
  });
  await approve.click();
  await expect(refusal).toBeVisible();
  await expect(extras.getByTestId("approved-additions")).toHaveText("£0.00");
  await page.unroute(`**${apiPath}/variations`);

  const revisionId = crypto.randomUUID();
  const revised = await page.request.post(`${apiPath}/variations`, { data: {
    version: "variation-command.v1", action: "revise", variationId: original.id, revisionId,
    expectedRevisionId: original.currentRevisionId, description,
    price: { quantity: "1", unit: "item", unitRatePence: 15000, direction: "addition" },
  } });
  expect(revised.ok(), await revised.text()).toBe(true);
  const stale = page.waitForResponse(response => response.url().endsWith(`${apiPath}/variations`) && response.request().method() === "POST");
  await approve.click();
  expect((await stale).status()).toBe(409);
  await expect(refusal).toBeVisible();
  expect((await read("/variations")).approvedAdditionsPence).toBe(0);

  await page.goto(`${jobPath}#variation-${original.id}`);
  await expect(page).toHaveURL(`${jobPath}/work#variation-${original.id}`);
  await expect(card).toBeFocused();
  await expect(card.getByText("Price revision 2 · £150.00", { exact: true })).toBeVisible();
  await approve.click();
  await expect(card.getByText("Approved and saved", { exact: true })).toBeVisible();
  await expect(extras.getByTestId("approved-additions")).toHaveText("£150.00");
  await expect(extras.getByTestId("pending-extras")).toHaveText("£0.00");
  await expect(extras.getByTestId("variation-baseline")).toHaveText("£900.00");
  const saved = await read("/variations");
  expect(saved).toMatchObject({ jobId, baselinePence: 90000, approvedAdditionsPence: 15000, approvedOmissionsPence: 0, pendingExtrasPence: 0 });
  expect(saved.variations.find((item: { id: string }) => item.id === original.id)).toMatchObject({
    currentRevisionId: revisionId, revisions: [{ revision: 1, approved: false }, { revision: 2, approved: true, signedDeltaPence: 15000 }],
  });
  expect((await read("/quotes")).draft.revision).toBe(1);
  await screenshot("approved-extra", card);

  await page.goto(jobPath);
  await expect(workspace).toHaveAttribute("data-job-id", jobId);
  await expect(workspace).not.toHaveClass(/designed-workspace/u);
  await expect(page).toHaveURL(jobPath);
  await workspace.getByRole("navigation", { name: "Saved job sections" }).getByRole("link", { name: "Quote", exact: true }).click();
  await expect(page).toHaveURL(`${jobPath}#quote`);
  await expect(page.getByTestId("accepted-net")).toHaveText("£900.00");
  await expect(page.getByTestId("approved-additions")).toHaveText("£150.00");
  await page.reload();
  await expect(page).toHaveURL(`${jobPath}/work#quote`);
  await expect(page.getByTestId("accepted-net")).toHaveText("£900.00");
});
