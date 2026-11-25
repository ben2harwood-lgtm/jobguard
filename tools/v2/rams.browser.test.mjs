// Q06: run against the checked V2 server, including the HTTPS phone-mode server.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { DEMO_TENANT_ID } from "../../packages/db/dist/index.js";
import { expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";

import { launchV2Browser, signInOnce, v2Context } from "./test/browser-session.mjs";

const warning = "Prepared by JobGuard from your plan. You must check and complete it. It is not a certificate.";
let origin, browser, storageState, jobId, jobTitle, jobAddress;
before(async () => {
  browser = await launchV2Browser();
  ({ origin, storageState, jobId } = await signInOnce(browser));
  const context = await v2Context(browser, storageState, 360);
  try {
    const jobsResponse = await context.request.get(`${origin}/api/jobs?tenantId=${DEMO_TENANT_ID}`);
    assert.ok(jobsResponse.ok(), `Jobs read failed: ${jobsResponse.status()}`);
    const { jobs } = await jobsResponse.json();
    jobTitle = jobs.find(job => job.id === jobId)?.title;
    assert.ok(jobTitle, "The seeded job must have a title");
    const partiesResponse = await context.request.get(`${origin}/api/jobs/${jobId}/parties`);
    assert.ok(partiesResponse.ok(), `Parties read failed: ${partiesResponse.status()}`);
    const { current } = await partiesResponse.json();
    assert.ok(current?.site, "The seeded site address must exist");
    jobAddress = [...current.site.addressLines, current.site.town, current.site.postcode].filter(Boolean).join(", ");
  } finally { await context.close(); }
});
after(async () => browser?.close());
for (const width of [360, 1280]) {
  test(`Q06 RAMS browser, reload and actual print PDF at ${width}px`, { timeout: 120_000 }, async () => {
    const context = await v2Context(browser, storageState, width);
    const directory = await mkdtemp(join(tmpdir(), "jobguard-rams-pdf-"));
    try {
      const page = await context.newPage(), foreign = [];
      page.on("request", request => { if (new URL(request.url()).origin !== origin) foreign.push(request.url()); });
      await page.goto(`${origin}/jobs/${jobId}/rams`);
      const main = page.getByRole("main"), document = main.locator("#rams-document");
      // Content assertions stay within main; V2 next.config disables dev indicators.
      await expect(main.getByRole("heading", { name: "RAMS draft", exact: true })).toBeVisible();
      const generate = main.getByRole("button", { name: /^(Generate draft|Generate new draft)$/u });
      await generate.click();
      await expect(document).toContainText(warning);
      await expect(document).toContainText(jobTitle);
      await expect(document).toContainText(jobAddress);
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
      assert.ok(printed.includes("Emergency contacts"), "Emergency contacts must print");
      for (const heading of await document.getByRole("heading", { level: 2 }).allTextContents()) assert.ok(printed.includes(heading), heading);
      assert.ok(printed.includes(jobTitle));
      assert.ok(printed.includes(jobAddress));
      assert.match(printed, /Builder signature.*Signed by Fictional Builder on \d{1,2} [A-Z][a-z]+ \d{4} at \d{2}:\d{2}/u);
      assert.doesNotMatch(printed, /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|membership|Job reference|Plan revision/iu);
      assert.doesNotMatch(printed, /Search jobs|BUILT FOR BUILDERS|Keep the work ready|Main navigation|Your messages|\b(?:Today|Jobs|To check|Money|More|Messages|Settings|Overview|Records)\b/u);
      assert.deepEqual(foreign, []);
    } finally { await context.close(); await rm(directory, { recursive: true, force: true }); }
  });
}
