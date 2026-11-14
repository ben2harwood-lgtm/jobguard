import { expect, test } from "@playwright/test";
import { openQuotingWatchdogJob, openReview, startWatchdogJob } from "./helpers/capture-journey";

test.setTimeout(180_000);
test("human confirmation and reproducible corrections retain group flags and session isolation", async ({ page, context, browser }) => {
  const capture = page.waitForResponse(r => r.url().endsWith("/api/jobs/capture") && r.request().method() === "POST");
  await openQuotingWatchdogJob(page);
  const { jobId } = await (await capture).json();
  const endpoint = `/api/jobs/${jobId}/supplier-lines`;
  const refused = await context.request.post(endpoint, { data: {} });
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toEqual({ code: "JOB_NOT_LIVE" });
  await startWatchdogJob(page);
  await page.goto(`/jobs/${jobId}/supplier-lines`);
  await expect(page.getByText("Revision 0 · Unconfirmed proposal")).toBeVisible();
  await expect(page.getByText(/Overall matching state: complete/)).toBeVisible();
  await expect(page.getByText(/^short_delivery:/)).toBeVisible();
  await expect(page.getByText(/^billed_above_received:/)).toBeVisible();
  const confirm = page.getByRole("button", { name: "Confirm reviewed lines" });
  await expect(confirm).toBeDisabled();
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await confirm.click();
  await expect(page.getByText("Revision 0 · Human-confirmed lines")).toBeVisible();
  const original = await (await context.request.get(`${endpoint}?version=supplier-lines-read.v1`)).json();
  const sourceRows = (facts: typeof original.facts) => ({ orders: facts.orders, receipts: facts.receipts, bills: facts.bills });
  const form = page.locator("form").first();
  await form.locator("select").selectOption(original.facts.orders[0].versionId);
  const corrected = page.waitForResponse(r => r.url().endsWith(endpoint) && r.request().method() === "POST");
  await form.getByRole("button", { name: "Record correction" }).click();
  const correctionResponse = await corrected;
  const command = correctionResponse.request().postDataJSON();
  const first = await correctionResponse.json();
  await expect(page.getByText("Revision 1 · Human-confirmed lines")).toBeVisible();
  expect(sourceRows(first.facts)).toEqual(sourceRows(original.facts));
  const replay = await context.request.post(endpoint, { data: command });
  expect(replay.status()).toBe(200); expect(await replay.json()).toEqual(first);
  const stale = await context.request.post(endpoint, { data: { ...command, commandId: crypto.randomUUID() } });
  expect(stale.status()).toBe(409); expect(await stale.json()).toEqual({ code: "MATCH_REVISION_CONFLICT" });
  const withdrawn = await context.request.post(endpoint, { data: { ...command, commandId: crypto.randomUUID(), expectedRevision: 1, orderVersionId: null } });
  expect(withdrawn.status()).toBe(200);
  const after = await withdrawn.json(); expect(after.revision).toBe(2); expect(after.facts).toEqual(original.facts);
  const historical = await context.request.get(`${endpoint}?version=supplier-lines-read.v1&snapshotId=${original.snapshotId}&revision=1`);
  expect(await historical.json()).toEqual(first);
  const spoof = await context.request.post(endpoint, { data: { ...command, tenantId: crypto.randomUUID() } });
  expect(spoof.status()).toBe(400);
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage(); await openReview(other);
    for (const id of [jobId, crypto.randomUUID()]) {
      const denied = await otherContext.request.get(`/api/jobs/${id}/supplier-lines?version=supplier-lines-read.v1&snapshotId=${original.snapshotId}`);
      expect(denied.status()).toBe(404); expect(await denied.json()).toEqual({ code: "NOT_FOUND" });
    }
    expect((await otherContext.request.post(endpoint, { data: command })).status()).toBe(404);
  } finally { await otherContext.close(); }
  await page.reload();
  await expect(page.getByText("Revision 2 · Human-confirmed lines")).toBeVisible();
  await page.getByText("Correction history", { exact: true }).click();
  await expect(page.getByText(/Revision 2; audit/)).toBeVisible();
  await expect(page.getByText(/^short_delivery:/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
