import { expect, test, type Page } from "@playwright/test";

// Keep the scanner in test code and load it inside the spec at execution time.
async function checkAccessibility(page: Page, screen: string) {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const results = await new AxeBuilder({ page }).analyze();
  await test.info().attach(`axe-${screen}`, { body: JSON.stringify(results, null, 2), contentType: "application/json" });
  const violations = results.violations.filter(v => v.impact === "serious" || v.impact === "critical");
  expect(violations, `${screen}: serious/critical axe violations`).toEqual([]);
  // Axe exempts disabled controls from contrast. The ENT-3 ruling requires AA
  // colours there too; measure rendered CSS colours independently in Chromium.
  const disabled = await page.getByRole("main").locator("button:disabled").evaluateAll(buttons => {
    const rgba = (value: string) => value.match(/[\d.]+/g)!.map(Number);
    const over = (front: number[], back: number[]) => front.slice(0, 3).map((c, i) => c * (front[3] ?? 1) + back[i]! * (1 - (front[3] ?? 1)));
    const luminance = (rgb: number[]) => rgb.map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i]!, 0);
    return buttons.filter(button => button.getClientRects().length > 0).map(button => {
      const ancestors: Element[] = [];
      for (let node: Element | null = button; node; node = node.parentElement) ancestors.unshift(node);
      let background = [255, 255, 255];
      for (const node of ancestors) background = over(rgba(getComputedStyle(node).backgroundColor), background);
      const foreground = over(rgba(getComputedStyle(button).color), background);
      const a = luminance(foreground), b = luminance(background);
      return { text: button.textContent, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), opacity: ancestors.reduce((n, node) => n * Number(getComputedStyle(node).opacity), 1) };
    });
  });
  await test.info().attach(`disabled-contrast-${screen}`, { body: JSON.stringify(disabled, null, 2), contentType: "application/json" });
  for (const button of disabled) {
    expect(button.opacity, `${screen}: ${button.text} must not fade its AA colours`).toBe(1);
    expect(button.ratio, `${screen}: ${button.text} disabled text contrast`).toBeGreaterThanOrEqual(4.5);
  }
}

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
  await expect(page.getByRole("note", { name: "Practice sandbox notice", exact: true })).toHaveText("Practice sandbox — synthetic data; nothing is sent or charged");
  const complete = page.getByRole("button", { name: "Complete visit", exact: true });
  await expect(complete).toBeDisabled();
  await checkAccessibility(page, "visit-and-unanswered-closeout");
  await page.getByLabel("Did the resident ask for anything extra?").selectOption("no");
  await checkAccessibility(page, "closeout-answer");
  await complete.click();
  await expect(page.getByText(/Visit request could not be confirmed/)).toBeVisible();
  await expect(page.getByLabel("Did the resident ask for anything extra?")).toBeDisabled();
  await checkAccessibility(page, "closeout-retry");
  await complete.click();
  await expect(page.getByText("Visit completed. Your answer has been recorded.")).toBeVisible();
  await checkAccessibility(page, "visit-completed");
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
  const orderCheck = { proceedComparison: "within", outcome: "new", sorCode: "FIT-LOCK", unit: "each", claimedQuantity: "1", instructedQuantity: null, extraQuantity: "1", orderLineScopeItemId: null };
  await page.route(`**/api/contractor/jobs/${jobId}/order-check?*`, route => route.fulfill({ json: { version: "site-order-check.v1", ...head, jobId, orderCheck } }));
  const hash = "a".repeat(64);
  await page.route("**/api/northside/photo", route => route.fulfill({ json: { photoEvidenceId: visitId, photoSha256: "b".repeat(64), shownContentSha256: hash } }));
  await page.route(`**/api/contractor/jobs/${jobId}/site-extras/sor`, async route => {
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1) return route.fulfill({ status: 503, json: { code: "SITE_PRICING_UNAVAILABLE" } });
    return route.fulfill({ status: 201, json: { version: "sor-site-extra-submitted.v2", ...head, jobId, extraId: jobId, requestId: visitId, state: "awaiting_approval", priceSource: "server_sor", orderCheck: { ...orderCheck, proceedComparison: undefined } } });
  });
  await page.goto("/site/extra");
  await page.getByLabel("Search schedule of rates").fill("lock");
  await expect(page.getByRole("button", { name: "FIT-LOCK: Fictional lock (each)", exact: true })).toBeVisible();
  await checkAccessibility(page, "sor-search-results");
  let taps = 0;
  await page.getByRole("button", { name: "FIT-LOCK: Fictional lock (each)", exact: true }).click(); taps++;
  await expect(page.getByText("New extra", { exact: true })).toBeVisible();
  await checkAccessibility(page, "order-check-new");
  await expect(page.getByTestId("proceed-comparison")).toContainText("within the limit");
  const status = page.getByRole("button", { name: "Finished", exact: true });
  const box = await status.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
  await status.click(); taps++;
  await checkAccessibility(page, "work-status-finished");
  await page.getByRole("button", { name: "Attach practice photo" }).click(); // Photo excluded by the card.
  await expect(page.getByText(`Content hash: ${hash}`)).toBeVisible();
  await checkAccessibility(page, "resident-confirmation");
  await expect(page.getByRole("button", { name: "Log extra", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: /The resident has seen this/ }).check(); taps++;
  await page.getByRole("button", { name: "Log extra", exact: true }).click(); taps++;
  expect(taps).toBeLessThanOrEqual(4);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("SITE_PRICING_UNAVAILABLE");
  await checkAccessibility(page, "submission-retry");
  await expect(page.getByLabel("Total quantity")).toBeDisabled();
  await page.getByRole("button", { name: "Log extra", exact: true }).click();
  await expect(page.getByTestId("extra-logged")).toContainText("priced by the server");
  await checkAccessibility(page, "priced-extra-logged");
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
  expect(attempts[0]).toMatchObject({ version: "log-sor-site-extra.v2", workStatus: "finished", photoEvidenceId: visitId, residentConfirmation: { shownContentSha256: hash }, siteVisitId: visitId });
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
 await checkAccessibility(page, "order-check-supervisor-question");
 for (const target of [ask, page.getByLabel("Total quantity")]) {
  const box = await target.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
 }
 await expect(page.getByRole("button", { name: "Attach practice photo" })).toBeDisabled();
 await ask.click();
 await expect(page.getByRole("main").getByRole("alert")).toContainText("SITE_PRICING_UNAVAILABLE");
  await checkAccessibility(page, "submission-retry");
 await expect(page.getByLabel("Total quantity")).toBeDisabled();
 await ask.click();
 await expect(page.getByTestId("extra-logged")).toHaveText("Question recorded for your supervisor. No extra was created.");
 await checkAccessibility(page, "supervisor-question-recorded");
 expect(attempts).toHaveLength(2); expect(attempts[0]).toEqual(attempts[1]);
 expect(attempts[0]).toMatchObject({ version: "record-site-supervisor-query.v1", orderLineScopeItemId: visitId, sorCode: "FIT-LOCK", quantity: "1", expectedOrderRevisionId: jobId });
 expect(extraCalls).toBe(0);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("supervisor reads immutable questions on the existing job extras screen", async ({ page }) => {
 await page.route("**/api/northside", route => route.fulfill({ status: 401, json: {} }));
 await page.route("**/api/contractor/practice/acting-as", route => route.fulfill({ json: { state: "acting" } }));
 await page.route("**/api/contractor/site/jobs", route => route.fulfill({ json: { jobs: [{ jobId, reference: "Fictional order", openVisitId: null }] } }));
 await page.route("**/api/northside/extras", route => route.fulfill({ json: { extras: [{ extraId: visitId, jobId, orderReference: "Fictional order", description: "Fictional extra", state: "approved", outcome: "approved", hasPhoto: true, residentConfirmed: true, quotedPence: null }], role: "supervisor" } }));
 await page.route(`**/api/contractor/jobs/${jobId}/order-lines`, route => route.fulfill({ json: { version: "site-order-lines.v1", ...head, jobId, workOrderId: jobId, revision: 1, lines: [] } }));
 await page.route(`**/api/contractor/jobs/${jobId}/supervisor-queries`, route => route.fulfill({ json: { version: "site-supervisor-queries.v1", ...head, jobId, workStatuses: [{ extraId: visitId, workStatus: "finished", operativeMembershipId: jobId, recordedAt: "2026-11-03T10:00:00.000Z", source: "operative_statement" }], queries: [{ version: "site-supervisor-query.v1", ...head, queryId: visitId, jobId, orderLineScopeItemId: visitId, sorCode: "FIT-LOCK", quantity: "1", orderRevisionId: jobId, operativeMembershipId: visitId, recordedAt: "2026-11-03T10:00:00.000Z" }] } }));
 await page.goto("/site/extra");
 await expect(page.getByRole("heading", { name: "My extras", exact: true })).toBeVisible();
 await expect(page.getByTestId("my-extra")).toContainText("Operative statement: Finished");
 await expect(page.getByTestId("my-extra")).toContainText("later approval does not erase a breach");
 await expect(page.getByTestId("my-extra").getByRole("button")).toHaveCount(0);
 await expect(page.getByTestId("supervisor-query")).toContainText("FIT-LOCK: claimed quantity 1");
 await checkAccessibility(page, "supervisor-query-and-work-statement");
 await expect(page.getByText("These are within the order. No extra or price was created. Resolving questions is not available yet.")).toBeVisible();
});

for (const comparison of ["within", "above", "unpriced"] as const) {
 test(`proceed comparison ${comparison} gives no work permission`, async ({ page }) => {
  await page.route("**/api/northside", route => route.fulfill({ status: 401, json: {} }));
  await page.route("**/api/contractor/practice/acting-as", route => route.fulfill({ json: { state: "acting" } }));
  await page.route("**/api/contractor/site/jobs", route => route.fulfill({ json: { jobs: [{ jobId, reference: "Fictional order", openVisitId: null }] } }));
  await page.route("**/api/northside/extras", route => route.fulfill({ json: { extras: [] } }));
  await page.route(`**/api/contractor/jobs/${jobId}/order-lines`, route => route.fulfill({ json: { version: "site-order-lines.v1", ...head, jobId, workOrderId: jobId, revision: 1, lines: [] } }));
  await page.route(`**/api/contractor/jobs/${jobId}/sor-items?*`, route => route.fulfill({ json: { version: "site-sor-items.v1", ...head, jobId, sorVersionId: jobId, items: [{ code: "FIT-LOCK", description: "Fictional lock", unit: "each" }], truncated: false } }));
  await page.route(`**/api/contractor/jobs/${jobId}/order-check?*`, route => route.fulfill({ json: { version: "site-order-check.v1", ...head, jobId, orderCheck: { outcome: "new", sorCode: "FIT-LOCK", unit: "each", claimedQuantity: "1", instructedQuantity: null, extraQuantity: "1", orderLineScopeItemId: null, proceedComparison: comparison === "within" ? "within" : "above" } } }));
  await page.goto("/site/extra");
  if (comparison !== "unpriced") {
   await page.getByLabel("Search schedule of rates").fill("lock");
   await page.getByRole("button", { name: "FIT-LOCK: Fictional lock (each)", exact: true }).click();
   for (const name of ["Not started", "Under way", "Finished"]) {
    const button = page.getByRole("button", { name, exact: true }), box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
    await button.click(); await expect(button).toHaveAttribute("aria-pressed", "true");
    await checkAccessibility(page, `work-status-${comparison}-${name}`);
   }
  }
  await expect(page.getByTestId("proceed-comparison")).toContainText(comparison === "within" ? "within the limit" : comparison === "unpriced" ? "above the limit (unpriced)" : "above the limit");
  await expect(page.getByTestId("proceed-comparison")).toContainText("This is a comparison and does not grant permission to proceed.");
  await checkAccessibility(page, `proceed-${comparison}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 });
}

for (const speech of ["installed", "unavailable"] as const) {
 test(`free-text status and ${speech} local speech keep words private until reviewed log`, async ({ page }) => {
  const spoken = "Fictional dictated repair", reviewed = "Reviewed fictional repair";
  await page.addInitScript(({ speech, spoken }) => {
   window.__JOBGUARD_SPEECH_ADAPTER__ = {
    configuration: { language: "en-GB", processLocally: true, remoteFallback: false },
    available: async () => speech,
    install: async () => false,
    start(callbacks) {
     queueMicrotask(() => { callbacks.final(spoken, "one"); callbacks.final(spoken, "one"); });
     return { stop() { callbacks.end(); }, cancel() { callbacks.end(); } };
    },
   };
  }, { speech, spoken });
  const posts: Array<{ url: string; body: string }> = [];
  page.on("request", request => { if (request.method() === "POST") posts.push({ url: request.url(), body: request.postData() ?? "" }); });
  await page.route("**/api/northside", route => route.fulfill({ status: 401, json: {} }));
  await page.route("**/api/contractor/practice/acting-as", route => route.fulfill({ json: { state: "acting" } }));
  await page.route("**/api/contractor/site/jobs", route => route.fulfill({ json: { jobs: [{ jobId, reference: "Fictional order", openVisitId: null }] } }));
  await page.route("**/api/northside/extras", route => route.fulfill({ json: { extras: [] } }));
  await page.route(`**/api/contractor/jobs/${jobId}/order-lines`, route => route.fulfill({ json: { version: "site-order-lines.v1", ...head, jobId, workOrderId: jobId, revision: 1, lines: [] } }));
  await page.route("**/api/northside/photo", route => route.fulfill({ json: { photoEvidenceId: visitId, photoSha256: "b".repeat(64), shownContentSha256: "a".repeat(64) } }));
  const attempts: Record<string, unknown>[] = [];
  await page.route(`**/api/contractor/jobs/${jobId}/site-extras`, async route => {
   attempts.push(route.request().postDataJSON());
   if (attempts.length === 1) return route.fulfill({ status: 503, json: { code: "SITE_EXTRA_UNAVAILABLE" } });
   return route.fulfill({ status: 201, json: { version: "site-extra-logged.v4", ...head, jobId, extraId: jobId, state: "logged", evidence: { photoEvidenceId: visitId, residentConfirmationEvidenceId: visitId, contentFormat: "site-extra-content.v1", contentSha256: (attempts[0]!.residentConfirmation as { shownContentSha256: string }).shownContentSha256 } } });
  });
  await page.goto("/site/extra");
  const description = page.getByLabel("What is the extra work?");
  if (speech === "installed") {
   await page.getByRole("button", { name: "Talk through the example", exact: true }).click();
   await expect(page.getByText("Listening on this device", { exact: true })).toBeVisible();
   await checkAccessibility(page, "dictation-listening");
   await page.getByRole("button", { name: "Stop listening", exact: true }).click();
   await expect(page.getByLabel("Words to review")).toHaveValue(spoken);
   await checkAccessibility(page, "dictation-review");
   await expect(description).toHaveValue("");
   await page.getByLabel("Words to review").fill(reviewed);
   await page.getByRole("button", { name: "Use these words", exact: true }).click();
   await expect(description).toHaveValue(reviewed);
   await checkAccessibility(page, "dictation-used");
  } else {
   await expect(page.getByText("On-device voice is unavailable in this browser. Type or use the example.", { exact: true })).toBeVisible();
   await checkAccessibility(page, "dictation-unavailable");
   await description.fill(reviewed);
  }
  await description.fill(`${reviewed} checked`);
  await page.getByLabel("Note for the office").fill("Fictional reviewed note");
  const attach = page.getByRole("button", { name: "Attach practice photo" });
  await expect(attach).toBeDisabled();
  await expect(page.getByTestId("proceed-comparison")).toContainText("above the limit (unpriced)");
  for (const name of ["Not started", "Under way", "Finished"]) {
   const button = page.getByRole("button", { name, exact: true }), box = await button.boundingBox();
   expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "Under way", exact: true }).click();
  await attach.click();
  await expect(page.getByTestId("photo-attached")).toBeVisible();
  expect(posts.filter(post => post.body.includes("repair") || post.body.includes(spoken))).toEqual([]);
  await expect(description).toBeDisabled();
  await page.getByRole("checkbox", { name: /The resident has seen this/ }).check();
  await page.getByRole("button", { name: "Log extra", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("SITE_EXTRA_UNAVAILABLE");
  await checkAccessibility(page, "free-text-retry");
  await page.getByRole("button", { name: "Log extra", exact: true }).click();
  await expect(page.getByTestId("extra-logged")).toContainText("waiting for a price and approval");
  await checkAccessibility(page, "free-text-logged");
  expect(attempts).toHaveLength(2); expect(attempts[1]).toEqual(attempts[0]);
  expect(attempts[0]).toMatchObject({ version: "log-site-extra.v4", workStatus: "under_way", description: `${reviewed} checked` });
  expect(posts.filter(post => post.body.includes("repair")).every(post => post.url.endsWith("/site-extras"))).toBe(true);
  expect(posts.some(post => /audio|transcri|speech/iu.test(post.url))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 });
}
