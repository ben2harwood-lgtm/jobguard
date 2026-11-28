import { expect, type Locator, type Page } from "@playwright/test";

// V2-SQ-I-1: checks shared by V2-DUI-1a and V2-DUI-1b (ported from #918's DUI-1a/1b, read only).
/** A designed control: outside every legacy wrapper, the reference button look, inside the viewport. */
export async function expectDesigned(page: Page, panel: Locator, control: Locator) {
  await expect(panel).toBeVisible();
  await expect(panel.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' jgd-legacy ')]")).toHaveCount(0);
  await expect(control).toHaveCSS("background-image", /linear-gradient/u);
  await expect(control).toHaveCSS("border-top-left-radius", "8px");
  const width = page.viewportSize()!.width, { x, width: w } = (await panel.boundingBox())!;
  expect(x).toBeGreaterThanOrEqual(0);
  expect(x + w).toBeLessThanOrEqual(width);
}

/** Two columns on desktop, one at phone width. */
export async function expectResponsiveGrid(page: Page, grid: Locator) {
  await expect(grid).toHaveCSS("display", "grid");
  const columns = page.viewportSize()!.width > 760 ? 2 : 1;
  await expect.poll(() => grid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(columns);
}

export async function expectNoSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

/** Every visible designed button in the panel is at least 44 px tall. */
export async function expectTallButtons(panel: Locator) {
  const heights = await panel.locator("button.btn:visible").evaluateAll(buttons => buttons.map(button => [button.textContent?.trim(), button.getBoundingClientRect().height] as const));
  for (const [name, height] of heights) expect(height, `${name} is under 44 px`).toBeGreaterThanOrEqual(44);
}
