import { expect, test, type Page, type Route } from "@playwright/test";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL } from "./global-setup";
import { openReview } from "./helpers/capture-journey";

test.setTimeout(180_000);
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
async function pricing(page: Page) {
  const price = button(page, "Price the work"), editor = page.locator(".quote-editor");
  await Promise.race([price.waitFor({ state: "visible" }), editor.waitFor({ state: "visible" })]);
  if (await price.isVisible()) await price.click();
  await expect(editor).toHaveAttribute("data-quote-ready", "true");
}
async function prepareAcceptance(page: Page) {
  await openReview(page);
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) await button(page, `Accept ${name}`).click();
  await button(page, "Dismiss Replace shelves").click();
  await page.getByLabel("Dismissal reason Replace shelves").fill("Outside this fictional quote");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  await button(page, "Confirm scope").click();
  await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");
  await expect(page.getByTestId("confirmed-line-count")).toHaveText("5");
  const jobId = (await page.locator("#captured-job-workspace").getAttribute("data-job-id"))!;
  await pricing(page);
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
async function read(page: Page, path: string) {
  const response = await page.request.get(path);
  expect(response.ok(), `Read ${path}: ${response.status()}`).toBe(true);
  return response.json();
}

for (const committedBeforeLoss of [true, false]) {
  test(committedBeforeLoss
    ? "lost committed quote acceptance visibly reconciles with GET only and no duplicate effect"
    : "uncommitted lost quote acceptance stays held after an empty read and retries the identical command", async ({ page }, testInfo) => {
    const admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
    const diagnostics: Record<string, unknown> = { committedBeforeLoss }, errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let path = "", intercept: ((route: Route) => Promise<void>) | undefined;
    try {
      const jobId = await prepareAcceptance(page); path = `/api/jobs/${jobId}/quotes/acceptance`;
      diagnostics.jobId = jobId;
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
            const actual = await route.fetch({ maxRetries: 0 });
            const body = await actual.json(); diagnostics.committedReply = { status: actual.status(), body };
            expect(actual.status()).toBe(200); expect(body.activeAcceptance).not.toBeNull();
          }
          // The other case proves the empty-read branch with no server write at all.
          await route.abort("failed"); resolved(undefined);
        } catch (error) { await route.abort("failed").catch(() => undefined); rejected(error); }
      };
      await page.route(`**${path}`, intercept);
      await button(page, "Record practice acceptance").click(); await lost;
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
      await button(page, "Load the saved acceptance").click();
      if (!committedBeforeLoss) {
        await expect(recovery).toContainText("do not yet confirm");
        await expect(button(page, "Record practice acceptance")).toBeDisabled();
        await expect(button(page, "Record customer decline")).toBeDisabled();
        expect(commands).toHaveLength(1); expect(await counts()).toEqual(beforeRecovery);
        const reply = page.waitForResponse(response => response.url().endsWith(path) && response.request().method() === "POST");
        await button(page, "Retry this same acceptance").click();
        expect((await reply).status()).toBe(200);
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
      await page.reload(); await pricing(page);
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
    } finally {
      if (path && intercept) await page.unroute(`**${path}`, intercept);
      await testInfo.attach("acceptance-recovery-receipts", { body: JSON.stringify({ diagnostics, browserErrors: errors }, null, 2), contentType: "application/json" });
      await admin.end();
    }
  });
}
