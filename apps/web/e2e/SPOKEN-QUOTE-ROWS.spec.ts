import { expect, test } from "@playwright/test";
import { openCapture } from "./helpers/capture-journey";

// V2-SQ2: the third spoken example, typed (nothing injected but the default unavailable voice), combined, split,
// priced, saved and reloaded. Runs in the desktop and mobile-360 projects.
test.setTimeout(120_000);
const words = "paint the walls two hundred pounds and fit the door sixty pounds";

test("combining keeps £260, splitting starts blank, and the priced parts survive a reload", async ({ page }) => {
  await openCapture(page);
  await page.getByLabel("Work details").fill(words);
  await page.getByRole("button", { name: "Make my draft" }).click();
  await page.getByRole("button", { name: "Check and edit my draft" }).click();
  await expect(page.getByRole("heading", { name: "Check the work items" })).toBeVisible();
  const total = page.getByTestId("running-total");
  await expect(total).toHaveText("Total so far £260.00 · complete");
  await expect(page.getByLabel("Price paint the walls")).toHaveValue("200.00");
  await expect(page.getByLabel("Price fit the door")).toHaveValue("60.00");
  await page.getByLabel("Select paint the walls for merge").check();
  await page.getByLabel("Select fit the door for merge").check();
  await page.getByRole("button", { name: "Merge selected (2)" }).click();
  await expect(page.getByTestId("row-origin")).toHaveText(["Combined from 2 rows · £260.00"]);
  await expect(total).toHaveText("Total so far £260.00 · complete");
  await page.getByRole("button", { name: "Split paint the walls + fit the door" }).click();
  await expect(total).toHaveText("Total so far £0.00 · incomplete: 2 rows need a price");
  await expect(page.getByTestId("row-origin").filter({ hasText: "Before the split: £260.00 for the whole row" })).toHaveCount(2);
  const partA = page.getByLabel("Price paint the walls + fit the door — part A"), partB = page.getByLabel("Price paint the walls + fit the door — part B");
  await expect(partA).toHaveValue(""); await expect(partB).toHaveValue("");
  await partA.fill("160");
  await expect(total).toHaveText("Total so far £160.00 · incomplete: 1 row needs a price");
  await partB.fill("100");
  await expect(total).toHaveText("Total so far £260.00 · complete");
  const saved = page.waitForResponse(r => r.url().endsWith("/review") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Save review" }).click();
  expect((await saved).status()).toBe(200);
  await page.screenshot({ path: `test-results/SPOKEN-QUOTE-ROWS-${test.info().project.name}.png`, fullPage: true });
  await page.reload();
  await expect(page.getByLabel("Price paint the walls + fit the door — part A")).toHaveValue("160.00");
  await expect(page.getByLabel("Price paint the walls + fit the door — part B")).toHaveValue("100.00");
  await expect(page.getByTestId("running-total")).toHaveText("Total so far £260.00 · complete");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
