// SV-5 reveal screen: what can be shown before the Final Check worker is scheduled (Q6). Synthetic; CI only.
import { expect, test } from "@playwright/test";
import { openLiveWatchdogJob } from "./helpers/capture-journey";
import { prepareLockJob } from "./helpers/final-account-lock-journey";
import { prepareInvoiceFinalCheck } from "./helpers/customer-invoice-journey";

test("before lock nothing is revealed; after lock the check shows as running and survives reload", async ({ page }) => {
  await openLiveWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  await page.goto(`/jobs/${jobId}#final-check`);
  const panel = page.getByTestId("final-check-reveal");
  await expect(panel.getByTestId("final-check-status")).toHaveText("JobGuard's final check runs after you complete the final account.");
  await expect(panel.getByTestId("final-check-item")).toHaveCount(0);
  const before = await page.request.get(`/api/jobs/${jobId}/final-check`);
  expect(await before.json()).toMatchObject({ state: "unlocked", items: [] });
});

test("after lock the check is running, shows no items and keeps that state after reload", async ({ page }) => {
  const { jobId, account } = await prepareLockJob(page);
  await prepareInvoiceFinalCheck(page, jobId, account);
  for (let pass = 0; pass < 2; pass++) {
    await page.goto(`/jobs/${jobId}#final-check`);
    const panel = page.getByTestId("final-check-reveal");
    await expect(panel.getByTestId("final-check-status")).toHaveText("Running JobGuard's final check");
    await expect(panel.getByTestId("final-check-item")).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

// E and K (fixture-seeded reveal + answers) return once the job's own capture text stops being a
// non-processable Final Check source; until then no captured practice job can complete a check.
