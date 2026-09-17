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
  const skip = page.getByRole("button", { name: "Skip tour" });
  await expect(skip).toBeVisible(); await expect(skip).toBeEnabled(); await skip.click();
  const newJob = page.getByRole("button", { name: "＋ Start a new job" });
  await expect(newJob).toBeVisible(); await expect(newJob).toBeEnabled(); await newJob.click();
  await expect(page.getByRole("heading", { name: "Walk the job" })).toBeVisible();
}

export async function openReview(page: Page) {
  await openCapture(page);
  const makeDraft = page.getByRole("button", { name: "Make my draft" });
  await expect(makeDraft).toBeVisible(); await expect(makeDraft).toBeEnabled(); await makeDraft.click();
  const checkDraft = page.getByRole("button", { name: "Check and edit my draft" });
  await expect(checkDraft).toBeVisible(); await expect(checkDraft).toBeEnabled(); await checkDraft.click();
  await expect(page.getByRole("heading", { name: "Check the work items" })).toBeVisible();
}

export async function confirmCapturedScope(page: Page) {
  await openReview(page);
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site", "Replace shelves"]) { const action=page.getByRole("button", { name: `Accept ${name}` }); await expect(action).toBeVisible(); await expect(action).toBeEnabled(); await action.click(); }
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder will remove waste");
  const confirm = page.getByRole("button", { name: "Confirm scope" }); await expect(confirm).toBeVisible(); await expect(confirm).toBeEnabled(); await confirm.click();
  await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");
}

export async function openQuote(page: Page) {
  await confirmCapturedScope(page);
  const price = page.getByRole("button", { name: "Price the work" }); await expect(price).toBeVisible(); await expect(price).toBeEnabled(); await price.click();
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
}
