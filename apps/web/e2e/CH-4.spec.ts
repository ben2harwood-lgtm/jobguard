// CH4-U work-state controls and linked-job offer. Synthetic only; runs in CI.
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { openLiveWatchdogJob } from "./helpers/capture-journey";
import { prepareLockJob } from "./helpers/final-account-lock-journey";
import { prepareInvoiceFinalCheck } from "./helpers/customer-invoice-journey";

const LINKED = "Start a linked job for this customer and site";
const panel = (page: Page) => page.getByTestId("job-work-state");
async function click(page: Page, name: string) {
  const button = panel(page).getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled(); await button.click();
  await expect(panel(page)).toHaveAttribute("aria-busy", "false");
}
const eventIds = (page: Page) => panel(page).getByTestId("work-state-event").evaluateAll(items => items.map(item => `${item.getAttribute("data-kind")}:${item.getAttribute("data-event-id")}`));

test("finish, cancel, close with a reason and reopen persist across reload and a second page", async ({ page, context }) => {
  await openLiveWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  await page.goto(`/jobs/${jobId}#site-work`);
  await expect(panel(page).getByTestId("work-state")).toHaveText("Work under way");
  await expect(panel(page).getByRole("button", { name: "Resume site work", exact: true })).toBeDisabled();

  await click(page, "Finished on site");
  await expect(panel(page).getByTestId("work-state")).toHaveText("Finished on site");
  await click(page, "Cancel finished on site");
  await expect(panel(page).getByTestId("work-state")).toHaveText("Work under way");

  await expect(panel(page).getByRole("button", { name: "Close job", exact: true })).toBeDisabled();
  await panel(page).getByLabel("Reason").selectOption("abandoned");
  await panel(page).getByLabel("Note (required)").fill("Fictional customer stopped the work");
  await click(page, "Close job");
  await expect(panel(page).getByTestId("work-state")).toHaveText("Closed");
  await expect(panel(page).getByTestId("work-state-event").last()).toContainText("Abandoned: Fictional customer stopped the work");
  await click(page, "Reopen job");
  await expect(panel(page).getByTestId("work-state")).toHaveText("Work under way");

  const saved = await eventIds(page);
  expect(saved.map(item => item.split(":")[0])).toEqual(expect.arrayContaining(["finished_on_site", "finished_cancelled", "closed", "reopened"]));
  await page.reload();
  await expect.poll(() => eventIds(page)).toEqual(saved);
  const second = await context.newPage();
  await second.goto(`/jobs/${jobId}#site-work`);
  await expect.poll(() => eventIds(second)).toEqual(saved);

  // A stale revision is refused and records nothing.
  const stale = await page.request.post(`/api/jobs/${jobId}/work-state`, { data: { version: "job-work-state-command.v1", commandId: randomUUID(), expectedRevision: 0, action: "finish" } });
  expect(stale.status()).toBe(409);
  await page.reload();
  await expect.poll(() => eventIds(page)).toEqual(saved);

  // Layout: no sideways scroll on this viewport and 44px actions.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const box = await panel(page).getByRole("button", { name: "Finished on site", exact: true }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("after lock, new site work is refused and the screen offers a linked job", async ({ page }) => {
  const { jobId, account } = await prepareLockJob(page);
  await prepareInvoiceFinalCheck(page, jobId, account);
  await page.goto(`/jobs/${jobId}#site-work`);
  await expect(panel(page).getByTestId("linked-job-offer")).toContainText(LINKED);
  const before = await eventIds(page);
  const { scopeItemId } = await (await page.request.get(`/api/jobs/${jobId}/proof`)).json();
  const refused = await page.request.post(`/api/jobs/${jobId}/proof`, { data: { version: "practice-proof-command.v1", commandId: randomUUID(), action: "select_generated", fixture: "completion-photo", scopeItemId } });
  expect(refused.ok()).toBe(false);
  expect(await refused.text()).toContain("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  await page.reload();
  await expect(panel(page).getByTestId("linked-job-offer")).toContainText(LINKED);
  await expect.poll(() => eventIds(page)).toEqual(before);
});
