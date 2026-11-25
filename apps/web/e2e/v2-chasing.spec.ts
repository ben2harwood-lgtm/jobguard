import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { signInOnce, v2Context } from "../../../tools/v2/test/browser-session.mjs";

const origin = process.env.V2_TEST_ORIGIN;
test("V2-K4 chasing remains dark outside local V2", async ({ request }) => {
  test.skip(!!origin);
  const result = await request.get("/jobs/e2020000-0000-4000-8000-000000000001/chasing");
  expect(result.status()).toBe(404);
});

test.describe("Seeded automatic chasing", () => {
  test.skip(!origin, "Requires the synthetic V2 HTTPS phone launcher.");
  let session: Awaited<ReturnType<typeof signInOnce>>;
  const screenshots = process.env.V2_TEST_SCREENSHOTS ?? "test-results";
  test.beforeAll(async ({ browser }) => {
    // BH1 #936, 3e9fad3b: one verified page sign-in and practice entry for both widths.
    session = await signInOnce(browser);
    await mkdir(screenshots, { recursive: true });
  });

  for (const width of [360, 1280]) {
    test(`firm switch, reload and local catcher at ${width}px`, async ({ browser }) => {
      const context = await v2Context(browser, session.storageState, width);
      try {
        const page = await context.newPage();
        const offOrigin: string[] = [];
        page.on("request", request => {
          if (new URL(request.url()).origin !== session.origin) offOrigin.push(request.url());
        });
        await page.goto(`${session.origin}/jobs/${session.jobId}/chasing`);
        const main = page.getByRole("main").filter({ has: page.getByRole("heading", { name: "Polite reminders", exact: true }) });
        await expect(main.getByText("Practice only. Messages stay in the local catcher.")).toBeVisible();
        await expect(main.getByRole("heading", { name: "What happens next", exact: true })).toBeVisible();
        await expect(main.getByRole("heading", { name: "Local catcher", exact: true })).toBeVisible();
        const on = main.getByRole("button", { name: "Switch chasing on", exact: true });
        const off = main.getByRole("button", { name: "Switch chasing off", exact: true });
        const run = main.getByRole("button", { name: "Run due practice reminders", exact: true });
        await expect(main.getByRole("button", { name: /^Switch chasing (on|off)$/u })).toBeEnabled();
        if (await off.count()) await off.click();
        await expect(on).toBeEnabled();
        await expect(run).toBeDisabled();
        await on.click();
        await expect(off).toBeEnabled();
        await page.reload();
        await expect(off).toBeEnabled();
        await expect(run).toBeEnabled();

        // The seeded job has one sent and accepted quote. A run must capture no message.
        const stoppedQuote = main.getByRole("article").filter({ has: page.getByRole("heading", { name: /^Quote /u }) });
        await expect(stoppedQuote.getByText("Stopped: decision", { exact: true })).toBeVisible();
        await expect(stoppedQuote.getByRole("button", { name: "Stop reminders after a quote decision", exact: true })).toBeDisabled();
        const api = `${session.origin}/api/jobs/${session.jobId}/chasing`;
        const [receipt] = await Promise.all([
          page.waitForResponse(response => response.url() === api && response.request().method() === "POST"),
          run.click(),
        ]);
        expect(receipt.status()).toBe(200);
        // The screen never reads this POST body, so Playwright's receipt.json() and finished()
        // can hang. The 200 status arrives after the run commits; read the saved log instead.
        const saved = await context.request.get(api);
        expect(saved.status()).toBe(200);
        expect((await saved.json() as { log: { message: string | null }[] }).log.filter(row => row.message)).toEqual([]);
        await expect(main.getByText("No reminders captured.", { exact: true })).toBeVisible();
        await expect(off).toBeEnabled();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: join(screenshots, `v2-chasing-${width}.png`), fullPage: true });

        await off.click();
        await expect(on).toBeEnabled();
        await page.reload();
        await expect(on).toBeEnabled();
        await expect(run).toBeDisabled();
        await expect(main.getByText("No reminders captured.", { exact: true })).toBeVisible();
        expect(offOrigin).toEqual([]);
      } finally { await context.close(); }
    });
  }
});
