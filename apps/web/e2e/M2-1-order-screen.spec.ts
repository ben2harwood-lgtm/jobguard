import { test, expect, type Page } from "@playwright/test";
import { openReview, startWatchdogJob } from "./helpers/capture-journey";
test.setTimeout(180_000);
// Use the browser cookie jar for secure session cookies on localhost.
async function sessionRequest(page: Page, url: string, data?: unknown) {
  return page.evaluate(async ({ url, data }) => {
    const response = await fetch(url, data === undefined ? { cache: "no-store" } : {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data),
    });
    return { status: response.status, ok: response.ok, body: await response.json() };
  }, { url, data });
}
// Runs headless in both mobile-360 and desktop projects. Real persisted fictional
// materials and authority; no merchant provider is registered or contacted.
test("reviews a cited above-rate order and confirms exactly one practice effect", async ({ page, browser }, info) => {
  await openReview(page);
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"])
    await page.getByRole("button", { name: `Accept ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Dismiss Replace shelves", exact: true }).click();
  await page.getByLabel("Dismissal reason Replace shelves").fill("Not needed");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");
  await page.getByRole("button", { name: "Confirm scope", exact: true }).click();
  await page.getByRole("button", { name: "Price the work", exact: true }).click();
  await startWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  await page.getByLabel("SKU", { exact: true }).fill(`ORDER-${info.project.name}`);
  await page.getByRole("button", { name: "Save agreed price and material", exact: true }).click();
  await expect(page.getByTestId("required-material-net")).toHaveText("£200.00");
  await page.getByRole("button", { name: "Preview proposed order", exact: true }).click();
  await expect(page.getByTestId("order-preview-revision")).toHaveText("1");
  const screen = page.getByRole("region", { name: "Practice merchant order", exact: true });
  await screen.getByRole("button", { name: "Review current merchant order" }).click();
  await expect(screen.getByText(/Above agreed rate/u)).toBeVisible();
  await expect(screen.getByText(/fee £0.00/u)).toBeVisible();
  await expect(screen.getByText("Stock: unknown. Lead time: unknown. Availability is unverified.")).toBeVisible();
  await expect(screen.getByText(/version 1: £20.00 per each/u)).toBeVisible();
  const route = `/api/jobs/${jobId}/purchase-orders/merchant-order`;
  const origin = new URL(page.url()).origin;
  const revisionId = (await sessionRequest(page, `/api/jobs/${jobId}/purchase-orders`)).body.order.revisionId;
  const previewBody = { version: "merchant-order-screen.v1", kind: "preview", revisionId };
  const signedOut = await browser.newContext();
  try {
    const signedOutPage = await signedOut.newPage();
    await signedOutPage.goto(`${origin}/api/session`);
    const denied = await sessionRequest(signedOutPage, route, previewBody);
    expect(denied.status).toBe(401);
    // A second persisted practice session cannot inspect the first session's job.
    expect((await sessionRequest(signedOutPage, "/api/session", {})).ok).toBe(true);
    const otherCompany = await sessionRequest(signedOutPage, route, previewBody);
    expect(otherCompany.status).toBe(404);
    expect(otherCompany.body).toEqual({ code: "NOT_FOUND" });
  } finally { await signedOut.close(); }
  const wrongLink = await sessionRequest(page, route, { ...previewBody, revisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  expect(wrongLink.status).toBe(404);
  expect(wrongLink.body).toEqual({ code: "NOT_FOUND" });
  // Every commercial change leaves the displayed authority stale until re-reviewed.
  for (const [label, value] of [["Order unit price (£)", "26.00"], ["Quantity", "11"], ["Fictional recipient", "changed@fictional.invalid"]]) {
    await page.locator("#purchase-orders").getByLabel(label!, { exact: true }).fill(value!);
    await page.getByRole("button", { name: "Preview changed order", exact: true }).click();
    await expect(page.getByTestId(label === "Quantity" ? "order-preview-quantity" : label === "Fictional recipient" ? "order-preview-recipient" : "order-proposed-net"))
      .toHaveText(label === "Quantity" ? "11" : label === "Fictional recipient" ? value! : "£260.00");
    await screen.getByRole("button", { name: "Confirm this exact practice order" }).click();
    await expect(screen.locator('[role="alert"]')).toContainText("NOT_FOUND");
    await screen.getByRole("button", { name: "Review current merchant order" }).click();
    await expect(screen.locator('[role="alert"]')).toHaveCount(0);
  }
  const approve = screen.getByRole("button", { name: "Confirm this exact practice order" });
  const outbound = page.waitForRequest(request => request.url().endsWith("/purchase-orders/merchant-order") && request.postDataJSON().kind === "approve");
  await approve.click();
  const approvedRequest = await outbound;
  await expect(screen.getByRole("status")).toContainText("One fake order action queued");
  await expect(approve).toBeDisabled();
  const retry = await sessionRequest(page, approvedRequest.url(), approvedRequest.postDataJSON());
  expect(retry.ok, JSON.stringify(retry.body)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
