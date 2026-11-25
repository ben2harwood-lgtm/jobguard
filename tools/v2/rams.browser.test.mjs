// Q06: run against the checked V2 server, including the HTTPS phone-mode server.
// Use a production build (or devIndicators:false in the router's test config).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";

const origin = process.env.V2_TEST_ORIGIN;
assert.ok(origin && /^https?:$/u.test(new URL(origin).protocol), "Set V2_TEST_ORIGIN to the router's V2 origin");
const warning = "Prepared by JobGuard from your plan. You must check and complete it. It is not a certificate.";
let browser, storageState, jobId;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM });
  const context = await browser.newContext({ ignoreHTTPSErrors: true,
    ...(process.env.V2_TEST_STORAGE_STATE && { storageState: process.env.V2_TEST_STORAGE_STATE }) });
  try {
    const page = await context.newPage();
    await page.goto(origin + "/sign-in");
    if (!process.env.V2_TEST_STORAGE_STATE) {
      await page.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
      await page.getByLabel("What do you want to do?").selectOption("signin");
      await page.getByRole("button", { name: "Request code", exact: true }).click();
      const code = page.getByTestId("fixture-code");
      await expect(code).toHaveText(/^[0-9]{8}$/u);
      await page.getByLabel("Eight-digit code").fill(await code.textContent());
      await page.getByRole("button", { name: "Verify code", exact: true }).click();
      await page.goto(origin + "/sign-in", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "You're signed in." })).toBeVisible();
      // Enter the existing fictional practice firm through the browser's cookie path.
      const entered = await page.evaluate(async () => {
        const session = await (await fetch("/api/auth/session")).json();
        const response = await fetch("/api/auth/practice", { method: "POST", headers: {
          "content-type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ version: "linked-practice-company.v1", action: "enter" }) });
        return response.status;
      });
      assert.equal(entered, 200);
    }
    const jobs = await page.evaluate(async () => (await fetch("/api/jobs?tenantId=11111111-1111-4111-8111-111111111111")).json());
    // Use the known fictional job, never invent an ID or seed RAMS directly.
    jobId = jobs.jobs?.find(job => /splashback and hall/u.test(job.title))?.id;
    assert.ok(jobId, "The V2 splashback-and-hall seed job must exist");
    storageState = await context.storageState();
  } finally { await context.close(); }
});
after(async () => browser?.close());

for (const width of [360, 1280]) {
  test(`Q06 RAMS browser, reload and actual print PDF at ${width}px`, { timeout: 120_000 }, async () => {
    const context = await browser.newContext({ viewport: { width, height: 800 }, storageState, ignoreHTTPSErrors: true });
    const directory = await mkdtemp(join(tmpdir(), "jobguard-rams-pdf-"));
    try {
      const page = await context.newPage(), foreign = [];
      page.on("request", request => { if (new URL(request.url()).origin !== origin) foreign.push(request.url()); });
      await page.goto(`${origin}/jobs/${jobId}/rams`);
      const main = page.getByRole("main"), document = main.locator("#rams-document");
      // The test requires the router to disable Next's dev indicator, not just crop it away.
      await expect(page.locator("nextjs-portal")).toHaveCount(0);
      await expect(main.getByRole("heading", { name: "RAMS draft", exact: true })).toBeVisible();
      const generate = main.getByRole("button", { name: /^(Generate draft|Generate new draft)$/u });
      await generate.click();
      await expect(document).toContainText(warning);
      await expect(document).toContainText("Tile-cutting dust");
      await expect(document).toContainText("Occupied home");
      const sign = main.getByRole("button", { name: "Sign this version", exact: true });
      await expect(sign).toBeDisabled();
      async function edit(heading, text) {
        await main.getByRole("button", { name: `Edit ${heading}`, exact: true }).click();
        await main.getByLabel(`Unsaved edit — ${heading}`, { exact: true }).fill(text);
        await main.getByRole("button", { name: "Save section", exact: true }).click();
        await expect(main.getByLabel(`Unsaved edit — ${heading}`, { exact: true })).toHaveCount(0);
        await expect(document).toContainText(text);
      }
      await edit("Welfare", "Fictional welfare cabin and handwashing point checked.");
      await edit("Emergency contacts", "Fictional site contact and assembly point checked.");
      await main.getByLabel("Your name", { exact: true }).fill("Fictional Builder");
      await main.getByLabel("I have checked every section and completed the site-specific assessment.").check();
      await expect(sign).toBeEnabled(); await sign.click();
      await expect(document).toContainText("Signed — read-only");
      await expect(document.getByRole("button", { name: /^Edit /u })).toHaveCount(0);
      const signed = await document.innerText();
      await page.reload();
      await expect(document).toContainText("Signed — read-only");
      assert.equal(await document.innerText(), signed);
      assert.doesNotMatch(await document.innerText(), /£|pence|hidden financial|shadow signal/iu);
      assert.ok(await main.evaluate(element => element.scrollWidth <= element.clientWidth));
      if (process.env.V2_TEST_SCREENSHOTS) {
        await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: join(process.env.V2_TEST_SCREENSHOTS, `v2-k9-signed-${width}.png`), fullPage: true });
      }
      await page.pdf({ path: join(directory, "rams.pdf"), format: "A4", printBackground: true });
      const extracted = spawnSync("pdftotext", [join(directory, "rams.pdf"), join(directory, "rams.txt")], { encoding: "utf8" });
      assert.equal(extracted.status, 0, `Install/use the test host's pdftotext for the real PDF check: ${extracted.error ?? extracted.stderr}`);
      const printed = (await readFile(join(directory, "rams.txt"), "utf8")).replace(/\s+/gu, " ");
      assert.ok(printed.includes(warning));
      for (const heading of await document.getByRole("heading", { level: 2 }).allTextContents()) assert.ok(printed.includes(heading), heading);
      assert.match(printed, /Builder signature.*Signed by Fictional Builder \(membership/u);
      assert.doesNotMatch(printed, /Search jobs|BUILT FOR BUILDERS|Keep the work ready|Main navigation|Your messages|\b(?:Today|Jobs|To check|Money|More|Messages|Settings|Overview|Records)\b/u);
      assert.deepEqual(foreign, []);
    } finally { await context.close(); await rm(directory, { recursive: true, force: true }); }
  });
}
