import { randomUUID } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import { jsonResult } from "./customer-invoice-journey";

export type PricedCatch = { id: string; description: string; currentRevisionId: string; revisions: { id: string; revision: number; contentHash: string; signedDeltaPence: number }[] };

/** The builder issues the link on the guide; delivery is simulated, so the guide shows it. The customer
 * signs in and approves in an isolated browser context. Customer cookies never enter the builder context. */
export async function approveJ3Catches(page: Page, browser: Browser, jobId: string, catches: PricedCatch[]) {
 const customerContext = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: page.viewportSize() });
 try {
  const customer = await customerContext.newPage();
  for (const subject of [jobId, randomUUID()]) {
   const refused = await customerContext.request.post("/api/customer-portal/variations/read", { data: { version: "customer-variations-read.v1", jobId: subject }, headers: { origin: new URL(page.url()).origin } });
   expect(refused.status()).toBe(401);
  }
  // One review link contains both priced catches. A second link in the same minute is refused.
  await page.goto(`/jobs/${jobId}/shadow-journey`);
  const issue = page.getByRole("button", { name: "Issue customer link", exact: true });
  await expect(issue).toBeEnabled({ timeout: 30_000 }); await issue.click();
  const link = page.getByTestId("guide-customer-link");
  await expect(link).toBeVisible({ timeout: 30_000 });
  await issue.click();
  await expect(page.getByText("A link was issued in the last minute. Wait a minute and try again.", { exact: true })).toBeVisible();
  await customer.goto((await link.getAttribute("href"))!);
  await customer.getByRole("button", { name: "Sign in", exact: true }).click();
  await customer.getByRole("link", { name: "Review extras", exact: true }).click();
  for (const item of catches) {
   const section = customer.locator("section").filter({ has: customer.getByRole("heading", { name: item.description, exact: true }) });
   const revision = item.revisions.find(row => row.id === item.currentRevisionId)!;
   await expect(section).toContainText(revision.contentHash);
   const request = customer.waitForRequest(request => request.method() === "POST" && new URL(request.url()).pathname === "/api/customer-portal/variation-approvals");
   await section.getByRole("button", { name: `Approve revision ${revision.revision} for +£${(revision.signedDeltaPence / 100).toFixed(2)}`, exact: true }).click();
   const approvedCommand = (await request).postDataJSON();
   await expect(section.getByText("Approved · authenticated customer", { exact: true })).toBeVisible();
   // A fresh command for the same exact revision is a duplicate approval,
   // not an idempotent replay. Exercise the real authenticated customer route.
   const duplicate = await customer.evaluate(async command => {
    const response = await fetch("/api/customer-portal/variation-approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
    return { status: response.status, body: await response.json() };
   }, { ...approvedCommand, commandId: randomUUID() });
   expect(duplicate).toEqual({ status: 401, body: { code: "CUSTOMER_REFUSED" } });
   await customer.reload();
   await expect(section.getByText("Approved · authenticated customer", { exact: true })).toBeVisible();
  }
  const view = await jsonResult(page.request.get(`/api/jobs/${jobId}/variations`), "Read customer-approved catches");
  for (const item of catches) {
   const revision = view.variations.find((row: { id: string }) => row.id === item.id).revisions.at(-1);
   expect({ approved: revision.approved, approvalMethod: revision.approvalMethod }).toEqual({ approved: true, approvalMethod: "customer_authenticated" });
  }
  expect((await page.context().cookies()).some(cookie => cookie.name === "jobguard_customer" || cookie.name === "jobguard_session")).toBe(false);
  expect((await customerContext.cookies()).some(cookie => cookie.name === "jg_session" || cookie.name === "jobguard_session")).toBe(false);
 } finally { await customerContext.close(); }
}
