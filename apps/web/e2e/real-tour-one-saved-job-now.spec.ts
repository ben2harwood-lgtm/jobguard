import { expect, test, type Page } from "@playwright/test";

// Real synthetic HTTP commands and PostgreSQL worker; never seed completed facts.
test.setTimeout(540_000);
const tour = (page: Page) => page.getByRole("region", { name: "Guided walkthrough" });
const control = (page: Page, name: string) => tour(page).getByRole("button", { name, exact: true });
async function frontDoor(page: Page, phone: boolean) {
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("link", { name: "Start my own practice firm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready for your first job", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Walk your first practice job", exact: true }).click();
  await expect(tour(page)).toContainText("Step 1 of 9");
}
async function read(page: Page, path: string) {
  const response = await page.request.get(path);
  expect(response.ok(), path).toBe(true);
  return response.json();
}
async function oneJob(page: Page, id: string) {
  expect(new URL(page.url()).searchParams.get("walkJob")).toBe(id);
  expect(new URL(page.url()).searchParams.has("walkExample")).toBe(false);
  const session = await read(page, "/api/session");
  const jobs = await read(page, `/api/jobs?tenantId=${session.tenants[0].id}`);
  expect(jobs.jobs.map((job: { id: string }) => job.id)).toEqual([id]);
}
async function spotlight(page: Page) {
  await expect.poll(async () => {
    const box = await page.locator('[class*="spotlight"]').boundingBox();
    const dock = await tour(page).boundingBox();
    return !!box && !!dock && box.width > 40 && box.height >= 20 && box.height < 350 && box.y >= 0 && box.y + box.height <= dock.y;
  }).toBe(true);
}
for (const mode of ["Play the whole thing", "Show me"] as const) {
  test(mode === "Play the whole thing" ? "fresh autoplay keeps one captured job" : "Show me presents words and saved draft", async ({ page }, info) => {
    // Only these viewer cases turn on real reading time.
    await page.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    let captures = 0;
    const commercial: string[] = [];
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (request.method() !== "POST") return;
      if (path === "/api/jobs/capture") captures++;
      if (/customer-invoices|receipts/.test(path)) commercial.push(path);
    });
    await frontDoor(page, info.project.name === "mobile-360");
    await control(page, mode).click();
    await expect(tour(page).getByRole("timer")).toBeVisible();
    await expect(page.getByLabel("Work details")).toHaveValue(/Protect room/);
    expect(captures).toBe(0);
    await expect(control(page, "Next")).toBeEnabled();
    // Allow the sample's full reading period; Next never pretends it was captured.
    await expect(page.getByRole("link", { name: "Open your saved job", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(tour(page)).toContainText("Step 1 of 9");
    await expect(page.locator("#walk-screen .review-line").first()).toBeVisible();
    await expect(tour(page).getByRole("timer")).toBeVisible();
    const id = new URL(page.url()).searchParams.get("walkJob")!;
    await oneJob(page, id);
    if (mode === "Show me") await control(page, "Next").click();
    for (let step = 2; step <= 9; step++) {
      await expect(tour(page)).toContainText(`Step ${step} of 9`, { timeout: 300_000 });
      await oneJob(page, id);
      if (step >= 3 && step <= 8) await expect(page.getByTestId("workspace-job-id")).toHaveAttribute("data-job-id", id);
      if (mode === "Show me") {
        if ([2, 5, 8].includes(step)) {
          const count = captures;
          await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
          await page.reload();
          await expect(tour(page)).toContainText(`Step ${step} of 9`, { timeout: 30_000 });
          await oneJob(page, id); expect(captures).toBe(count);
        }
        await control(page, mode).click();
      }
    }
    await expect(tour(page)).toContainText("Tour complete", { timeout: 300_000 });
    expect(captures).toBe(1);
    await expect(page.getByTestId("value-invoiced-gross")).toHaveText("£1,230.00");
    await expect(page.getByTestId("value-recorded-gross")).toHaveText("£1,230.00");
    await expect(page.getByTestId("value-outstanding-gross")).toHaveText("£0.00");
    await expect(page.getByTestId("value-found-after-lock")).toContainText("awaiting approval");
    for (const link of await page.locator('.value-page a[href^="/jobs/"]').all()) await expect(link).toHaveAttribute("href", new RegExp(`^/jobs/${id}(?:#|$|/)`));
    const invoices = await read(page, `/api/jobs/${id}/customer-invoices`);
    expect(invoices.invoices).toHaveLength(1);
    const receipts = await read(page, `/api/jobs/${id}/customer-invoices/${invoices.invoices[0].id}/receipts`);
    expect(receipts.receipts).toHaveLength(1);
    expect(invoices.invoices[0].balancePence).toBe(0);
    const before = [...commercial];
    await page.reload();
    await expect(tour(page)).toContainText("Step 9 of 9");
    await control(page, "Show me").click();
    await expect(page.getByTestId("value-recorded-gross")).toHaveText("£1,230.00");
    await control(page, "Read the report again").click();
    await page.getByRole("button", { name: "Return to the saved job", exact: true }).click();
    await oneJob(page, id);
    expect(captures).toBe(1); expect(commercial).toEqual(before);
    expect(await read(page, `/api/jobs/${id}/customer-invoices`)).toEqual(invoices);
    expect(await read(page, `/api/jobs/${id}/customer-invoices/${invoices.invoices[0].id}/receipts`)).toEqual(receipts);
  });
}

test("hand step 3 saves customer and site before sending", async ({ page }, info) => {
  await frontDoor(page, info.project.name === "mobile-360");
  await control(page, "I'll do it").click();
  await page.getByLabel("Work details").fill("JOB: Fictional hand room\nITEM: Paint fictional walls | £900.00");
  await page.getByRole("button", { name: "Make my draft", exact: true }).click();
  await expect(tour(page)).toContainText("Step 2 of 9");
  for (const input of await page.locator('.review-line input[aria-label^="Description "]').all()) await page.getByRole("button", { name: `Accept ${await input.inputValue()}`, exact: true }).click();
  for (const input of await page.locator('input[aria-label^="Answer "]').all()) await input.fill("Builder removes fictional waste");
  await page.getByRole("button", { name: "Confirm scope", exact: true }).click();
  await page.getByRole("button", { name: "Price the work", exact: true }).click();
  await page.getByRole("button", { name: "Save draft revision", exact: true }).click();
  await control(page, "Next").click();
  await expect(tour(page)).toContainText("Step 3 of 9");
  await expect(tour(page)).toContainText(/Save customer and site.*Preview immutable quote/);
  await control(page, "Go to customer/site or quote preview").click();
  const form = page.getByRole("form", { name: "Customer and site details" });
  await expect(form).toBeVisible();
  await expect(page.getByTestId("party-binding-id")).toHaveCount(0);
  await spotlight(page);
  const values = await form.locator("input").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
  // Delay the real save beyond the trusted-input grace period; no scroll follows its result.
  await page.route("**/api/jobs/*/parties", async route => {
    if (route.request().method() === "POST") await new Promise(resolve => setTimeout(resolve, 1400));
    await route.continue();
  });
  await form.getByRole("button", { name: "Save customer and site", exact: true }).click();
  const position = await page.evaluate(() => scrollY);
  await expect(page.getByTestId("party-binding-id")).toHaveCount(1);
  await expect(page.getByTestId("party-customer")).not.toBeEmpty();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => scrollY)).toEqual(position);
  expect(await form.locator("input").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(values);
  await control(page, "Go to customer/site or quote preview").click();
  await spotlight(page);
  await page.getByRole("button", { name: "Preview immutable quote", exact: true }).click();
  await page.getByRole("button", { name: "Simulate sending this quote", exact: true }).click();
  await page.getByRole("button", { name: "Continue fake worker", exact: true }).click();
  await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
  await control(page, "Next").click();
  await page.getByRole("button", { name: "Record practice acceptance", exact: true }).click();
  await page.getByRole("button", { name: "Start this practice job", exact: true }).click();
  await expect(page.getByTestId("activation-policy")).toBeVisible();
  await oneJob(page, new URL(page.url()).searchParams.get("walkJob")!);
});

test("own-job refusal waits for an explicit alternative", async ({ page }, info) => {
  await frontDoor(page, info.project.name === "mobile-360");
  for (let step = 1; step <= 2; step++) { await expect(tour(page)).toContainText(`Step ${step} of 9`); await control(page, "Show me").click(); }
  const own = new URL(page.url()).searchParams.get("walkJob")!;
  let attempts = 0, captures = 0;
  page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/jobs/capture") captures++; });
  await page.route(`**/api/jobs/${own}/quotes/preview`, async route => { attempts++; await route.fulfill({ status: 409, json: { code: "STALE_QUOTE" } }); });
  await control(page, "Show me").click();
  await expect(page.getByRole("alert").filter({ hasText: /^Your own job could not continue\./ })).toBeVisible({ timeout: 40_000 });
  await oneJob(page, own); expect(captures).toBe(0); expect(attempts).toBe(1);
  expect((await read(page, `/api/jobs/${own}/proposal`)).status).toBe("quoting");
  expect((await read(page, `/api/jobs/${own}/customer-invoices`)).invoices).toEqual([]);
  await page.getByRole("button", { name: "Use the prepared example job", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByRole("heading", { name: "Prepared example · simulated customer" })).toBeVisible();
  const alternative = new URL(page.url()).searchParams.get("walkExample")!;
  expect(alternative).not.toBe(own); expect(captures).toBe(1);
  await control(page, "Show me").click(); await expect(tour(page)).toContainText("Step 4 of 9");
  await page.reload(); await expect(tour(page)).toContainText("Step 4 of 9");
  await expect(page.getByTestId("workspace-job-id")).toHaveAttribute("data-job-id", alternative);
  expect(attempts).toBe(1); expect(captures).toBe(1);
});


test("cancel sample reading before and after capture without another command", async ({ page }, info) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let captures = 0;
  page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/jobs/capture") captures++; });
  await frontDoor(page, info.project.name === "mobile-360");
  await control(page, "Show me").click();
  await expect(tour(page).getByRole("timer")).toBeVisible();
  await control(page, "Stop playback").click();
  await expect(control(page, "Show me")).toBeEnabled();
  expect(captures).toBe(0);
  await control(page, "Show me").click();
  await expect(tour(page).getByRole("timer")).toBeVisible();
  await control(page, "Next").click();
  await expect(page.getByRole("link", { name: "Open your saved job", exact: true })).toBeVisible();
  await expect(tour(page).getByRole("timer")).toBeVisible();
  await control(page, "Stop playback").click();
  await page.waitForTimeout(16_000);
  await expect(tour(page)).toContainText("Step 1 of 9");
  expect(captures).toBe(1);
  await oneJob(page, new URL(page.url()).searchParams.get("walkJob")!);
});

test("foreign selectors and reset-session resume never capture an alternative", async ({ page, browser, baseURL }, info) => {
  await frontDoor(page, info.project.name === "mobile-360");
  await control(page, "Show me").click();
  await expect(tour(page)).toContainText("Step 2 of 9");
  const savedUrl = page.url(), own = new URL(savedUrl).searchParams.get("walkJob")!;
  const other = await browser.newContext({ baseURL: baseURL! });
  try {
    const stranger = await other.newPage();
    let captures = 0;
    stranger.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/jobs/capture") captures++; });
    await stranger.goto(`${savedUrl}&walkExample=${own}`);
    await expect(stranger.getByRole("alert").filter({ hasText: "Your saved walkthrough could not load" })).toBeVisible();
    await expect(tour(stranger)).toHaveCount(0); expect(captures).toBe(0);
    expect((await stranger.request.get(`/api/jobs/${own}/proposal`)).ok()).toBe(false);
    await oneJob(page, own);
  } finally { await other.close(); }
  const reset = await page.request.post("/api/practice-company", { headers: { origin: new URL(page.url()).origin }, data: { version: "blank-practice-company.v1", action: "reset" } });
  expect(reset.ok()).toBe(true);
  let captures = 0;
  page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/jobs/capture") captures++; });
  await page.goto(savedUrl);
  await expect(page.getByRole("alert").filter({ hasText: "Your saved walkthrough could not load" })).toBeVisible();
  await expect(tour(page)).toHaveCount(0); expect(captures).toBe(0);
  expect(new URL(page.url()).searchParams.has("walkExample")).toBe(false);
  expect((await page.request.get(`/api/jobs/${own}/proposal`)).ok()).toBe(false);
});
