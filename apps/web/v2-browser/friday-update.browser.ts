import { expect, test, type BrowserContext } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const origin = process.env.V2_TEST_ORIGIN!;
if (!origin || new URL(origin).protocol !== "https:") throw new Error("V2_TEST_ORIGIN must name the launcher's HTTPS phone origin");
const screenshots = process.env.V2_TEST_SCREENSHOTS ?? "test-results";
let storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
let jobId: string;

// Copied from V2-BH1 browser-session.mjs at 2ce5299f; adapted to Playwright's fixtures.
// One sign-in, verify-response CSRF, post-verify navigation wait, then saved practice state.
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/sign-in`);
    await page.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
    await page.getByLabel("What do you want to do?").selectOption("signin");
    await page.getByRole("button", { name: "Request code" }).click();
    const code = page.getByTestId("fixture-code");
    await expect(code).toHaveText(/^[0-9]{8}$/u);
    await page.getByLabel("Eight-digit code").fill((await code.textContent())!);
    const [verified] = await Promise.all([
      page.waitForResponse(`${origin}/api/auth/verify`),
      page.getByRole("button", { name: "Verify code" }).click(),
    ]);
    expect(verified.status()).toBe(200);
    const { csrfToken } = await verified.json();
    expect(typeof csrfToken).toBe("string"); expect(csrfToken).toBeTruthy();
    await page.waitForURL(url => !url.pathname.startsWith("/sign-in"));
    await page.waitForLoadState("load");
    await page.evaluate(async token => {
      const response = await fetch("/api/auth/practice", {
        method: "POST", headers: { "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ version: "linked-practice-company.v1", action: "enter" }),
      });
      if (!response.ok) throw new Error(`practice:${response.status}`);
    }, csrfToken);
    const { DEMO_TENANT_ID } = await import("../../../packages/db/dist/index.js");
    const jobs = await page.evaluate(async tenantId => {
      const response = await fetch(`/api/jobs?tenantId=${tenantId}`);
      if (!response.ok) throw new Error(`jobs:${response.status}`);
      return (await response.json()).jobs;
    }, DEMO_TENANT_ID);
    jobId = jobs.find((job: { title: string }) => job.title.includes("Occupied-home kitchen splashback and hall decorating"))?.id;
    expect(jobId).toBeTruthy();
    storageState = await context.storageState();
    await mkdir(screenshots, { recursive: true });
  } finally { await context.close(); }
});

for (const width of [360, 1280]) test(`K3 preview/edit/send survives reload at ${width} with no customer leaks`, async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true, storageState });
  try {
    const page = await context.newPage();
    const offOrigin: string[] = [];
    page.on("request", request => { if (new URL(request.url()).origin !== origin) offOrigin.push(request.url()); });
    const week = width === 360 ? "2027-01-11" : "2027-01-18";
    const weekLabel = width === 360 ? "Monday 11 January 2027" : "Monday 18 January 2027";
    await page.goto(`${origin}/jobs/${jobId}/friday-update`);
    const main = page.getByRole("main");
    await expect(main.getByTestId("friday-update")).toBeVisible();
    // V2's Next config disables the dev indicator; all content checks stay in main.
    await expect(main.getByText("Practice sandbox — synthetic data; nothing is sent or charged", { exact: true })).toBeVisible();
    await expect(main.getByLabel("Week starting Monday")).toBeEnabled();
    await main.getByLabel("Week starting Monday").fill(week);
    const prepare = main.getByRole("button", { name: "Prepare update", exact: true });
    await expect(prepare).toBeEnabled(); await prepare.click();
    await expect(main.getByRole("button", { name: "Edit text", exact: true })).toBeEnabled();
    await main.getByRole("button", { name: "Edit text", exact: true }).click();
    await main.getByLabel("This week text").fill("Splashback prepared and tiled.");
    await main.getByLabel("Next week text").fill("Grout the splashback.");
    for (const button of await main.getByRole("button").all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await main.getByRole("button", { name: "Save text", exact: true }).click();
    await expect(main.getByText("Splashback prepared and tiled.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(main.getByLabel("Week starting Monday")).toBeEnabled();
    await main.getByLabel("Week starting Monday").fill(week);
    await expect(main.getByText("Splashback prepared and tiled.", { exact: true })).toBeVisible();
    await expect(main.getByText(`Week of ${weekLabel} · to customer@jobguard-v2.invalid`, { exact: true })).toBeVisible();
    await main.getByRole("button", { name: "Preview as the customer sees it", exact: true }).click();
    await expect(main.getByRole("heading", { name: "Your Friday update", exact: true })).toBeVisible();
    const preview = main.getByTestId("customer-message");
    const expectedMessage = `Practice sandbox — synthetic data; nothing is sent or charged\nYour Friday update · week of ${weekLabel}\nThis week\nSplashback prepared and tiled.\nPhotos\nNo photos this week.\nNext week\nGrout the splashback.`;
    expect(await preview.textContent()).toBe(expectedMessage);
    await expect(main.getByRole("heading", { name: "This week", exact: true })).toHaveCount(0);
    await expect(main.getByRole("img")).toHaveCount(0);
    expect(await main.getByTestId("friday-update").innerText()).not.toMatch(/£|GBP|Fictional Tiler|private diary marker|hidden marker|other-job-photo/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: join(screenshots, `v2-k3-preview-${width}.png`), fullPage: true });
    await main.getByRole("button", { name: "Back to editing", exact: true }).click();
    const send = main.getByRole("button", { name: "Send update", exact: true });
    await send.focus(); await expect(send).toBeFocused();
    for (const button of await main.getByRole("button").all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const [sent] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith(`/api/jobs/${jobId}/friday-update`) && response.request().method() === "POST"),
      send.click(),
    ]);
    expect(sent.status()).toBe(200);
    // The seed suite also checks this response text against the persisted catcher_message.
    const delivered = await sent.json();
    expect(delivered.message).toBe(expectedMessage);
    expect(delivered.snapshot.sentAt).toBeTruthy();
    await expect(main.getByText(/sent to the practice inbox\. Sending this version again adds nothing/u)).toBeVisible();
    await expect(send).toBeDisabled();
    await page.reload();
    await expect(main.getByLabel("Week starting Monday")).toBeEnabled();
    await main.getByLabel("Week starting Monday").fill(week);
    await expect(main.getByRole("button", { name: "Send update", exact: true })).toBeDisabled();
    await expect(main.getByText("Grout the splashback.", { exact: true })).toBeVisible();
    await main.getByRole("button", { name: "Preview as the customer sees it", exact: true }).click();
    expect(await main.getByTestId("customer-message").textContent()).toBe(expectedMessage);
    expect(offOrigin).toEqual([]);
  } finally { await context.close(); }
});
