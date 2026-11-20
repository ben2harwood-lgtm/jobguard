import { expect, test, type Page } from "@playwright/test";
import { jsonResult } from "./helpers/customer-invoice-journey";
import { finishDispositionsAndTerms, prepareLockJob } from "./helpers/final-account-lock-journey";

const priced = "moved rad to other wall";
const draft = "made good ceiling, price tbc";

test.setTimeout(240_000);

async function prepareWaitingExtras(page: Page) {
  const fixture = await prepareLockJob(page);
  await finishDispositionsAndTerms(page);
  const panel = page.getByTestId("final-account-lock");
  for (const [description, price] of [[priced, "220"], [draft, ""]] as const) {
    await panel.getByLabel("Final-review extra description").fill(description);
    await panel.getByLabel("Final-review extra price (£, optional)").fill(price);
    await panel.getByRole("button", { name: "Add final-review extra", exact: true }).click();
    await expect(panel.getByRole("region", { name: "Captured variations" })).toContainText(description);
  }
  await page.reload();
  return {
    ...fixture, panel,
    complete: panel.getByRole("button", { name: "Complete final account", exact: true }),
    waiting: panel.getByRole("region", { name: "Extras not on this bill yet" }),
    readLock: () => jsonResult(page.request.get(`/api/jobs/${fixture.jobId}/final-account/lock`), "Read persisted lock"),
  };
}

test("both waiting extras must be intentionally left off before completing", async ({ page }) => {
  const { jobId, account, panel, complete, waiting, readLock } = await prepareWaitingExtras(page);
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account review");
  await expect(complete).toBeDisabled();
  await expect(waiting).toContainText(priced);
  await expect(waiting).toContainText(draft);
  await expect(waiting).toContainText("£220.00 — not approved yet");
  await expect(waiting).toContainText("Needs a price");
  const capture = (await readLock()).captures.find((item: { description: string }) => item.description === priced);
  const link = waiting.getByRole("link", { name: "Price or approve it" }).and(waiting.locator(`a[href="#variation-${capture.id}"]`));
  await link.click();
  const card = page.getByTestId(`variation-${capture.id}`);
  await expect(card).toContainText(priced);
  await expect(card.getByRole("button", { name: "Approve exact revision" })).toBeInViewport();

  await page.goto(`/jobs/${jobId}#final-account-title`);
  await waiting.getByRole("checkbox", { name: `Leave "${priced}" off this bill on purpose` }).check();
  await expect(complete).toBeDisabled();
  await waiting.getByRole("checkbox", { name: `Leave "${draft}" off this bill on purpose` }).check();
  await expect(complete).toBeEnabled();
  await complete.click();
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");
  const locked = await readLock();
  expect(locked.lock.finalAccountRevisionId).toBe(account.id);
  expect(locked.account.totals.net).toEqual(account.totals.net);
  expect(locked.captures).toEqual(expect.arrayContaining([
    expect.objectContaining({ description: priced, state: "priced", netPence: 22000 }),
    expect.objectContaining({ description: draft, state: "draft", netPence: null }),
  ]));
});

test("after approval and rebuilding only the unpriced extra still waits", async ({ page }) => {
  const { jobId, account, panel, complete, waiting, readLock } = await prepareWaitingExtras(page);
  const capture = (await readLock()).captures.find((item: { description: string }) => item.description === priced);
  const link = waiting.locator(`a[href="#variation-${capture.id}"]`);
  await expect(link).toBeVisible();
  await link.click();
  const card = page.getByTestId(`variation-${capture.id}`);
  await card.getByRole("button", { name: "Approve exact revision" }).click();
  await expect(card.getByText("Approved and saved", { exact: true })).toBeVisible();
  await page.goto(`/jobs/${jobId}#final-account-title`);
  await page.getByRole("button", { name: "Rebuild from approved sources", exact: true }).click();
  await expect.poll(async () => (await readLock()).account.totals.net.pence).toBe(account.totals.net.pence + 22000);
  const dispositions = panel.getByRole("combobox");
  await expect(dispositions.first()).toBeVisible();
  for (const disposition of await dispositions.all()) {
    await disposition.selectOption("done");
    await expect(panel).toHaveAttribute("aria-busy", "false");
  }
  const terms = panel.getByRole("button", { name: "Accept final check terms", exact: true });
  if (await terms.isEnabled()) await terms.click();
  await expect(waiting.getByRole("checkbox")).toHaveCount(1);
  await expect(waiting).toContainText(draft);
  await expect(waiting).not.toContainText(priced);
  await waiting.getByRole("checkbox", { name: `Leave "${draft}" off this bill on purpose` }).check();
  await complete.click();
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");
  const locked = await readLock();
  expect(locked.account.totals.net.pence).toBe(account.totals.net.pence + 22000);
  expect(locked.account.lines).toEqual(expect.arrayContaining([expect.objectContaining({ description: priced, netPence: 22000 })]));
});
