import { expect, type Page } from "@playwright/test";

export async function openCapture(page: Page) {
  await page.addInitScript(() => {
    if (!(window as any).__JOBGUARD_SPEECH_ADAPTER__) (window as any).__JOBGUARD_SPEECH_ADAPTER__ = {
      configuration: { language: "en-GB", processLocally: true, remoteFallback: false },
      available: async () => "unavailable",
      install: async () => false,
      start: () => ({ stop() {}, cancel() {} }),
    };
  });
  await page.goto("/");
  const start = page.getByRole("button", { name: "Start the demo" });
  await start.waitFor({ state: "visible" });
  await start.click();
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page.getByRole("button", { name: "＋ Start a new job" }).dispatchEvent("click");
  await expect(page.getByRole("heading", { name: "Walk the job" })).toBeVisible();
}

export async function openReview(page: Page) {
  await openCapture(page);
  await page.getByRole("button", { name: "Make my draft" }).click();
  await page.getByRole("button", { name: "Check and edit my draft" }).click();
  await expect(page.getByRole("heading", { name: "Check the work items" })).toBeVisible();
}

export async function confirmCapturedScope(page: Page) {
  await openReview(page);
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site", "Replace shelves"])
    await page.getByRole("button", { name: `Accept ${name}` }).click();
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder will remove waste");
  await page.getByRole("button", { name: "Confirm scope" }).click();
  await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");
}

export async function openQuote(page: Page) {
  await confirmCapturedScope(page);
  await page.getByRole("button", { name: "Price the work" }).click();
}
