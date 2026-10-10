import { randomUUID } from "node:crypto";
import { Pool } from "pg";
// The synthetic demo tenant (packages/db/src/demo-seed.ts), inlined as the other specs do: @jobguard/db is ESM-only and cannot load in a Playwright spec.
const DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";
import { E2E_RUNTIME_URL } from "./global-setup";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { get, persistedRecoverySources, post } from "./helpers/recovery-sources";

test.setTimeout(150_000);
const banner = "Practice sandbox — synthetic data; nothing is sent or charged";
const customerBody = "Practice message — not sent. Our practice records show £320.00 net remains in this case. Please review the attached example records.";
const changed = "Review the changed message before approving";
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
async function click(page: Page, name: string) { await expect(button(page, name)).toBeEnabled(); await button(page, name).click(); }
const V = (page: Page, id: string, value: string) => expect(page.getByTestId(id)).toHaveText(value);
// The panel's own alert: Next also renders a route announcer with role=alert, so a bare getByRole("alert") is ambiguous.
const alertOf = (page: Page) => page.locator("#recovery-follow-ups").getByRole("alert");
const followUps = (caseId: string) => `/api/recovery-cases/${caseId}/follow-ups`;
const messages = (caseId: string) => `/api/recovery-cases/${caseId}/messages`;
const followUpCommand = (page: Page, caseId: string, followUpId: string, body: Record<string, unknown>) =>
  page.request.post(`${followUps(caseId)}/${followUpId}/commands`, { data: { version: "recovery-follow-up-command.v1", commandId: randomUUID(), followUpId, ...body } });

/** A £320 customer case with its evidence pack, and the exact message approved and recorded by the practice provider, all through the real UI. */
async function deliveredMessage(page: Page) {
  const source = await persistedRecoverySources(page);
  // The practice run whose own fake clock the follow-up will run on (the same session, the same API the Jobs home button uses).
  const run = await post(page, "/api/sandbox/runs", { contractVersion: "sandbox_command_v1", commandId: randomUUID() });
  await page.goto(`/jobs/${source.jobId}#recovery-cases`);
  await click(page, "Open £320 withheld payment");
  await expect(page.getByTestId("case-claimed-net")).toHaveText("£320.00");
  const caseId = (await get(page, `/api/jobs/${source.jobId}/recovery-cases`)).cases.at(-1).id as string;
  await click(page, "Build evidence pack");
  await expect(page.getByTestId("pack-state")).toHaveText("Sources mapped — inspect the evidence");
  await click(page, "Approve this pack for attachment");
  await expect(page.getByTestId("pack-current-attachment-status")).toHaveText("Attachment approval recorded for these exact hashes");
  await click(page, "Preview factual message");
  await click(page, "Approve this exact message");
  await V(page, "pursuit-delivery", "Approved — queued, nothing sent");
  await click(page, "Advance practice delivery");
  await V(page, "pursuit-delivery", "Simulated delivery — nothing sent");
  await V(page, "pursuit-sink-count", "1");
  return { source, caseId, runId: run.run.id as string };
}
/** One M4-1-S workbench event on the case through the real recovery API, at the revision the server now reports. */
async function caseEvent(page: Page, jobId: string, eventType: string, amountPence?: number) {
  const current = (await get(page, `/api/jobs/${jobId}/recovery-cases`)).cases.at(-1);
  await post(page, `/api/jobs/${jobId}/recovery-cases`, { version: "recovery-case-command.v1", action: "transition", commandId: randomUUID(), caseId: current.id, eventType, ...(amountPence ? { amountPence } : {}), expectedRevision: current.revision });
}
async function assertLayout(page: Page, names: string[]) {
  await expect(page.getByText(banner, { exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const first = button(page, names[0]!); await first.focus(); await expect(first).toBeFocused();
  const focus = await first.evaluate(element => ({ outline: getComputedStyle(element).outlineStyle, shadow: getComputedStyle(element).boxShadow }));
  expect(focus.outline !== "none" || focus.shadow !== "none").toBe(true);
  for (const name of names) { const bounds = await button(page, name).boundingBox(); expect(bounds, name).not.toBeNull(); expect(bounds!.height, name).toBeGreaterThanOrEqual(44); expect(bounds!.width, name).toBeGreaterThanOrEqual(44); }
}
/** The saved state, read the three ways a builder can meet it: after a reload, after leaving through Jobs and reopening the job, and from a second browser context. */
async function persisted(page: Page, browser: Browser, jobId: string, assert: (target: Page) => Promise<void>) {
  await page.reload(); await assert(page);
  await page.goto("/"); await expect(page.getByRole("heading", { name: "Jobs in this demo", exact: true })).toBeVisible();
  await page.goto(`/jobs/${jobId}#recovery-cases`); await assert(page);
  const second = await browser.newContext({ storageState: await page.context().storageState() });
  try { const other = await second.newPage(); await other.goto(`/jobs/${jobId}#recovery-cases`); await assert(other); }
  finally { await second.close(); }
}

test("passing practice time only makes the reminder ready to review; only approving the exact reminder sends it, once, and a revoked approval needs approving again", async ({ page, browser }, testInfo) => {
  const { source, caseId, runId } = await deliveredMessage(page);
  const database = new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 });
  const rows = async (sql: string, args: unknown[] = []) => {
    const client = await database.connect();
    try { await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]); return (await client.query(sql, args)).rows; }
    finally { await client.query("ROLLBACK"); client.release(); }
  };
  const evidence = async () => (await rows(
    `SELECT (SELECT count(*)::int FROM app.recovery_message_sink WHERE case_id=$1) sink, (SELECT count(*)::int FROM app.recovery_message_approval WHERE case_id=$1) approvals,
      (SELECT count(*)::int FROM app.action_authorization a JOIN app.recovery_message_approval p ON p.tenant_id=a.tenant_id AND p.authorization_id=a.id WHERE p.case_id=$1) authorizations,
      (SELECT count(*)::int FROM app.action_outbox o JOIN app.recovery_message_approval p ON p.tenant_id=o.tenant_id AND p.outbox_action_id=o.id WHERE p.case_id=$1) outbox`, [caseId]))[0];
  try {
    // DW1: passing the due time gives Review reminder and no new simulated message.
    await click(page, "Refresh follow-up");
    await click(page, "Schedule a follow-up reminder");
    await V(page, "follow-up-state", "Waiting for the due time"); await V(page, "new-simulated-messages", "0"); await V(page, "follow-up-clock", "Tick 0 of 3");
    await V(page, "follow-up-owner", `Practice fake clock · run ${runId}`);
    await expect(button(page, "Preview the reminder")).toBeDisabled(); await expect(button(page, "Approve this exact reminder")).toBeDisabled();
    const before = await evidence();
    expect(before).toEqual({ sink: 1, approvals: 1, authorizations: 1, outbox: 1 });
    await click(page, "Advance practice time");
    await V(page, "follow-up-state", "Review reminder"); await V(page, "new-simulated-messages", "0"); await V(page, "follow-up-clock", "Tick 1 of 3");
    await V(page, "follow-up-decision", "Pending — nothing authorized");
    expect(await evidence()).toEqual(before);
    const due = (await get(page, followUps(caseId))).latest;
    expect(due).toMatchObject({ state: "review_reminder", label: "Review reminder", newSimulatedMessages: 0, reminder: null, owner: { kind: "practice_fake_clock", runId } });
    const assertDue = async (target: Page) => {
      await V(target, "follow-up-state", "Review reminder"); await V(target, "new-simulated-messages", "0"); await V(target, "follow-up-clock", "Tick 1 of 3");
      await V(target, "follow-up-decision", "Pending — nothing authorized"); await V(target, "pursuit-sink-count", "1");
      await assertLayout(target, ["Advance practice time", "Refresh follow-up"]);
    };
    await persisted(page, browser, source.jobId, assertDue);

    // DW2: the reminder is opened through the M4-5-S path as a preview; it is not yet approved, authorized or queued.
    await click(page, "Preview the reminder");
    await V(page, "follow-up-delivery", "Preview only — awaiting your approval");
    await V(page, "follow-up-recipient", "practice-customer@example.invalid"); await V(page, "follow-up-body", customerBody); await V(page, "follow-up-amount", "£320.00");
    await V(page, "follow-up-state", "Review reminder");
    expect(await evidence()).toEqual(before);
    const previewed = (await get(page, followUps(caseId))).latest;
    expect(previewed.reminder).toMatchObject({ attempt: 1, status: "previewed", body: customerBody, recipient: "practice-customer@example.invalid", amountPence: 32000 });
    // Forged or changed approvals are refused with the M4-5-S changed-message refusal and approve nothing.
    const exact = { action: "approve_reminder", expectedRevision: previewed.revision, messageId: previewed.reminder.messageId, expectedMessageRevision: previewed.reminder.revision,
      recipient: previewed.reminder.recipient, body: previewed.reminder.body, amountPence: 32000, packId: previewed.reminder.packId, contentHash: previewed.reminder.contentHash };
    for (const forged of [{ amountPence: 9_000_000 }, { body: `${customerBody} Pay today or face court.` }, { contentHash: "f".repeat(64) }, { recipient: "practice-supplier@example.invalid" }]) {
      const response = await followUpCommand(page, caseId, previewed.id, { ...exact, ...forged });
      expect(response.status()).toBe(409); expect(await response.json()).toEqual({ code: "RECOVERY_MESSAGE_CHANGED" });
    }
    for (const forged of [{ tenantId: randomUUID() }, { actorRef: "forged" }, { mode: "production" }, { recipient: "real.person@gmail.com" }, { approved: true }]) {
      expect((await followUpCommand(page, caseId, previewed.id, { ...exact, ...forged })).status()).toBe(400);
    }
    // The plain message route keeps its one-effect rule: only the follow-up's own command can approve its reminder.
    const plain = await page.request.post(`${messages(caseId)}/${previewed.reminder.messageId}/commands`, { data: { version: "recovery-message-command.v1", commandId: randomUUID(), action: "approve", messageId: previewed.reminder.messageId,
      expectedRevision: previewed.reminder.revision, recipient: previewed.reminder.recipient, body: previewed.reminder.body, amountPence: 32000, packId: previewed.reminder.packId, contentHash: previewed.reminder.contentHash } });
    expect(plain.status()).toBe(409); expect((await plain.json()).code).toBe("RECOVERY_MESSAGE_EXISTING_EFFECT");
    expect(await evidence()).toEqual(before);
    await expect(page.getByTestId("follow-up-reminder-changed")).toHaveCount(0);
    // Approving the exact reminder queues it; approval is not delivery.
    await click(page, "Approve this exact reminder");
    await V(page, "follow-up-delivery", "Approved — queued, nothing sent"); await V(page, "follow-up-state", "Approved — queued, nothing sent"); await V(page, "new-simulated-messages", "0");
    expect(await evidence()).toEqual({ sink: 1, approvals: 2, authorizations: 2, outbox: 2 });
    // DW5: revoking the approval behind a pending reminder shows Approval needed again, blocks execution and records nothing.
    await click(page, "Revoke the reminder approval");
    await V(page, "follow-up-state", "Approval needed again");
    await V(page, "follow-up-delivery", "Approval revoked — nothing sent");
    const revoked = (await get(page, messages(caseId))).latest;
    expect(revoked).toMatchObject({ status: "revoked" });
    const refused = await page.request.post(`${messages(caseId)}/${revoked.id}/commands`, { data: { version: "recovery-message-command.v1", commandId: randomUUID(), action: "advance", messageId: revoked.id, expectedRevision: revoked.revision, outcome: "success" } });
    expect(refused.status()).toBe(409); expect((await refused.json()).code).toBe("RECOVERY_MESSAGE_REVOKED");
    expect((await evidence()).sink).toBe(1);
    await V(page, "new-simulated-messages", "0");
    await expect(button(page, "Approve this exact reminder")).toBeDisabled();
    // A fresh reviewed reminder, approved again, is delivered exactly once.
    await click(page, "Preview the reminder");
    await V(page, "follow-up-delivery", "Preview only — awaiting your approval"); await V(page, "follow-up-state", "Review reminder");
    await click(page, "Approve this exact reminder");
    await V(page, "follow-up-delivery", "Approved — queued, nothing sent");
    await click(page, "Deliver the reminder to the practice sink");
    await V(page, "follow-up-delivery", "Simulated delivery — nothing sent"); await V(page, "follow-up-state", "Simulated delivery — nothing sent"); await V(page, "new-simulated-messages", "1");
    expect((await evidence()).sink).toBe(2);
    const sink = (await get(page, messages(caseId))).sink;
    expect(sink).toHaveLength(2);
    expect(sink.at(-1)).toMatchObject({ recipient: "practice-customer@example.invalid", body: customerBody, environment: "synthetic_demo" });
    await expect(button(page, "Deliver the reminder to the practice sink")).toHaveCount(0);
    // Persisted: the M4-5-S panel and the follow-up panel both read the delivered reminder after a reload, a fresh navigation and a second context.
    const assertDelivered = async (target: Page) => {
      await V(target, "follow-up-state", "Simulated delivery — nothing sent"); await V(target, "new-simulated-messages", "1");
      await V(target, "pursuit-delivery", "Simulated delivery — nothing sent"); await V(target, "pursuit-sink-count", "2"); await V(target, "follow-up-real-actions", "0");
    };
    await persisted(page, browser, source.jobId, assertDelivered);
    await assertLayout(page, ["Advance practice time", "Refresh follow-up", "Cancel this follow-up"]);
    // Another practice session cannot see or act on this one's follow-up (a plain 404, nothing disclosed), and with no session at all it is a 401.
    const saved = await get(page, followUps(caseId));
    const stranger = await browser.newContext({ baseURL: "http://127.0.0.1:3000", viewport: page.viewportSize() });
    const missing = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
    try {
      expect((await stranger.request.post("/api/session")).ok()).toBe(true);
      const version = "recovery-follow-up-command.v1", followUpId = saved.latest.id;
      for (const context of [stranger, missing]) {
        const expected = context === stranger ? { status: 404, code: "NOT_FOUND" } : { status: 401, code: "UNAUTHENTICATED" };
        const responses = [
          await context.request.get(followUps(caseId)),
          await context.request.post(followUps(caseId), { data: { version, action: "schedule", commandId: randomUUID(), sourceMessageId: randomUUID(), expectedCaseRevision: 2 } }),
          ...await Promise.all(["advance_time", "cancel"].map(action => context.request.post(`${followUps(caseId)}/${followUpId}/commands`, { data: { version, action, commandId: randomUUID(), followUpId, ...(action === "cancel" ? { expectedRevision: saved.latest.revision } : {}) } }))),
        ];
        for (const response of responses) { expect(response.status(), await response.text()).toBe(expected.status); expect(await response.json()).toEqual({ code: expected.code }); }
      }
      expect(await get(page, followUps(caseId))).toEqual(saved);
    } finally { await stranger.close(); await missing.close(); }
    await page.locator("#recovery-follow-ups").screenshot({ path: `test-results/M4-6-S-reminder-${testInfo.project.name}.png` });
  } finally { await database.end(); }
});

test("a cancellation, a dispute and a settlement each show Stopped and create no due Decision; a reopened case needs a new reviewed follow-up", async ({ page, browser }, testInfo) => {
  const { source, caseId } = await deliveredMessage(page);
  const stoppedAfterAdvance = async (state: string) => {
    const decisions = (await get(page, followUps(caseId))).followUps.map((item: { dueDecision: unknown }) => item.dueDecision);
    await click(page, "Advance practice time");
    await V(page, "follow-up-state", state);
    const after = (await get(page, followUps(caseId))).followUps.map((item: { dueDecision: unknown }) => item.dueDecision);
    expect(after).toEqual(decisions);
  };
  await click(page, "Refresh follow-up");
  // Cancel: an immutable cancellation shows Stopped, and a later advance creates nothing.
  await click(page, "Schedule a follow-up reminder");
  await V(page, "follow-up-state", "Waiting for the due time");
  await click(page, "Cancel this follow-up");
  await V(page, "follow-up-state", "Stopped"); await V(page, "new-simulated-messages", "0");
  await V(page, "follow-up-stopped", "You cancelled this follow-up.");
  await expect(button(page, "Cancel this follow-up")).toBeDisabled(); await expect(button(page, "Preview the reminder")).toBeDisabled();
  await stoppedAfterAdvance("Stopped");
  const cancelled = (await get(page, followUps(caseId))).latest;
  expect(cancelled).toMatchObject({ state: "stopped", stopReason: "cancelled", dueDecision: null });

  // Dispute: the case moves on, then is disputed.
  await click(page, "Schedule a follow-up reminder");
  await V(page, "follow-up-state", "Waiting for the due time");
  await caseEvent(page, source.jobId, "assemble_evidence");
  await click(page, "Refresh follow-up"); await V(page, "follow-up-state", "Waiting for the due time");
  await caseEvent(page, source.jobId, "dispute");
  await click(page, "Refresh follow-up"); await V(page, "follow-up-state", "Stopped");
  await V(page, "follow-up-stopped", "The case moved on, so this follow-up ended.");
  expect((await get(page, followUps(caseId))).latest).toMatchObject({ state: "stopped", stopReason: "case_disputed", dueDecision: null });
  await stoppedAfterAdvance("Stopped");

  // Settlement: received in full, then closed as recovered.
  await click(page, "Schedule a follow-up reminder");
  await V(page, "follow-up-state", "Waiting for the due time");
  await caseEvent(page, source.jobId, "record_landing", 32000); await caseEvent(page, source.jobId, "close_recovered");
  await click(page, "Refresh follow-up"); await V(page, "follow-up-state", "Stopped");
  expect((await get(page, followUps(caseId))).latest).toMatchObject({ state: "stopped", stopReason: "case_settled", dueDecision: null });
  expect((await get(page, followUps(caseId))).followUps).toHaveLength(3);

  // A reopened case (the received money reversed after the close) never revives a stopped follow-up. A fresh practice run carries the new, reviewed one.
  await caseEvent(page, source.jobId, "reverse_landing", 32000);
  await click(page, "Refresh follow-up");
  await V(page, "follow-up-state", "Stopped");
  await V(page, "follow-up-stopped", "The case was reopened. This follow-up stays stopped; schedule a new reviewed follow-up if you want one.");
  expect((await get(page, followUps(caseId))).latest).toMatchObject({ state: "stopped", reopened: true });
  await expect(page.getByTestId("follow-up-not-ready")).toHaveCount(0);
  const fresh = await post(page, "/api/sandbox/runs", { contractVersion: "sandbox_command_v1", commandId: randomUUID() });
  await click(page, "Refresh follow-up");
  await click(page, "Schedule a follow-up reminder");
  await V(page, "follow-up-state", "Waiting for the due time"); await V(page, "follow-up-clock", "Tick 0 of 3");
  const second = (await get(page, followUps(caseId))).latest;
  expect(second.owner.runId).toBe(fresh.run.id);
  await click(page, "Advance practice time");
  await V(page, "follow-up-state", "Review reminder"); await V(page, "new-simulated-messages", "0");
  // Nothing was sent for any of it: the sink still holds the one delivered message.
  expect((await get(page, messages(caseId))).sinkCount).toBe(1);
  const all = (await get(page, followUps(caseId))).followUps as Array<{ state: string; dueDecision: unknown }>;
  expect(all.map(item => item.state)).toEqual(["stopped", "stopped", "stopped", "review_reminder"]);
  expect(all.filter(item => item.dueDecision).length).toBe(1);
  await persisted(page, browser, source.jobId, async target => { await V(target, "follow-up-state", "Review reminder"); await V(target, "new-simulated-messages", "0"); });
  await assertLayout(page, ["Advance practice time", "Refresh follow-up", "Schedule a follow-up reminder"]);
  await page.locator("#recovery-follow-ups").screenshot({ path: `test-results/M4-6-S-stopped-${testInfo.project.name}.png` });
});
