import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { E2E_RUNTIME_URL } from "./global-setup";
import { ch4Company, capturedCompanyJob } from "./helpers/ch4-company-fixture";

test("a company-only session gains no practice invoice access from Money", async ({ page, context }) => {
  const runtime = new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 });
  try {
    const company = await ch4Company(runtime);
    const job = await capturedCompanyJob(company);
    await context.addCookies([{ name: "jobguard_session", value: company.sessionToken, url: "http://127.0.0.1:3000" }]);
    const identity = await page.request.get("/api/auth/session");
    expect(identity.ok()).toBe(true);
    expect((await identity.json()).memberships).toEqual(expect.arrayContaining([expect.objectContaining({ tenantId: company.tenantId })]));
    expect((await page.request.get("/api/session")).status()).toBe(401);

    const reads: string[] = [];
    page.on("request", request => {
      if (/\/api\/jobs\/[^/]+\/(final-account|customer-invoices)(?:\/|$)/u.test(new URL(request.url()).pathname)) reads.push(request.url());
    });
    await page.goto(`/jobs/${job.jobId}/money#customer-invoices`);
    await expect(page.getByRole("heading", { name: "Open the practice workspace" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invoices and payments" })).toHaveCount(0);
    await expect(page.getByTestId("lock-bound-invoices")).toHaveCount(0);
    expect(reads).toEqual([]);
    expect((await page.request.get(`/api/jobs/${job.jobId}/customer-invoices`)).status()).toBe(401);
  } finally {
    await runtime.end();
  }
});
