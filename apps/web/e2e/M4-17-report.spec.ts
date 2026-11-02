import { expect, test } from "@playwright/test";
import { reportFixture, reportId } from "./helpers/reconciliation-report";
// Browser rendering uses an explicitly fake transport. Repository RLS/finance checks run in the DB suite.
test("read-only report separates gross and payout, and clears money when access is refused", async ({ page }) => {
 const value = reportFixture(), path = `/jobs/${value.jobId}/reconciliation/${value.runId}`;
 let status = 200;
 await page.route(`**/api/jobs/${value.jobId}/reconciliation/*`, route => route.fulfill({ status, json: status === 200 ? value : { code: "RECONCILIATION_FORBIDDEN" } }));
 await page.goto(path); const main = page.getByRole("main");
 await expect(main.getByTestId("reconciliation-grossCharged")).toHaveText("£120.00");
 await expect(main.getByTestId("reconciliation-netPayout")).toHaveText("£90.00");
 await expect(main.getByRole("heading", { name: "Unexplained balance queue" })).toBeVisible();
 await expect(main.getByText("Net payout is not gross recovered money", { exact: false })).toBeVisible();
 await expect(main.locator("button,input,textarea,select,form,[contenteditable=true]")).toHaveCount(0);
 status = 403; await page.reload();
 await expect(main.getByRole("status")).toHaveText("You do not have access to this report.");
 await expect(main.getByTestId("reconciliation-grossCharged")).toHaveCount(0);
 status = 404; await page.goto(`/jobs/${value.jobId}/reconciliation/${reportId(99)}`);
 await expect(main.getByRole("status")).toHaveText("Report not found.");
 await expect(main.getByTestId("reconciliation-netPayout")).toHaveCount(0);
});
test("a mismatched response cannot display another run's money", async ({ page }) => {
 const value = reportFixture();
 await page.route("**/api/jobs/*/reconciliation/*", route => route.fulfill({ json: { ...value, jobId: reportId(99) } }));
 await page.goto(`/jobs/${value.jobId}/reconciliation/${value.runId}`);
 const main = page.getByRole("main"); await expect(main.getByRole("status")).toHaveText("Report unavailable.");
 await expect(main.getByTestId("reconciliation-grossCharged")).toHaveCount(0);
});
test("the real report route refuses an anonymous caller without returning money", async ({ request }) => {
 const value = reportFixture();
 const result = await request.get(`/api/jobs/${value.jobId}/reconciliation/${value.runId}`);
 expect(result.status()).toBe(401); expect(result.headers()["cache-control"]).toBe("no-store");
 expect(await result.json()).toEqual({ version: "financial-reconciliation-screen-error.v1", code: "UNAUTHENTICATED" });
});
