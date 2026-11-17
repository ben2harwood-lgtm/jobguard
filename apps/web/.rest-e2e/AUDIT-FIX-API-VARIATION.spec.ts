import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { openLiveWatchdogJob } from "./helpers/capture-journey";
import type { VariationWorkspaceResponse } from "@jobguard/api/variation-contracts";

test.setTimeout(300_000);
test("captured extras can be priced, and stale edits and rejections preserve approved terms", async ({ page }) => {
  await openLiveWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  const url = `/api/jobs/${jobId}/variations`;
  await page.getByLabel("Description", { exact: true }).fill("Fictional audit extra");
  await page.getByRole("button", { name: "Add proposed variation", exact: true }).click();
  const extra = page.getByTestId(/^variation-/).filter({ hasText: "Fictional audit extra" });
  await expect(extra).toBeVisible();
  await expect(extra.getByRole("button", { name: "Approve exact revision", exact: true })).toHaveCount(0);
  const before = await (await page.request.get(url)).json() as VariationWorkspaceResponse;
  const captured = before.variations.find(v => v.description === "Fictional audit extra")!;
  await extra.getByRole("button", { name: "Change price", exact: true }).click();
  await extra.getByLabel("New price Fictional audit extra").fill("125.00");
  await extra.getByRole("button", { name: "Save new proposed revision", exact: true }).click();
  await expect(extra.getByText("Price revision 1 · £125.00", { exact: true })).toBeVisible();
  await extra.getByRole("button", { name: "Approve exact revision", exact: true }).click();
  await expect(page.getByTestId("approved-additions")).toHaveText("£125.00");
  const first = await (await page.request.get(url)).json() as VariationWorkspaceResponse;
  const priced = first.variations.find(v => v.id === captured.id)!;
  expect(priced.scopeItemId).toBe(captured.scopeItemId);
  expect(priced.lineageParentScopeItemId).toBe(captured.lineageParentScopeItemId);
  const rejected = await page.request.post(url, { data: { version: "variation-command.v1", action: "reject",
    variationId: priced.id, revisionId: priced.currentRevisionId, rejectionId: randomUUID() } });
  expect(rejected.status()).toBe(409); expect(await rejected.json()).toEqual({ code: "VARIATION_REVISION_CONFLICT" });

  // Client A starts editing R1; client B records and approves R2 through the same HTTP boundary.
  await extra.getByRole("button", { name: "Change price", exact: true }).click();
  await extra.getByLabel("New price Fictional audit extra").fill("110.00");
  const r2 = randomUUID();
  const edited = await page.request.post(url, { data: { version: "variation-command.v1", action: "revise",
    variationId: priced.id, revisionId: r2, expectedRevisionId: priced.currentRevisionId,
    description: priced.description, price: { quantity: "1", unit: "item", unitRatePence: 20000, direction: "addition" } } });
  expect(edited.ok()).toBe(true);
  const approved = await page.request.post(url, { data: { version: "variation-command.v1", action: "approve",
    variationId: priced.id, revisionId: r2, approvalId: randomUUID(),
    attestation: "Builder-recorded practice acceptance — not an authenticated customer signature" } });
  expect(approved.ok()).toBe(true);
  const attempt = page.waitForResponse(response => response.url().endsWith(url) && response.request().method() === "POST");
  await extra.getByRole("button", { name: "Save new proposed revision", exact: true }).click();
  expect((await attempt).status()).toBe(409);
  await expect(page.getByText("This variation could not be changed. Reload and review the current revision.", { exact: true })).toBeVisible();
  const saved = await (await page.request.get(url)).json() as VariationWorkspaceResponse;
  expect(saved.variations.find(v => v.id === priced.id)).toMatchObject({ state: "approved", currentRevisionId: r2 });
  expect(saved.variations.find(v => v.id === priced.id)!.revisions).toHaveLength(2);
  expect(saved.approvedAdditionsPence).toBe(20000);
  await page.reload();
  await page.getByRole("button", { name: "Price the work", exact: true }).click();
  await expect(page.getByTestId("approved-additions")).toHaveText("£200.00");
});
