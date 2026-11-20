import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.setTimeout(360_000);
async function expandPhoneControls(page: import("@playwright/test").Page) {
  const more = page.getByRole("region", { name: "Guided walkthrough" }).getByRole("button", { name: "More", exact: true });
  if (await more.isVisible()) await more.click();
}
// Both mobile-360 and desktop run these against real synthetic routes and workers.
for (const mode of ["Play the whole thing", "Show me"] as const) {
test(`WALK-3 ${mode} completes the builder’s own job without a second job`, async ({ page }) => {
  // Exercise the invoice/receipt mount race: an issued invoice is visible while
  // the separate receipt-history read is still in flight. Keep the real response.
  await page.route(/\/api\/jobs\/[^/]+\/customer-invoices\/[^/]+\/receipts$/, async route => {
    if (route.request().method() === "GET") await new Promise(resolve => setTimeout(resolve, 1500));
    await route.continue();
  });
  let catchReplay: { url: string; data: unknown } | undefined;
  page.on("request", request => {
    if (request.method() === "POST" && /\/final-check\/catches$/.test(request.url())) catchReplay = { url: request.url(), data: request.postDataJSON() };
  });
  const revealed: string[] = [];
  const checkedJobs = new Set<string>();
  // Buffer the real server response before delivering it to the document. A
  // workspace remount may abort its fetch after headers, discarding CDP's body.
  await page.route(/\/api\/jobs\/[^/]+\/final-check$/, async route => {
    const response = await route.fetch();
    if (route.request().method() === "GET" && response.ok()) {
      checkedJobs.add(new URL(response.url()).pathname.split("/")[3]!);
      const body = await response.json();
      for (const item of body.items ?? []) revealed.push(item.description);
    }
    await route.fulfill({ response });
  });
  await page.goto("/practice-company?name=Tommy");
  await expect(page.getByRole("heading", { name: "Tommy's practice firm", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  const practiceToken = (await page.context().cookies()).find(cookie => cookie.name === "jg_session")!.value;
  await page.getByRole("link", { name: "Walk your first practice job", exact: true }).click();
  const tour = page.getByRole("region", { name: "Guided walkthrough" });
  await expect(tour).toContainText("Step 1 of 9");
  await expect(page.getByLabel("Work details")).toHaveValue("Practice decorating. Protect room £200.00. Prepare walls £200.00. Paint walls £200.00. Finish trim £200.00. Clean site £100.00. Replace shelves");
  expect((await page.context().cookies()).find(cookie => cookie.name === "jg_session")!.value).toBe(practiceToken);
  await tour.getByRole("button", { name: "Show me", exact: true }).click();
  await expect(tour).toContainText("Step 2 of 9");
  await tour.getByRole("button", { name: "Show me", exact: true }).click();
  await expect(tour).toContainText("Step 3 of 9", { timeout: 40_000 });
  await expect(page.locator("body")).not.toContainText("This part uses a prepared example job");
  await expect(tour).toContainText("Customer invitation is still to build");
  await page.getByRole("button", { name: "Continue on my own saved job", exact: true }).click();
  if (mode !== "Show me") await tour.getByRole("button", { name: mode, exact: true }).click();
  const ownHref = await page.getByRole("link", { name: "Open your saved job", exact: true }).getAttribute("href");
  if (mode === "Show me") {
    for (let step = 3; step <= 9; step++) {
      await expect(tour).toContainText(`Step ${step} of 9`, { timeout: 300_000 });
      await expect(page.getByTestId("workspace-job-id")).toHaveAttribute("data-job-id", ownHref!.split("/").at(-1)!);
      await expect(page.locator("body")).not.toContainText("This part uses a prepared example job");
      if (step === 8) {
        const result = page.getByTestId("final-check-item");
        await expect(result).toContainText("fitted loft hatch");
        await expect(result.getByRole("button", { name: "Yes — this was extra work", exact: true })).toBeVisible();
        await expect(result.getByLabel("Or answer", { exact: true })).toBeVisible();
        await expect(result.getByRole("button", { name: "Save answer", exact: true })).toBeVisible();
      }
      if (step === 9) {
        // Replay the already paid step: no extra, invoice, receipt or diary mutation.
        const writes: string[] = [];
        const record = (request: import("@playwright/test").Request) => { if (request.method() === "POST" && request.url().includes("/api/jobs/")) writes.push(request.url()); };
        page.on("request", record);
        await expandPhoneControls(page);
        await tour.getByRole("button", { name: "Back", exact: true }).click();
        await expect(tour).toContainText("Step 8 of 9");
        await tour.getByRole("button", { name: mode, exact: true }).click();
        await expect(tour).toContainText("Step 9 of 9");
        expect(writes).toEqual([]); page.off("request", record);
      }
      await tour.getByRole("button", { name: mode, exact: true }).click();
    }
  }
  await expect(page.getByLabel("Simulated customer")).toContainText("customer view is not connected");
  await expect(tour).toContainText("That's the whole job", { timeout: 300_000 });
  await expect(page).toHaveURL(/#final-account-title$/);
  expect(revealed).toContain("fitted loft hatch");
  expect([...checkedJobs]).toEqual([ownHref!.split("/").at(-1)]);
  await expect(page.getByTestId("value-found-after-lock")).toContainText("Found after your bill was complete: £300.00 — from JobGuard's final check");
  await expect(page.getByTestId("value-found-after-lock")).toContainText("awaiting approval");
  await expect(page.getByTestId("value-found-after-lock").getByRole("link", { name: "fitted loft hatch" })).toHaveAttribute("href", /#variation-/);
  await expect(page.getByTestId("value-found-after-lock").getByRole("link", { name: "Inspect the Final Check result" })).toHaveAttribute("href", /#final-check$/);
  await expect(page.getByTestId("value-approved-extras")).toHaveText("£125.00");
  await expect(page.getByTestId("value-invoiced-gross")).toHaveText("£1,230.00");
  await expect(page.getByTestId("value-recorded-gross")).toHaveText("£1,230.00");
  await expect(page.getByTestId("value-outstanding-gross")).toHaveText("£0.00");
  const preparedHref = await page.locator('.value-page a[href^="/jobs/"]').first().getAttribute("href");
  expect(preparedHref!.split("#")[0]).toBe(ownHref);
  expect(new URL(page.url()).searchParams.has("walkExample")).toBe(false);
  const session = await (await page.request.get("/api/session")).json();
  const jobs = await (await page.request.get(`/api/jobs?tenantId=${session.tenants[0].id}`)).json();
  expect(jobs.jobs.map((job: { id: string }) => job.id)).toEqual([ownHref!.split("/").at(-1)]);
  const own = await (await page.request.get(`/api${ownHref}/proposal`)).json();
  expect(["live", "invoiced", "paid"]).toContain(own.status);
  expect(own.review.lines[0].description).toContain("carefully");
  expect((await (await page.request.get(`/api${ownHref}/final-check`)).json()).items).toEqual(expect.arrayContaining([expect.objectContaining({ description: "fitted loft hatch" })]));
  expect(catchReplay).toBeDefined();
  expect((await page.request.post(catchReplay!.url, { data: catchReplay!.data })).ok()).toBe(true);
  const savedValue = await (await page.request.get(`/api${ownHref}/value`)).json();
  expect(savedValue.foundAfterLock).toHaveLength(1);
  expect(savedValue.foundAfterLock[0]).toMatchObject({ description: "fitted loft hatch", pence: 30000, approved: false });
  await tour.getByRole("button", { name: "Close walkthrough" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
}

test("WALK-3 waits for real typed capture, supports keyboard close and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/practice-company/walkthrough");
  const tour = page.getByRole("region", { name: "Guided walkthrough" });
  await expect(tour).toContainText("Step 1 of 9");
  await expandPhoneControls(page);
  await expect(tour.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await tour.getByRole("button", { name: "I'll do it", exact: true }).click();
  await page.getByLabel("Work details").fill("JOB: Fictional room\nITEM: Paint a fictional wall | £200.00");
  await expect(tour).toContainText("Step 1 of 9");
  await page.getByRole("button", { name: "Make my draft", exact: true }).click();
  await expect(tour).toContainText("Step 2 of 9");
  await expect(page.getByRole("heading", { name: "Check the work items" })).toBeVisible();
  await expect(tour.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await tour.getByRole("button", { name: "Show me", exact: true }).click();
  await expect(tour).toContainText("Step 3 of 9");
  await expect(page.getByTestId("workspace-job-id")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("This part uses a prepared example job");
  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("WALK-3 closes playback before any draft command when stopped during the pointer delay", async ({ page }) => {
  await page.goto("/practice-company/walkthrough");
  const tour = page.getByRole("region", { name: "Guided walkthrough" });
  await expect(tour).toContainText("Step 1 of 9");
  let captures = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/api/jobs/capture")) captures++; });
  await tour.getByRole("button", { name: "Play the whole thing", exact: true }).click();
  await tour.getByRole("button", { name: "Stop playback", exact: true }).click();
  await expect(tour.getByRole("button", { name: "Show me", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Work details")).toHaveValue("Practice decorating. Protect room £200.00. Prepare walls £200.00. Paint walls £200.00. Finish trim £200.00. Clean site £100.00. Replace shelves");
  expect(captures).toBe(0);
});

test("WALK-3 on-device words reach the real capture contract without uploading audio", async ({ page }) => {
  await page.addInitScript(() => {
    window.__JOBGUARD_SPEECH_ADAPTER__ = {
      configuration: { language: "en-GB", processLocally: true, remoteFallback: false },
      available: async () => "installed", install: async () => true,
      start(callbacks) {
        callbacks.final("JOB: Fictional voice room\nITEM: Paint fictional walls | £200.00", "words-1");
        callbacks.end();
        return { stop() {}, cancel() {} };
      },
    };
  });
  await page.goto("/practice-company/walkthrough");
  const tour = page.getByRole("region", { name: "Guided walkthrough" });
  await expect(tour).toContainText("Step 1 of 9");
  await expandPhoneControls(page);
  await tour.getByRole("button", { name: "I'll do it", exact: true }).click();
  await page.getByRole("button", { name: "Talk through the example", exact: true }).click();
  await page.getByRole("button", { name: "Use these words", exact: true }).click();
  const request = page.waitForRequest(r => r.method() === "POST" && r.url().endsWith("/api/jobs/capture"));
  await page.getByRole("button", { name: "Make my draft", exact: true }).click();
  expect((await request).postDataJSON().source).toMatchObject({ kind: "browser_local_transcript", acquisition: { processLocally: true, audioUploaded: false, audioStored: false } });
  await expect(tour).toContainText("Step 2 of 9");
  await expect(page.getByTestId("capture-method")).toHaveText("On-device dictation · checked by you");
});

// Authored for mobile-360 and desktop; run headless with --workers=2.
test("WALK-3 verifies saved progress after reload and refuses unavailable saved reads", async ({ page }) => {
  await page.goto("/practice-company/walkthrough");
  const tour = page.getByRole("region", { name: "Guided walkthrough" });
  await tour.getByRole("button", { name: "Show me", exact: true }).click();
  await expect(tour).toContainText("Step 2 of 9");
  await tour.getByRole("button", { name: "Show me", exact: true }).click();
  await expect(tour).toContainText("Step 3 of 9");
  const link = page.getByRole("link", { name: "Open your saved job", exact: true });
  const href = await link.getAttribute("href");
  await page.reload();
  await expect(tour).toContainText("Step 3 of 9");
  await expect(link).toHaveAttribute("href", href!);
  const stored = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("walk-3.progress:")));
  expect(stored).toHaveLength(1);
  expect(Object.keys(JSON.parse(stored[0]![1])).sort()).toEqual(["jobId", "prepared", "priced"]);
  const captures: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && request.url().endsWith("/api/jobs/capture")) captures.push(request.url());
  });
  await page.route(`**/api${href}/quotes`, route => route.fulfill({ status: 503, body: '{}' }));
  await page.reload();
  const savedReadError = page.getByRole("alert").filter({ hasText: "Your saved walkthrough could not load" });
  await expect(savedReadError).toContainText("Your saved walkthrough could not load");
  await expect(tour).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("walkJob")).toBe(href!.split("/").at(-1));
  await page.route(`**/api${href}/proposal`, route => route.fulfill({ status: 404, body: '{}' }));
  await page.reload();
  await expect(savedReadError).toContainText("Your saved walkthrough could not load");
  await expect(tour).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("walkJob")).toBe(href!.split("/").at(-1));
  expect(captures).toEqual([]);
});

test("WALK-3 accepts a manually approved £150 extra", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/practice-company/walkthrough");
  const tour = page.getByRole("region", { name: "Guided walkthrough" });
  for (let step = 1; step <= 5; step++) {
    await expect(tour).toContainText(`Step ${step} of 9`, { timeout: 60_000 });
    await tour.getByRole("button", { name: "Show me", exact: true }).click();
  }
  await expect(tour).toContainText("Step 6 of 9");
  await page.locator('.variation-entry input:not([aria-label])').fill("Fictional extra preparation");
  await page.getByLabel("Variation price (£, optional)").fill("150.00");
  await page.getByRole("button", { name: "Add proposed variation", exact: true }).click();
  await page.getByRole("button", { name: "Approve exact revision", exact: true }).click();
  await expect(page.getByTestId("approved-additions")).toHaveText("£150.00");
  await page.reload();
  // Server-verified proof resumes at extras. Revisit evidence to check that
  // replaying its completed step preserves the saved proof and manual price.
  await expect(tour).toContainText("Step 6 of 9");
  await expect(page.getByTestId("stage-status")).toHaveText("Complete");
  await expect(page.getByTestId("proof-state")).toHaveText("File integrity checked · synthetic example");
  await expect(page.getByTestId("approved-additions")).toHaveText("£150.00");
  await expandPhoneControls(page);
  await tour.getByRole("button", { name: "Back", exact: true }).click();
  await expect(tour).toContainText("Step 5 of 9");
  await tour.getByRole("button", { name: "Show me", exact: true }).click();
  await expect(tour).toContainText("Step 6 of 9");
  await expect(page.getByTestId("approved-additions")).toHaveText("£150.00");
  await expect(tour.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  await expandPhoneControls(page);
  await tour.getByRole("button", { name: "Next", exact: true }).click();
  await expect(tour).toContainText("Step 7 of 9");
});

// REAL-WALK-PACE: actual layout, not mocked geometry, at the requested phone width.
test("390px collapsed bar leaves every step's first highlighted control clear", async ({ page }) => {
  test.setTimeout(540_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/practice-company/walkthrough");
  const tour = page.getByRole("region", { name: "Guided walkthrough" });
  const more = tour.getByRole("button", { name: "More", exact: true });
  await more.focus(); await page.keyboard.press("Enter");
  await expect(tour.getByRole("button", { name: "Less", exact: true })).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Enter");
  expect((await new AxeBuilder({ page }).include('section[aria-label="Guided walkthrough"]').analyze()).violations).toEqual([]);
  for (let step = 1; step <= 9; step++) {
    await expect(tour).toContainText(`Step ${step} of 9`, { timeout: 300_000 });
    await expect(tour.getByRole("button", { name: "More", exact: true })).toHaveAttribute("aria-expanded", "false");
    for (const name of ["Back", "I'll do it", "Next", "Close walkthrough"]) {
      await expect(tour.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect.poll(async () => {
      const target = await page.locator('[class*="spotlight"]').boundingBox();
      const bar = await tour.boundingBox();
      return !!target && !!bar && target.y >= 0 && target.y + target.height <= bar.y;
    }).toBe(true);
    if (step === 1) {
      const scrolled = await page.evaluate(() => {
        const before = scrollY;
        window.scrollBy({ top: before > 0 ? -80 : 80, behavior: "instant" });
        return { before, after: scrollY };
      });
      expect(scrolled.after).not.toBe(scrolled.before);
      // More than two spotlight polls must leave the viewer's scroll alone.
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => scrollY)).toBe(scrolled.after);
    }
    await tour.getByRole("button", { name: "Show me", exact: true }).click();
  }
  await expect(tour.getByRole("heading", { name: "Tour complete", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('section[aria-label="Guided walkthrough"]').analyze()).violations).toEqual([]);
  await tour.getByRole("button", { name: "Read the report again" }).focus();
  await page.keyboard.press("Enter");
  await expect(tour).toHaveCount(0);
  await expect(page.getByTestId("value-recorded-gross")).toBeVisible();
});


for (const refusal of ["refused", "disabled"] as const) {
  test(`WALK-3 own-job ${refusal} control switches honestly without completing the own job`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/practice-company/walkthrough");
    const tour = page.getByRole("region", { name: "Guided walkthrough" });
    for (let step = 1; step <= 2; step++) {
      await expect(tour).toContainText(`Step ${step} of 9`);
      await tour.getByRole("button", { name: "Show me", exact: true }).click();
    }
    await expect(tour).toContainText("Step 3 of 9");
    await page.getByRole("button", { name: "Continue on my own saved job", exact: true }).click();
    const own = new URL(page.url()).searchParams.get("walkJob")!;
    await expect(page.getByTestId("workspace-job-id")).toHaveAttribute("data-job-id", own);
    let alternativeCaptures = 0;
    page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/jobs/capture") alternativeCaptures++; });
    let attempts = 0;
    if (refusal === "refused") {
      // Fault injection at the HTTP boundary; all saved state still uses the real DB.
      await page.route(`**/api/jobs/${own}/quotes/preview`, async route => {
        attempts++;
        await route.fulfill({ status: 409, json: { code: "STALE_QUOTE" } });
      });
    } else {
      await page.getByLabel(/^Unit rate /u).first().fill("");
      await expect(page.getByRole("button", { name: "Preview immutable quote", exact: true })).toBeDisabled();
    }
    await tour.getByRole("button", { name: "Show me", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /^Your own job could not continue\./ })).toBeVisible({ timeout: 40_000 });
    await expect(tour.getByRole("button", { name: "Show me", exact: true })).toBeEnabled();
    expect(new URL(page.url()).searchParams.has("walkExample")).toBe(false);
    expect(alternativeCaptures).toBe(0);
    await expect(page.getByTestId("workspace-job-id")).toHaveAttribute("data-job-id", own);
    const alternative = page.getByRole("button", { name: "Use the prepared example job", exact: true });
    await alternative.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect(page.getByRole("heading", { name: "Prepared example · simulated customer" })).toBeVisible({ timeout: 40_000 });
    expect(alternativeCaptures).toBe(1);
    await expect(tour).toContainText("This part uses a prepared example job");
    await expect(tour).toContainText("Step 3 of 9");
    const example = new URL(page.url()).searchParams.get("walkExample");
    expect(example).toBeTruthy(); expect(example).not.toBe(own);
    expect(attempts).toBe(refusal === "refused" ? 1 : 0);
    const ownState = await (await page.request.get(`/api/jobs/${own}/proposal`)).json();
    expect(ownState.status).toBe("quoting");
    expect((await (await page.request.get(`/api/jobs/${own}/customer-invoices`)).json()).invoices).toEqual([]);
    await tour.getByRole("button", { name: "Show me", exact: true }).click();
    await expect(tour).toContainText("Step 4 of 9", { timeout: 30_000 });
    await page.reload();
    await expect(tour).toContainText("Step 4 of 9", { timeout: 30_000 });
    await expect(tour).toContainText("This part uses a prepared example job");
    await expect(page.getByTestId("workspace-job-id")).toHaveAttribute("data-job-id", example!);
  });
}
