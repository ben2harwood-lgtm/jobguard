import { expect, test, type Page, type Route } from "@playwright/test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL } from "./global-setup";
import { openReview } from "./helpers/capture-journey";

test.setTimeout(180_000);
const actionTimeout = 10_000, responseTimeout = 30_000;
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
// The actual contract imports ESM-only core output. Use the same built-module
// boundary as the existing allocation helpers, without loading it through CJS.
const captureContracts = () => (new Function("specifier", "return import(specifier)") as
  (specifier: string) => Promise<typeof import("../../api/src/capture/contracts")>)(
  pathToFileURL(join(process.cwd(), "../api/dist/capture/contracts.js")).href);
async function pricing(page: Page) {
  const price = button(page, "Price the work"), editor = page.locator(".quote-editor");
  await Promise.race([price.waitFor({ state: "visible", timeout: actionTimeout }), editor.waitFor({ state: "visible", timeout: actionTimeout })]);
  if (await price.isVisible()) await price.click();
  await expect(editor).toHaveAttribute("data-quote-ready", "true");
}
async function prepareAcceptance(page: Page, phase: (value: string) => void) {
  phase("capture-and-review");
  const [response] = await Promise.all([
    page.waitForResponse(candidate => new URL(candidate.url()).pathname === "/api/jobs/capture" && candidate.request().method() === "POST", { timeout: responseTimeout }),
    openReview(page),
  ]);
  expect(response.status(), await response.text()).toBe(201);
  const captured = (await captureContracts()).captureWorkspaceResponseV1.parse(await response.json());
  expect(captured.proposal.lines).toHaveLength(6);
  const jobId = captured.jobId;
  phase("confirm-captured-scope");
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) await button(page, `Accept ${name}`).click();
  await button(page, "Dismiss Replace shelves").click();
  await page.getByLabel("Dismissal reason Replace shelves").fill("Outside this fictional quote");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  await button(page, "Confirm scope").click();
  await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");
  await expect(page.getByTestId("confirmed-line-count")).toHaveText("5");
  // /classic renders ReviewProposal inline; it has no WorkspaceShell and a
  // reload returns to Jobs. Open the same authoritative job before the fault so
  // the final reload exercises this persisted quote, not the inline wizard.
  phase("open-saved-quote");
  await page.goto(`/jobs/${jobId}#quote`);
  await pricing(page);
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-job-id", jobId);
  await button(page, "Save draft revision").click();
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await page.getByLabel("Unit rate Clean site").fill("200.00");
  await button(page, "Save draft revision").click();
  await expect(page.getByTestId("quote-revision")).toHaveText("2");
  await expect(page.getByTestId("quote-net")).toHaveText("GBP 1,000.00");
  await button(page, "Preview this quote").click();
  await expect(page.getByRole("region", { name: "Quote preview", exact: true })).toBeVisible();
  await button(page, "Simulate sending this quote").click();
  await expect(page.getByTestId("quote-delivery")).toHaveText(/^(Queued — not sent|Simulated delivery — nothing sent)$/u);
  if (await page.getByTestId("quote-delivery").textContent() === "Queued — not sent") await button(page, "Continue fake worker").click();
  await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
  await expect(button(page, "Record practice acceptance")).toBeEnabled();
  return jobId;
}
async function read(page: Page, path: string) {
  const response = await page.request.get(path, { timeout: responseTimeout });
  expect(response.ok(), `Read ${path}: ${response.status()}`).toBe(true);
  return response.json();
}

for (const committedBeforeLoss of [true, false]) {
  test(committedBeforeLoss
    ? "lost committed quote acceptance visibly reconciles with GET only and no duplicate effect"
    : "uncommitted lost quote acceptance stays held after an empty read and retries the identical command", async ({ page }, testInfo) => {
    page.setDefaultTimeout(actionTimeout); page.setDefaultNavigationTimeout(responseTimeout);
    const admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1, connectionTimeoutMillis: actionTimeout, statement_timeout: actionTimeout, query_timeout: actionTimeout });
    const diagnostics: Record<string, unknown> = { committedBeforeLoss }, errors: string[] = [];
    const phase = (value: string) => {
      diagnostics.phase = value;
      console.info("TOMMY_ACCEPTANCE_RECOVERY_PHASE", JSON.stringify({ committedBeforeLoss, project: testInfo.project.name, phase: value }));
    };
    page.on("pageerror", error => errors.push(error.message));
    let path = "", intercept: ((route: Route) => Promise<void>) | undefined, failed = false;
    try {
      const jobId = await prepareAcceptance(page, phase); path = `/api/jobs/${jobId}/quotes/acceptance`;
      diagnostics.jobId = jobId;
      phase("inject-acceptance-response-loss");
      const before = await read(page, path);
      expect(before.activeAcceptance).toBeNull(); expect(before.events).toHaveLength(0);
      const commands: Record<string, unknown>[] = [], rawCommands: (string | null)[] = [];
      diagnostics.rawCommandBodies = rawCommands;
      page.on("request", request => { if (request.url().endsWith(path) && request.method() === "POST") { commands.push(request.postDataJSON()); rawCommands.push(request.postData()); } });
      let resolved!: (value: unknown) => void, rejected!: (error: unknown) => void;
      const lost = new Promise((resolve, reject) => { resolved = resolve; rejected = reject; });
      intercept = async route => {
        if (route.request().method() !== "POST") return route.continue();
        try {
          if (committedBeforeLoss) {
            // Forward the real command exactly once; discard only its committed reply.
            const actual = await route.fetch({ maxRetries: 0, timeout: responseTimeout });
            const body = await actual.json(); diagnostics.committedReply = { status: actual.status(), body };
            expect(actual.status()).toBe(200); expect(body.activeAcceptance).not.toBeNull();
          }
          // The other case proves the empty-read branch with no server write at all.
          await route.abort("failed"); resolved(undefined);
        } catch (error) { rejected(error); await route.abort("failed").catch(() => undefined); }
      };
      await page.route(`**${path}`, intercept);
      const lossDeadline = setTimeout(() => rejected(new Error("Acceptance fault interception did not finish within 30 seconds")), responseTimeout);
      try { await Promise.all([lost, button(page, "Record practice acceptance").click()]); }
      finally { clearTimeout(lossDeadline); }
      const recovery = page.getByRole("status", { name: "Acceptance recovery", exact: true });
      await expect(recovery).toBeVisible(); await expect(recovery).toBeFocused();
      await expect(recovery).toContainText("may or may not have been saved");
      for (const name of ["Record practice acceptance", "Record customer decline", "Supersede quote", "Save draft revision"]) await expect(button(page, name)).toBeDisabled();
      await expect(button(page, "Load the saved acceptance")).toBeEnabled();
      expect(commands).toHaveLength(1); expect(rawCommands).toHaveLength(1);
      expect(rawCommands[0]).toEqual(expect.any(String)); expect(rawCommands[0]!.length).toBeGreaterThan(0);
      const original = commands[0]!; diagnostics.originalCommand = original;
      await page.unroute(`**${path}`, intercept); intercept = undefined;
      const counts = async () => (await admin.query(`SELECT
        (SELECT count(*)::int FROM app.quote_acceptance WHERE job_id=$1) acceptances,
        (SELECT count(*)::int FROM app.acceptance_event WHERE job_id=$1 AND kind='accepted') events,
        (SELECT count(*)::int FROM app.activation_acceptance_operation_use WHERE job_id=$1 AND operation='quote.acceptance.attest') operations`, [jobId])).rows[0];
      const beforeRecovery = await counts(); diagnostics.beforeRecovery = beforeRecovery;
      expect(beforeRecovery).toEqual({ acceptances: committedBeforeLoss ? 1 : 0, events: committedBeforeLoss ? 1 : 0, operations: committedBeforeLoss ? 1 : 0 });
      phase("read-authoritative-acceptance");
      await button(page, "Load the saved acceptance").click();
      if (!committedBeforeLoss) {
        await expect(recovery).toContainText("do not yet confirm");
        await expect(button(page, "Record practice acceptance")).toBeDisabled();
        await expect(button(page, "Record customer decline")).toBeDisabled();
        expect(commands).toHaveLength(1); expect(await counts()).toEqual(beforeRecovery);
        phase("explicit-identical-command-retry");
        const [reply] = await Promise.all([
          page.waitForResponse(response => response.url().endsWith(path) && response.request().method() === "POST", { timeout: responseTimeout }),
          button(page, "Retry this same acceptance").click(),
        ]);
        expect(reply.status()).toBe(200);
        expect(commands).toHaveLength(2); expect(commands[1]).toEqual(original);
        expect(rawCommands).toHaveLength(2); expect(rawCommands[1]).toBe(rawCommands[0]);
      }
      const terms = page.getByRole("region", { name: "Accepted terms", exact: true });
      await expect(terms).toBeVisible(); await expect(terms.getByTestId("accepted-revision")).toContainText("£1,000.00 net");
      await expect(recovery).toHaveCount(0);
      if (committedBeforeLoss) await expect(page.locator(".quote-notice")).toContainText("no new acceptance was sent");
      expect(commands).toHaveLength(committedBeforeLoss ? 1 : 2); expect(errors).toEqual([]);
      const stored = await read(page, path); diagnostics.saved = stored;
      expect(stored.activeAcceptance).toMatchObject({ documentId: original.documentId, documentHash: original.documentHash, documentVersion: original.documentVersion, netPence: 100000, totalPence: 120000 });
      expect(stored.events).toHaveLength(1); expect(stored.effects).toEqual(before.effects);
      expect(await counts()).toEqual({ acceptances: 1, events: 1, operations: 1 });
      const operation = (await admin.query(`SELECT c.command_id,c.command_type,c.status,u.job_id,u.operation
        FROM app.command_receipt c JOIN app.activation_acceptance_operation_use u USING(tenant_id,command_id)
        WHERE c.command_id=$1 AND u.job_id=$2`, [original.commandId, jobId])).rows;
      expect(operation).toEqual([{ command_id: original.commandId, command_type: "quote.acceptance.attest", status: "succeeded", job_id: jobId, operation: "quote.acceptance.attest" }]);
      diagnostics.operation = operation;
      phase("reload-same-saved-quote");
      await page.reload(); await pricing(page);
      await expect(page.locator(".quote-editor")).toHaveAttribute("data-job-id", jobId);
      await expect(terms).toBeVisible(); expect(await read(page, path)).toEqual(stored);
      const finalCounts = await counts();
      expect(finalCounts).toEqual({ acceptances: 1, events: 1, operations: 1 });
      expect(commands).toHaveLength(committedBeforeLoss ? 1 : 2); expect(errors).toEqual([]);
      // Passing Playwright attachments are not uploaded; retain the asserted
      // end state in the green job log without printing customer claim text.
      console.info("TOMMY_ACCEPTANCE_RECOVERY_RECEIPT", JSON.stringify({
        committedBeforeLoss, project: testInfo.project.name, jobId, postCount: commands.length,
        dbCounts: finalCounts, originalCommandId: original.commandId, browserErrors: errors.length,
        rawRetryBytesIdentical: committedBeforeLoss ? null : rawCommands[1] === rawCommands[0],
      }));
    } catch (error) {
      failed = true;
      diagnostics.failure = error instanceof Error ? error.message : String(error);
      console.error("TOMMY_ACCEPTANCE_RECOVERY_FAILURE", JSON.stringify({ committedBeforeLoss, project: testInfo.project.name, phase: diagnostics.phase, failure: diagnostics.failure }));
      throw error;
    } finally {
      const cleanupErrors: string[] = [];
      const cleanup = async (name: string, work: () => Promise<unknown>) => {
        try { await work(); } catch (error) { cleanupErrors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
      };
      await cleanup("route", async () => { if (path && intercept) await page.unroute(`**${path}`, intercept); });
      await cleanup("database pool", () => admin.end());
      diagnostics.cleanupErrors = cleanupErrors;
      await cleanup("attachment", () => testInfo.attach("acceptance-recovery-receipts", { body: JSON.stringify({ diagnostics, browserErrors: errors }, null, 2), contentType: "application/json" }));
      if (cleanupErrors.length) {
        console.error("TOMMY_ACCEPTANCE_RECOVERY_CLEANUP", JSON.stringify({ committedBeforeLoss, project: testInfo.project.name, errors: cleanupErrors }));
        if (!failed) throw new Error(cleanupErrors.join("; "));
      }
    }
  });
}
