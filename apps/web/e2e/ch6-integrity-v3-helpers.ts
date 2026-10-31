import { expect, type Page } from "@playwright/test";
import { openReview } from "./helpers/v1-sample-job";
import { confirmCapturedScope } from "./helpers/capture-journey";
/** Existing saved-v1 commands only; no seeded advisor result or financial outcome. */
export async function openOrdinaryAdvisoryJob(page: Page) {
 await openReview(page);
 const match = /\/jobs\/([a-f0-9-]+)/u.exec(new URL(page.url()).pathname);
 if (!match) throw new Error("Review did not open an existing job page");
 return match[1]!;
}
export async function expectInstalledV1Panel(page: Page) {
 const panel = page.getByRole("main").locator("#commercial-integrity");
 await expect(panel.getByText("Example thresholds — not a judgement or billing rule", { exact: true })).toBeVisible();
 await expect(panel.getByText("Cap-basis signals are v1-only.", { exact: true })).toBeVisible();
 await expect(panel.getByTestId("integrity-frozen-accepted-cap")).toHaveText("£0.00");
 await expect(panel.getByText("No checks in this filter.", { exact: true })).toBeVisible();
 await expect(panel.getByRole("alert")).toHaveCount(0);
 await expect(panel.getByRole("button", { name: "Review or dismiss", exact: true })).toHaveCount(0);
 await expect(panel.getByText(/£12\.00|£200\.00/u)).toHaveCount(0);
 await expect(panel.locator("a")).toHaveCount(0);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

/** A fresh v3 job created through the existing capture/confirmation commands. */
export async function openFreshAdvisoryJob(page: Page) {
 await confirmCapturedScope(page);
 const jobId = await page.getByRole("main").getAttribute("data-job-id");
 if (!jobId) throw Error("Fresh capture did not expose its saved job identity");
 await page.goto(`/jobs/${jobId}#commercial-integrity`);
 return jobId;
}
export async function expectInstalledV3Panel(page: Page) {
 const panel = page.getByRole("main").locator("#commercial-integrity");
 await expect(panel.getByText("Recorded advisory checks · v3", { exact: true })).toBeVisible();
 await expect(panel.getByText("Example thresholds — not a judgement or billing rule", { exact: true })).toBeVisible();
 await expect(panel.getByRole("heading", { name: "Some checks are unavailable", exact: true })).toBeVisible();
 await expect(panel.getByText("No authorised phone-sharing source is available.", { exact: true })).toBeVisible();
 await expect(panel.getByText("No authorised card-sharing source is available.", { exact: true })).toBeVisible();
 await expect(panel.getByTestId("integrity-frozen-accepted-cap")).toHaveCount(0);
 await expect(panel.getByText("Cap-basis signals are v1-only.", { exact: true })).toHaveCount(0);
 await expect(panel.getByRole("alert")).toHaveCount(0);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
