// SV-7A diary and customer-message pages over the checked intake writer. Synthetic; CI only.
import { expect, test } from "@playwright/test";
import { openLiveWatchdogJob } from "./helpers/capture-journey";
import { seedManySignals } from "./helpers/final-account-lock-journey";

const NOTICE = "Notes are for your records. To bill for extra work, use Log an extra. JobGuard checks your records against your final bill after you complete it.";
const tenantId = "11111111-1111-4111-8111-111111111111";

test("a diary note and a fictional customer message persist; the diary shows only the standing notice", async ({ page }) => {
  await openLiveWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  await page.goto(`/jobs/${jobId}#job-diary`);
  const diary = page.getByTestId("job-diary");
  await expect(diary.getByTestId("diary-notice")).toHaveText(NOTICE);
  await expect(diary.getByLabel(/Written on site/u)).toBeDisabled();
  await diary.getByLabel("Note").fill("Fitted outside tap.");
  await diary.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(diary.getByTestId("diary-entry")).toHaveCount(1);
  await expect(diary.getByTestId("diary-entry")).toContainText("Fitted outside tap.");

  const messages = page.getByTestId("customer-messages");
  await messages.getByLabel("Made-up customer name").fill("Fictional Alex");
  await messages.getByLabel("Message").fill("Please fit an outside tap.");
  await messages.getByRole("button", { name: "Save message", exact: true }).click();
  await expect(messages.getByTestId("customer-message")).toContainText("Fictional Alex");

  await page.reload();
  await expect(page.getByTestId("diary-entry")).toContainText("Fitted outside tap.");
  await expect(page.getByTestId("customer-message")).toContainText("Please fit an outside tap.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // Diary responses are identical with and without hidden signals derived from the notes.
  const before = await (await page.request.get(`/api/jobs/${jobId}/diary`)).text();
  const evidenceId = JSON.parse(before).entries[0].evidence.id as string;
  await seedManySignals(tenantId, jobId, evidenceId);
  expect(await (await page.request.get(`/api/jobs/${jobId}/diary`)).text()).toBe(before);
  await page.reload();
  await expect(page.getByTestId("diary-notice")).toHaveText(NOTICE);
  await expect(page.getByTestId("diary-entry")).toHaveCount(1);
});
