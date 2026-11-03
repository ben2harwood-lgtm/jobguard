import { expect, test } from "@playwright/test";
// Screen contract coverage at both configured widths. This is a mocked browser journey,
// not evidence of database authorization, immutable answers or priced capture.
const jobId = "01960000-0000-7000-8000-000000000001";
const visitId = "01960000-0000-7000-8000-000000000002";
const head = { environment: "synthetic_demo", realExternalActions: 0 };
test("visit completion requires an answer and retries the exact command", async ({ page }) => {
  const attempts: unknown[] = [];
  await page.route("**/api/contractor/site/jobs", route => route.fulfill({ json: { jobs: [{ jobId, reference: "Fictional order", openVisitId: visitId }] } }));
  await page.route("**/api/northside/extras", route => route.fulfill({ json: { extras: [] } }));
  await page.route(`**/api/contractor/jobs/${jobId}/order-lines`, route => route.fulfill({ json: { version: "site-order-lines.v1", ...head, jobId, workOrderId: jobId, revision: 1, lines: [] } }));
  await page.route(`**/api/contractor/jobs/${jobId}/site-visits/${visitId}/complete`, async route => {
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1) return route.fulfill({ status: 503, json: { code: "SITE_VISIT_UNAVAILABLE" } });
    return route.fulfill({ json: { version: "site-visit-completed.v1", ...head, jobId, visitId, completedAt: "2026-11-03T10:00:00Z", closeoutAnswer: "no" } });
  });
  await page.goto("/site/extra");
  const complete = page.getByRole("button", { name: "Complete visit", exact: true });
  await expect(complete).toBeDisabled();
  await page.getByLabel("Did the resident ask for anything extra?").selectOption("no");
  await complete.click();
  await expect(page.getByText(/Visit request could not be confirmed/)).toBeVisible();
  await expect(page.getByLabel("Did the resident ask for anything extra?")).toBeDisabled();
  await complete.click();
  await expect(page.getByText("Visit completed. Your answer has been recorded.")).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("priced capture binds the displayed evidence in at most four taps, with exact retry", async ({ page }) => {
  const attempts: Record<string, unknown>[] = [];
  await page.route("**/api/northside", route => route.fulfill({ status: 401, json: {} }));
  await page.route("**/api/contractor/practice/acting-as", route => route.fulfill({ json: { state: "acting" } }));
  await page.route("**/api/contractor/site/jobs", route => route.fulfill({ json: { jobs: [{ jobId, reference: "Fictional order", openVisitId: visitId }] } }));
  await page.route("**/api/northside/extras", route => route.fulfill({ json: { extras: [], settings: { settings: { rules: { proceedLimit: { pence: 25000 } } } } } }));
  await page.route(`**/api/contractor/jobs/${jobId}/order-lines`, route => route.fulfill({ json: { version: "site-order-lines.v1", ...head, jobId, workOrderId: jobId, revision: 1, lines: [] } }));
  await page.route(`**/api/contractor/jobs/${jobId}/sor-items?*`, route => route.fulfill({ json: { version: "site-sor-items.v1", ...head, jobId, sorVersionId: jobId, items: [{ code: "FIT-LOCK", description: "Fictional lock", unit: "each" }], truncated: false } }));
  const orderCheck = { outcome: "new", sorCode: "FIT-LOCK", unit: "each", claimedQuantity: "1", instructedQuantity: null, extraQuantity: "1", orderLineScopeItemId: null };
  await page.route(`**/api/contractor/jobs/${jobId}/order-check?*`, route => route.fulfill({ json: { version: "site-order-check.v1", ...head, jobId, orderCheck } }));
  const hash = "a".repeat(64);
  await page.route("**/api/northside/photo", route => route.fulfill({ json: { photoEvidenceId: visitId, photoSha256: "b".repeat(64), shownContentSha256: hash } }));
  await page.route(`**/api/contractor/jobs/${jobId}/site-extras/sor`, async route => {
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1) return route.fulfill({ status: 503, json: { code: "SITE_PRICING_UNAVAILABLE" } });
    return route.fulfill({ status: 201, json: { version: "sor-site-extra-submitted.v2", ...head, jobId, extraId: jobId, requestId: visitId, state: "awaiting_approval", priceSource: "server_sor", orderCheck } });
  });
  await page.goto("/site/extra");
  await page.getByLabel("Search schedule of rates").fill("lock");
  let taps = 0;
  await page.getByRole("button", { name: "FIT-LOCK: Fictional lock (each)", exact: true }).click(); taps++;
  await expect(page.getByText("New extra", { exact: true })).toBeVisible();
  await expect(page.getByText(/Proceed limit: £250.00/)).toBeVisible();
  await page.getByRole("button", { name: "Attach practice photo" }).click(); // Photo excluded by the card.
  await expect(page.getByText(`Content hash: ${hash}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Log extra", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: /The resident has seen this/ }).check(); taps++;
  await page.getByRole("button", { name: "Log extra", exact: true }).click(); taps++;
  expect(taps).toBeLessThanOrEqual(4);
  await expect(page.getByRole("alert")).toContainText("SITE_PRICING_UNAVAILABLE");
  await expect(page.getByLabel("Total quantity")).toBeDisabled();
  await page.getByRole("button", { name: "Log extra", exact: true }).click();
  await expect(page.getByTestId("extra-logged")).toContainText("priced by the server");
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
  expect(attempts[0]).toMatchObject({ version: "log-sor-site-extra.v2", photoEvidenceId: visitId, residentConfirmation: { shownContentSha256: hash }, siteVisitId: visitId });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test("within-order item records one supervisor question with exact retry and no extra", async ({ page }) => {
 const attempts: Record<string, unknown>[] = [];
 let extraCalls = 0;
 await page.route("**/api/northside", route => route.fulfill({ status: 401, json: {} }));
 await page.route("**/api/contractor/practice/acting-as", route => route.fulfill({ json: { state: "acting" } }));
 await page.route("**/api/contractor/site/jobs", route => route.fulfill({ json: { jobs: [{ jobId, reference: "Fictional order", openVisitId: visitId }] } }));
 await page.route("**/api/northside/extras", route => route.fulfill({ json: { extras: [] } }));
 await page.route(`**/api/contractor/jobs/${jobId}/order-lines`, route => route.fulfill({ json: { version: "site-order-lines.v1", ...head, jobId, workOrderId: jobId, revision: 1, lines: [] } }));
 await page.route(`**/api/contractor/jobs/${jobId}/sor-items?*`, route => route.fulfill({ json: { version: "site-sor-items.v1", ...head, jobId, sorVersionId: jobId, items: [{ code: "FIT-LOCK", description: "Fictional lock", unit: "each" }], truncated: false } }));
 await page.route(`**/api/contractor/jobs/${jobId}/order-check?*`, route => route.fulfill({ json: { version: "site-order-check.v1", ...head, jobId, orderCheck: { outcome: "already_on_order", sorCode: "FIT-LOCK", unit: "each", claimedQuantity: "1", instructedQuantity: "2", orderLineScopeItemId: visitId, orderRevisionId: jobId } } }));
 await page.route(`**/api/contractor/jobs/${jobId}/site-extras**`, route => { extraCalls++; return route.fulfill({ status: 500 }); });
 await page.route(`**/api/contractor/jobs/${jobId}/supervisor-queries`, route => {
  attempts.push(route.request().postDataJSON());
  if (attempts.length === 1) return route.fulfill({ status: 503, json: { code: "SITE_PRICING_UNAVAILABLE" } });
  return route.fulfill({ status: 201, json: { version: "site-supervisor-query.v1", ...head, queryId: visitId, jobId, orderLineScopeItemId: visitId, sorCode: "FIT-LOCK", quantity: "1", orderRevisionId: jobId, operativeMembershipId: visitId, recordedAt: "2026-11-03T10:00:00.000Z" } });
 });
 await page.goto("/site/extra");
 await page.getByLabel("Search schedule of rates").fill("lock");
 await page.getByRole("button", { name: "FIT-LOCK: Fictional lock (each)", exact: true }).click();
 const ask = page.getByRole("button", { name: "Ask supervisor", exact: true });
 await expect(ask).toBeEnabled();
 for (const target of [ask, page.getByLabel("Total quantity")]) {
  const box = await target.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
 }
 await expect(page.getByRole("button", { name: "Attach practice photo" })).toBeDisabled();
 await ask.click();
 await expect(page.getByRole("alert")).toContainText("SITE_PRICING_UNAVAILABLE");
 await expect(page.getByLabel("Total quantity")).toBeDisabled();
 await ask.click();
 await expect(page.getByTestId("extra-logged")).toHaveText("Question recorded for your supervisor. No extra was created.");
 expect(attempts).toHaveLength(2); expect(attempts[0]).toEqual(attempts[1]);
 expect(attempts[0]).toMatchObject({ version: "record-site-supervisor-query.v1", orderLineScopeItemId: visitId, sorCode: "FIT-LOCK", quantity: "1", expectedOrderRevisionId: jobId });
 expect(extraCalls).toBe(0);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("supervisor reads immutable questions on the existing job extras screen", async ({ page }) => {
 await page.route("**/api/northside", route => route.fulfill({ status: 401, json: {} }));
 await page.route("**/api/contractor/practice/acting-as", route => route.fulfill({ json: { state: "acting" } }));
 await page.route("**/api/contractor/site/jobs", route => route.fulfill({ json: { jobs: [{ jobId, reference: "Fictional order", openVisitId: null }] } }));
 await page.route("**/api/northside/extras", route => route.fulfill({ json: { extras: [], role: "supervisor" } }));
 await page.route(`**/api/contractor/jobs/${jobId}/order-lines`, route => route.fulfill({ json: { version: "site-order-lines.v1", ...head, jobId, workOrderId: jobId, revision: 1, lines: [] } }));
 await page.route(`**/api/contractor/jobs/${jobId}/supervisor-queries`, route => route.fulfill({ json: { version: "site-supervisor-queries.v1", ...head, jobId, queries: [{ version: "site-supervisor-query.v1", ...head, queryId: visitId, jobId, orderLineScopeItemId: visitId, sorCode: "FIT-LOCK", quantity: "1", orderRevisionId: jobId, operativeMembershipId: visitId, recordedAt: "2026-11-03T10:00:00.000Z" }] } }));
 await page.goto("/site/extra");
 await expect(page.getByRole("heading", { name: "My extras", exact: true })).toBeVisible();
 await expect(page.getByTestId("supervisor-query")).toContainText("FIT-LOCK: claimed quantity 1");
 await expect(page.getByText("These are within the order. No extra or price was created. Resolving questions is not available yet.")).toBeVisible();
});
