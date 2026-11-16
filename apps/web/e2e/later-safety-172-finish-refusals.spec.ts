import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL } from "./global-setup";
import { installContractorAgreementFixture } from "./contractor-agreement-fixture";

test.setTimeout(180_000);
// Real server-rendered owner controls; only the finish transport is fault-injected.
// ENT-8a-job-finish.spec.ts retains real authorization, replay and persisted reload coverage.
async function openJob(page: Page) {
 await installContractorAgreementFixture(page);
 await page.goto("/admin/contractor");
 await page.getByRole("button", { name: "Start generated contractor practice", exact: true }).click();
 await expect(page.getByTestId("contractor-revision")).toHaveText("0");
 await page.goto("/contractor/work-orders");
 await page.getByLabel(/Starter orders/).check();
 await page.getByRole("button", { name: "Import selected file", exact: true }).click();
 await expect(page.getByTestId("import-counts")).toContainText("5 created");
 const org = await (await page.request.get("/api/contractor")).json();
 const admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
 let jobId: string;
 try {
  jobId = (await admin.query<{ job_id: string }>("SELECT job_id FROM app.work_order WHERE tenant_id=$1 ORDER BY reference LIMIT 1", [org.tenantId])).rows[0]!.job_id;
 } finally { await admin.end(); }
 await page.goto(`/contractor/jobs/${jobId}/possible-extras`);
 await expect(page.getByRole("button", { name: "Finish job", exact: true })).toBeVisible();
 return jobId;
}
const failure = (code: string) => ({ version: "enterprise-live-prompt-error.v1", code, message: "private server detail" });

test("definitive refusals explain the next action and prevent blind resubmission", async ({ page }) => {
 const jobId = await openJob(page);
 const cases = [
  { status: 409, body: failure("JOB_NOT_LIVE"), text: "This job cannot be finished in its present state." },
  { status: 409, body: failure("PROMPT_CONFLICT"), text: "Close any open visit first, then reload" },
  { status: 401, body: failure("UNAUTHENTICATED"), text: "Check your session and access" },
  { status: 403, body: failure("EXTRA_FORBIDDEN"), text: "Check your session and access" },
  { status: 422, body: failure("FUTURE_CODE"), text: "The server refused this finish request." },
  { status: 400, body: null, text: "The server refused this finish request." },
 ];
 let active = cases[0]!, requests = 0;
 await page.route(`**/api/contractor/jobs/${jobId}/finish`, route => {
  requests++;
  return route.fulfill({ status: active.status, json: active.body });
 });
 for (const item of cases) {
  active = item;
  await page.reload();
  await page.getByRole("button", { name: "Finish job", exact: true }).click();
  await page.getByRole("button", { name: "Confirm finish", exact: true }).click();
  const completion = page.getByRole("region", { name: "Job completion" });
  await expect(completion.getByRole("alert")).toContainText(item.text);
  await expect(completion).not.toContainText(/Retry|private server detail|Job finished/);
  await expect(completion.getByRole("button")).toHaveCount(0);
 }
 expect(requests).toBe(cases.length);
});

for (const fault of ["network", "503", "invalid-success", "cross-job-success"] as const) {
 test(`${fault} remains unconfirmed and retry preserves the exact command`, async ({ page }) => {
  const jobId = await openJob(page), commands: unknown[] = [];
  const result = { jobId, finishedAt: "2026-11-15T12:00:00Z", checkRan: true, promptsRaised: 0 };
  await page.route(`**/api/contractor/jobs/${jobId}/finish`, route => {
   commands.push(route.request().postDataJSON());
   if (commands.length === 1) {
    if (fault === "network") return route.abort("failed");
    if (fault === "503") return route.fulfill({ status: 503, json: failure("PROMPT_UNAVAILABLE") });
    if (fault === "cross-job-success") return route.fulfill({ status: 201, json: { ...result, jobId: crypto.randomUUID() } });
    return route.fulfill({ status: 201, json: {} });
   }
   return route.fulfill({ status: 201, json: result });
  });
  await page.getByRole("button", { name: "Finish job", exact: true }).click();
  const confirm = page.getByRole("button", { name: "Confirm finish", exact: true });
  await confirm.click();
  const completion = page.getByRole("region", { name: "Job completion" });
  await expect(completion.getByRole("alert")).toContainText("Retry checks the same request");
  await expect(completion).not.toContainText("Job finished");
  expect(commands).toHaveLength(1);
  await confirm.click();
  await expect(completion.getByRole("status")).toContainText("Job finished");
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  expect(commands[0]).toEqual({ version: "end-check.v1", commandId: expect.any(String) });
 });
}
