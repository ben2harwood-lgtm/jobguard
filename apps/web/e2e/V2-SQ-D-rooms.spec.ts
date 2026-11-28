import { expect, test } from "@playwright/test";
import { openCapture } from "./helpers/capture-journey";

// V2-SQ-D: three rooms said aloud (typed here), a row moved and back, one room quoted as one price, saved, reloaded
// and reopened. Runs in the desktop (1280) and mobile-360 projects. Per plan-check condition 3, only `room` and
// `category` are stored: empty rooms and "check" marks are session-only, so the reload checks rooms, order, prices
// and the total, and sees the one-price room as its single combined row.
test.setTimeout(120_000);
const words = "in the kitchen fit new units two thousand pounds and in the bathroom tile the floor five hundred pounds and move two sockets ninety pounds and in the hallway paint the walls six hundred pounds";
const sockets = "move two sockets ninety pounds and in the hallway";

test("rooms: headings, a move and back, one price for the bathroom, and the same after a reload", async ({ page }) => {
  await openCapture(page);
  await page.getByLabel("Work details").fill(words);
  await page.getByRole("button", { name: "Make my draft" }).click();
  await page.getByRole("button", { name: "Check and edit my draft" }).click();
  await expect(page.getByRole("heading", { name: "Check the work items" })).toBeVisible();
  const headings = page.locator(".room-head h2"), subtotals = page.getByTestId("room-total"), total = page.getByTestId("running-total");
  await expect(headings).toHaveText(["Kitchen", "Bathroom", "Hallway"]);
  await expect(subtotals).toHaveText(["£2,000.00", "£590.00", "£600.00"]);
  await expect(total).toHaveText("Total so far £3,190.00 · complete");

  await page.getByRole("button", { name: `Move ${sockets}` }).click();
  const sheet = page.getByRole("dialog", { name: `Move ${sockets}` });
  await sheet.getByRole("button", { name: "Kitchen", exact: true }).click();
  await expect(subtotals).toHaveText(["£2,090.00", "£500.00", "£600.00"]);
  await expect(total).toHaveText("Total so far £3,190.00 · complete");
  await page.getByRole("button", { name: `Move ${sockets}` }).click();
  await page.getByRole("dialog", { name: `Move ${sockets}` }).getByRole("button", { name: "Bathroom", exact: true }).click();
  await expect(subtotals).toHaveText(["£2,000.00", "£590.00", "£600.00"]);

  const bathroom = page.getByRole("region", { name: "Bathroom" });
  await bathroom.getByLabel("One price for the room").check();
  await bathroom.getByLabel("Room price Bathroom").fill("900");
  await bathroom.getByRole("button", { name: "Set one price for Bathroom" }).click();
  const confirm = page.getByRole("dialog", { name: "One price for Bathroom" });
  await expect(confirm.getByRole("listitem")).toHaveText(["tile the floor · proposed", `${sockets} · proposed`]);
  await confirm.getByRole("button", { name: "Apply one price" }).click();
  await expect(subtotals).toHaveText(["£2,000.00", "£900.00", "£600.00"]);
  await expect(total).toHaveText("Total so far £3,500.00 · complete");
  await expect(page.getByText("Undo works until you save. After saving, split the row to itemise it again.")).toBeVisible();
  for (const box of await page.locator(".room-group button, .room-group select").all()) {
    if (await box.isVisible()) expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/V2-SQ-D-rooms-${test.info().project.name}.png`, fullPage: true });

  const saved = page.waitForResponse(r => r.url().endsWith("/review") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Save review" }).click();
  expect((await saved).status()).toBe(200);
  const expectSaved = async () => {
    await expect(headings).toHaveText(["Kitchen", "Bathroom", "Hallway"]);
    await expect(subtotals).toHaveText(["£2,000.00", "£900.00", "£600.00"]);
    await expect(total).toHaveText("Total so far £3,500.00 · complete");
    await expect(page.getByLabel(`Description Bathroom: tile the floor; ${sockets}`)).toBeVisible();
    await expect(page.getByTestId("row-origin")).toContainText(["Itemised came to £590.00 · room price £900.00"]);
  };
  const url = page.url();
  await page.reload();
  await expectSaved();
  await page.goto("/classic");
  await page.goto(url);
  await expectSaved();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
