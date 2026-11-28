import { expect, type Page, type TestInfo } from "@playwright/test";

export async function openDesignedTab(page: Page, name: "Work" | "Money" | "Records") {
  await page.getByRole("navigation", { name: "Job sections" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByTestId(`designed-job-${name.toLowerCase()}`)).toBeVisible();
}

export async function moneyScreenshot(page: Page, info: TestInfo, state: string, anchor: string) {
  const width = info.project.name === "mobile-360" ? 360 : 1280;
  expect(page.viewportSize()?.width).toBe(width);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  if (!process.env.DUI_4_SCREENSHOTS) return;
  const target = page.locator(anchor);
  const path = `e2e/artifacts/dui-4/${info.project.name}-${state}.png`;
  if (anchor === "#paid-report") {
    await target.screenshot({ path, animations: "disabled", style: ".rr-mobile-nav { visibility: hidden; }" });
  } else {
    await target.evaluate(element => window.scrollBy({ top: element.getBoundingClientRect().top - 65, behavior: "instant" }));
    await page.screenshot({ path, animations: "disabled" });
  }
}
