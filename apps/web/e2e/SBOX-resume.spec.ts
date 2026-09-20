import { expect, test, type Page } from "@playwright/test";
import { jobWorkspaceResponseV1 } from "../../api/src/workspace/contracts";
import { openReview } from "./helpers/capture-journey";

test.setTimeout(180_000);
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
async function click(page: Page, name: string) {
  await expect(button(page, name)).toBeVisible();
  await expect(button(page, name)).toBeEnabled();
  await button(page, name).click();
}
async function get(page: Page, url: string) {
  const response = await page.request.get(url);
  expect(response.ok(), `${url}: ${response.status()} ${await response.text()}`).toBe(true);
  return response.json();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}
async function confirmed(page: Page) {
  await openReview(page);
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) await click(page, `Accept ${name}`);
  await click(page, "Dismiss Replace shelves");
  await page.getByLabel("Dismissal reason Replace shelves").fill("Not in this practice quote");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");
  await click(page, "Confirm scope");
  await click(page, "Price the work");
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  const scopeIds = (await page.locator(".quote-editor").getAttribute("data-scope-lineage"))!;
  await click(page, "Save draft revision");
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  return { jobId, scopeIds };
}

test("opens a saved quote directly and preserves source identity after reload and a second context", async ({ page, browser }) => {
  const { jobId, scopeIds } = await confirmed(page);
  const before = await get(page, `/api/jobs/${jobId}/quotes`);
  const workspace = jobWorkspaceResponseV1.parse(await get(page, `/api/jobs/${jobId}`));
  expect([...workspace.job.scopeIdentityIds].sort()).toEqual(scopeIds.split(",").sort());
  await page.goto(`/jobs/${jobId}#quote`);
  await expect(page.getByRole("heading", { name: "Price the work", exact: true })).toBeVisible();
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-job-id", jobId);
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-scope-lineage", scopeIds);
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  const second = await browser.newContext({ storageState: await page.context().storageState(), viewport: page.viewportSize() });
  try {
    const other = await second.newPage();
    await other.goto(`/jobs/${jobId}#quote`);
    await expect(other.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
    await expect(other.locator(".quote-editor")).toHaveAttribute("data-job-id", jobId);
    expect((await get(other, `/api/jobs/${jobId}/quotes`)).revisions.at(-1)).toEqual(before.revisions.at(-1));
    expect(jobWorkspaceResponseV1.parse(await get(other, `/api/jobs/${jobId}`))).toEqual(workspace);
  } finally { await second.close(); }
  await page.reload();
  await expect(page.getByRole("heading", { name: "Price the work", exact: true })).toBeVisible();
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  expect((await get(page, `/api/jobs/${jobId}/quotes`)).revisions.at(-1)).toEqual(before.revisions.at(-1));
  await click(page, "← Scope review");
  await expect(page.getByRole("heading", { name: "Scope confirmed", exact: true })).toBeVisible();
  await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");
  await noOverflow(page);
});

test("reopens accepted and active work without rewriting lifecycle or scope", async ({ page }) => {
  const { jobId, scopeIds } = await confirmed(page);
  await click(page, "Preview immutable quote");
  await click(page, "Simulate sending this quote");
  await click(page, "Continue fake worker");
  await click(page, "Record practice acceptance");
  await page.goto(`/jobs/${jobId}#quote`);
  await expect(page.getByTestId("job-status")).toHaveText("Customer said yes");
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-scope-lineage", scopeIds);
  expect(jobWorkspaceResponseV1.parse(await get(page, `/api/jobs/${jobId}`)).job.status).toBe("accepted");
  await click(page, "Start this practice job");
  await page.goto(`/jobs/${jobId}#work-proof`);
  await expect(page.getByTestId("job-status")).toHaveText("Work under way");
  await expect(page.locator("#work-proof")).toBeVisible();
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-scope-lineage", scopeIds);
  const proof = await get(page, `/api/jobs/${jobId}/proof`);
  const workspace = jobWorkspaceResponseV1.parse(await get(page, `/api/jobs/${jobId}`));
  expect(workspace.job.status).toBe("live");
  expect(workspace.job.scopeIdentityIds).toContain(proof.scopeItemId);
  expect([...workspace.job.scopeIdentityIds].sort()).toEqual(scopeIds.split(",").sort());
  await page.getByRole("link", { name: "Final account and invoices", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Final account", exact: true })).toBeVisible();
  await expect(button(page, "Build final account")).toBeVisible();
  await click(page, "← Scope review");
  await expect(page.getByTestId("job-status")).toHaveText("Work under way");
  await expect(button(page, "Confirm scope")).toHaveCount(0);
  await expect(button(page, "Save review")).toHaveCount(0);
  await expect(page.locator(".confirmed-scope")).toBeVisible();
  await expect(page.getByRole("note", { name: "Practice sandbox notice", exact: true })).toHaveText("Practice sandbox — synthetic data; nothing is sent or charged");
  expect((await get(page, `/api/jobs/${jobId}/proof`)).scopeItemId).toBe(proof.scopeItemId);
  expect(jobWorkspaceResponseV1.parse(await get(page, `/api/jobs/${jobId}`))).toEqual(workspace);
  await noOverflow(page);
});

test("does not expose saved job controls for missing jobs, unauthenticated requests or a foreign tenant selection", async ({ page, request }) => {
  const { jobId } = await confirmed(page);
  const unauthenticated = await request.get(`/api/jobs/${jobId}`);
  expect(unauthenticated.status()).toBe(401);
  const forbidden = await page.request.get(`/api/jobs/${jobId}?requested_tenant_id=22222222-2222-4222-8222-222222222222`);
  expect(forbidden.status()).toBe(403);
  expect(await forbidden.json()).not.toHaveProperty("job");
  const missing = "00000000-0000-4000-8000-000000000099";
  expect((await page.request.get(`/api/jobs/${missing}`)).status()).toBe(404);
  await page.goto(`/jobs/${missing}#work-proof`);
  await expect(page.getByRole("heading", { name: "You cannot open this job", exact: true })).toBeVisible();
  await expect(page.locator(".quote-editor")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Saved job sections" })).toHaveCount(0);
  await noOverflow(page);
});
