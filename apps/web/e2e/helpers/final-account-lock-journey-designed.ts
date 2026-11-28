import { expect, type Page } from "@playwright/test";
import { startWatchdogJob } from "./capture-journey";
import { openCaptureDesigned } from "./capture-journey-designed";

/** Continue the designed capture and quote journey into the live job's final-account review. */
export async function prepareLockJobDesigned(page: Page, beforeBuild?: (jobId: string) => Promise<void>) {
  const click = (name: string) => page.getByRole("button", { name, exact: true }).click();
  await openCaptureDesigned(page);
  await page.getByLabel("Work details").fill("JOB: Fictional blue room\nITEM: Paint walls | £200.00");
  await click("Make my draft");
  await click("Check and edit my draft");
  await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+\/work$/u);
  const jobId = new URL(page.url()).pathname.split("/")[2]!;
  await click("Save customer and site");
  await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
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
