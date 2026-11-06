import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.setTimeout(360_000);
// Both mobile-360 and desktop run these against real synthetic routes and workers.
for (const mode of ["Play the whole thing", "Show me"] as const) {
test(`WALK-3 ${mode} saves its own draft then honestly completes a prepared example`, async ({ page }) => {
  await page.goto("/practice-company?name=Tommy");
  await expect(page.getByRole("heading", { name: "Tommy's practice firm", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  const practiceToken = (await page.context().cookies()).find(cookie => cookie.name === "jg_session")!.value;
  await page.getByRole("link", { name: "Walk your first practice job", exact: true }).click();
  const tour = page.getByRole("region", { name: "Guided walkthrough" });
  await expect(tour).toContainText("Step 1 of 9");
  await expect(page.getByLabel("Work details")).toHaveValue("");
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
      await tour.getByRole("button", { name: mode, exact: true }).click();
    }
  }
  await expect(page.getByLabel("Simulated customer")).toContainText("customer view is not connected");
  await expect(tour).toContainText("Tour complete", { timeout: 300_000 });
  await expect(page).toHaveURL(/#final-account-title$/);
  await expect(page.getByTestId("value-approved-extras")).toHaveText("£125.00");
  await expect(page.getByTestId("value-invoiced-gross")).toHaveText("£1,230.00");
  await expect(page.getByTestId("value-recorded-gross")).toHaveText("£1,230.00");
  await expect(page.getByTestId("value-outstanding-gross")).toHaveText("£0.00");
  const preparedHref = await page.locator('.value-page a[href^="/jobs/"]').first().getAttribute("href");
  expect(ownHref).not.toBe(preparedHref);
  const own = await (await page.request.get(`/api${ownHref}/proposal`)).json();
  expect(own.status).toBe("quoting");
  expect(own.review.lines[0].description).toContain("carefully");
  await tour.getByRole("button", { name: "Close walkthrough" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
}

test("WALK-3 waits for real typed capture, supports keyboard close and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/practice-company/walkthrough");
  const tour = page.getByRole("region", { name: "Guided walkthrough" });
  await expect(tour).toContainText("Step 1 of 9");
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
  await expect(page.getByLabel("Work details")).toHaveValue("");
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
  await tour.getByRole("button", { name: "I'll do it", exact: true }).click();
  await page.getByRole("button", { name: "Talk through the example", exact: true }).click();
  await page.getByRole("button", { name: "Use these words", exact: true }).click();
  const request = page.waitForRequest(r => r.method() === "POST" && r.url().endsWith("/api/jobs/capture"));
  await page.getByRole("button", { name: "Make my draft", exact: true }).click();
  expect((await request).postDataJSON().source).toMatchObject({ kind: "browser_local_transcript", acquisition: { processLocally: true, audioUploaded: false, audioStored: false } });
  await expect(tour).toContainText("Step 2 of 9");
  await expect(page.getByTestId("capture-method")).toHaveText("On-device dictation · checked by you");
});
