import { expect, test } from "@playwright/test";
import { openLiveWatchdogJob } from "./helpers/capture-journey";

// Synthetic user journey; no fixture or direct metric writer. Both projects run headlessly.
test.setTimeout(180_000);
test("a practice inbox dismissal reaches the dashboard with its feedback reason", async ({ page }) => {
  await openLiveWatchdogJob(page);
  const jobId = new URL(page.url()).pathname.split("/")[2]!;
  await page.getByRole("button", { name: "Seed relevance scenario" }).click();
  await expect(page.getByTestId("inbox-mandatory-decision-count")).toHaveText("2");
  const card = page.locator(".inbox-card").filter({ hasText: "Review supplier invoice" });
  await card.getByRole("button", { name: "Why am I seeing this?" }).click();
  await page.getByLabel("Feedback reason (optional)").selectOption("duplicate");
  await page.getByRole("button", { name: "Dismiss advisory check" }).click();
  await expect(page.getByRole("dialog", { name: "Why am I seeing this?" })).toHaveCount(0);
  await expect(page.getByTestId("inbox-mandatory-decision-count")).toHaveText("2");
  await expect(card).toHaveCount(0);
  const report = await (await page.request.get(`/api/jobs/${jobId}/inbox-metrics`)).json();
  expect(report.byRule).toMatchObject([{ ruleId: "supplier-check", ruleVersion: "supplier-check.v1",
    findings: 2, decisions: 1, dismissed: 1, duplicateCount: 1, meanTimeToDecisionMs: 300000 }]);
  await page.getByRole("link", { name: "Signal-to-noise dashboard", exact: true }).click();
  const row = page.getByRole("article", { name: "supplier-check supplier-check.v1" });
  await expect(row).toContainText("300 seconds");
  await expect(row).toContainText("1 / 1");
  await expect(row).toContainText("Unknown — no later outcomes recorded");
  await expect(page.getByRole("region", { name: "Mandatory blockers" })).toContainText("proof-required");
});
