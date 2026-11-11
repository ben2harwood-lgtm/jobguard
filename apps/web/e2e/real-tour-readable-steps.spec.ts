import { expect, test, type Page } from "@playwright/test";

// This spec alone allows the real worker's bounded Final Check plus nine reading holds.
// No completed jobs, successful responses or provider results are seeded or mocked.
test.setTimeout(540_000);
const tourSelector = 'section[aria-label="Guided walkthrough"]';
type Interval = { step: number; resultAt: number; readingAt?: number; intendedMs?: number; endedAt?: number };
declare global { interface Window { readableSteps: Interval[] } }

// Also retain partial monotonic measurements if a later real journey assertion fails.
test.afterEach(async ({ page }, info) => {
  const intervals = await page.evaluate(() => window.readableSteps ?? []);
  await info.attach("completed-result-intervals.json", {
    body: JSON.stringify(intervals.map(interval => ({ ...interval,
      completedResultMs: interval.endedAt === undefined ? null : interval.endedAt - interval.resultAt,
      visibleTimerMs: interval.endedAt === undefined || interval.readingAt === undefined ? null : interval.endedAt - interval.readingAt,
    })), null, 2), contentType: "application/json",
  });
});

async function start(page: Page, phone: boolean) {
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("link", { name: "Start my own practice firm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready for your first job", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Walk your first practice job", exact: true }).click();
  const tour = page.getByRole("region", { name: "Guided walkthrough" });
  await expect(tour).toContainText("Step 1 of 9");
  // Step-1 sample/saved-draft presentation is owned by real-tour-one-saved-job.
  return tour;
}

async function recordIntervals(page: Page) {
  await page.evaluate(selector => {
    window.readableSteps = [];
    const root = document.querySelector(selector)!;
    const text = (id: string) => document.querySelector(`#walk-screen [data-testid="${id}"]`)?.textContent ?? "";
    const inspect = () => {
      const now = performance.now(); // Browser monotonic clock, including background scheduling delays.
      const step = Number(root.querySelector("h2")?.textContent?.match(/^Step (\d+) of 9/)?.[1] ?? 0);
      for (const entry of window.readableSteps) if (entry.step !== step && entry.endedAt === undefined) entry.endedAt = now;
      const completed = step === 4 ? !!document.querySelector('#walk-screen [data-testid="activation-policy"]')
        : step === 5 ? text("stage-status") === "Complete" && text("proof-state") === "File integrity checked · synthetic example" && [...document.querySelectorAll('#walk-screen [data-testid="diary-entry"]')].some(node => node.textContent?.includes("Fictional practice diary: fitted loft hatch. Estimated extra: £300 net."))
        : step === 6 ? text("approved-additions") === "£125.00"
        : step === 9 ? !!document.querySelector("#walk-screen .value-page h1") && !!text("value-invoiced-gross") && text("value-invoiced-gross") !== "No recorded outcome yet"
        : false;
      if (!completed) return;
      let entry = window.readableSteps.find(value => value.step === step);
      if (!entry) { entry = { step, resultAt: now }; window.readableSteps.push(entry); }
      const progress = root.querySelector<HTMLElement>('[role="timer"] > span');
      if (progress && entry.readingAt === undefined) {
        entry.readingAt = now;
        // The component sets this duration by calling the authoritative readingTime(title, words).
        entry.intendedMs = parseFloat(progress.style.animationDuration);
      }
    };
    new MutationObserver(inspect).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    inspect();
  }, tourSelector);
}

test("viewer walk 2 gives every completed autoplay step time to read", async ({ page }, info) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const phone = info.project.name === "mobile-360";
    const tour = await start(page, phone);
    await recordIntervals(page);
    await tour.getByRole("button", { name: "Play the whole thing", exact: true }).click();
    for (const step of [4, 5, 6, 9]) {
      await expect(tour.getByRole("heading")).toContainText(`Step ${step} of 9`, { timeout: 300_000 });
      await expect(tour.getByRole("timer")).toBeVisible({ timeout: 300_000 });
      await expect(tour.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
      await expect(tour.getByRole("button", { name: "Stop playback", exact: true })).toBeVisible();
      if (phone) {
        // Both the words and controls must be reachable; opening More cannot release reading.
        const more = tour.getByRole("button", { name: "More", exact: true });
        if (await more.isVisible()) await more.click();
        const words = tour.locator("p").first();
        await words.scrollIntoViewIfNeeded(); await expect(words).toBeInViewport();
        await tour.getByRole("button", { name: "Next", exact: true }).scrollIntoViewIfNeeded();
        await expect(tour.getByRole("button", { name: "Next", exact: true })).toBeInViewport();
        await tour.getByRole("button", { name: "Stop playback", exact: true }).scrollIntoViewIfNeeded();
        await expect(tour.getByRole("button", { name: "Stop playback", exact: true })).toBeInViewport();
        // Check geometry with the compact card, as in the existing dock regression.
        await tour.getByRole("button", { name: "Less", exact: true }).click();
        await expect.poll(async () => {
          const target = await page.locator('[class*="spotlight"]').boundingBox(), card = await tour.boundingBox();
          return !!target && !!card && target.y >= 0 && target.y + target.height <= card.y;
        }).toBe(true);
      }
      await page.mouse.wheel(0, 80);
      await page.evaluate(() => window.scrollBy({ top: -40, behavior: "instant" }));
      // Deliberate viewer interaction must leave this completed result on screen.
      await page.waitForTimeout(250);
      await expect(tour.getByRole("heading")).toContainText(`Step ${step} of 9`);
      if (step === 9) await expect(tour.getByRole("heading", { name: "Tour complete", exact: true })).toHaveCount(0);
      await expect(tour.getByRole("heading")).not.toContainText(`Step ${step} of 9`, { timeout: 20_000 });
    }
    await expect(tour.getByRole("heading", { name: "Tour complete", exact: true })).toBeVisible();
    const intervals = await page.evaluate(() => window.readableSteps);
    expect(intervals.map(value => value.step)).toEqual([4, 5, 6, 9]);
    for (const interval of intervals) {
      expect(interval.readingAt).toBeDefined(); expect(interval.intendedMs).toBeGreaterThanOrEqual(4000);
      expect(interval.intendedMs).toBeLessThanOrEqual(15000); expect(interval.endedAt).toBeDefined();
      // Scheduling may lengthen the hold; it must never shorten the intended completed-result interval.
      expect(interval.endedAt! - interval.resultAt).toBeGreaterThanOrEqual(interval.intendedMs!);
      expect(interval.endedAt! - interval.resultAt).toBeLessThan(interval.intendedMs! + 5000);
    }
    await page.screenshot({ path: info.outputPath("readable-viewer.png") });
});

test("explicit Next releases reading; Stop prevents another command and Close restores interaction", async ({ page }, info) => {
  // These controls release/cancel viewer reading, so opt into the same viewer path.
  await page.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const tour = await start(page, info.project.name === "mobile-360");
  const commands: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/")) commands.push(request.url()); });
  await tour.getByRole("button", { name: "Play the whole thing", exact: true }).click();
  await expect(tour.getByRole("timer")).toBeVisible({ timeout: 40_000 });
  await expect(tour.getByRole("heading")).toContainText("Step 1 of 9");
  const remaining = await tour.getByRole("timer").evaluate(element => {
    const animation = element.firstElementChild as HTMLElement;
    return parseFloat(animation.style.animationDuration);
  });
  const beforeNext = await page.evaluate(() => performance.now());
  await tour.getByRole("button", { name: "Next", exact: true }).click();
  await expect(tour.getByRole("heading")).toContainText("Step 2 of 9");
  expect(await page.evaluate(() => performance.now()) - beforeNext).toBeLessThan(remaining);
  await expect(tour.getByRole("timer")).toBeVisible({ timeout: 40_000 });
  await tour.getByRole("button", { name: "Stop playback", exact: true }).click();
  const count = commands.length;
  await expect(tour.getByRole("timer")).toHaveCount(0);
  await expect(tour.getByRole("button", { name: "Show me", exact: true })).toBeEnabled();
  await page.waitForTimeout(16_000); // Beyond the longest readingTime: no subsequent commercial command.
  expect(commands).toHaveLength(count);
  await expect(tour.getByRole("heading")).toContainText("Step 2 of 9");
  await tour.getByRole("button", { name: "Close walkthrough", exact: true }).click();
  await expect(tour).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use the prepared example job", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Open guided walkthrough", exact: true }).click();
  await expect(tour).toBeVisible();
  // Close while a fresh completed-result hold is active too, rather than only after Stop.
  await tour.getByRole("button", { name: "Play the whole thing", exact: true }).click();
  await expect(tour.getByRole("timer")).toBeVisible({ timeout: 40_000 });
  await tour.getByRole("button", { name: "Close walkthrough", exact: true }).click();
  const closedCount = commands.length;
  await page.waitForTimeout(16_000);
  expect(commands).toHaveLength(closedCount);
  await expect(tour).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open guided walkthrough", exact: true })).toBeEnabled();
});
