import { expect, test, type Page } from "@playwright/test";
const origin = "http://127.0.0.1:3000";
const api = (page: Page, path: string) => page.evaluate(async path => {
  const response = await fetch(path, { cache: "no-store" });
  return { status: response.status, body: await response.json() };
}, path);

// Real headless journey in CI's mobile-360 and desktop projects. No provider calls.
test("owner approves the exact displayed practice terms, then revokes and cancels", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Fictional email address").fill(`m413-${crypto.randomUUID()}@practice.invalid`);
  await page.getByRole("button", { name: "Request code", exact: true }).click();
  const code = await page.getByTestId("fixture-code").textContent(); expect(code).toMatch(/^\d{8}$/u);
  await page.getByLabel("Eight-digit code").fill(code!);
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Signed in", exact: true })).toBeVisible();
  await page.goto("/plans/mandate");
  const main = page.getByRole("main");
  await expect(main).toContainText("not approved"); await expect(main).toContainText("no authority");
  await expect(main).toContainText("Practice only"); await expect(main).toContainText("wording still needs Ben’s approval");
  await main.getByRole("combobox", { name: "Plan" }).selectOption("Builder");
  await expect(main.getByTestId("mandate-terms")).toContainText('"plan":"Builder"');
  const shown = await main.getByTestId("mandate-terms").textContent();
  const shownHash = await page.evaluate(async text => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text!));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }, shown);
  const approve = main.getByRole("button", { name: "Approve practice terms", exact: true });
  await expect(approve).toBeDisabled();
  await main.getByRole("checkbox").check();
  for (const control of await main.locator("button, select, input").all()) {
    const box = await control.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    if (await control.isEnabled()) { await control.focus(); await expect(control).toBeFocused(); }
  }
  // Chromium's native contrast audit requires no downloaded accessibility library.
  // Together with named controls, headings, keyboard focus and a single main landmark below,
  // this checks the serious accessibility failures relevant to this compact form.
  const cdp = await page.context().newCDPSession(page);
  const contrastIssues: unknown[] = [];
  cdp.on("Audits.issueAdded", event => { if (event.issue.code === "LowTextContrastIssue") contrastIssues.push(event.issue); });
  await cdp.send("Audits.enable"); await cdp.send("Audits.checkContrast", { reportAAA: false });
  expect(contrastIssues).toEqual([]); await cdp.detach();
  await expect(main).toHaveCount(1); await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(main.getByRole("checkbox", { name: "I have read this exact practice agreement." })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const approvalRequest = page.waitForRequest(request => request.url().endsWith("/api/subscription-mandate") && request.method() === "POST");
  await approve.click();
  const approval = (await approvalRequest).postDataJSON();
  expect(approval.command.selection.plan).toBe("Builder"); expect(approval.command.selection).not.toHaveProperty("tenantId");
  await expect(main.getByRole("status")).toContainText("Server recorded active");
  await expect(main.getByRole("status")).toContainText(shownHash);
  const persisted = await api(page, "/api/subscription-mandate?plan=Builder");
  expect(persisted.status).toBe(200); expect(persisted.body.snapshot.record.termsHash).toBe(shownHash);
  // Changed selection requires fresh human approval and remains held by notice policy.
  await main.getByRole("combobox", { name: "Plan" }).selectOption("Solo");
  await expect(main.getByTestId("mandate-terms")).toContainText('"plan":"Solo"');
  await main.getByRole("checkbox").check(); await approve.click();
  await expect(main.getByRole("status")).toContainText("needs fresh approval");
  page.once("dialog", dialog => dialog.dismiss());
  await main.getByRole("button", { name: "Revoke authority", exact: true }).click();
  expect((await api(page, "/api/subscription-mandate")).body.snapshot.record.state).toBe("active");
  page.once("dialog", dialog => dialog.accept());
  await main.getByRole("button", { name: "Revoke authority", exact: true }).click();
  await expect(main).toContainText("Current state: revoked"); await expect(main).toContainText("not current; no authority");
  page.once("dialog", dialog => dialog.accept());
  await main.getByRole("button", { name: "Cancel agreement", exact: true }).click();
  await expect(main).toContainText("Current state: cancelled"); await expect(main).toContainText("Provider cancellation is pending");
  await page.reload(); await expect(page.getByRole("main")).toContainText("Current state: cancelled");
});

// Transport-only fixture: proves retry identity, not persistence or payment execution.
test("an uncertain approval retries identical bytes and command ID", async ({ page }) => {
  const selection = { version: "subscription-agreement-selection.v1", plan: "Solo" };
  await page.route("**/api/subscription-mandate?*", route => route.fulfill({ json: {
    version: "subscription-mandate-screen.v1", sequence: 0, csrfToken: "fictional-csrf",
    snapshot: { record: null, authorityCurrent: false }, preview: { selection,
      termsText: "Fictional exact terms for retry rendering only", termsHash: "a".repeat(64), previewProof: "b".repeat(64) },
  } }));
  const sent: string[] = [];
  await page.route(`${origin}/api/subscription-mandate`, async route => {
    sent.push(route.request().postData()!);
    if (sent.length === 1) return route.abort("failed");
    return route.fulfill({ json: { sequence: 1, state: "active", termsHash: "a".repeat(64), productionEnabled: false } });
  });
  await page.goto("/plans/mandate"); const main = page.getByRole("main");
  await main.getByRole("checkbox").check();
  await main.getByRole("button", { name: "Approve practice terms", exact: true }).click();
  await expect(main.getByRole("status")).toContainText("outcome is unknown");
  await expect(main.getByRole("combobox")).toBeDisabled();
  await main.getByRole("button", { name: "Retry same request", exact: true }).click();
  await expect(main.getByRole("status")).toContainText("Server recorded active");
  expect(sent).toHaveLength(2); expect(sent[1]).toBe(sent[0]);
});
