import { expect, type Page } from "@playwright/test";
import { openReview } from "./helpers/v1-sample-job";
/** Existing saved-v1 commands only; no seeded advisor result or financial outcome. */
export async function openOrdinaryAdvisoryJob(page: Page) {
 await openReview(page);
 const match = /\/jobs\/([a-f0-9-]+)/u.exec(new URL(page.url()).pathname);
 if (!match) throw new Error("Review did not open an existing job page");
 return match[1]!;
}
export async function expectInstalledV1Panel(page: Page) {
 const panel = page.locator("#commercial-integrity");
 await expect(panel.getByText("Example thresholds — not a judgement or billing rule", { exact: true })).toBeVisible();
 await expect(panel.getByTestId("integrity-frozen-accepted-cap")).toHaveText("£0.00");
 await expect(panel.getByText("No checks in this filter.", { exact: true })).toBeVisible();
 await expect(panel.getByRole("alert")).toHaveCount(0);
 await expect(panel.getByRole("button", { name: "Review or dismiss", exact: true })).toHaveCount(0);
 await expect(panel.getByText(/£12\.00|£200\.00/u)).toHaveCount(0);
 await expect(panel.locator("a")).toHaveCount(0);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
