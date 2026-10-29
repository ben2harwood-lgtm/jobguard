import { installContractorAgreementFixture } from "./contractor-agreement-fixture.js";
import { expect, test } from "@playwright/test";
test.setTimeout(180_000);
test.beforeEach(async ({ page }) => { await installContractorAgreementFixture(page); });
const origin = "http://127.0.0.1:3000";
test("stored baseline import/replay, scoped dashboard and baseline downloads use real synthetic routes", async ({ page, browser }) => {
  await page.goto("/admin/contractor");
  await page.getByRole("button", { name: "Start generated contractor practice", exact: true }).click();
  await expect(page.getByTestId("contractor-revision")).toHaveText("0");
  const organisation = await (await page.request.get("/api/contractor")).json();
  let revision = organisation.revision;
  const dashboardGrant = crypto.randomUUID();
  for (const [role, id] of [["commercial_manager", dashboardGrant], ["finance", crypto.randomUUID()]]) {
    const response = await page.request.post("/api/contractor", { headers: { origin }, data: {
      version: "contractor-command.v1", environment: "synthetic_demo", commandId: crypto.randomUUID(), id,
      expectedRevision: revision++, kind: "grant.create", membershipId: organisation.membershipId,
      role, scope: { kind: "tenant", id: organisation.tenantId }, contractId: null,
    } });
    expect(response.status()).toBe(200);
  }
  const team = crypto.randomUUID();
  const created = await page.request.post("/api/contractor", { headers: { origin }, data: {
    version: "contractor-command.v1", environment: "synthetic_demo", commandId: crypto.randomUUID(), id: team,
    expectedRevision: revision++, kind: "team.create", branchId: organisation.teams[0].branch_id, name: "Fictional comparison team",
  } });
  expect(created.status()).toBe(200);
  await page.goto("/contractor/dashboard");
  await page.getByLabel("Captured from (UTC)").fill("2026-01-01");
  await page.getByLabel("Until, exclusive (UTC)").fill("2027-01-01");
  await page.getByRole("button", { name: "Load dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Billed and paid", exact: true })).toBeVisible();
  await expect(page.getByText("billed: 0 extras · net £0.00", { exact: true })).toBeVisible();
  await expect(page.getByText(/They do not prove a variation or fee entitlement/)).toBeVisible();
  const history = { version: "baseline-history.v1", environment: "synthetic_demo", sourceNamespace: "fictional", sourceBatchId: "browser-history", sourceRevision: "v1",
    startMonth: "2026-01", endMonthExclusive: "2026-07", teamIds: ["pilot", "rest"], jobs: [
      { sourceJobId: "history-one", teamId: "pilot", month: "2026-01", extras: [{ sourceExtraId: "extra-one", sourceWorkId: "work-one", reportedNet: { pence: 12345, currency: "GBP" } }] },
      { sourceJobId: "history-two", teamId: "rest", month: "2026-02", extras: [] },
    ] };
  await page.getByLabel(/Synthetic baseline-history/).fill(JSON.stringify(history));
  await page.getByLabel(/Historical team =/).fill(`pilot=${organisation.teams[0].id}\nrest=${team}`);
  await page.getByRole("button", { name: "Import history", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("History imported");
  const batchId = await page.getByLabel("Stored batch ID").inputValue(); expect(batchId).toMatch(/^[a-f0-9-]{36}$/u);
  await page.getByRole("button", { name: "Import history", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Existing import replayed");
  expect(await page.getByLabel("Stored batch ID").inputValue()).toBe(batchId);
  await page.getByLabel("Pilot historical team IDs (comma separated)").fill("pilot");
  await page.getByLabel("Rest historical team IDs (comma separated)").fill("rest");
  const exportFormat = page.getByRole("combobox", { name: "Export format", exact: true });
  await expect(exportFormat).toBeVisible();
  await expect(exportFormat).toBeEnabled();
  await exportFormat.selectOption("csv");
  await expect(exportFormat).toHaveValue("csv");
  await page.getByRole("button", { name: "Compare baseline", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pilot baseline comparison" })).toBeVisible();
  await expect(page.getByText(/pilot: 1 jobs · 1 extras · known net £123.45/)).toBeVisible();
  await expect(page.getByText(/Job history-two/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download baseline with method (csv)" }).click();
  const file = await download; expect(file.suggestedFilename()).toBe("pilot-baseline.csv");
  const stream = await file.createReadStream(), chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain("baseline-method.reference.v1"); expect(csv).toContain("Synthetic reference only"); expect(csv).toContain("inputHash");
  const otherContext = await browser.newContext(); const other = await otherContext.newPage();
  await other.goto("/admin/contractor"); await other.getByRole("button", { name: "Start generated contractor practice", exact: true }).click();
  await expect(other.getByTestId("contractor-revision")).toHaveText("0");
  const foreign = await other.request.post("/api/contractor/baseline/compare", { headers: { origin }, data: { version: "baseline-read.v1", batchId,
    cohorts: { version: "baseline-cohorts.v1", pilotTeamIds: ["pilot"], restTeamIds: ["rest"] }, methodVersion: "baseline-method.reference.v1", outputFormat: "json" } });
  expect(foreign.status()).toBe(404); expect(await foreign.json()).toEqual({ version: "enterprise-dashboard-error.v1", code: "NOT_FOUND" });
  await page.getByRole("button", { name: "Load dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Billed and paid", exact: true })).toBeVisible();
  const revoked = await page.request.post("/api/contractor", { headers: { origin }, data: {
    version: "contractor-command.v1", environment: "synthetic_demo", commandId: crypto.randomUUID(), id: crypto.randomUUID(),
    expectedRevision: revision, kind: "grant.revoke", grantId: dashboardGrant,
  } });
  expect(revoked.status()).toBe(200);
  await page.getByRole("button", { name: "Load dashboard", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("NOT_FOUND");
  await expect(page.getByRole("heading", { name: "Billed and paid", exact: true })).toHaveCount(0);
  await otherContext.close();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
