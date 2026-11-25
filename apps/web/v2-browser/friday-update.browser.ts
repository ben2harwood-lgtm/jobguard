import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
// One browser sign-in and one linked practice session serve both viewports.
test("K3 preview/edit/send survives reload at 360 and 1280 with no customer leaks", async ({ page }) => {
  test.setTimeout(120000);
  const origin = process.env.V2_TEST_ORIGIN;
  if (!origin) throw new Error("V2_TEST_ORIGIN required; run with playwright.v2-k3.config.ts");
  await page.goto("/sign-in");
  await page.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
  await page.getByLabel("What do you want to do?").selectOption("signin");
  await page.getByRole("button", { name: "Request code", exact: true }).click();
  const code = page.getByTestId("fixture-code");
  await expect(code).toHaveText(/^[0-9]{8}$/u);
  await page.getByLabel("Eight-digit code").fill((await code.textContent())!);
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You're signed in." })).toBeVisible();
  const jobId = await page.evaluate(async () => {
    const session = await (await fetch("/api/auth/session")).json();
    const enter = await fetch("/api/auth/practice", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
      body: JSON.stringify({ version: "linked-practice-company.v1", action: "enter" }) });
    if (!enter.ok) throw new Error("Practice entry failed");
    const result = await (await fetch("/api/jobs?tenantId=11111111-1111-4111-8111-111111111111")).json();
    const job = result.jobs.find((item: { title: string }) => item.title.includes("Occupied-home kitchen splashback and hall decorating"));
    if (!job) throw new Error("V2 seed job missing");
    return job.id as string;
  });
  const offOrigin: string[] = [];
  page.on("request", request => { if (new URL(request.url()).origin !== origin) offOrigin.push(request.url()); });
  await mkdir("test-results", { recursive: true });
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/jobs/${jobId}/friday-update`);
    const main = page.getByRole("main");
    await expect(main.getByTestId("friday-update")).toBeVisible();
    // A production build, or devIndicators:false, is required; an overlay is a failed test setup.
    await expect(page.locator("nextjs-portal")).toHaveCount(0);
    await expect(main.getByText("Practice sandbox — synthetic data; nothing is sent or charged", { exact: true })).toBeVisible();
    await expect(main.getByLabel("Week starting Monday")).toBeEnabled();
    await main.getByLabel("Week starting Monday").fill(width === 360 ? "2027-01-11" : "2027-01-18");
    const prepare = main.getByRole("button", { name: "Prepare update", exact: true });
    await expect(prepare).toBeEnabled(); await prepare.click();
    await expect(main.getByRole("button", { name: "Edit text", exact: true })).toBeEnabled();
    await main.getByRole("button", { name: "Edit text", exact: true }).click();
    await main.getByLabel("This week text").fill("Splashback prepared and tiled.");
    await main.getByLabel("Next week text").fill("Grout the splashback.");
    await main.getByRole("button", { name: "Save text", exact: true }).click();
    await expect(main.getByText("Splashback prepared and tiled.", { exact: true })).toBeVisible();
    await page.reload();
    // The route defaults to this week; select the same saved week after reopening.
    await main.getByLabel("Week starting Monday").fill(width === 360 ? "2027-01-11" : "2027-01-18");
    await expect(main.getByText("Splashback prepared and tiled.", { exact: true })).toBeVisible();
    await main.getByRole("button", { name: "Preview as the customer sees it", exact: true }).click();
    await expect(main.getByRole("heading", { name: "Your Friday update", exact: true })).toBeVisible();
    await expect(main.getByText("No photos this week.", { exact: true })).toBeVisible();
    await expect(main.getByRole("img")).toHaveCount(0);
    const content = main.getByTestId("friday-update");
    expect(await content.innerText()).not.toMatch(/£|GBP|Fictional Tiler|private diary marker|hidden marker|other-job-photo/u);
    await main.getByRole("button", { name: "Back to editing", exact: true }).click();
    const send = main.getByRole("button", { name: "Send update", exact: true });
    await send.focus(); await expect(send).toBeFocused();
    expect((await send.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/v2-k3-preview-${width}.png`, fullPage: true });
    await send.click();
    await expect(main.getByText(/sent to the practice inbox\. Sending this version again adds nothing/u)).toBeVisible();
    await expect(send).toBeDisabled();
    await page.reload();
    await main.getByLabel("Week starting Monday").fill(width === 360 ? "2027-01-11" : "2027-01-18");
    await expect(main.getByRole("button", { name: "Send update", exact: true })).toBeDisabled();
    await expect(main.getByText("Grout the splashback.", { exact: true })).toBeVisible();
  }
  expect(offOrigin).toEqual([]);
});
