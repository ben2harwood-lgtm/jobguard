import { expect, test, type BrowserContext } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const origin = process.env.V2_TEST_ORIGIN!;
if (!origin || new URL(origin).protocol !== "https:") throw new Error("V2_TEST_ORIGIN must name the launcher's HTTPS phone origin");
const screenshots = process.env.V2_TEST_SCREENSHOTS ?? "test-results";
let storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
let jobId: string;

// Copied K3's named V2-BH1 pattern (2ce5299f); the shared helper is not on this base.
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
    // The signed-in workspace's own tenant (as BH1 and WALK-3.spec.ts do), not a fixture import.
    const jobs = await page.evaluate(async () => {
      const session = await fetch("/api/session");
      if (!session.ok) throw new Error(`session:${session.status}`);
      const tenantId = (await session.json()).tenants?.[0]?.id;
      if (!tenantId) throw new Error("session:no-tenant");
      const response = await fetch(`/api/jobs?tenantId=${encodeURIComponent(tenantId)}`);
      if (!response.ok) throw new Error(`jobs:${response.status}`);
      return (await response.json()).jobs;
    });
    jobId = jobs.find((job: { title: string }) => job.title.includes("Occupied-home kitchen splashback and hall decorating"))?.id;
    expect(jobId).toBeTruthy();
    storageState = await context.storageState();
    await mkdir(screenshots, { recursive: true });
  } finally { await context.close(); }
});

declare global {
  interface Window {
    fridayProbe: { shared: string[]; copied: string[]; failure: string; canShare: boolean };
  }
}

for (const width of [360, 1280]) test(`K1 shares only the sent text at ${width}`, async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true, storageState });
  try {
    // Only the OS share sheet and clipboard are faked; all JobGuard paths are real.
    await context.addInitScript(() => {
      const probe = { shared: [] as string[], copied: [] as string[], failure: "", canShare: true };
      window.fridayProbe = probe;
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => probe.canShare });
      Object.defineProperty(navigator, "share", { configurable: true, value: async ({ text }: ShareData) => {
        if (probe.failure) throw new DOMException("Test share refusal", probe.failure);
        probe.shared.push(text!);
      } });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        writeText: async (text: string) => { probe.copied.push(text); },
      } });
    });
    const page = await context.newPage();
    const offOrigin: string[] = [];
    page.on("request", request => { if (new URL(request.url()).origin !== origin) offOrigin.push(request.url()); });
    const week = width === 360 ? "2027-02-01" : "2027-02-08";
    await page.goto(`${origin}/jobs/${jobId}/friday-update`);
    const main = page.getByRole("main");
    const section = main.getByRole("region", { name: "Share sent Friday update" });
    await expect(main.getByLabel("Week starting Monday")).toBeEnabled();
    await main.getByLabel("Week starting Monday").fill(week);
    await expect(main.getByRole("button", { name: "Prepare update", exact: true })).toBeEnabled();
    await expect(section).toHaveCount(0);
    await main.getByRole("button", { name: "Prepare update", exact: true }).click();
    const send = main.getByRole("button", { name: "Send update", exact: true });
    await expect(send).toBeEnabled();
    await expect(section).toHaveCount(0);
    const [sent] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith(`/api/jobs/${jobId}/friday-update`) && response.request().method() === "POST"),
      send.click(),
    ]);
    expect(sent.status()).toBe(200);
    const { message, snapshot } = await sent.json();
    expect(snapshot.sentAt).toBeTruthy();
    expect(message.startsWith("Practice sandbox — synthetic data; nothing is sent or charged\n")).toBe(true);
    const share = section.getByRole("button", { name: "Share", exact: true });
    await expect(share).toBeVisible();
    await share.click();
    expect(await page.evaluate(() => window.fridayProbe.shared)).toEqual([message]);
    await page.evaluate(() => { window.fridayProbe.failure = "AbortError"; });
    await share.click();
    await expect(share).toBeEnabled();
    await expect(section.getByRole("status")).toHaveCount(0);
    await expect(section.getByRole("button", { name: "Copy text", exact: true })).toHaveCount(0);
    await page.evaluate(() => { window.fridayProbe.failure = "NotAllowedError"; });
    await share.click();
    await expect(section.getByRole("status")).toHaveText("Sharing didn't work. Copy the text instead.");
    const copy = section.getByRole("button", { name: "Copy text", exact: true });
    await copy.focus(); await expect(copy).toBeFocused();
    await copy.click();
    expect(await page.evaluate(() => window.fridayProbe.copied)).toEqual([message]);
    await expect(section.getByRole("status")).toHaveText("Text copied.");
    const whatsapp = section.getByRole("link", { name: "Open WhatsApp", exact: true });
    await expect(whatsapp).toHaveAttribute("href", `https://wa.me/?text=${encodeURIComponent(message)}`);
    await expect(whatsapp).toHaveAttribute("target", "_blank");
    await expect(whatsapp).toHaveAttribute("rel", "noreferrer");
    for (const control of [copy, whatsapp]) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: join(screenshots, `v2-k1-fallback-${width}.png`), fullPage: true });
    await page.reload();
    await expect(main.getByLabel("Week starting Monday")).toBeEnabled();
    await main.getByLabel("Week starting Monday").fill(week);
    await expect(section.getByRole("button", { name: "Share", exact: true })).toBeVisible();
    await main.getByRole("button", { name: "Preview as the customer sees it", exact: true }).click();
    expect(await main.getByTestId("customer-message").textContent()).toBe(message);
    await page.screenshot({ path: join(screenshots, `v2-k1-native-${width}.png`), fullPage: true });
    // With canShare false, a newly mounted sent snapshot offers fallback immediately.
    await page.evaluate(() => { window.fridayProbe.canShare = false; });
    await main.getByRole("button", { name: "Back to editing", exact: true }).click();
    await main.getByRole("button", { name: "Edit text", exact: true }).click();
    await main.getByRole("button", { name: "Save text", exact: true }).click();
    await expect(section).toHaveCount(0);
    await expect(send).toBeEnabled();
    await send.click();
    await expect(copy).toBeVisible();
    await expect(share).toHaveCount(0);
    expect(offOrigin).toEqual([]);
  } finally { await context.close(); }
});

