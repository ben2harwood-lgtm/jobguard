import { expect, test } from "@playwright/test";
import { openCapture } from "./helpers/capture-journey";

// V2-SQ-E: three rooms from the review reach the saved quote, the preview and the customer's quote page, with the
// bathroom shown as one room total. Runs in the desktop (1280) and mobile-360 projects. Totals never change.
test.setTimeout(180_000);
const words = "in the kitchen fit new units two thousand pounds and in the bathroom tile the floor five hundred pounds and move two sockets ninety pounds and in the hallway paint the walls six hundred pounds";

test("rooms: the bathroom as one room total in the editor, the preview and the customer's quote, and the same after reopening", async ({ page, browser }) => {
  const click = async (name: string) => { const button = page.getByRole("button", { name, exact: true }); await expect(button).toBeEnabled(); await button.click(); };
  const noSideScroll = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await openCapture(page);
  await page.getByLabel("Work details").fill(words);
  await click("Make my draft");
  await click("Check and edit my draft");
  await expect(page.getByRole("heading", { name: "Check the work items" })).toBeVisible();
  await expect(page.locator(".room-head h2")).toHaveText(["Kitchen", "Bathroom", "Hallway"]);
  await click("Save customer and site");
  await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
  await expect(page.getByRole("form", { name: "Customer and site details" }).locator("fieldset")).toBeEnabled();
  const lines = page.locator(".review-line");
  for (let i = 0; i < await lines.count(); i++) await lines.nth(i).getByRole("button", { name: /^Accept /u }).click();
  const answers = page.getByRole("textbox", { name: /^Answer /u });
  for (let i = 0; i < await answers.count(); i++) await answers.nth(i).fill("Builder removes the waste in this practice job.");
  await click("Save review");
  await click("Confirm scope");
  await click("Price the work");
  const quote = page.locator(".quote-editor");
  await expect(quote).toHaveAttribute("data-quote-ready", "true");
  await expect(quote.locator(".quote-room-head h3")).toHaveText(["Kitchen", "Bathroom", "Hallway"]);
  const gross = await page.getByTestId("quote-gross").textContent();

  await quote.getByLabel("Show Bathroom as").selectOption("room_total");
  await expect(quote.getByTestId("quote-editor-room-total")).toHaveText("Room total £590.00");
  await expect(page.getByRole("button", { name: "Preview this quote" })).toBeDisabled();
  await click("Save draft revision");
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await expect(page.getByTestId("quote-gross")).toHaveText(gross!);
  await click("Preview this quote");
  const preview = page.getByRole("region", { name: "Quote preview" });
  await expect(preview.locator(".quote-room h3")).toHaveText(["Kitchen", "Bathroom", "Hallway"]);
  await expect(preview.getByTestId("quote-room-total")).toHaveText(["Room total £590.00"]);
  await expect(preview.getByRole("region", { name: "Bathroom" }).getByRole("listitem")).not.toContainText(["£"]);
  await expect(preview.getByRole("region", { name: "Kitchen" }).getByRole("listitem")).toContainText(["£2,000.00"]);
  await noSideScroll();
  await page.screenshot({ path: `test-results/V2-SQ-E-rooms-preview-${test.info().project.name}.png`, fullPage: true });

  await click("Get practice customer link");
  const link = await page.getByLabel("Practice customer link — nothing emailed or texted").inputValue();
  const viewport = page.viewportSize()!;
  const customer = await browser.newContext({ viewport, baseURL: new URL(page.url()).origin });
  try {
    const separate = await customer.newPage();
    await separate.goto(link);
    await separate.getByRole("button", { name: "Sign in", exact: true }).click();
    await separate.getByRole("link", { name: "Review your quote", exact: true }).click();
    await expect(separate.locator(".quote-room h3")).toHaveText(["Kitchen", "Bathroom", "Hallway"]);
    await expect(separate.getByTestId("quote-room-total")).toHaveText(["Room total £590.00"]);
    await expect(separate.getByRole("region", { name: "Bathroom" }).getByRole("listitem")).not.toContainText(["£"]);
    expect(await separate.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await separate.screenshot({ path: `test-results/V2-SQ-E-rooms-customer-${test.info().project.name}.png`, fullPage: true });
  } finally { await customer.close(); }

  // Reopen from the jobs list, as the spoken-quote journey does.
  await page.reload();
  await page.goto("/jobs");
  await page.locator(".job-row").first().getByRole("button", { name: "Open job →" }).click();
  await page.getByRole("navigation", { name: "Job sections" }).getByRole("button", { name: "Work", exact: true }).click();
  await click("Price the work");
  await expect(quote).toHaveAttribute("data-quote-ready", "true");
  await expect(quote.getByLabel("Show Bathroom as")).toHaveValue("room_total");
  await expect(quote.getByTestId("quote-editor-room-total")).toHaveText("Room total £590.00");
  await expect(page.getByRole("button", { name: "Preview this quote" })).toBeEnabled();
  await noSideScroll();
  await page.screenshot({ path: `test-results/V2-SQ-E-rooms-reopened-${test.info().project.name}.png`, fullPage: true });
});
