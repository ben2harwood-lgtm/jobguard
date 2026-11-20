import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { jsonResult } from "./helpers/customer-invoice-journey";
import { finishDispositionsAndTerms, prepareLockJob } from "./helpers/final-account-lock-journey";

test.setTimeout(240_000);

test("updates the stale bill explicitly and keeps saved dispositions", async ({ page }) => {
  const { jobId, account } = await prepareLockJob(page);
  const panel = page.getByTestId("final-account-lock");
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account review");
  const description = "Fictional radiator move";
  await panel.getByLabel("Final-review extra description").fill(description);
  await panel.getByLabel("Final-review extra price (£, optional)").fill("220");
  await panel.getByRole("button", { name: "Add final-review extra", exact: true }).click();
  await expect(panel.getByRole("region", { name: "Captured variations" })).toContainText(description);
  const path = `/api/jobs/${jobId}/final-account/lock`;
  const readLock = () => jsonResult(page.request.get(path), "Read persisted lock");
  const capture = (await readLock()).captures.find((item: { description: string }) => item.description === description);
  await page.goto(`/jobs/${jobId}#variation-${capture.id}`);
  await page.reload();
  const card = page.getByTestId(`variation-${capture.id}`);
  await card.getByRole("button", { name: "Approve exact revision" }).click();
  await expect(card.getByText("Approved immutable commercial fact", { exact: true })).toBeVisible();
  await page.goto(`/jobs/${jobId}#final-account-title`);
  await finishDispositionsAndTerms(page);
  const complete = panel.getByRole("button", { name: "Complete final account", exact: true });
  await complete.click();
  const error = panel.getByTestId("final-account-lock-error");
  await expect(error).toHaveText("You approved a change after this bill was built. Update the bill, check the new total, then press Complete final account again.", { timeout: 5_000 });
  await expect(error).toHaveAttribute("data-error-code", "STALE_REVISION");
  await expect(error).toBeInViewport();
  await expect(panel.getByText("STALE_REVISION", { exact: true })).toHaveCount(0);

  await panel.getByRole("button", { name: "Update the bill with approved extras", exact: true }).click();
  await expect(page.getByTestId("final-net")).toHaveText(new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((account.totals.net.pence + 22000) / 100));
  await expect(error).toHaveCount(0);
  const dispositions = panel.getByRole("combobox");
  await expect(dispositions.first()).toBeVisible();
  for (const disposition of await dispositions.all()) expect(await disposition.inputValue()).toBe("done");

  const stale = await page.request.post(path, { data: {
    version: "final-account.lock.v1", commandId: randomUUID(), finalAccountRevisionId: account.id,
    expectedRevision: account.revision, declarationVersion: "final_account_declaration.v1",
  } });
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toMatchObject({ code: "STALE_REVISION" });
  expect((await readLock()).lock).toBeNull();
  await complete.click();
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");
});
