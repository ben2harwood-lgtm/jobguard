// V2-SQ-I-3: ported from #918's DUI-3.spec.ts (read only) to the V2 designed routes. Every money figure #918 asserts is asserted unchanged.
import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL } from "./global-setup";
import { jsonResult } from "./helpers/customer-invoice-journey";
import { finishDispositionsAndTerms, seedManySignals } from "./helpers/final-account-lock-journey";
import { openDesignedTab, prepareLockJobV2 as prepareLockJobDesigned } from "./helpers/designed-v2-money";

const unlocked = "JobGuard's final check runs after you complete the final account.";
const running = "Running JobGuard's final check";
const lockPanel = (page: Page) => page.getByTestId("final-account-lock");
const reveal = (page: Page) => page.getByTestId("final-check-reveal");
const complete = (page: Page) => lockPanel(page).getByRole("button", { name: "Complete final account", exact: true });
const lockPath = (jobId: string) => `/api/jobs/${jobId}/final-account/lock`;
const lockView = (page: Page, jobId: string) => jsonResult(page.request.get(lockPath(jobId)), "Read persisted lock");

test.setTimeout(300_000);

async function checkDesigned(page: Page, control: Locator) {
  await expect(control).toBeVisible();
  await expect(control).toHaveClass(/\bbtn\b/u);
  await expect(control.locator("xpath=ancestor::*[contains(concat(' ',normalize-space(@class),' '),' jgd-legacy ')]")).toHaveCount(0);
  const box = (await control.boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

async function expectHidden(page: Page, status: string) {
  await expect(reveal(page).getByTestId("final-check-status")).toHaveText(status);
  await expect(page.getByTestId("final-check-item")).toHaveCount(0);
  await expect(page.getByTestId("final-check-post-lock")).toHaveCount(0);
  await expect(page.getByTestId("final-check-disputes")).toHaveCount(0);
  await expect(reveal(page)).not.toContainText(/heated towel rail|Synthetic held extra|found \d/u);
}

// V2-SQ-I-3: designed, the lock-bound invoices sit on Money (not inside the Work lock panel), so check
// them there and come back to Work for the declaration and reveal steps.
async function expectInvoiceRefusal(page: Page, jobId: string, code: string) {
  await openDesignedTab(page, "Money");
  const invoices = page.getByTestId("lock-bound-invoices");
  await expect(invoices.getByRole("alert")).toHaveAttribute("data-error-code", code);
  const { account } = await lockView(page, jobId);
  for (const invoiceKind of ["final", "supplementary"]) {
    await expect(invoices.getByRole("button", { name: `Issue ${invoiceKind} invoice`, exact: true })).toBeDisabled();
    const refusal = await page.request.post(lockPath(jobId), { data: {
      version: "lock-bound-invoice.issue.v1", commandId: randomUUID(), finalAccountRevisionId: account.id,
      expectedSourceHash: account.sourceHash, invoiceKind, recipient: "practice@example.invalid", issuedOn: "2026-11-23",
    } });
    expect(refusal.status()).toBe(400);
    expect((await refusal.json()).code).toBe(code);
  }
  await page.goto(`/jobs/${jobId}/work#final-check`);
}

async function screenshot(info: TestInfo, name: string, anchor: Locator) {
  await anchor.evaluate(el => window.scrollBy({ top: el.getBoundingClientRect().top - 60, behavior: "instant" }));
  await anchor.page().screenshot({ path: `test-results/V2-DUI-3-${info.project.name}-${name}.png`, animations: "disabled", style: "nextjs-portal { visibility: hidden; }" });
}

test("V2-DUI-3: designed declaration, saved processing, evidence and one confirmed catch", async ({ page }, info) => {
  const jobId = await prepareLockJobDesigned(page, async () => {
    const message = "Hi, yes please go ahead and fit the heated towel rail as well. 180 pounds is fine. Thanks.";
    const messages = page.getByTestId("customer-messages");
    await messages.getByLabel("Made-up customer name").fill("Fictional Alex");
    await messages.getByLabel("Message", { exact: true }).fill(message);
    await messages.getByRole("button", { name: "Save message", exact: true }).click();
    await expect(messages.getByTestId("customer-message")).toContainText(message);
    const note = "Customer asked for an extra heated towel rail while we were on site. Agreed 180 pounds. Fitted it today.";
    const diary = page.getByTestId("job-diary");
    await diary.getByLabel("Note", { exact: true }).fill(note);
    await diary.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(diary.getByTestId("diary-entry")).toContainText(note);
  });
  const read = (suffix: string) => jsonResult(page.request.get(`/api/jobs/${jobId}/${suffix}`), suffix);
  const check = reveal(page);
  const panel = lockPanel(page);
  await checkDesigned(page, complete(page));
  await expectHidden(page, unlocked);
  expect(await read("final-check")).toEqual({ state: "unlocked", items: [], message: null });
  await expectInvoiceRefusal(page, jobId, "FINAL_ACCOUNT_LOCK_REQUIRED");
  await expect(complete(page)).toBeDisabled();
  await expect(page.getByTestId("final-net")).toHaveText("£200.00");
  await expect(page.getByTestId("final-gross")).toHaveText("£240.00");
  await screenshot(info, "final-account", page.locator("#final-account-title"));
  await finishDispositionsAndTerms(page);
  const declaration = panel.getByText("I've reviewed the work and extras on this job and this is my complete final account.", { exact: true });
  await expect(declaration).toBeVisible();
  await screenshot(info, "declaration", info.project.name === "mobile-360" ? declaration : panel);
  // Keyboard traversal reaches the same action and keeps the design focus ring.
  await complete(page).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(complete(page)).toBeFocused();
  await expect(complete(page)).toHaveCSS("outline-width", "3px");

  const lockWrites: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === lockPath(jobId) && request.method() === "POST"
      && request.postDataJSON().version === "final-account.lock.v1") lockWrites.push(request.postDataJSON().commandId);
  });
  await complete(page).dblclick();
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");
  expect(lockWrites).toHaveLength(1);
  const savedLock = (await lockView(page, jobId)).lock;
  expect(savedLock.finalAccountRevisionId).toBe((await read("final-account")).account.id);

  const work = `/jobs/${jobId}/work`;
  await page.goto(`${work}#final-check`);
  await expect(check).toBeFocused();
  await expect(check.getByTestId("final-check-item")).toHaveCount(1, { timeout: 180_000 });
  const item = check.getByTestId("final-check-item");
  await expect(check.getByTestId("final-check-status")).toContainText("found 1 thing");
  await expect(item.getByRole("heading", { name: "heated towel rail", exact: true })).toBeVisible();
  await expect(item.getByTestId("final-check-estimate")).toHaveText("Estimated extra: £180.00");
  await expect(item.getByRole("listitem")).toHaveCount(2);
  await expect(item).toContainText("no match found");
  await expect(item.getByRole("button", { name: "Save answer", exact: true })).toBeDisabled();
  await openDesignedTab(page, "Money");
  await expect(page.getByTestId("lock-bound-invoices").getByRole("button", { name: "Issue final invoice", exact: true })).toBeEnabled();
  await page.goto(`${work}#final-check`);
  await expect(check.getByTestId("final-check-item")).toHaveCount(1);
  await screenshot(info, "results", item);
  const confirm = item.getByRole("button", { name: "Yes — this was extra work", exact: true });
  await checkDesigned(page, confirm);
  let catchWrites = 0;
  page.on("request", request => {
    if (request.url().endsWith("/final-check/catches") && request.method() === "POST") catchWrites++;
  });
  await confirm.dblclick();
  await expect(item.getByTestId("final-check-disposition")).toContainText("added to your extras as a draft");
  expect(catchWrites).toBe(1);
  const catches = (await read("variations")).variations.filter((v: { description: string }) => v.description === "heated towel rail");
  expect(catches).toHaveLength(1);
  expect(catches[0]).toMatchObject({ state: "draft", currentRevisionId: null });
  expect((await lockView(page, jobId)).lock).toEqual(savedLock);
  expect((await read("customer-invoices")).invoices).toHaveLength(0);

  await page.reload();
  await expect(item.getByTestId("final-check-disposition")).toContainText("added to your extras as a draft");
  await expect(page.getByTestId(`variation-${catches[0].id}`).getByRole("button", { name: "Change price", exact: true })).toBeVisible();
  await screenshot(info, "confirmed-catch", item);
});

test("V2-DUI-3: zero and many held signals have identical unlocked and incomplete views", async ({ page, browser }, info) => {
  const other = await browser.newContext({ viewport: page.viewportSize()! });
  const snapshots = [];
  try {
    for (const [contextPage, hasSignals] of [[page, false], [await other.newPage(), true]] as const) {
      const jobId = await prepareLockJobDesigned(contextPage, async id => {
        const result = await jsonResult(contextPage.request.post(`/api/jobs/${id}/supplier-documents/intake`, { data: {
          version: "supplier-document-intake.v1", commandId: randomUUID(), fixtureId: "unreadable",
          channel: "picker", expectedRevision: 0,
        } }), "Hold an unreadable pre-lock source");
        expect(result.result).toBe("held");
        if (hasSignals) {
          const admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
          try {
            const { tenant_id, id: evidenceId } = (await admin.query(
              "SELECT tenant_id, id FROM app.evidence_object WHERE job_id=$1 ORDER BY server_received_at LIMIT 1", [id],
            )).rows[0];
            await seedManySignals(tenant_id, id, evidenceId);
          } finally { await admin.end(); }
        }
      });
      const requests: string[] = [];
      contextPage.on("request", request => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith(`/api/jobs/${jobId}/final-check`)) requests.push(path.slice(`/api/jobs/${jobId}`.length));
      });
      await contextPage.reload();
      await expectHidden(contextPage, unlocked);
      await expect(reveal(contextPage)).toHaveAttribute("aria-busy", "false");
      expect([...new Set(requests)]).toEqual(["/final-check"]);
      const before = await reveal(contextPage).innerText();
      expect(await jsonResult(contextPage.request.get(`/api/jobs/${jobId}/final-check`), "Read unlocked check"))
        .toEqual({ state: "unlocked", items: [], message: null });
      await finishDispositionsAndTerms(contextPage);
      await complete(contextPage).click();
      await expect(lockPanel(contextPage).getByTestId("lock-state")).toHaveText("Final account completed");
      await contextPage.goto(`/jobs/${jobId}/work#final-check`);
      await expectHidden(contextPage, running);
      await expect(lockPanel(contextPage).getByTestId("final-check-state")).toHaveText(running);
      await expectInvoiceRefusal(contextPage, jobId, "FINAL_CHECK_NOT_COMPLETE");
      const pending = await jsonResult(contextPage.request.get(`/api/jobs/${jobId}/final-check`), "Read incomplete check");
      expect(pending).toMatchObject({ state: "pending", items: [] });
      const after = await reveal(contextPage).innerText();
      snapshots.push({ before, after });
      if (!hasSignals) {
        await screenshot(info, "processing", reveal(contextPage));
        await screenshot(info, "locked", lockPanel(contextPage));
      }
    }
    expect(snapshots[1]).toEqual(snapshots[0]);
  } finally { await other.close(); }
});

test("V2-DUI-3: priced and unpriced final-review extras require separate acknowledgement", async ({ page }) => {
  const jobId = await prepareLockJobDesigned(page);
  const panel = lockPanel(page);
  await finishDispositionsAndTerms(page);
  const add = panel.getByRole("button", { name: "Add final-review extra", exact: true });
  const description = panel.getByLabel("Final-review extra description");
  const price = panel.getByLabel("Final-review extra price (£, optional)");
  await description.fill("Fictional priced extra");
  await price.fill("invalid");
  await add.click();
  await expect(panel.getByTestId("final-account-lock-error")).toHaveText("INVALID_FINAL_ACCOUNT_LOCK_INPUT");
  await expect(panel.getByTestId("final-account-lock-error")).toBeFocused();
  await price.fill("220");
  await add.click();
  const waiting = panel.getByRole("region", { name: "Extras not on this bill yet" });
  await expect(waiting).toContainText("£220.00 — not approved yet");
  await description.fill("Fictional unpriced extra");
  await add.click();
  await expect(waiting).toContainText("Needs a price");
  const { account, captures } = await lockView(page, jobId);
  const priced = captures.find((capture: { description: string }) => capture.description === "Fictional priced extra");
  await waiting.locator(`a[href="#variation-${priced.id}"]`).click();
  await expect(page.getByTestId(`variation-${priced.id}`)).toBeFocused();
  await page.goto(`/jobs/${jobId}/work#final-account-title`);
  const acknowledgements = waiting.getByRole("checkbox");
  await expect(acknowledgements).toHaveCount(2);
  await expect(complete(page)).toBeDisabled();
  await acknowledgements.first().check();
  await expect(complete(page)).toBeDisabled();
  await acknowledgements.last().check();
  await expect(complete(page)).toBeEnabled();
  await complete(page).click();
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");
  const locked = await lockView(page, jobId);
  expect(locked.lock.finalAccountRevisionId).toBe(account.id);
  expect(locked.account.totals.net).toEqual(account.totals.net);
  expect(locked.captures).toEqual(expect.arrayContaining([
    expect.objectContaining({ description: "Fictional priced extra", state: "priced", netPence: 22000 }),
    expect.objectContaining({ description: "Fictional unpriced extra", state: "draft", netPence: null }),
  ]));
});
