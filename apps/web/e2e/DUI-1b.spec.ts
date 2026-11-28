import { expect, test, type Locator } from "@playwright/test";
import type { QuoteWorkspaceResponse } from "@jobguard/api/quote-contracts";
import { openCaptureDesigned } from "./helpers/capture-journey-designed";

const prices = {
  "Protect room": "200",
  "Prepare walls": "200",
  "Paint walls": "200",
  "Finish trim": "200",
  "Clean site": "100",
};
const capture = [
  "JOB: Practice decorating",
  ...Object.entries(prices).map(([item, rate]) => `ITEM: ${item} | £${rate}.00`),
  "ITEM: Replace shelves",
  "QUESTION: Confirm disposal",
].join("\n");

async function expectTotals(editor: Locator, revision: string) {
  await expect(editor.getByTestId("quote-revision")).toHaveText(revision);
  await expect(editor.getByTestId("quote-net")).toHaveText("GBP 900.00");
  await expect(editor.getByTestId("quote-vat")).toHaveText("GBP 180.00");
  await expect(editor.getByTestId("quote-gross")).toHaveText("GBP 1,080.00");
}

test("DUI-1b: an own job is priced, previewed and sent through designed controls", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openCaptureDesigned(page);
  const click = (name: string) => page.getByRole("button", { name, exact: true }).click();
  await page.getByLabel("Work details").fill(capture);
  await click("Make my draft");
  await click("Check and edit my draft");
  await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+\/work$/u);
  const jobId = new URL(page.url()).pathname.split("/")[2]!;
  const quotePath = `/api/jobs/${jobId}/quotes`;

  for (const item of Object.keys(prices)) await click(`Accept ${item}`);
  await click("Dismiss Replace shelves");
  await page.getByLabel("Dismissal reason Replace shelves").fill("Outside this fictional job");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  await click("Confirm scope");
  const confirmed = page.getByRole("heading", { name: "Scope confirmed", exact: true });
  await expect(confirmed).toBeVisible();
  await page.reload();
  await expect(confirmed).toBeVisible();
  await page.getByLabel("Customer name", { exact: true }).fill("DUI Practice Customer");
  await page.getByLabel("Premises address", { exact: true }).fill("14 Fictional Lane");
  await click("Save customer and site");
  await expect(page.getByTestId("party-customer")).toHaveText("DUI Practice Customer");
  await click("Price the work");

  const editor = page.locator(".designed-quote");
  await expect(editor).toHaveAttribute("data-quote-ready", "true");
  await expect(editor).toHaveAttribute("data-job-id", jobId);
  await expect(editor.getByRole("heading", { name: "Price the work", exact: true })).toBeVisible();
  await expect(editor.getByLabel("Tax policy", { exact: true })).toBeDisabled();
  await expect(editor.getByLabel("Coverage diff")).toContainText("Blocking questions: 0");
  const layout = editor.locator(".quote-layout");
  const width = page.viewportSize()!.width;
  await expect.poll(() => layout.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length))
    .toBe(width === 360 ? 1 : 2);

  async function expectDesigned(control: Locator) {
    await expect(control).toBeVisible();
    await expect(control.locator("xpath=ancestor::*[contains(concat(' ',normalize-space(@class),' '),' jgd-legacy ')]")).toHaveCount(0);
    await expect(control).toHaveCSS("background-image", /linear-gradient/u);
    await expect(control).toHaveCSS("border-top-left-radius", "8px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  async function screenshot(name: string, anchor: Locator) {
    if (!process.env.DUI_1B_SCREENSHOTS) return;
    await anchor.evaluate(element => window.scrollBy(0, element.getBoundingClientRect().top - 58));
    await page.screenshot({
      path: testInfo.outputPath(`${name}.png`),
      animations: "disabled",
      style: "nextjs-portal { visibility: hidden; }",
    });
  }

  const save = editor.getByRole("button", { name: "Save draft revision", exact: true });
  await expectDesigned(save);
  await save.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(save).toBeFocused();
  await expect(save).toHaveCSS("outline-width", "3px");
  await expectTotals(editor, "0");
  await save.press("Enter");
  await expectTotals(editor, "1");
  await screenshot("pricing", editor.getByRole("heading", { name: "Price the work", exact: true }));

  const savedQuote = await page.request.get(quotePath);
  expect(savedQuote.ok()).toBe(true);
  const saved = await savedQuote.json() as QuoteWorkspaceResponse;
  expect(saved.jobId).toBe(jobId);
  expect(saved.draft?.revision).toBe(1);
  expect(saved.revisions).toHaveLength(1);
  expect(saved.revisions[0]).toMatchObject({ revision: 1, netPence: 90000 });
  expect(saved.revisions[0]?.lines.filter(line => line.included)).toHaveLength(5);

  const previewResponse = page.waitForResponse(response => response.url().endsWith(`${quotePath}/preview`) && response.request().method() === "POST");
  await click("Preview this quote");
  const issuedPreview = await previewResponse;
  expect(issuedPreview.ok()).toBe(true);
  const { view, document } = await issuedPreview.json();
  expect(view).toMatchObject({ quoteRevision: 1, documentVersion: 1, status: "previewed" });
  expect(document).toMatchObject({ netPence: 90000, taxPence: 18000, totalPence: 108000 });
  const preview = editor.getByRole("region", { name: "Quote preview", exact: true });
  await expect(preview).toContainText("Document version 1");
  await expect(preview).toContainText("DUI Practice Customer");
  await expect(preview).toContainText("5 included lines · Total £1,080.00");
  await expect(preview.getByTestId("quote-artifact-hash")).toHaveText(view.contentHash);
  const send = preview.getByRole("button", { name: "Simulate sending this quote", exact: true });
  await expectDesigned(send);
  await screenshot("preview", preview);

  const recipient = editor.getByLabel("Confirmed recipient", { exact: true });
  const approvedRecipient = await recipient.inputValue();
  await recipient.fill("different@example.invalid");
  await send.click();
  await expect(editor.getByText("Stale approval blocked", { exact: true })).toBeVisible();
  await expect(editor.getByTestId("quote-delivery")).toHaveText("Not queued");
  await recipient.fill(approvedRecipient);
  await send.click();
  await expect(editor.getByTestId("quote-delivery")).toHaveText(/^(Queued — not sent|Simulated delivery — nothing sent)$/u);
  if ((await editor.getByTestId("quote-delivery").textContent()) === "Queued — not sent") await click("Continue fake worker");
  await expect(editor.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
  const delivery = editor.getByRole("region", { name: "Delivery facts", exact: true });
  for (const fact of ["Issued: yes", "Provider accepted: no", "Delivered: no", "Customer accepted: no"]) {
    await expect(delivery.getByText(fact, { exact: true })).toBeVisible();
  }
  await screenshot("sent", delivery);
  const savedDelivery = await page.request.get(`${quotePath}/delivery`);
  expect(savedDelivery.ok()).toBe(true);
  expect(await savedDelivery.json()).toMatchObject({
    documentId: view.documentId, contentHash: view.contentHash, quoteRevision: 1, documentVersion: 1, status: "simulated_delivery",
  });

  // Reopen the same saved quote through the classic workspace to compare the persisted terms.
  await page.goto(`/jobs/${jobId}#quote`);
  const classic = page.locator(".quote-editor");
  await expect(classic).toHaveAttribute("data-quote-ready", "true");
  await expect(classic).not.toHaveClass(/designed-quote/u);
  await expectTotals(classic, "1");
  await expect(classic.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
});
