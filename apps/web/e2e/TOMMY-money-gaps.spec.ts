import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import type { CaptureWorkspaceResponse } from "../../api/src/capture/contracts";
import type { QuoteWorkspaceResponse } from "../../api/src/quote/contracts";
import type { FinalAccountResponse } from "../../api/src/final-account.contracts";
import { openCapture } from "./helpers/capture-journey";
import { click, enterQuote, jsonResult } from "./helpers/customer-invoice-journey";
import { allocationPanel, allocationPath, parseAllocationView, readAllocations, readyAllocations, splitRecoveryValueReceipt } from "./helpers/recovery-allocation-journey";

// New bounded journeys only. Existing test timeouts/assertions and product behavior are unchanged.
test.setTimeout(600_000);
const tenant = "11111111-1111-4111-8111-111111111111";
const names = ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"];
const source = [
  "JOB: Tommy fictional decorating check",
  "ITEM: Protect room | £200.00",
  "ITEM: Prepare walls | £200.00",
  "ITEM: Paint walls | £200.00",
  "ITEM: Finish trim | £200.00",
  "ITEM: Clean site | £100.00",
  "ITEM: Replace shelves",
].join("\n");
const dismissalReason = "Outside the agreed fictional job";
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const root = (jobId: string) => "/api/jobs/" + jobId;
const read = <T = any>(page: Page, path: string): Promise<T> => jsonResult(page.request.get(path), "Read " + path);
const post = (page: Page, path: string, data: unknown) => jsonResult(page.request.post(path, { data, maxRetries: 0 }), "Post " + path);
// The existing API/core packages are ESM-only. Follow the allocation helper's
// native compiled-contract import rather than loading them through Playwright's CJS transform.
const loadCaptureContracts = () => (new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("../../api/src/capture/contracts")>)(pathToFileURL(join(process.cwd(), "../api/dist/capture/contracts.js")).href);

function contextOptions(info: TestInfo) {
  const { baseURL, viewport } = info.project.use;
  if (!baseURL || !viewport) throw new Error("This journey needs its configured baseURL and viewport");
  return { baseURL, viewport };
}
async function attach(info: TestInfo, name: string, evidence: unknown) {
  await info.attach(name, { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
}

async function freshContext(browser: Browser, info: TestInfo) {
  const context = await browser.newContext(contextOptions(info));
  // Explicit contexts do not inherit the page fixture's action settings. A bad
  // locator must fail at its action, not consume the ten-minute journey budget.
  context.setDefaultTimeout(10_000);
  context.setDefaultNavigationTimeout(30_000);
  return context;
}

async function phase<T>(name: string, work: () => Promise<T>): Promise<T> {
  const info = test.info();
  const receipt = { project: info.project.name, test: info.title, phase: name };
  console.info("TOMMY_MONEY_GAP_PHASE " + JSON.stringify({ ...receipt, status: "START" }));
  try {
    const result = await test.step(name, work);
    console.info("TOMMY_MONEY_GAP_PHASE " + JSON.stringify({ ...receipt, status: "PASS" }));
    return result;
  } catch (error) {
    console.error("TOMMY_MONEY_GAP_PHASE " + JSON.stringify({ ...receipt, status: "FAIL", error: String(error).slice(0, 2000) }));
    throw error;
  }
}

/** Attempt every cleanup, retaining the original failure and reporting secondary errors. */
async function cleanup(info: TestInfo, primaryFailed: boolean, actions: Array<[string, () => Promise<unknown>]>) {
  let cleanupFailed = false;
  let firstError: unknown;
  for (const [name, action] of actions) {
    try { await action(); }
    catch (error) {
      if (!cleanupFailed) firstError = error;
      cleanupFailed = true;
      const description = `${name}: ${String(error)}`;
      info.annotations.push({ type: primaryFailed ? "secondary-cleanup-error" : "cleanup-error", description });
      console.error("TOMMY_MONEY_GAP_PHASE " + JSON.stringify({ project: info.project.name, test: info.title, phase: name, status: "FAIL", secondary: primaryFailed, error: description.slice(0, 2000) }));
    }
  }
  if (cleanupFailed && !primaryFailed) throw firstError;
}

const closeContext = (context: BrowserContext) => () => context.close();

/** Six fresh source inputs, five confirmed identities, no saved sample or terminal-state seed. */
async function freshLiveJob(page: Page, target: "core" | "recovery") {
  const { captureWorkspaceResponseV1 } = await loadCaptureContracts();
  const captured = await phase(`${target}: capture six original source inputs`, async () => {
    await openCapture(page);
    const input = page.locator("#walk-source");
    await expect(input).toHaveAccessibleName(/^Work details /u);
    await input.fill(source);
    const [response] = await Promise.all([
      page.waitForResponse(reply => new URL(reply.url()).pathname === "/api/jobs/capture" && reply.request().method() === "POST"),
      click(page, "Make my draft"),
    ]);
    expect(response.ok(), await response.text()).toBe(true);
    const created = captureWorkspaceResponseV1.parse(await response.json());
    expect(created.source.text).toBe(source);
    expect(created.status).toBe("draft");
    await expect(page.getByTestId("proposal-line-count")).toHaveText("6");
    console.info("TOMMY_MONEY_GAP_CAPTURE " + JSON.stringify({ project: test.info().project.name, target, jobId: created.jobId, captureId: created.captureId, proposalId: created.proposalId }));
    return created;
  });
  const jobId = captured.jobId;
  await click(page, "Check and edit my draft");
  await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
  const savedCapture = captureWorkspaceResponseV1.parse(await read(page, root(jobId) + "/proposal"));
  // view() supplies a new provisional reviewId until a review is saved. Both schema parses
  // validate that UUID; every persisted identity, source and proposal field must remain exact.
  expect(captured.review).toBeNull();
  expect(savedCapture.review).toBeNull();
  expect(savedCapture).toEqual({ ...captured, reviewId: savedCapture.reviewId });
  expect(captured.source.text).toBe(source);
  expect(captured.proposal.lines.map(line => line.description.value)).toEqual([...names, "Replace shelves"]);
  const originalIds = captured.proposal.lines.filter(line => names.includes(line.description.value)).map(line => line.scopeItemId);
  const shelfId = captured.proposal.lines.find(line => line.description.value === "Replace shelves")!.scopeItemId;
  expect(new Set([...originalIds, shelfId]).size).toBe(6);
  const confirmed = await phase(`${target}: confirm five source identities and dismiss the shelf`, async () => {
    for (const name of names) {
      const line = page.locator(".review-line").filter({ has: page.getByLabel("Description " + name, { exact: true }) });
      await expect(line.locator("blockquote")).toContainText(name);
      await page.getByLabel("Quantity " + name, { exact: true }).fill("1");
      await page.getByLabel("Unit " + name, { exact: true }).fill("item");
      await click(page, "Accept " + name);
    }
    await click(page, "Dismiss Replace shelves");
    await page.getByLabel("Dismissal reason Replace shelves", { exact: true }).fill(dismissalReason);
    for (const answer of await page.getByRole("textbox", { name: /^Answer /u }).all()) await answer.fill("Builder removes fictional waste");
    await click(page, "Save customer and site");
    await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
    await click(page, "Confirm scope");
    await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");
    await expect(page.getByTestId("confirmed-line-count")).toHaveText("5");
    const saved = await read<CaptureWorkspaceResponse>(page, root(jobId) + "/proposal");
    expect(saved.review!.lines.filter(line => line.disposition === "accepted").map(line => line.scopeItemId).sort()).toEqual([...originalIds].sort());
    expect(saved.review!.lines.find(line => line.scopeItemId === shelfId)).toMatchObject({ disposition: "dismissed", dismissalReason });
    return saved;
  });
  // Persisted route, bound to the capture response. Reloading an inline /classic
  // screen would return to its job list instead of retaining this job.
  await page.goto("/jobs/" + jobId + "#quote");
  await enterQuote(page);
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-job-id", jobId);
  const quotes = await phase(`${target}: save two quote revisions on the same job`, async () => {
    for (const name of names) await page.getByLabel("Unit rate " + name, { exact: true }).fill(name === "Clean site" ? "100.00" : "200.00");
    await expect(page.getByTestId("quote-net")).toHaveText("GBP 900.00");
    await click(page, "Save draft revision");
    await expect(page.getByTestId("quote-revision")).toHaveText("1");
    const first = await read<QuoteWorkspaceResponse>(page, root(jobId) + "/quotes");
    await page.getByLabel("Unit rate Clean site", { exact: true }).fill(target === "core" ? "200.00" : "18000.00");
    await click(page, "Save draft revision");
    await expect(page.getByTestId("quote-revision")).toHaveText("2");
    await expect(page.getByTestId("quote-net")).toHaveText(target === "core" ? "GBP 1,000.00" : "GBP 18,800.00");
    const saved = await read<QuoteWorkspaceResponse>(page, root(jobId) + "/quotes");
    expect(saved.revisions).toHaveLength(2);
    expect(saved.revisions[0]).toEqual(first.revisions[0]);
    for (const revision of saved.revisions) expect(revision.lines.map(line => line.scopeItemId).sort()).toEqual([...originalIds].sort());
    return saved;
  });
  const activation = await phase(`${target}: send, accept and activate the exact quote`, async () => {
    await click(page, "Preview immutable quote");
    await click(page, "Simulate sending this quote");
    await expect(page.getByTestId("quote-delivery")).toHaveText(/^(Queued — not sent|Simulated delivery — nothing sent)$/u);
    if (await page.getByTestId("quote-delivery").textContent() === "Queued — not sent") await click(page, "Continue fake worker");
    await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
    await click(page, "Record practice acceptance");
    await click(page, "Start this practice job");
    await expect(page.getByRole("heading", { name: "Live · baseline frozen", exact: true })).toBeVisible();
    const saved = await read(page, root(jobId) + "/quotes/activation");
    expect(saved.activation).toMatchObject({ acceptedNetPence: target === "core" ? 100000 : 1880000, policyVersion: "reference_fee_policy_v3", recoveryCapPence: null });
    expect(saved.effects).toMatchObject({ activations: 1, capSnapshots: 0, simulatedObligations: 0, settlements: 0, platformJournals: 0, realExternalActions: 0 });
    return saved;
  });
  return { jobId, originalIds, shelfId, captured, confirmed, quotes, activation };
}

async function addVariation(page: Page, description: string, price: string, direction: "addition" | "omission") {
  await phase(`Record proposed ${direction}: ${description}`, async () => {
    const form = page.locator(".variation-entry");
    await expect(form).toBeVisible();
    await form.getByLabel("Description", { exact: true }).fill(description);
    await form.getByLabel("Change type", { exact: true }).selectOption(direction);
    await form.getByLabel("Variation price (£, optional)", { exact: true }).fill(price);
    await click(page, "Add proposed variation");
    await expect(form.getByLabel("Description", { exact: true })).toHaveValue("");
  });
}

/** Real proof and worker-owned Final Check, followed by the actual invoice command. No SQL setup. */
async function finishAndInvoice(page: Page, jobId: string, netPence: number, grossPence: number) {
  const evidenceId = await phase("Verify the source job's completion proof", async () => {
    const proofPath = root(jobId) + "/proof";
    const before = await read(page, proofPath);
    const selected = await post(page, proofPath, { version: "practice-proof-command.v1", commandId: randomUUID(), action: "select_generated", scopeItemId: before.scopeItemId, fixture: "completion-photo" });
    await post(page, proofPath, { version: "practice-proof-command.v1", commandId: randomUUID(), action: "finalize", uploadId: selected.upload.id, objectVersionId: selected.upload.objectVersionId });
    await expect.poll(async () => (await read(page, proofPath)).upload?.state, { timeout: 45_000 }).toBe("verified");
    const verified = await read(page, proofPath);
    const completed = await post(page, proofPath, { version: "practice-proof-command.v1", commandId: randomUUID(), action: "complete", evidenceId: verified.upload.evidenceId, scopeItemId: before.scopeItemId });
    expect(completed.completion.id).toEqual(expect.any(String));
    await post(page, "/api/decisions", { version: "finding-evaluation-command.v1", commandId: randomUUID(), tenantId: tenant, jobId });
    return verified.upload.evidenceId as string;
  });
  const account = await phase("Build and lock the exact final account", async () => {
    await click(page, "Build final account");
    await expect(page.getByTestId("final-gross")).toHaveText(grossPence === 132000 ? "£1,320.00" : "£22,560.00");
    const account = (await read<FinalAccountResponse>(page, root(jobId) + "/final-account")).account!;
    expect(account).not.toBeNull();
    expect(account.issueBlocked).toBe(false);
    expect(account.totals).toEqual({ net: { pence: netPence, currency: "GBP" }, tax: { pence: grossPence - netPence, currency: "GBP" }, total: { pence: grossPence, currency: "GBP" } });
    for (const name of names) {
      await page.getByLabel("Disposition " + name, { exact: true }).selectOption("done");
      await expect(page.getByLabel("Disposition " + name, { exact: true })).toBeEnabled();
      await expect(page.getByLabel("Disposition " + name, { exact: true })).toHaveValue("done");
    }
    await expect(page.getByTestId("final-account-lock")).toHaveAttribute("aria-busy", "false");
    const terms = await read(page, root(jobId) + "/final-account/lock");
    if (!terms.termsAccepted) await click(page, "Accept final check terms");
    await expect(button(page, "Accept final check terms")).toBeDisabled();
    await click(page, "Complete final account");
    await expect(page.getByTestId("lock-state")).toHaveText("Final account completed");
    return account;
  });
  await page.reload();
  await enterQuote(page);
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-job-id", jobId);
  await phase("Observe worker completion and load the saved Final Check", async () => {
    // The real lock queued this captured practice job's request (migration 0698).
    // A worker that has already completed legitimately removes the run button.
    // Do not restart failed work or infer completion from an absent control.
    await expect.poll(async () => (await read(page, root(jobId) + "/final-check")).state, { timeout: 180_000, intervals: [3_000] }).toBe("completed");
    await click(page, "Load the saved final check");
    await expect(page.getByTestId("final-check-status")).toContainText("JobGuard's final check found");
  });
  const invoice = await phase("Issue the invoice from the checked locked account", async () => {
    await click(page, "Issue and simulate this invoice");
    await expect(page.getByTestId("invoice-gross")).toHaveText(grossPence === 132000 ? "GBP 1,320.00" : "GBP 22,560.00");
    const issued = await read(page, root(jobId) + "/customer-invoices");
    expect(issued.invoices).toHaveLength(1);
    const invoice = issued.invoices[0];
    expect(invoice).toMatchObject({ finalAccountRevisionId: account.id, sourceHash: account.sourceHash, netPence, totalPence: grossPence, balancePence: grossPence, delivery: "simulated_delivery" });
    return invoice;
  });
  return { account, invoice, evidenceId };
}

test("support-v02: matched fresh jobs exclude dismissed shelves and a pending £50 from the same final bill", async ({ browser }, info) => {
  const outcomes: Record<string, unknown>[] = [];
  let failed = false;
  try {
    for (const includePending of [false, true]) {
      const context = await freshContext(browser, info);
      let contextFailed = false;
      try {
        await phase(`support-v02: complete ${includePending ? "£50-present" : "£50-absent"} job and verify saved money`, async () => {
          const page = await context.newPage();
          const job = await freshLiveJob(page, "core");
          await addVariation(page, "Extra preparation", "125.00", "addition");
          await addVariation(page, "Omit cabinet painting", "25.00", "omission");
          if (includePending) await addVariation(page, "Pending trim repair", "50.00", "addition");
          await button(page, "Approve exact revision").nth(0).click();
          await expect(page.getByTestId("approved-additions")).toHaveText("£125.00");
          await button(page, "Approve exact revision").nth(0).click();
          await expect(page.getByTestId("approved-omissions")).toHaveText("−£25.00");
          const finished = await finishAndInvoice(page, job.jobId, 110000, 132000);
          const { account } = finished;
          expect(account.lines.filter(line => line.kind === "baseline").map(line => line.scopeItemId).sort()).toEqual([...job.originalIds].sort());
          expect(account.lines.some(line => line.scopeItemId === job.shelfId)).toBe(false);
          const variations = account.lines.filter(line => line.kind === "variation");
          expect(variations.map(line => ({ description: line.description, netPence: line.netPence })).sort((a, b) => a.description.localeCompare(b.description))).toEqual([
            { description: "Extra preparation", netPence: 12500 }, { description: "Omit cabinet painting", netPence: -2500 },
          ]);
          for (const variation of variations) expect(variation.approvalId).toMatch(/^[a-f0-9-]{36}$/u);
          expect(account.pending).toHaveLength(includePending ? 1 : 0);
          if (includePending) {
            expect(account.pending[0]).toMatchObject({ description: "Pending trim repair", netPence: 5000 });
            expect(account.lines.some(line => line.sourceId === account.pending[0]!.sourceId)).toBe(false);
            await expect(page.getByRole("region", { name: "Not included — approval needed", exact: true })).toContainText("Pending trim repair · £50.00");
          }
          const receiptsPath = root(job.jobId) + "/customer-invoices/" + finished.invoice.id + "/receipts";
          const receipts = await read(page, receiptsPath);
          expect(receipts.receipts).toHaveLength(0);
          expect(receipts.eligibleRecoveryPrincipalPence).toBe(0);
          const allocations = await readAllocations(page, job.jobId);
          expect(allocations.allocations).toHaveLength(0);
          expect(allocations.eligibleNetPence).toBe(0);
          const collection = await read(page, root(job.jobId) + "/success-fees/collection");
          expect(collection).toMatchObject({ attempts: [], settledPrincipal: 0, refundedPrincipal: 0, retainedPrincipal: 0, outstandingPrincipal: 0, refundDue: 0, collectionReserved: 0, refundReserved: 0, unknownOutcome: false });
          await page.reload();
          await enterQuote(page);
          await expect(page.locator(".quote-editor")).toHaveAttribute("data-job-id", job.jobId);
          expect((await read<FinalAccountResponse>(page, root(job.jobId) + "/final-account")).account).toEqual(account);
          const savedReview = await read<CaptureWorkspaceResponse>(page, root(job.jobId) + "/proposal");
          expect(savedReview.review!.lines.find(line => line.scopeItemId === job.shelfId)).toMatchObject({ disposition: "dismissed", dismissalReason });
          expect(savedReview.review!.lines.filter(line => line.disposition === "accepted").map(line => line.scopeItemId).sort()).toEqual([...job.originalIds].sort());
          expect((await read(page, root(job.jobId) + "/customer-invoices")).invoices).toEqual([finished.invoice]);
          outcomes.push({ includePending, jobId: job.jobId, originalIds: job.originalIds, shelfId: job.shelfId, review: savedReview.review, quoteRevisions: job.quotes.revisions, account, invoice: finished.invoice, receipts, allocations, collection,
            comparison: { totals: account.totals, billableLines: account.lines.map(line => ({ kind: line.kind, description: line.description, netPence: line.netPence })).sort((a, b) => a.description.localeCompare(b.description)) } });
        });
      } catch (error) { contextFailed = true; throw error; }
      finally { await cleanup(info, contextFailed, [["Close paired-job context", closeContext(context)]]); }
    }
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]!.comparison).toEqual(outcomes[1]!.comparison);
    expect(outcomes[0]!.jobId).not.toBe(outcomes[1]!.jobId);
    console.info("TOMMY_MONEY_GAP_RECEIPT " + JSON.stringify({ caseId: "support-v02", project: info.project.name, sourceSha256: createHash("sha256").update(source).digest("hex"), jobs: outcomes.map(item => ({ includePending: item.includePending, jobId: item.jobId, originalIds: item.originalIds, shelfId: item.shelfId, comparison: item.comparison })), result: "PASS" }));
  } catch (error) { failed = true; throw error; }
  finally { await cleanup(info, failed, [["Attach paired money evidence", () => attach(info, "support-v02-paired-money-and-provenance", outcomes)]]); }
});


/** Read-only observer: bind the exact HTTP command to immutable effects under runtime RLS. */
async function allocationReceipt(jobId: string, commandId: string) {
  const pool = new Pool({ host: "127.0.0.1", port: 55432, database: "jobguard_synthetic_demo", user: "jobguard_runtime", password: ["sbox", "e2e", "runtime"].join("-"), max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
      const params = [tenant, jobId, commandId];
      const commands = await client.query("SELECT command_id,case_id,payload,payload_hash,result FROM app.recovery_allocation_command WHERE tenant_id=$1 AND job_id=$2 AND command_id=$3", params);
      const allocations = await client.query("SELECT id,command_id,review_id,authorization_id,case_id,payment_id,invoice_id,movement_id,evidence_id,gross_pence,eligible_net_pence,tax_pence FROM app.recovery_case_allocation WHERE tenant_id=$1 AND job_id=$2 ORDER BY id", params.slice(0, 2));
      const landed = await client.query("SELECT case_id,command_id,event_type,amount_pence FROM app.recovery_case_event WHERE tenant_id=$1 AND job_id=$2 AND event_type='record_landing' ORDER BY id", params.slice(0, 2));
      const lines = await client.query("SELECT row_to_json(t)::text value FROM app.receipt_line_allocation t WHERE tenant_id=$1 AND job_id=$2 ORDER BY id", params.slice(0, 2));
      const payments = await client.query("SELECT id,amount_pence FROM app.customer_payment WHERE tenant_id=$1 AND job_id=$2 ORDER BY id", params.slice(0, 2));
      await client.query("COMMIT");
      return { commands: commands.rows, allocations: allocations.rows, landed: landed.rows, lines: lines.rows, payments: payments.rows };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } finally { await pool.end(); }
}

async function firstRecoveryReceipt(page: Page) {
  const job = await freshLiveJob(page, "recovery");
  const finished = await finishAndInvoice(page, job.jobId, 1880000, 2256000);
  const opened = await post(page, root(job.jobId) + "/recovery-cases", {
    version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), caseType: "withheld_customer_payment",
    claimedNetPence: 32000, counterparty: "Practice Customer", book: "builder_customer", sourceType: "customer_invoice",
    sourceRefs: [finished.invoice.id], expectedRevision: 0,
  });
  expect(opened.cases).toHaveLength(1);
  const caseId = opened.affectedCaseId as string;
  expect(opened.cases[0]).toMatchObject({ id: caseId, claimedNetPence: 32000, sourceRefs: [finished.invoice.id] });
  // Exact terms and source-backed pursuit precede the generated pending/settled movement.
  await page.goto("/jobs/" + job.jobId + "/recovery-journey");
  const terms = page.locator('[data-case-id="' + caseId + '"]');
  await terms.getByRole("button", { name: /^Approve exact terms for the/u }).click();
  await expect(terms.getByRole("status")).toHaveText("Exact terms approved for this case.");
  await page.goto("/jobs/" + job.jobId + "#recovery-cases");
  await button(page, "withheld customer payment · £320.00").click();
  for (const [action, marker, value] of [
    ["Evidence assembled", "case-state", "Evidence assembled"],
    ["Review evidence-backed claim", null, null],
    ["Approve this eligibility review", "eligibility-status", "Approved for this simulation"],
    ["Build evidence pack", "pack-state", "Sources mapped — inspect the evidence"],
    ["Approve this pack for attachment", "pack-current-attachment-status", "Attachment approval recorded for these exact hashes"],
    ["Preview factual message", null, null], ["Approve this exact message", null, null], ["Advance practice delivery", null, null],
  ] as const) {
    if (action === "Advance practice delivery") {
      const [response] = await Promise.all([
        page.waitForResponse(reply => reply.url().includes("/api/recovery-cases/" + caseId + "/messages/") && reply.url().endsWith("/commands") && reply.request().method() === "POST" && reply.request().postDataJSON().action === "advance"),
        click(page, action),
      ]);
      expect(response.ok(), await response.text()).toBe(true);
    } else await click(page, action);
    if (marker && value) await expect(page.getByTestId(marker)).toHaveText(value);
  }
  await expect(page.getByTestId("pursuit-delivery")).toHaveText("Simulated delivery — nothing sent");
  await expect(page.getByTestId("pursuit-sink-count")).toHaveText("1");
  await expect(page.getByTestId("pursuit-real-actions")).toHaveText("0");
  const pursuit = await read(page, "/api/recovery-cases/" + caseId + "/messages");
  expect(pursuit.latest).toMatchObject({ status: "simulated_delivery" });
  expect(pursuit.sink).toHaveLength(1);
  expect(pursuit.sink[0]).toMatchObject({ messageId: pursuit.latest.id, contentHash: pursuit.latest.message.contentHash, recipient: pursuit.latest.message.recipient, environment: "synthetic_demo" });
  const receiptPath = root(job.jobId) + "/customer-invoices/" + finished.invoice.id + "/receipts";
  const recorded = await post(page, receiptPath, { version: "practice-customer-receipt.record.v1", commandId: randomUUID(), invoiceId: finished.invoice.id, paidOn: finished.invoice.issuedOn, amountPence: 38400, method: "bank_transfer", reference: "Fictional canonical receipt-384" });
  expect(recorded.receipts).toHaveLength(1);
  const paymentId = recorded.receipts[0].id as string;
  expect(recorded.invoice.balancePence).toBe(2217600);
  const feedPath = root(job.jobId) + "/practice-feed";
  let feed = await post(page, feedPath, { version: "practice-feed-command.v1", commandId: randomUUID(), expectedRevision: 0, action: "connect" });
  const advance = async (step: string) => {
    feed = await post(page, feedPath, { version: "practice-feed-command.v1", commandId: randomUUID(), expectedRevision: feed.revision, action: "advance", movement: "receipt-384", step });
    return feed;
  };
  const pending = await advance("pending");
  expect(pending.movements).toHaveLength(1);
  expect(pending.movements[0]).toMatchObject({ state: "pending", grossPence: 38400 });
  const pendingAllocations = await readAllocations(page, job.jobId);
  expect(pendingAllocations.eligibleNetPence).toBe(0);
  expect(pendingAllocations.allocations).toHaveLength(0);
  const refused = await page.request.post(feedPath, { data: { version: "practice-feed-command.v1", commandId: randomUUID(), expectedRevision: feed.revision, action: "match_receipt", movement: "receipt-384", paymentId }, maxRetries: 0 });
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toMatchObject({ code: "PRACTICE_FEED_MOVEMENT_NOT_SETTLED" });
  await advance("settled");
  for (const step of ["replay", "page_overlap"]) await advance(step);
  expect(feed.movements).toHaveLength(1);
  expect(feed.movements[0]).toMatchObject({ id: pending.movements[0].id, state: "settled", grossPence: 38400 });
  feed = await post(page, feedPath, { version: "practice-feed-command.v1", commandId: randomUUID(), expectedRevision: feed.revision, action: "match_receipt", movement: "receipt-384", paymentId });
  const matched = await readAllocations(page, job.jobId);
  expect(matched.receipts).toHaveLength(1);
  expect(matched.receipts[0]).toMatchObject({ paymentId, invoiceId: finished.invoice.id, grossPence: 38400, availablePence: 38400, reversed: false });
  expect(matched.allocations).toHaveLength(0);
  expect(matched.eligibleNetPence).toBe(0);
  await splitRecoveryValueReceipt(page, job.jobId, 38400);
  return { ...job, ...finished, caseId, paymentId, receiptPath, feedPath, pursuit, pending, pendingAllocations, feed, matched };
}

test("support-v04: a lost committed £384 allocation reply reconciles before exact replay and keeps one £320 principal", async ({ browser }, info) => {
  const context = await freshContext(browser, info);
  const evidence: Record<string, unknown> = {};
  let failed = false;
  try {
    const page = await context.newPage();
    const job = await phase("support-v04: prepare the invoice, approved pursuit and settled receipt", () => firstRecoveryReceipt(page));
    evidence.setup = job;
    const path = allocationPath(job.jobId);
    await page.goto("/jobs/" + job.jobId + "#recovery-allocations");
    await readyAllocations(page);
    const panel = allocationPanel(page);
    await panel.getByRole("combobox", { name: "Recovery case", exact: true }).selectOption(job.caseId);
    await panel.getByRole("combobox", { name: "Matched receipt", exact: true }).selectOption(job.paymentId);
    await panel.getByRole("combobox", { name: "Recovery evidence on file", exact: true }).selectOption(job.evidenceId);
    await panel.getByLabel("Allocation gross (£)", { exact: true }).fill("384.00");
    await panel.getByRole("button", { name: "Review receipt allocation", exact: true }).click();
    await expect(panel.getByTestId("allocation-review-split")).toHaveText("£384.00 = £320.00 net + £64.00 tax");
    expect((await readAllocations(page, job.jobId)).allocations).toHaveLength(0);
    const browserErrors: string[] = [];
    page.on("pageerror", error => browserErrors.push(error.message));
    const browserAllocationBodies: string[] = [];
    page.on("request", request => {
      if (request.url().endsWith(path) && request.method() === "POST" && request.postDataJSON().action === "allocate") browserAllocationBodies.push(request.postData()!);
    });
    const writes: string[] = [];
    let release!: (value: { raw: string; status: number; view: Awaited<ReturnType<typeof readAllocations>> }) => void;
    let fail!: (error: unknown) => void;
    const committed = new Promise<{ raw: string; status: number; view: Awaited<ReturnType<typeof readAllocations>> }>((resolve, reject) => { release = resolve; fail = reject; });
    await page.route("**" + path, async route => {
      const request = route.request();
      if (request.method() !== "POST" || request.postDataJSON().action !== "allocate") return route.continue();
      try {
        const raw = request.postData()!;
        writes.push(raw);
        expect(writes).toHaveLength(1);
        // The genuine allocation commits first. Only its reply is lost.
        const response = await route.fetch({ maxRetries: 0 });
        expect(response.status(), await response.text()).toBe(200);
        const view = await parseAllocationView(await response.json());
        await route.abort("failed");
        release({ raw, status: response.status(), view });
      } catch (error) { fail(error); await route.abort("failed").catch(() => {}); }
    });
    const [lost] = await phase("support-v04: lose the reply after the real allocation commits", () => Promise.all([committed, panel.getByRole("button", { name: "Approve exact receipt allocation", exact: true }).click()]));
    evidence.lostReply = lost;
    const command = JSON.parse(lost.raw);
    expect(command).toMatchObject({ action: "allocate", caseId: job.caseId, paymentId: job.paymentId, evidenceId: job.evidenceId, grossPence: 38400 });
    await expect(panel.getByRole("alert")).toHaveText("The result is unknown. Read the saved allocations before doing anything else.");
    await expect(panel.getByRole("alert")).toBeFocused();
    await expect(panel.getByRole("combobox", { name: "Recovery case", exact: true })).toBeDisabled();
    expect(writes).toHaveLength(1);

    // Read authoritative state BEFORE any retry; no inferred success or fake response.
    const saved = await phase("support-v04: read the authoritative allocation before any retry", () => readAllocations(page, job.jobId));
    evidence.beforeReplay = saved;
    expect(saved).toEqual(lost.view);
    expect(saved.allocations).toHaveLength(1);
    expect(saved.allocations[0]).toMatchObject({ caseId: job.caseId, paymentId: job.paymentId, invoiceId: job.invoice.id, evidenceId: job.evidenceId, grossPence: 38400, eligibleNetPence: 32000, taxPence: 6400, held: false, reversedPence: 0 });
    expect(saved.eligibleNetPence).toBe(32000);
    expect(saved.allocatedTaxPence).toBe(6400);
    expect(saved.receipts).toHaveLength(1);
    expect(saved.receipts[0]).toMatchObject({ paymentId: job.paymentId, grossPence: 38400, availablePence: 0 });
    const allocatedLines = saved.lines.filter(line => line.paymentId === job.paymentId && line.reversesId === null);
    expect(allocatedLines.length).toBeGreaterThan(0);
    for (const [kind, expected] of [["gross", 38400n], ["net", 32000n]] as const) {
      let numerator = 0n, denominator = 1n;
      for (const line of allocatedLines) {
        const value = line[kind], nextDenominator = BigInt(value.denominator);
        numerator = numerator * nextDenominator + BigInt(value.numerator) * denominator;
        denominator *= nextDenominator;
      }
      expect(numerator).toBe(expected * denominator);
    }
    const database = await phase("support-v04: bind the original command to saved database effects", () => allocationReceipt(job.jobId, command.commandId));
    evidence.databaseBeforeReplay = database;
    expect(database.commands).toHaveLength(1);
    expect(database.commands[0]).toMatchObject({ command_id: command.commandId, case_id: job.caseId, payload: command });
    expect(database.allocations).toHaveLength(1);
    expect(database.allocations[0]).toMatchObject({ id: saved.allocations[0]!.id, command_id: command.commandId, payment_id: job.paymentId, gross_pence: "38400", eligible_net_pence: "32000", tax_pence: "6400" });
    expect(database.landed).toEqual([{ case_id: job.caseId, command_id: command.commandId, event_type: "record_landing", amount_pence: "32000" }]);
    expect(database.payments).toEqual([{ id: job.paymentId, amount_pence: "38400" }]);
    expect(database.lines.length).toBeGreaterThan(0);
    await page.unroute("**" + path);
    await panel.getByRole("button", { name: "Load saved allocations", exact: true }).click();
    await readyAllocations(page);
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await expect(panel.getByTestId("eligible-net")).toHaveText("£320.00");
    await expect(panel.getByTestId("recovery-allocation")).toHaveCount(1);
    expect(writes).toHaveLength(1);

    // Deliberate protocol replay after reconciliation. The UI has already read
    // the saved success; this is not presented as a user-facing retry control.
    const originalBytes = Buffer.from(lost.raw, "utf8");
    const replayResponse = await phase("support-v04: replay only the original allocation command bytes", async () => {
      const response = await page.request.post(path, { data: originalBytes, headers: { "content-type": "application/json" }, maxRetries: 0 });
      expect(response.status(), await response.text()).toBe(200);
      return response;
    });
    const replayed = await parseAllocationView(await replayResponse.json());
    expect(replayed).toEqual(saved);
    expect(await allocationReceipt(job.jobId, command.commandId)).toEqual(database);
    // A different identity cannot reuse that receipt's exhausted capacity.
    const overlap = await page.request.post(path, { data: { version: "recovery-allocation-command.v1", action: "review", commandId: randomUUID(), caseId: job.caseId, paymentId: job.paymentId, evidenceId: job.evidenceId, expectedCaseRevision: saved.cases.find(row => row.caseId === job.caseId)!.revision, grossPence: 38400 }, maxRetries: 0 });
    expect(overlap.status()).toBe(409);
    expect(await overlap.json()).toEqual({ version: "recovery-allocation-error.v1", code: "ALLOCATION_EXCEEDS_AVAILABLE" });
    expect(await readAllocations(page, job.jobId)).toEqual(saved);
    await page.reload();
    await readyAllocations(page);
    await expect(panel.getByTestId("recovery-allocation")).toHaveCount(1);
    await expect(panel.getByTestId("eligible-net")).toHaveText("£320.00");
    expect(await readAllocations(page, job.jobId)).toEqual(saved);
    expect((await read(page, job.receiptPath)).receipts).toHaveLength(1);
    expect(await allocationReceipt(job.jobId, command.commandId)).toEqual(database);
    expect(browserErrors).toEqual([]);
    expect(browserAllocationBodies).toEqual([lost.raw]);

    // Actual v3 source-backed fee review/approval: no local fee calculation or mock.
    await page.goto("/jobs/" + job.jobId + "/recovery-journey");
    await click(page, "Review success fee");
    await expect(page.getByTestId("fee-review-cumulative")).toHaveText("£32.00");
    await expect(page.getByTestId("fee-review-delta")).toHaveText("£32.00");
    const [postedFeeResponse] = await phase("support-v04: approve the exact source-backed fee posting", () => Promise.all([
      page.waitForResponse(response => response.url().endsWith(root(job.jobId) + "/success-fees") && response.request().method() === "POST" && response.request().postDataJSON().action === "approve"),
      click(page, "Approve this exact fee posting"),
    ]));
    expect(postedFeeResponse.ok(), await postedFeeResponse.text()).toBe(true);
    const fee = await postedFeeResponse.json();
    await expect(page.getByTestId("fee-posting-saved")).toHaveText("Saved. Cumulative fee £32.00; change £32.00.");
    expect(fee.statement.feePence).toBe(3200);
    expect(fee).toMatchObject({ action: "approve", environment: "synthetic_demo", productionEnabled: false, realExternalActions: 0 });
    expect(fee.journalId).toMatch(/^[a-f0-9-]{36}$/u);
    expect(fee.statement.qualifyingPrincipal).toEqual({ numerator: "32000", denominator: "1" });
    expect(fee.statement.sources).toContainEqual(expect.objectContaining({ caseId: job.caseId, recoveryAllocationId: saved.allocations[0]!.id }));
    await click(page, "Review success fee");
    await expect(page.getByTestId("fee-review-cumulative")).toHaveText("£32.00");
    await expect(page.getByTestId("fee-review-delta")).toHaveText("£0.00");
    expect(await readAllocations(page, job.jobId)).toEqual(saved);
    expect(await allocationReceipt(job.jobId, command.commandId)).toEqual(database);
    evidence.fee = fee;
    evidence.browserErrors = browserErrors;
    evidence.browserAllocationBodies = browserAllocationBodies;
    evidence.rawRequestSha256 = createHash("sha256").update(originalBytes).digest("hex");
    console.info("TOMMY_MONEY_GAP_RECEIPT " + JSON.stringify({ caseId: "support-v04", project: info.project.name, jobId: job.jobId, paymentId: job.paymentId, commandId: command.commandId, allocationId: saved.allocations[0]!.id, rawRequestSha256: evidence.rawRequestSha256, originalHttpStatus: lost.status, replayHttpStatus: replayResponse.status(), savedStateReadBeforeReplay: true, allocationCount: database.allocations.length, landingEventCount: database.landed.length, receiptCount: database.payments.length, eligibleNetPence: saved.eligibleNetPence, allocatedTaxPence: saved.allocatedTaxPence, feePence: fee.statement.feePence, result: "PASS" }));
  } catch (error) { failed = true; throw error; }
  finally { await cleanup(info, failed, [
    ["Attach committed-allocation evidence", () => attach(info, "support-v04-committed-allocation-loss", evidence)],
    ["Close committed-allocation context", closeContext(context)],
  ]); }
});
