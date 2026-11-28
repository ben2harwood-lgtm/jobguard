import { expect, test, type Locator, type Page } from "@playwright/test";
import { openNewJob } from "./helpers/spoken-quote-journey";
import { expectNoSideScroll } from "./helpers/designed-v2";

// V2-SQ-I-2 / V2-DUI-2 (ported from #918's DUI-2, read only): on V2, a typed job is accepted, started, given proof and
// an exact extra through designed controls outside the legacy block. Money and behaviour are the base's; only the look
// is new. Typed input and the real practice routes throughout; nothing is injected. Desktop (1280) and mobile-360 projects.
const prices = { "Protect room": "200", "Prepare walls": "200", "Paint walls": "200", "Finish trim": "200", "Clean site": "100" };
const capture = ["JOB: Practice decorating", ...Object.entries(prices).map(([item, rate]) => `ITEM: ${item} | £${rate}.00`),
  "ITEM: Replace shelves", "QUESTION: Confirm disposal"].join("\n");

test("V2-DUI-2: accept, start, record proof and approve an exact extra through designed controls", async ({ page }) => {
  test.setTimeout(180_000);
  await openNewJob(page);
  const button = (name: string, root: Locator | Page = page) => root.getByRole("button", { name, exact: true });
  const click = async (name: string) => { const control = button(name); await expect(control).toBeEnabled(); await control.click(); };
  const width = page.viewportSize()!.width;
  const shot = (name: string) => page.screenshot({ path: `test-results/V2-DUI-2-${name}-${test.info().project.name}.png`, fullPage: true });

  /** #918's checkDesigned: outside every legacy wrapper, the reference button, 44 px, inside the viewport. */
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

  await page.getByLabel("Work details").fill(capture);
  await click("Make my draft");
  await click("Check and edit my draft");
  await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+\/work$/u);
  const jobId = new URL(page.url()).pathname.split("/")[2]!;
  const apiPath = `/api/jobs/${jobId}`;
  const read = async (suffix: string) => {
    const response = await page.request.get(apiPath + suffix);
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  await page.getByLabel("Customer name", { exact: true }).fill("DUI Practice Customer");
  await page.getByLabel("Premises address", { exact: true }).fill("14 Fictional Lane");
  await click("Save customer and site");
  await expect(page.getByTestId("party-customer")).toHaveText("DUI Practice Customer");
  await expect(page.getByRole("form", { name: "Customer and site details" }).locator("fieldset")).toBeEnabled();
  for (const item of Object.keys(prices)) await click(`Accept ${item}`);
  await click("Dismiss Replace shelves");
  await page.getByLabel("Dismissal reason Replace shelves").fill("Outside this fictional job");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  await click("Confirm scope");
  await click("Price the work");
  const editor = page.locator(".designed-quote");
  await expect(editor).toHaveAttribute("data-quote-ready", "true");
  await click("Save draft revision");
  await expect(editor.getByTestId("quote-revision")).toHaveText("1");
  await expect(editor.getByTestId("quote-gross")).toHaveText("GBP 1,080.00");
  await click("Preview this quote");
  await click("Simulate sending this quote");
  const delivery = editor.getByTestId("quote-delivery");
  await expect(delivery).toHaveText(/^(Queued — not sent|Simulated delivery — nothing sent)$/u);
  if (await delivery.textContent() === "Queued — not sent") await click("Continue fake worker");
  await expect(delivery).toHaveText("Simulated delivery — nothing sent");
  const issued = await read("/quotes/delivery");
  expect(issued).toMatchObject({ quoteRevision: 1, documentVersion: 1, status: "simulated_delivery" });

  // Accept: the designed acceptance card, keyboard focus visible.
  const acceptance = editor.getByRole("region", { name: "Record customer acceptance", exact: true });
  const record = button("Record practice acceptance", acceptance);
  await checkDesigned(record);
  for (const name of ["Record customer decline", "Supersede quote"]) await checkDesigned(button(name, acceptance));
  await expect(acceptance).toContainText("Exact terms: document v1 · £1,080.00");
  await record.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(record).toBeFocused();
  await expect(record).toHaveCSS("outline-width", "3px");
  await shot("acceptance");
  await record.press("Enter");
  const accepted = editor.getByRole("region", { name: "Accepted terms", exact: true });
  await checkDesigned(button("Cancel pre-live acceptance", accepted));
  expect((await read("/quotes/acceptance")).activeAcceptance).toMatchObject({ documentId: issued.documentId, documentVersion: 1, netPence: 90000, totalPence: 108000 });

  // Start: the designed start control, then the live activation card.
  const start = editor.locator("#practice-start-job");
  await checkDesigned(start);
  await shot("start");
  await start.click();
  await expect(page.getByTestId("accepted-net")).toHaveText("£900.00");
  const live = editor.getByRole("region", { name: "Live activation", exact: true });
  await checkDesigned(button("Next: review this job", live));
  expect(await read("/proposal")).toMatchObject({ jobId, status: "live" });
  expect((await read("/quotes/activation")).activation).toMatchObject({ acceptedNetPence: 90000, acceptedDocumentVersion: 1 });

  // Site work: designed, outside the legacy block.
  const siteWork = page.getByTestId("job-work-state");
  await checkDesigned(button("Load saved site work", siteWork));

  // Proof: the designed proof stage.
  const proof = page.getByRole("region", { name: "Proof of the work" });
  await checkDesigned(button("Attach generated practice image", proof));
  await expect(button("Complete this stage", proof)).toBeDisabled();
  await button("Attach generated practice image", proof).click();
  await expect(page.getByTestId("proof-state")).toHaveText("Uploading");
  await button("Check file integrity", proof).click();
  await button("Complete this stage", proof).click();
  await expect(page.getByTestId("stage-status")).toHaveText("Complete");
  expect(await read("/proof")).toMatchObject({ jobId, upload: { state: "verified" }, completion: { reviewRequired: false }, realExternalActions: 0 });
  await shot("proof");

  // An exact extra: propose, a genuinely stale approval is refused, the current revision is approved.
  const extras = page.getByRole("region", { name: "Extra work and omissions" });
  await checkDesigned(button("Add proposed variation", extras));
  const description = "Fit an extra shelf";
  await extras.getByLabel("Description", { exact: true }).fill(description);
  await extras.getByLabel("Variation price (£, optional)").fill("125.00");
  await button("Add proposed variation", extras).click();
  await expect(extras.getByRole("heading", { name: description, exact: true })).toBeVisible();
  const original = (await read("/variations")).variations.find((item: { description: string }) => item.description === description);
  const card = extras.getByTestId(`variation-${original.id}`);
  const approve = button("Approve exact revision", card);
  await checkDesigned(approve);
  await expect(extras.getByTestId("pending-extras")).toHaveText("£125.00");
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
  await expect(extras.getByText("This variation could not be changed. Reload and review the current revision.", { exact: true })).toBeVisible();
  expect((await read("/variations")).approvedAdditionsPence).toBe(0);
  await page.goto(`/jobs/${jobId}/work#variation-${original.id}`);
  await expect(card).toBeFocused();
  await expect(card.getByText("Price revision 2 · £150.00", { exact: true })).toBeVisible();
  await checkDesigned(approve);
  await approve.click();
  await expect(card.getByText("Approved and saved", { exact: true })).toBeVisible();
  await expect(extras.getByTestId("approved-additions")).toHaveText("£150.00");
  await expect(extras.getByTestId("pending-extras")).toHaveText("£0.00");
  await expect(extras.getByTestId("variation-baseline")).toHaveText("£900.00");
  expect(await read("/variations")).toMatchObject({ jobId, baselinePence: 90000, approvedAdditionsPence: 15000, approvedOmissionsPence: 0, pendingExtrasPence: 0 });
  await expectNoSideScroll(page);
  await shot("approved-extra");
});
