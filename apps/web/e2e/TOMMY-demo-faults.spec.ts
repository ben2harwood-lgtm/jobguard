import { expect, test, type Page, type Route } from "@playwright/test";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL } from "./global-setup";
import { openReview } from "./helpers/capture-journey";

// Same journey budget as M4-1-S; no existing timeout or assertion is relaxed.
test.setTimeout(180_000);
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const adminPool = () => new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
async function read(page: Page, path: string) {
  const response = await page.request.get(path);
  expect(response.ok(), `Read ${path}: ${response.status()}`).toBe(true);
  return response.json();
}
async function prepareReview(page: Page) {
  await openReview(page);
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) await button(page, `Accept ${name}`).click();
  await button(page, "Dismiss Replace shelves").click();
  await page.getByLabel("Dismissal reason Replace shelves").fill("Outside this fictional quote");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  return (await page.locator("#captured-job-workspace").getAttribute("data-job-id"))!;
}
async function enterPricing(page: Page) {
  const price = button(page, "Price the work"), editor = page.locator(".quote-editor");
  await Promise.race([price.waitFor({ state: "visible" }), editor.waitFor({ state: "visible" })]);
  if (await price.isVisible()) await price.click();
  await expect(editor).toHaveAttribute("data-quote-ready", "true");
}
async function prepareAcceptance(page: Page) {
  const jobId = await prepareReview(page);
  await button(page, "Confirm scope").click();
  await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");
  await expect(page.getByTestId("confirmed-line-count")).toHaveText("5");
  await enterPricing(page);
  await button(page, "Save draft revision").click();
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await page.getByLabel("Unit rate Clean site").fill("200.00");
  await button(page, "Save draft revision").click();
  await expect(page.getByTestId("quote-revision")).toHaveText("2");
  await expect(page.getByTestId("quote-net")).toHaveText("GBP 1,000.00");
  await button(page, "Preview immutable quote").click();
  await expect(page.getByLabel("Quote preview")).toBeVisible();
  await button(page, "Simulate sending this quote").click();
  await expect(page.getByTestId("quote-delivery")).toHaveText("Queued — not sent");
  await button(page, "Continue fake worker").click();
  await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
  return jobId;
}

// support-v01 is CUSTOMER/quote acceptance, not the fake delivery executor's
// "Simulate timeout after acceptance" (provider acceptance). No end-state seeds.
test("support-v01: a lost committed quote-acceptance reply reconciles the same operation and document on reload", async ({ page }, testInfo) => {
  const admin = adminPool(), outcomes: unknown[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    for (const loseReply of [false, true]) {
      const jobId = await prepareAcceptance(page), path = `/api/jobs/${jobId}/quotes/acceptance`;
      const outcome: Record<string, unknown> = { loseReply, jobId }; outcomes.push(outcome);
      const before = await read(page, path), activationBefore = await read(page, `/api/jobs/${jobId}/quotes/activation`);
      outcome.before = before;
      expect(before.activeAcceptance).toBeNull(); expect(before.events).toHaveLength(0);
      expect(before.currentDocument).toMatchObject({ netPence: 100000, totalPence: 120000 });
      const posts: unknown[] = [];
      const observed = (request: import("@playwright/test").Request) => {
        if (request.url().endsWith(path) && request.method() === "POST") posts.push(request.postDataJSON());
      };
      page.on("request", observed);
      let committed: { status: number; body: any } | undefined;
      let resolveLost!: (value: { status: number; body: any }) => void, rejectLost!: (reason: unknown) => void;
      const lost = new Promise<{ status: number; body: any }>((resolve, reject) => { resolveLost = resolve; rejectLost = reject; });
      const intercept = async (route: Route) => {
        if (route.request().method() !== "POST") return route.continue();
        try {
          // Forward exactly once. Only the already-committed response is lost.
          const actual = await route.fetch({ maxRetries: 0 });
          const result = { status: actual.status(), body: await actual.json() };
          await route.abort("failed");
          resolveLost(result);
        } catch (error) { await route.abort("failed").catch(() => undefined); rejectLost(error); }
      };
      try {
        if (loseReply) await page.route(`**${path}`, intercept);
        await button(page, "Record practice acceptance").click();
        if (loseReply) {
          committed = await lost;
          outcome.committedBeforeAbort = committed;
          expect(committed.status).toBe(200);
          expect(committed.body.activeAcceptance).not.toBeNull();
          await expect(page.getByRole("region", { name: "Accepted terms", exact: true })).toHaveCount(0);
          await page.unroute(`**${path}`, intercept);
        } else await expect(page.getByRole("region", { name: "Accepted terms", exact: true })).toBeVisible();
        expect(posts).toHaveLength(1);
        const command = posts[0] as { commandId: string; documentId: string; documentHash: string; documentVersion: number };
        outcome.command = command;
        expect(command).toMatchObject({ documentId: before.currentDocument.id, documentHash: before.currentDocument.hash, documentVersion: before.currentDocument.version });
        // Reconcile with authoritative stored facts BEFORE any further action.
        const saved = await read(page, path);
        outcome.saved = saved;
        expect(saved.jobStatus).toBe("accepted");
        expect(saved.activeAcceptance).toMatchObject({ documentId: command.documentId, documentHash: command.documentHash, documentVersion: command.documentVersion, netPence: 100000, totalPence: 120000 });
        expect(saved.events).toHaveLength(1);
        expect(saved.events[0]).toMatchObject({ kind: "accepted", documentHash: command.documentHash, documentVersion: command.documentVersion });
        if (committed) expect(saved).toEqual(committed.body);
        // Read-only observer: bind the captured browser operation ID to its durable
        // success receipt. The public acceptance GET alone does not expose that ID.
        const operationRead = async () => (await admin.query(`SELECT c.command_id,c.command_type,c.status,c.request_hash,c.result,u.job_id,u.operation,u.payload_hash
          FROM app.command_receipt c JOIN app.activation_acceptance_operation_use u USING(tenant_id,command_id)
          WHERE c.command_id=$1 AND u.job_id=$2`, [command.commandId, jobId])).rows;
        const operation = await operationRead(); outcome.operation = operation;
        expect(operation).toHaveLength(1);
        expect(operation[0]).toMatchObject({ command_id: command.commandId, command_type: "quote.acceptance.attest", status: "succeeded", job_id: jobId, operation: "quote.acceptance.attest" });
        const counts = async () => (await admin.query(`SELECT
          (SELECT count(*)::int FROM app.quote_acceptance WHERE job_id=$1) acceptances,
          (SELECT count(*)::int FROM app.acceptance_event WHERE job_id=$1 AND kind='accepted') events,
          (SELECT count(*)::int FROM app.activation_acceptance_operation_use WHERE job_id=$1 AND operation='quote.acceptance.attest') operations`, [jobId])).rows[0];
        expect(await counts()).toEqual({ acceptances: 1, events: 1, operations: 1 });
        await page.reload();
        await enterPricing(page);
        await expect(page.getByRole("region", { name: "Accepted terms", exact: true })).toBeVisible();
        await expect(page.getByTestId("accepted-revision")).toContainText("£1,000.00 net");
        expect(await read(page, path)).toEqual(saved);
        expect(await operationRead()).toEqual(operation);
        expect(await counts()).toEqual({ acceptances: 1, events: 1, operations: 1 });
        expect((await read(page, `/api/jobs/${jobId}/quotes/activation`)).effects).toEqual(activationBefore.effects);
        expect(posts).toHaveLength(1); // Reload reconciles; it must never silently POST acceptance again.
        outcome.counts = await counts(); outcome.browserErrors = [...errors];
      } finally { page.off("request", observed); await page.unroute(`**${path}`, intercept); }
    }
  } finally {
    await testInfo.attach("support-v01-acceptance-receipts", { body: JSON.stringify({ outcomes, browserErrors: errors }, null, 2), contentType: "application/json" });
    await admin.end();
  }
});

test("concurrent confirm-scope and open-recovery commands preserve one scope and one case, or recover the exact held command", async ({ page }, testInfo) => {
  const admin = adminPool(), diagnostics: Record<string, unknown> = {};
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const jobId = await prepareReview(page), confirmPath = `/api/jobs/${jobId}/confirm`, casePath = `/api/jobs/${jobId}/recovery-cases`;
    diagnostics.jobId = jobId;
    const deadlocks = async () => (await admin.query("SELECT deadlocks::int FROM pg_stat_database WHERE datname=current_database()")).rows[0].deadlocks;
    diagnostics.deadlocksBefore = await deadlocks();
    const requests: Record<string, any>[] = [];
    diagnostics.requests = requests; diagnostics.stage = "waiting for both commands";
    let bothArrived!: () => void;
    const arrived = new Promise<void>(resolve => { bothArrived = resolve; });
    const intercept = async (route: Route) => {
      if (route.request().method() !== "POST") return route.continue();
      requests.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
      if (requests.length === 2) bothArrived();
      await gate;
      await route.continue(); // Real requests and real responses; no success API fulfilled.
    };
    await page.route(`**${confirmPath}`, intercept); await page.route(`**${casePath}`, intercept);
    const confirmReply = page.waitForResponse(response => response.url().endsWith(confirmPath) && response.request().method() === "POST");
    const caseReply = page.waitForResponse(response => response.url().endsWith(casePath) && response.request().method() === "POST");
    await expect(button(page, "Open £2,500 withheld payment")).toBeEnabled();
    await button(page, "Confirm scope").click();
    await button(page, "Open £2,500 withheld payment").click();
    await arrived;
    expect(requests).toHaveLength(2); // Both commands are outstanding before either is sent to the real server.
    diagnostics.stage = "both commands released";
    release();
    const [confirmation, opening] = await Promise.all([confirmReply, caseReply]);
    const confirmationBody = await confirmation.json(), openingBody = await opening.json();
    diagnostics.requests = requests; diagnostics.confirmation = { status: confirmation.status(), body: confirmationBody };
    diagnostics.opening = { status: opening.status(), body: openingBody }; diagnostics.deadlocksAfter = await deadlocks();
    await page.unroute(`**${confirmPath}`, intercept); await page.unroute(`**${casePath}`, intercept);
    expect(confirmation.status(), JSON.stringify(diagnostics)).toBe(200);
    await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");
    await expect(page.getByTestId("confirmed-line-count")).toHaveText("5");
    const openingCommand = requests.find(request => request.path === casePath)!.body;
    const confirmedCommand = requests.find(request => request.path === confirmPath)!.body;
    if (opening.status() !== 200) {
      // A 503 is not success. It must carry the precise unknown-outcome contract,
      // visibly hold other writes, and recover by the original command, once.
      expect(opening.status()).toBe(503);
      expect(openingBody).toMatchObject({ version: "recovery-command-error.v1", code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN", outcome: "unknown" });
      const panel = page.locator("#recovery-cases");
      await expect(panel.getByRole("alert")).toContainText("may or may not have been saved");
      await expect(button(page, "Open £2,500 withheld payment")).toBeDisabled();
      diagnostics.beforeRetry = await read(page, casePath);
      const retryRequest = page.waitForRequest(request => request.url().endsWith(casePath) && request.method() === "POST");
      const retryReply = page.waitForResponse(response => response.url().endsWith(casePath) && response.request().method() === "POST");
      await panel.getByRole("button", { name: "Try again", exact: true }).click();
      expect((await retryRequest).postDataJSON()).toEqual(openingCommand);
      const retried = await retryReply;
      diagnostics.retry = { status: retried.status(), body: await retried.json() };
      expect(retried.status(), JSON.stringify(diagnostics)).toBe(200);
    }
    await expect(page.getByTestId("case-claimed-net")).toHaveText("£2,500.00");
    await expect(page.getByTestId("case-landed-net")).toHaveText("£0.00");
    await expect(page.getByTestId("case-fee")).toHaveText("£0.00");
    const saved = await read(page, casePath);
    expect(saved.cases).toHaveLength(1);
    expect(saved.cases[0]).toMatchObject({ caseType: "withheld_customer_payment", claimedNetPence: 250000, landedNetPence: 0, outstandingNetPence: 250000, feeJobLiabilityPence: 0, state: "identified" });
    expect((await admin.query("SELECT command_id,event_type,case_id FROM app.recovery_case_event WHERE job_id=$1 AND command_id=$2", [jobId, openingCommand.commandId])).rows).toEqual([{ command_id: openingCommand.commandId, event_type: "opened", case_id: saved.cases[0].id }]);
    expect((await admin.query("SELECT status FROM app.command_receipt WHERE command_id=$1 AND command_type='confirm_proposal_review'", [confirmedCommand.commandId])).rows).toEqual([{ status: "succeeded" }]);
    expect((await admin.query("SELECT count(*)::int revisions,count(DISTINCT scope_item_id)::int identities FROM app.scope_revision WHERE job_id=$1", [jobId])).rows[0]).toEqual({ revisions: 5, identities: 5 });
    await page.reload();
    await expect(page.getByTestId("case-claimed-net")).toHaveText("£2,500.00");
    expect(await read(page, casePath)).toEqual(saved);
    diagnostics.saved = saved;
  } finally {
    release();
    await testInfo.attach("scope-recovery-concurrency", { body: JSON.stringify(diagnostics, null, 2), contentType: "application/json" });
    await admin.end();
  }
});
