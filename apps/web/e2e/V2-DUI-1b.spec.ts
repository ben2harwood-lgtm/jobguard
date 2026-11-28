import { expect, test, type Locator } from "@playwright/test";
import type { QuoteWorkspaceResponse } from "@jobguard/api/quote-contracts";
import { openNewJob } from "./helpers/spoken-quote-journey";
import { expectDesigned, expectNoSideScroll, expectResponsiveGrid, expectTallButtons } from "./helpers/designed-v2";

// V2-SQ-I-1 / V2-DUI-1b (ported from #918's DUI-1b): on V2, a typed job is priced, previewed and sent through the
// designed quote editor. Money and behaviour are SQ-E's; only the look is new. Desktop (1280) and mobile-360 projects.
const prices = { "Protect room": "200", "Prepare walls": "200", "Paint walls": "200", "Finish trim": "200", "Clean site": "100" };
const capture = ["JOB: Practice decorating", ...Object.entries(prices).map(([item, rate]) => `ITEM: ${item} | £${rate}.00`),
  "ITEM: Replace shelves", "QUESTION: Confirm disposal"].join("\n");

async function expectTotals(editor: Locator, revision: string) {
  await expect(editor.getByTestId("quote-revision")).toHaveText(revision);
  await expect(editor.getByTestId("quote-net")).toHaveText("GBP 900.00");
  await expect(editor.getByTestId("quote-vat")).toHaveText("GBP 180.00");
  await expect(editor.getByTestId("quote-gross")).toHaveText("GBP 1,080.00");
}

test("V2-DUI-1b: a typed job is priced, previewed and sent through the designed quote editor", async ({ page }) => {
  test.setTimeout(150_000);
  await openNewJob(page);
  const click = async (name: string) => { const button = page.getByRole("button", { name, exact: true }); await expect(button).toBeEnabled(); await button.click(); };
  await page.getByLabel("Work details").fill(capture);
  await click("Make my draft");
  await click("Check and edit my draft");
  await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+\/work$/u);
  const jobId = new URL(page.url()).pathname.split("/")[2]!;
  const quotePath = `/api/jobs/${jobId}/quotes`;
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
  await expect(page.getByRole("heading", { name: "Scope confirmed", exact: true })).toBeVisible();
  await click("Price the work");

  const editor = page.locator(".designed-quote");
  await expect(editor).toHaveAttribute("data-quote-ready", "true");
  await expect(editor).toHaveAttribute("data-job-id", jobId);
  await expect(editor.getByRole("heading", { name: "Price the work", exact: true })).toBeVisible();
  await expect(editor.getByLabel("Tax policy", { exact: true })).toBeDisabled();
  await expect(editor.getByLabel("Coverage diff")).toContainText("Blocking questions: 0");
  await expectResponsiveGrid(page, editor.locator(".quote-layout"));

  const save = editor.getByRole("button", { name: "Save draft revision", exact: true });
  await expectDesigned(page, editor, save);
  await save.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(save).toBeFocused();
  await expect(save).toHaveCSS("outline-width", "3px");
  await expectTotals(editor, "0");
  await save.press("Enter");
  await expectTotals(editor, "1");
  await expectTallButtons(editor);
  await expectNoSideScroll(page);
  await page.screenshot({ path: `test-results/V2-DUI-1b-pricing-${test.info().project.name}.png`, fullPage: true });

  const saved = await (await page.request.get(quotePath)).json() as QuoteWorkspaceResponse;
  expect(saved.draft?.revision).toBe(1);
  expect(saved.revisions[0]).toMatchObject({ revision: 1, netPence: 90000 });
  expect(saved.revisions[0]?.lines.filter(line => line.included)).toHaveLength(5);

  const previewResponse = page.waitForResponse(response => response.url().endsWith(`${quotePath}/preview`) && response.request().method() === "POST");
  await click("Preview this quote");
  const { view, document } = await (await previewResponse).json();
  expect(view).toMatchObject({ quoteRevision: 1, status: "previewed" });
  expect(document).toMatchObject({ netPence: 90000, taxPence: 18000, totalPence: 108000 });
  const preview = editor.getByRole("region", { name: "Quote preview", exact: true });
  await expect(preview).toContainText("DUI Practice Customer");
  await expect(preview).toContainText("5 included lines · Total £1,080.00");
  await expect(preview.getByTestId("quote-artifact-hash")).toHaveText(view.contentHash);
  const send = preview.getByRole("button", { name: "Simulate sending this quote", exact: true });
  await expectDesigned(page, preview, send);
  await expectNoSideScroll(page);
  await page.screenshot({ path: `test-results/V2-DUI-1b-preview-${test.info().project.name}.png`, fullPage: true });

  const recipient = editor.getByLabel("Confirmed recipient", { exact: true });
  const approved = await recipient.inputValue();
  await recipient.fill("different@example.invalid");
  await send.click();
  await expect(editor.getByText("Stale approval blocked", { exact: true })).toBeVisible();
  await expect(editor.getByTestId("quote-delivery")).toHaveText("Not queued");
  await recipient.fill(approved);
  await send.click();
  await expect(editor.getByTestId("quote-delivery")).toHaveText(/^(Queued — not sent|Simulated delivery — nothing sent)$/u);
  if ((await editor.getByTestId("quote-delivery").textContent()) === "Queued — not sent") await click("Continue fake worker");
  await expect(editor.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
  const delivery = editor.getByRole("region", { name: "Delivery facts", exact: true });
  for (const fact of ["Issued: yes", "Provider accepted: no", "Delivered: no", "Customer accepted: no"]) await expect(delivery.getByText(fact, { exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/V2-DUI-1b-sent-${test.info().project.name}.png`, fullPage: true });

  // Reopen the saved quote: the same terms in the same designed editor.
  await page.reload();
  await click("Price the work");
  await expect(editor).toHaveAttribute("data-quote-ready", "true");
  await expectTotals(editor, "1");
  await expect(editor.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
});
