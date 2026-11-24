import { expect, test } from "@playwright/test";
// Regular CI runs the dark-boundary test. Full interaction proof runs separately
// against the seeded launcher (including its HTTPS phone-mode origin).
const origin = process.env.V2_TEST_ORIGIN;
test("V2-K4 chasing remains dark outside local V2", async ({ request }) => {
  test.skip(!!origin);
  const result = await request.get("/jobs/e2020000-0000-4000-8000-000000000001/chasing");
  expect(result.status()).toBe(404);
});
for (const width of [360, 1280]) {
  test(`V2-K4 firm switch, reload and catcher at ${width}px`, async ({ browser }) => {
    test.skip(!origin);
    const context = await browser.newContext({ baseURL: origin!, viewport: { width, height: 800 }, ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage();
      await page.goto(`${origin}/sign-in`);
      await page.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
      await page.getByLabel("What do you want to do?").selectOption("signin");
      await page.getByRole("button", { name: "Request code" }).click();
      const code = page.getByTestId("fixture-code");
      await expect(code).toHaveText(/^[0-9]{8}$/u);
      await page.getByLabel("Eight-digit code").fill((await code.textContent())!);
      const [verified] = await Promise.all([page.waitForResponse(`${origin}/api/auth/verify`), page.getByRole("button", { name: "Verify code" }).click()]);
      expect(verified.status()).toBe(200);
      const session = await (await context.request.get(`${origin}/api/auth/session`)).json();
      const csrfToken = (await verified.json()).csrfToken;
      const practice = await context.request.post(`${origin}/api/auth/practice`, {
        headers: { origin: origin!, "x-csrf-token": csrfToken }, data: { version: "linked-practice-company.v1", action: "enter" },
      });
      expect(practice.status()).toBe(200); expect(session.memberships).toHaveLength(1);
      const jobs = await (await context.request.get(`${origin}/api/jobs?tenantId=11111111-1111-4111-8111-111111111111`)).json();
      expect(jobs.jobs.length).toBeGreaterThan(0);
      const job = jobs.jobs[0].id;
      await page.goto(`${origin}/jobs/${job}/chasing`);
      await expect(page.getByRole("heading", { name: "Polite reminders" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "What happens next" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Local catcher" })).toBeVisible();
      // Establish a known off state without relying on an earlier suite's setting.
      const off = page.getByRole("button", { name: "Switch chasing off" });
      await expect(page.getByRole("button", { name: /Switch chasing (on|off)/ })).toBeEnabled();
      if (await off.count()) { await off.click(); await expect(page.getByRole("button", { name: "Switch chasing on" })).toBeEnabled(); }
      await page.getByRole("button", { name: "Switch chasing on" }).click();
      await expect(off).toBeEnabled();
      await page.reload(); await expect(off).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // On seeded accepted quotes the stopped status is shown and the button is disabled.
      const stopped = page.getByText("Stopped: decision");
      if (await stopped.count()) await expect(stopped.first()).toBeVisible();
      await off.click();
      await expect(page.getByRole("button", { name: "Run due practice reminders" })).toBeDisabled();
      await page.screenshot({ path: `test-results/v2-chasing-${width}.png`, fullPage: true });
    } finally { await context.close(); }
  });
}
