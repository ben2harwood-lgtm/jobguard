import { expect, test } from "@playwright/test";
import { openQuotingWatchdogJob } from "./helpers/capture-journey";
test.setTimeout(300_000);

test("CH-5 previews, attests and reloads an invoiced v3 import without a count or an invented lock", async ({ page, browser }) => {
  await openQuotingWatchdogJob(page);
  const main = page.getByRole("main");
  const sourceId = (await main.locator(".quote-editor").getAttribute("data-job-id"))!;
  await main.getByRole("button", { name: "Save customer and site", exact: true }).click();
  await expect(main.getByTestId("party-binding-id")).toBeVisible();
  await main.getByRole("link", { name: "Import a job under v3 terms", exact: true }).click();
  await expect(main.getByRole("heading", { name: "Import a fictional job under v3 terms" })).toBeVisible();
  await main.getByRole("button", { name: "Preview import", exact: true }).click();
  await expect(main.getByRole("button", { name: "Confirm import", exact: true })).toBeDisabled();
  await expect(main.getByRole("region", { name: "Import preview" })).toContainText("reference_fee_policy_v3");
  await main.getByRole("checkbox").check();
  await main.getByRole("button", { name: "Confirm import", exact: true }).click();
  const receipt = main.getByRole("region", { name: "Imported job" });
  await expect(receipt).toContainText("Counted places: 0");
  await expect(receipt).toContainText("Builder-attested imported baseline");
  await expect(receipt).toContainText("Pre-adoption evidence: £0.00 recovery fee");
  await expect(receipt).toContainText("no historical evidence or catches");
  await main.getByRole("link", { name: "Open saved import", exact: true }).click();
  await page.reload();
  await expect(main.getByRole("region", { name: "Imported job" })).toContainText("Counted places: 0");
  const importedId = page.url().split("/jobs/")[1]!.split("/")[0]!;
  const stored = await page.request.get(`/api/jobs/${importedId}/parties/import-v3`);
  expect(stored.ok()).toBe(true);
  const { result } = await stored.json();
  const forgedLock = await page.request.post(`/api/jobs/${importedId}/final-account/lock`, { data: {
    version: "final-account.lock.v1", commandId: crypto.randomUUID(), finalAccountRevisionId: result.baselineId, expectedRevision: 1, declarationVersion: "final_account_declaration.v1",
  } });
  expect(forgedLock.status()).toBe(409); expect((await forgedLock.json()).code).toBe("STALE_REVISION");
  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage(); await otherPage.goto("/");
    expect((await other.request.get(`/api/jobs/${importedId}/parties/import-v3`)).ok()).toBe(false);
  } finally { await other.close(); }
  await page.goto(`/jobs/${sourceId}/imports`);
  await main.getByLabel("Import stage").selectOption("live");
  await main.getByRole("button", { name: "Preview import", exact: true }).click();
  await main.getByRole("checkbox").check();
  await main.getByRole("button", { name: "Confirm import", exact: true }).click();
  await expect(main.getByRole("alert")).toContainText("No job has been imported");
});
