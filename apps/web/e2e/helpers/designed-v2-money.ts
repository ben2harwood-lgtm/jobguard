import { expect, type Page, type TestInfo } from "@playwright/test";
import { startWatchdogJob } from "./capture-journey";
import { openNewJob } from "./spoken-quote-journey";

// V2-SQ-I-3: helpers shared by V2-DUI-3 and the two V2-DUI-4 to-Paid specs (ported from #918's dui-4.ts and
// final-account-lock-journey-designed.ts, read only). The V2 entry is the rule 22 practice sign-in, then /jobs/new.
export async function openDesignedTab(page: Page, name: "Work" | "Money" | "Records") {
  await page.getByRole("navigation", { name: "Job sections" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByTestId(`designed-job-${name.toLowerCase()}`)).toBeVisible();
}

/** No side scroll at either width, and a screenshot in test-results for the PR. */
export async function moneyScreenshot(page: Page, info: TestInfo, state: string, anchor: string) {
  const width = info.project.name === "mobile-360" ? 360 : 1280;
  expect(page.viewportSize()?.width).toBe(width);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const target = page.locator(anchor).first();
  await target.evaluate(element => window.scrollBy({ top: element.getBoundingClientRect().top - 65, behavior: "instant" }));
  await page.screenshot({ path: `test-results/V2-DUI-money-${info.project.name}-${state}.png`, animations: "disabled" });
}

/** The V2 customer-and-site card needs a name and premises before it saves. */
export async function savePracticeParties(page: Page, name = "Practice Customer") {
  await page.getByLabel("Customer name", { exact: true }).fill(name);
  await page.getByLabel("Premises address", { exact: true }).fill("14 Fictional Lane");
  await page.getByRole("button", { name: "Save customer and site", exact: true }).click();
  await expect(page.getByTestId("party-customer")).toHaveText(name);
}

/** Continue the designed V2 capture and quote journey into the live job's final-account review. */
export async function prepareLockJobV2(page: Page, beforeBuild?: (jobId: string) => Promise<void>) {
  const click = (name: string) => page.getByRole("button", { name, exact: true }).click();
  await openNewJob(page);
  await page.getByLabel("Work details").fill("JOB: Fictional blue room\nITEM: Paint walls | £200.00");
  await click("Make my draft");
  await click("Check and edit my draft");
  await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+\/work$/u);
  const jobId = new URL(page.url()).pathname.split("/")[2]!;
  await savePracticeParties(page);
  await expect(page.getByRole("form", { name: "Customer and site details" }).getByText(/^Saved at /u)).toBeVisible();
  await click("Accept Paint walls");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  await click("Confirm scope");
  await click("Price the work");
  await startWatchdogJob(page);
  await page.goto(`/jobs/${jobId}/work#work-proof`);
  await click("Attach generated practice image");
  await click("Check file integrity");
  await click("Complete this stage");
  await expect(page.getByTestId("stage-status")).toHaveText("Complete");
  await click("Finished on site");
  await expect(page.getByTestId("work-state")).toHaveText("Finished on site");
  await beforeBuild?.(jobId);
  await page.goto(`/jobs/${jobId}/work#final-account-title`);
  await expect(page.locator("#final-account-title")).toBeFocused();
  await click("Build final account");
  await expect(page.getByTestId("lock-state")).toHaveText("Final account review");
  return jobId;
}
