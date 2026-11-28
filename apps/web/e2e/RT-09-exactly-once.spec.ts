import { randomUUID } from "node:crypto";
import { expect, test, type Page, type Route } from "@playwright/test";
import type { CaptureWorkspaceResponse } from "@jobguard/api/capture-contracts";

// HEAD_UNDER_TEST=49755b620ccf0223e64575006cd4590c77595ca2.
// Actual screen components in Chromium. Route doubles model committed replies,
// response loss and typed revision conflicts; API/PostgreSQL proof is in the API suite.
const tenant = "11111111-1111-4111-8111-111111111111";
const words = "Fictional kitchen. Fit shelves £200.00.";
const changed = "Fit shelves and brackets";
const send = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
async function fixture(page: Page) {
  const jobs = new Map<string, CaptureWorkspaceResponse>();
  const captures: { captureId: string; source: { text: string } }[] = [];
  const requests: { action: string; body: any }[] = [];
  let dropCapture = false, dropSave = false, dropConfirm = false;
  let captureGate: Promise<void> | undefined, saveGate: Promise<void> | undefined, confirmGate: Promise<void> | undefined;
  let effects = 0;
  await page.addInitScript(() => {
    localStorage.setItem("jobguard-tour-complete-v1", "yes");
    (window as any).__JOBGUARD_SPEECH_ADAPTER__ = { configuration: { language: "en-GB", processLocally: true, remoteFallback: false },
      available: async () => "unavailable", install: async () => false, start: () => ({ stop() {}, cancel() {} }) };
  });
  await page.context().route("**/api/**", async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (path === "/api/session") return send(route, { version: 1, principal: { displayName: "Fictional builder" }, tenants: [{ id: tenant, name: "Fictional firm" }] });
    if (path === "/api/jobs") return send(route, { version: 1, tenantId: tenant, jobs: [] });
    if (path === "/api/decisions") return send(route, { counts: { mandatory: 0, advisory: 0, pending: 0 }, decisions: [] });
    if (path === "/api/jobs/capture") {
      const body = route.request().postDataJSON(); captures.push(body);
      if (!jobs.has(body.captureId)) {
        const lineId = randomUUID(), scopeItemId = randomUUID();
        jobs.set(body.captureId, { version: 1, environment: "synthetic_demo", captureId: body.captureId, jobId: randomUUID(),
          proposalId: randomUUID(), reviewId: randomUUID(), source: { kind: body.source.kind, text: body.source.text, version: 1, acquisition: body.source.acquisition ?? null, audioByteLength: 0 },
          proposal: { title: "Fictional kitchen", lines: [{ id: lineId, scopeItemId, description: { value: "Fit shelves" }, quantity: { value: "1" }, unit: { value: "item" },
            unitPricePence: { value: 20000 }, room: "Kitchen", category: "Carpentry", sourceExcerpt: words }], questions: [] }, review: null, status: "draft" });
      }
      await captureGate;
      if (dropCapture) { dropCapture = false; return route.abort("failed"); }
      return send(route, jobs.get(body.captureId), 201);
    }
    const match = /^\/api\/jobs\/([^/]+)\/(review|confirm|proposal)$/u.exec(path);
    if (match) {
      const current = [...jobs.values()].find(job => job.jobId === match[1])!;
      if (match[2] === "proposal") return send(route, current);
      const body = route.request().postDataJSON(); requests.push({ action: match[2]!, body });
      if (body.expectedRevision !== (current.review?.revision ?? 0) || current.status !== "draft") return send(route, { code: "REVIEW_REVISION_CONFLICT" }, 409);
      if (match[2] === "review") {
        current.review = { ...body.review, revision: body.expectedRevision + 1 };
        await saveGate;
        if (dropSave) { dropSave = false; return route.abort("failed"); }
      } else {
        current.status = "quoting"; effects++;
        await confirmGate;
        if (dropConfirm) { dropConfirm = false; return route.abort("failed"); }
      }
      return send(route, current);
    }
    return send(route, { code: "NOT_FOUND" }, 404);
  });
  async function open(designed = false, target = page) {
    await target.goto(designed ? "/jobs/new" : "/classic");
    if (!designed) await target.getByRole("button", { name: "＋ Start a new job", exact: true }).click();
    await target.locator("#walk-source").fill(words);
  }
  async function review(target = page) {
    await open(false, target); await target.getByRole("button", { name: "Make my draft", exact: true }).click();
    await target.getByRole("button", { name: "Check and edit my draft", exact: true }).click();
    await expect(target.getByLabel("Description Fit shelves", { exact: true })).toHaveValue("Fit shelves");
    await target.getByRole("button", { name: "Accept Fit shelves", exact: true }).click();
  }
  const gate = (action: "capture" | "save" | "confirm") => {
    let release!: () => void;
    const promise = new Promise<void>(resolve => { release = resolve; });
    if (action === "capture") captureGate = promise;
    if (action === "save") saveGate = promise;
    if (action === "confirm") confirmGate = promise;
    return release;
  };
  return { jobs, captures, requests, open, review, gate, effects: () => effects,
    drop: (action: "capture" | "save" | "confirm") => { if (action === "capture") dropCapture = true; if (action === "save") dropSave = true; if (action === "confirm") dropConfirm = true; } };
}
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test("RT-09-B01 slow capture double-tap has one request and preserves words", async ({ page }) => {
  const f = await fixture(page); await f.open(); const release = f.gate("capture");
  try {
    await button(page, "Make my draft").evaluate(b => { (b as HTMLButtonElement).click(); (b as HTMLButtonElement).click(); });
    await expect.poll(() => f.captures.length).toBe(1);
    await expect(button(page, "Make my draft")).toBeDisabled();
    await expect(page.locator("#walk-source")).toHaveValue(words);
    await page.waitForTimeout(10_000); // Site latency: allow another tap while the same request is outstanding.
    expect(f.captures).toHaveLength(1);
  } finally { release(); }
  await expect(button(page, "Check and edit my draft")).toBeVisible(); expect(f.jobs.size).toBe(1);
});

test("RT-09-B02 RV4-01 reload after lost capture reply retains identity on designed screen", async ({ page }) => {
  const f = await fixture(page); f.drop("capture"); await f.open(true);
  await button(page, "Make my draft").click(); await expect(page.getByText(/We could not make the draft/u)).toBeVisible();
  await page.reload(); await page.locator("#walk-source").fill(words);
  await button(page, "Make my draft").click(); await expect(button(page, "Check and edit my draft")).toBeVisible();
  expect(f.captures).toHaveLength(2); expect(f.captures[0]!.captureId).toBe(f.captures[1]!.captureId); expect(f.jobs.size).toBe(1);
});

test("RT-09-B03 lost capture reply retry in the same mounted screen recovers one job", async ({ page }) => {
  const f = await fixture(page); await f.open(); f.drop("capture");
  await button(page, "Make my draft").click(); await expect(page.getByText(/We could not make the draft/u)).toBeVisible();
  await button(page, "Make my draft").click(); await expect(button(page, "Check and edit my draft")).toBeVisible();
  expect(f.captures).toHaveLength(2); expect(new Set(f.captures.map(r => r.captureId)).size).toBe(1); expect(f.jobs.size).toBe(1);
});

test("RT-09-B04 slow Save double-tap locks the form and submits one edit", async ({ page }) => {
  const f = await fixture(page); await f.review(); const release = f.gate("save");
  await page.getByLabel("Description Fit shelves", { exact: true }).fill(changed);
  try {
    await button(page, "Save review").evaluate(b => { (b as HTMLButtonElement).click(); (b as HTMLButtonElement).click(); });
    await expect.poll(() => f.requests.length).toBe(1);
    await expect(page.getByLabel(`Description ${changed}`, { exact: true })).toBeDisabled();
    await expect(button(page, "Confirm scope")).toBeDisabled();
  } finally { release(); }
  await expect(page.getByText("Review saved. Your source and choices will be here after reload.")).toBeVisible();
  expect([...f.jobs.values()][0]!.review!.lines[0]!.description).toBe(changed);
});

test("RT-09-B05 RV4-02 slow Confirm double-tap holds the lock through both requests", async ({ page }) => {
  const f = await fixture(page); await f.review(); const release = f.gate("confirm");
  try {
    await button(page, "Confirm scope").evaluate(b => { (b as HTMLButtonElement).click(); (b as HTMLButtonElement).click(); });
    await expect.poll(() => f.requests.map(r => r.action)).toEqual(["review", "confirm"]);
    await expect(page.getByLabel("Description Fit shelves", { exact: true })).toBeDisabled();
    await expect(button(page, "← Walk the job")).toBeDisabled();
  } finally { release(); }
  await expect(page.getByTestId("confirmed-line-count")).toHaveText("1"); expect(f.effects()).toBe(1);
});

test("RT-09-B06 stale Save shows conflict and preserves the losing tab's local words", async ({ page }) => {
  const f = await fixture(page); await f.review();
  const job = [...f.jobs.values()][0]!;
  // A competing tab has saved before this tab's first Save.
  job.review = { version: "proposal_review_v1", reviewId: job.reviewId, proposalId: job.proposalId, jobId: job.jobId, revision: 1, lines: [], questions: [] };
  await page.getByLabel("Description Fit shelves", { exact: true }).fill(changed);
  await button(page, "Save review").click();
  await expect(page.getByRole("alert").filter({ hasText: "This draft changed. Review the latest version." })).toBeVisible();
  await expect(page.getByLabel(`Description ${changed}`, { exact: true })).toHaveValue(changed);
  expect(f.effects()).toBe(0); expect(job.review.revision).toBe(1);
});

test("RT-09-B07 stale Confirm cannot promote another tab's revision", async ({ page }) => {
  const f = await fixture(page); await f.review(); const release = f.gate("save");
  await button(page, "Confirm scope").click();
  await expect.poll(() => f.requests.length).toBe(1);
  // Commit by another tab after this Save response's revision was chosen.
  // The response must remain revision 1, so intercept confirm itself as stale.
  await page.route("**/api/jobs/*/confirm", route => send(route, { code: "REVIEW_REVISION_CONFLICT" }, 409));
  release();
  await expect(page.getByRole("alert").filter({ hasText: "This draft changed. Review the latest version." })).toBeVisible();
  await expect(page.getByLabel("Description Fit shelves", { exact: true })).toHaveValue("Fit shelves"); expect(f.effects()).toBe(0);
});

test("RT-09-B08 lost Save reply retry conflicts clearly and retains both local and stored edit", async ({ page }) => {
  const f = await fixture(page); await f.review(); await page.getByLabel("Description Fit shelves", { exact: true }).fill(changed); f.drop("save");
  await button(page, "Save review").click(); await expect(page.getByRole("alert").filter({ hasText: "could not be saved" })).toBeVisible();
  await button(page, "Save review").click(); await expect(page.getByRole("alert").filter({ hasText: "This draft changed" })).toBeVisible();
  await expect(page.getByLabel(`Description ${changed}`, { exact: true })).toHaveValue(changed);
  expect([...f.jobs.values()][0]!.review!.lines[0]!.description).toBe(changed); expect(f.effects()).toBe(0);
});

test("RT-09-B09 lost Confirm reply retry cannot duplicate canonical scope", async ({ page }) => {
  const f = await fixture(page); await f.review(); f.drop("confirm");
  await button(page, "Confirm scope").click(); await expect(page.getByRole("alert").filter({ hasText: "Scope was not confirmed" })).toBeVisible();
  await button(page, "Confirm scope").click(); await expect(page.getByRole("alert").filter({ hasText: "This draft changed" })).toBeVisible();
  expect(f.effects()).toBe(1); expect([...f.jobs.values()][0]!.status).toBe("quoting");
});

test("RT-09-B10 RV4-03 invalid price blocks Save and Confirm without erasing text", async ({ page }) => {
  const f = await fixture(page); await f.review();
  await page.getByLabel("Price Fit shelves", { exact: true }).fill("250.001");
  await expect(button(page, "Save review")).toBeDisabled(); await expect(button(page, "Confirm scope")).toBeDisabled();
  await expect(page.getByLabel("Price Fit shelves", { exact: true })).toHaveValue("250.001"); expect(f.requests).toHaveLength(0);
});

test("RT-09-B11 back from review retains an unsaved added work clause", async ({ page }) => {
  const f = await fixture(page); await f.review(); await page.getByLabel("Description Fit shelves", { exact: true }).fill(changed);
  const reviewUrl = page.url();
  await button(page, "← Walk the job").click(); await page.goto(reviewUrl);
  await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
  await expect(page.getByLabel(`Description ${changed}`, { exact: true })).toHaveValue(changed);
});

test("RT-09-B12 completed save is retained when navigating back into the same review", async ({ page }) => {
  const f = await fixture(page); await f.review(); await page.getByLabel("Description Fit shelves", { exact: true }).fill(changed);
  await button(page, "Save review").click(); await expect(page.getByText("Review saved. Your source and choices will be here after reload.")).toBeVisible();
  const reviewUrl = page.url();
  await button(page, "← Walk the job").click(); await page.goto(reviewUrl);
  await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
  await expect(page.getByLabel(`Description ${changed}`, { exact: true })).toHaveValue(changed);
});

test("RT-09-B13 reload mid-review retains the added unsaved work clause", async ({ page }) => {
  const f = await fixture(page); await f.review();
  await page.getByLabel("Description Fit shelves", { exact: true }).fill(changed);
  await page.reload(); await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
  await expect(page.getByLabel(`Description ${changed}`, { exact: true })).toHaveValue(changed);
});

async function speech(page: Page) {
  await page.addInitScript(() => {
    (window as any).__JOBGUARD_SPEECH_ADAPTER__ = { configuration: { language: "en-GB", processLocally: true, remoteFallback: false },
      available: async () => "installed", install: async () => true,
      start: (callbacks: unknown) => { (window as any).__rt09Speech = callbacks; return { stop() { (callbacks as { end(): void }).end(); }, cancel() {} }; } };
  });
}

test("RT-09-B14 permission loss retains completed spoken words", async ({ page }) => {
  const f = await fixture(page); await speech(page); await f.open();
  await button(page, "Talk through a quote").click();
  await page.evaluate(text => { (window as any).__rt09Speech.final(text, "segment-1"); }, words);
  await expect(page.getByLabel("Words to review", { exact: true })).toHaveValue(words);
  await page.evaluate(() => (window as any).__rt09Speech.error("not-allowed"));
  await expect(page.getByLabel("Words to review", { exact: true })).toHaveValue(words);
  await button(page, "Use these words").click(); await expect(page.locator("#walk-source")).toHaveValue(words);
});

test("RT-09-B15 RV4-04 cancel second recording restores first words and provenance", async ({ page }) => {
  const f = await fixture(page); await speech(page); await f.open();
  await button(page, "Talk through a quote").click();
  await page.evaluate(text => (window as any).__rt09Speech.final(text, "first"), words);
  await button(page, "Stop listening").click(); await button(page, "Talk through a quote").click();
  await page.evaluate(() => { (window as any).__rt09Speech.final("and fit brackets", "second"); (window as any).__rt09Speech.interim("then paint"); });
  await button(page, "Cancel dictation").click();
  await expect(page.getByLabel("Words to review", { exact: true })).toHaveValue(words);
  await button(page, "Use these words").click(); await button(page, "Make my draft").click();
  await expect(button(page, "Check and edit my draft")).toBeVisible();
  expect(f.captures[0]!.source).toMatchObject({ text: words, acquisition: { rawFinalText: words, humanEdited: false } });
});

for (const event of ["error", "end"] as const) test(`RT-09-B16-${event} interrupted speech retains the partial clause`, async ({ page }) => {
  const f = await fixture(page); await speech(page); await f.open();
  await button(page, "Talk through a quote").click();
  await page.evaluate(() => { (window as any).__rt09Speech.final("Fit shelves", "first"); (window as any).__rt09Speech.interim("and fit brackets"); });
  await expect(page.getByTestId("interim-transcript")).toContainText("and fit brackets");
  await page.evaluate(event => { if (event === "error") (window as any).__rt09Speech.error("not-allowed"); else (window as any).__rt09Speech.end(); }, event);
  await expect(page.getByLabel("Words to review", { exact: true })).toBeVisible();
  // The uncertain recognition may be labelled provisional or asked about, but
  // the work clause must remain available rather than being silently erased.
  await expect.poll(() => page.getByRole("region", { name: "On-device dictation" }).evaluate(region =>
    [region.textContent, ...Array.from(region.querySelectorAll("textarea,input")).map(node => (node as HTMLInputElement).value)].join(" ")
  )).toContain("and fit brackets");
});

test("RT-09-B17 two real tabs editing one recording retain the winning and conflicting edits", async ({ page, context }) => {
  const f = await fixture(page); await f.review(); await button(page, "Save review").click();
  await expect(page.getByText("Review saved. Your source and choices will be here after reload.")).toBeVisible();
  const storage = await page.evaluate(() => Object.entries(sessionStorage));
  const second = await context.newPage();
  await second.addInitScript(entries => { for (const [key, value] of entries) sessionStorage.setItem(key, value); }, storage);
  await f.review(second);
  expect(f.jobs.size).toBe(1); expect(f.captures[0]!.captureId).toBe(f.captures[1]!.captureId);
  await page.getByLabel("Description Fit shelves", { exact: true }).fill(changed);
  await button(page, "Save review").click();
  await expect(page.getByText("Review saved. Your source and choices will be here after reload.")).toBeVisible();
  await second.getByLabel("Description Fit shelves", { exact: true }).fill("Fit shelves and supports");
  await button(second, "Save review").click();
  await expect(second.getByRole("alert").filter({ hasText: "This draft changed" })).toBeVisible();
  await expect(second.getByLabel("Description Fit shelves and supports", { exact: true })).toHaveValue("Fit shelves and supports");
  expect([...f.jobs.values()][0]!.review!.lines[0]!.description).toBe(changed);
  expect(f.effects()).toBe(0); await second.close();
});
