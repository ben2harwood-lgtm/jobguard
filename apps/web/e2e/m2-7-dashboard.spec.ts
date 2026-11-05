import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const loadDb = () => (new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@jobguard/db")>)(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
import { openLiveWatchdogJob } from "./helpers/capture-journey";
import { E2E_RUNTIME_URL } from "./global-setup";

// Both configured projects run this headlessly: mobile-360 and desktop (1280px).
test.setTimeout(180_000);
test("owner sees content-free outcomes, honest unknowns and uncapped mandatory blockers", async ({ page, browser }) => {
  await openLiveWatchdogJob(page);
  const jobId = new URL(page.url()).pathname.split("/")[2]!;
  const endpoint = `/api/jobs/${jobId}/inbox-metrics`;
  const dashboard = `/jobs/${jobId}/signal-to-noise`;
  await page.getByRole("link", { name: "Signal-to-noise dashboard", exact: true }).click();
  await expect(page.getByText("No outcome metrics recorded for this job.", { exact: false })).toBeVisible();
  expect((await (await page.request.get(endpoint)).json()).byRule).toEqual([]);

  await page.goto(`/jobs/${jobId}`);
  await page.getByRole("button", { name: "Seed relevance scenario" }).click();
  await expect(page.getByTestId("inbox-mandatory-decision-count")).toHaveText("2");
  await page.getByRole("button", { name: "Set advisory budget to zero" }).click();
  await expect(page.getByTestId("visible-advisory-count")).toHaveText("0");

  // Fixture setup goes through the existing durable metadata writer, never a new public write route.
  const { authorizePracticeJob, InboxMetricsRepository } = await loadDb();
  const pool = new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 });
  try {
    const token = (await page.context().cookies()).find(cookie => cookie.name === "jg_session")!.value;
    const owner = await authorizePracticeJob(pool, token, jobId);
    const repo = new InboxMetricsRepository(pool);
    const event = { tenantId: owner.context.tenantId, jobId, ruleId: "supplier-check", ruleVersion: "v1", occurredAt: "2026-01-01T00:00:00Z" };
    const record = async (body: object) => {
      const result = await repo.record(owner.context, { version: "inbox-metric-record.v1", environment: "synthetic_demo", jobId, receiptId: randomUUID(), event: { ...event, eventId: randomUUID(), commandId: randomUUID(), ...body } });
      expect(result.status).toBe("accepted");
    };
    const findingIds = [randomUUID(), randomUUID()], decisionId = randomUUID();
    for (const findingId of findingIds) await record({ kind: "finding", findingId });
    await record({ kind: "decision", findingIds, decisionId });
    await record({ kind: "resolution", decisionId, resolution: "dismissed", reason: "duplicate", occurredAt: "2026-01-01T00:01:00Z" });
    await record({ kind: "later_outcome", decisionId, outcome: "useful" });
    await record({ kind: "later_outcome", decisionId, outcome: "reversed", occurredAt: "2026-01-02T00:00:00Z" });
    await record({ kind: "finding", findingId: randomUUID(), ruleVersion: "v2" });
  } finally { await pool.end(); }

  const response = await page.request.get(`${endpoint}?tenantId=33333333-3333-4333-8333-333333333333&advisoryBudget=0`, { headers: { "x-tenant-id": "33333333-3333-4333-8333-333333333333" } });
  expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toBe("no-store");
  const report = await response.json();
  expect(report.mandatoryBlockers.reduce((sum: number, row: { count: number }) => sum + row.count, 0)).toBe(2);
  expect(report.byRule).toMatchObject([
    { ruleId: "supplier-check", ruleVersion: "v1", coalescedCount: 1, duplicateCount: 1, dismissed: 1, meanTimeToDecisionMs: 60000, laterOutcomes: { unknown: 0, recorded: { useful: 0, reversed: 1 } } },
    { ruleId: "supplier-check", ruleVersion: "v2", findingToDecisionRate: 0, meanTimeToDecisionMs: null },
  ]);
  expect(JSON.stringify(report)).not.toMatch(/recipient|customer|message|Practice Customer|Electrical proof required/u);
  await page.goto(dashboard);
  await expect(page.getByRole("heading", { name: "Signal-to-noise dashboard" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Mandatory blockers" })).toContainText("proof-required");
  await expect(page.getByRole("article", { name: "supplier-check v1" })).toContainText("60 seconds");
  await expect(page.getByRole("article", { name: "supplier-check v1" })).toContainText("reversed: 1");
  await expect(page.getByRole("article", { name: "supplier-check v2" })).toContainText("Unknown");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/m2-7-dashboard-${test.info().project.name}.png`, fullPage: true });

  const stranger = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  try {
    expect((await stranger.request.get(endpoint)).status()).toBe(401);
    expect((await stranger.request.post("/api/session")).ok()).toBe(true);
    expect((await stranger.request.get(endpoint)).status()).toBe(404);
    const otherPage = await stranger.newPage(); await otherPage.goto(dashboard);
    await expect(otherPage.getByRole("heading", { name: "Signal-to-noise dashboard" })).toHaveCount(0);
    await stranger.addCookies([{ name: "jg_session", value: randomUUID(), domain: "127.0.0.1", path: "/" }]);
    expect((await stranger.request.get(endpoint)).status()).toBe(401);
  } finally { await stranger.close(); }
});
