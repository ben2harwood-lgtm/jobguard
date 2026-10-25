import { expect, type Page } from "@playwright/test";
import { openReview } from "./helpers/capture-journey";
/** Existing capture commands only: no seeded advisor result or money/Final Check outcome. */
export async function openOrdinaryAdvisoryJob(page: Page) {
 await openReview(page);
 const match = /\/jobs\/([a-f0-9-]+)/u.exec(new URL(page.url()).pathname);
 if (!match) throw new Error("Capture did not open an existing job page");
 return match[1]!;
}
export async function expectNoLegacyFlash(page: Page) {
 const panel = page.locator("#commercial-integrity");
 await expect(panel.getByTestId("integrity-frozen-accepted-cap")).toHaveCount(0);
 await expect(panel.getByText(/£12\.00|£200\.00|Frozen accepted-value cap/u)).toHaveCount(0);
 await expect(panel.locator("a")).toHaveCount(0);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
