import { expect, type Page } from "@playwright/test";

/** The designed entry to capture, with the same local speech fixture as the classic journey. */
export async function openCaptureDesigned(page: Page) {
  await page.addInitScript(() => {
    window.__JOBGUARD_SPEECH_ADAPTER__ ??= {
      configuration: { language: "en-GB", processLocally: true, remoteFallback: false },
      available: async () => "unavailable",
      install: async () => false,
      start: () => ({ stop() {}, cancel() {} }),
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start my own practice firm", exact: true }).click();
  await expect(page.getByTestId("designed-today")).toBeVisible();
  await page.getByRole("navigation", { name: /^(Main|Mobile) navigation$/u })
    .getByRole("button", { name: "Jobs", exact: true }).click();
  const jobs = page.getByTestId("designed-jobs-list");
  await expect(jobs.getByText("No jobs yet", { exact: true })).toBeVisible();
  await jobs.getByRole("button", { name: "Start a new job", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/new$/u);
  await expect(page.getByRole("heading", { name: "Walk the job", exact: true })).toBeVisible();
}
