import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.setTimeout(360_000);
async function expandPhoneControls(page: import("@playwright/test").Page) {
  const more = page.getByRole("region", { name: "Guided walkthrough" }).getByRole("button", { name: "More", exact: true });
  if (await more.isVisible()) await more.click();
}
// Both mobile-360 and desktop run these against real synthetic routes and workers.
for (const mode of ["Play the whole thing", "Show me"] as const) {
test(`WALK-3 ${mode} saves its own draft then honestly completes a prepared example`, async ({ page }) => {
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
  page.on("response", async response => {
    if (response.request().method() === "GET" && /\/api\/jobs\/[^/]+\/final-check$/.test(response.url()) && response.ok()) {
      const body = await response.json();
      for (const item of body.items ?? []) revealed.push(item.description);
    }
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
  await tour.getByRole("button", { name: mode, exact: true }).click();
  if (mode === "Show me") {
    await expect(tour).toContainText("Step 2 of 9");
    await tour.getByRole("button", { name: mode, exact: true }).click();
  }
  await expect(tour).toContainText("Step 3 of 9", { timeout: 40_000 });
  await expect(tour).toContainText("This part uses a prepared example job");
  await expect(tour).toContainText("prerequisite still to build");
  const ownHref = await page.getByRole("link", { name: "Open your saved job", exact: true }).getAttribute("href");
  if (mode === "Show me") {
    for (let step = 3; step <= 9; step++) {
      await expect(tour).toContainText(`Step ${step} of 9`, { timeout: 300_000 });
      if (step === 8) {
        const result = page.getByTestId("final-check-item");
        await expect(result).toContainText("fitted loft hatch");
        await expect(result.getByRole("button", { name: "Yes — this was extra work", exact: true })).toBeVisible();
        await expect(result.getByLabel("Or answer", { exact: true })).toBeVisible();
        await expect(result.getByRole("button", { name: "Save answer", exact: true })).toBeVisible();
      }
      await tour.getByRole("button", { name: mode, exact: true }).click();
    }
  }
  await expect(page.getByLabel("Simulated customer")).toContainText("customer view is not connected");
  await expect(tour).toContainText("That's the whole job", { timeout: 300_000 });
  await expect(page).toHaveURL(/#final-account-title$/);
  expect(revealed).toContain("fitted loft hatch");
  await expect(page.getByTestId("value-found-after-lock")).toContainText("Found after your bill was complete: £300.00 — from JobGuard's final check");
  await expect(page.getByTestId("value-found-after-lock")).toContainText("awaiting approval");
  await expect(page.getByTestId("value-found-after-lock").getByRole("link", { name: "fitted loft hatch" })).toHaveAttribute("href", /#variation-/);
  await expect(page.getByTestId("value-found-after-lock").getByRole("link", { name: "Inspect the Final Check result" })).toHaveAttribute("href", /#final-check$/);
  await expect(page.getByTestId("value-approved-extras")).toHaveText("£125.00");
  await expect(page.getByTestId("value-invoiced-gross")).toHaveText("£1,230.00");
  await expect(page.getByTestId("value-recorded-gross")).toHaveText("£1,230.00");
  await expect(page.getByTestId("value-outstanding-gross")).toHaveText("£0.00");
  const preparedHref = await page.locator('.value-page a[href^="/jobs/"]').first().getAttribute("href");
  expect(ownHref).not.toBe(preparedHref);
  const own = await (await page.request.get(`/api${ownHref}/proposal`)).json();
  expect(own.status).toBe("quoting");
  expect(own.review.lines[0].description).toContain("carefully");
  expect((await (await page.request.get(`/api${ownHref}/value`)).json()).foundAfterLock).toEqual([]);
  expect(catchReplay).toBeDefined();
  expect((await page.request.post(catchReplay!.url, { data: catchReplay!.data })).ok()).toBe(true);
  const savedValue = await (await page.request.get(`/api${preparedHref}/value`)).json();
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
  await expect(page.getByRole("button", { name: "Use the prepared example job" })).toBeVisible();
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
