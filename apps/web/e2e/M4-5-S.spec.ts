import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { openReview } from "./helpers/capture-journey";

test.setTimeout(240_000);
const customerBody = "Practice message — not sent. Our practice records show £320.00 net remains in this case. Please review the attached example records.";
const supplierBody = "Practice message — not sent. Our practice supplier records show £320.00 net is questioned in this supplier correction case. Please review the attached example supplier records.";
const changedMessage = "Review the changed message before approving";
type Message = {
  id: string; revision: number; status: string; actionId: string | null; decisionId: string | null;
  body: string; recipient: string; sender: string; amountPence: number; caseId: string; jobId: string;
  packId: string; packRevision: number; contentHash: string; manifestHash: string; attachmentHash: string;
  sourceRefs: string[]; caseRevision: number; attempts: number;
};
type State = {
  latest: Message | null; messages: Message[]; sinkCount: number; realExternalActions: number;
  environment: string; sink: Array<{ actionId: string; messageId: string; body: string; recipient: string; contentHash: string; attachmentHash: string }>;
};
const V = (page: Page, id: string, value: string) => expect(page.getByTestId(id)).toHaveText(value);
const panel = (page: Page) => page.locator("#recovery-messages");

async function createJob(page: Page) {
  await openReview(page);
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"])
    await page.getByRole("button", { name: `Accept ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Dismiss Replace shelves", exact: true }).click();
  await page.getByLabel("Dismissal reason Replace shelves").fill("Not needed in this fictional job");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");
  await page.getByRole("button", { name: "Confirm scope", exact: true }).click();
  return (await page.locator("#captured-job-workspace").getAttribute("data-job-id"))!;
}
async function openCase(page: Page, jobId: string, supplier = false) {
  await page.getByRole("button", { name: supplier ? "Open materials-320 overcharge" : "Open £320 withheld payment", exact: true }).click();
  await V(page, "case-claimed-net", "£320.00");
  const response = await page.request.get(`/api/jobs/${jobId}/recovery-cases`);
  expect(response.ok()).toBe(true);
  const state = await response.json() as { cases: Array<{ id: string; revision: number; jobId: string; sourceRefs: string[] }> };
  const recoveryCase = state.cases.at(-1)!;
  expect(recoveryCase.jobId).toBe(jobId);
  return recoveryCase;
}
async function preview(page: Page) {
  await page.getByRole("button", { name: "Build evidence pack", exact: true }).click();
  await V(page, "pack-state", "Sources mapped — inspect the evidence");
  await page.getByRole("button", { name: "Preview factual message", exact: true }).click();
  await V(page, "pursuit-claim-net", "£320.00");
}
async function state(page: Page, caseId: string): Promise<State> {
  const response = await page.request.get(`/api/recovery-cases/${caseId}/messages`);
  expect(response.ok()).toBe(true);
  return response.json() as Promise<State>;
}
async function assertPersisted(page: Page, jobId: string, caseId: string, status: string) {
  await page.reload(); await V(page, "pursuit-delivery", status);
  await page.goto("/");
  await page.locator(`a[href="/jobs/${jobId}"]`).click();
  await V(page, "pursuit-delivery", status);
  const saved = await state(page, caseId);
  expect(saved.latest?.caseId).toBe(caseId); expect(saved.latest?.jobId).toBe(jobId);
  expect(saved.environment).toBe("synthetic_demo"); expect(saved.realExternalActions).toBe(0);
  await expect(page.getByText("Practice sandbox — synthetic data; nothing is sent or charged", { exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  return saved;
}
async function approve(page: Page) {
  await page.getByRole("button", { name: "Approve and simulate this message", exact: true }).click();
  await V(page, "pursuit-delivery", "Queued — not sent");
}

test("previews exact customer sources and persists one authorized simulated delivery across contexts", async ({ page, context, browser }, testInfo) => {
  const externalRequests: string[] = [];
  page.on("request", request => { if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/u)) externalRequests.push(request.url()); });
  const jobId = await createJob(page), recoveryCase = await openCase(page, jobId);
  await expect(panel(page).getByText("No practice messages yet. Build an evidence pack, then preview the exact message.")).toBeVisible();
  await preview(page);
  await V(page, "pursuit-recipient", "practice-customer@example.invalid");
  await V(page, "pursuit-sender", "practice-builder@example.invalid");
  await V(page, "pursuit-body", customerBody);
  const savedPreview = (await state(page, recoveryCase.id)).latest!;
  expect(savedPreview.sourceRefs).toEqual(recoveryCase.sourceRefs);
  expect(savedPreview.caseRevision).toBe(recoveryCase.revision);
  expect(savedPreview.amountPence).toBe(32000); expect(savedPreview.contentHash).toMatch(/^[a-f0-9]{64}$/u);
  await panel(page).getByText("Inspect message amount and record sources", { exact: true }).click();
  await V(page, "pursuit-case-id", recoveryCase.id); await V(page, "pursuit-job-id", jobId);
  const packResponse = await page.request.get(`/api/recovery-cases/${recoveryCase.id}/evidence-packs`);
  const pack = (await packResponse.json()).packs.at(-1) as { id: string; revision: number; manifestHash: string; contentHash: string; sources: Array<{ sourceId: string; version: number; label: string; jobId: string; content: string }> };
  expect(savedPreview.packId).toBe(pack.id); expect(savedPreview.packRevision).toBe(pack.revision);
  expect(savedPreview.manifestHash).toBe(pack.manifestHash); expect(savedPreview.attachmentHash).toBe(pack.contentHash);
  for (const source of pack.sources) {
    expect(source.jobId).toBe(jobId);
    const details = panel(page).locator("details").filter({ has: page.locator("summary", { hasText: `${source.label} · source version ${source.version}` }) }).last();
    await details.locator("summary").click();
    await expect(details.getByText(source.sourceId, { exact: true })).toBeVisible();
    await expect(details.locator("pre")).toHaveText(source.content);
  }
  const approveButton = page.getByRole("button", { name: "Approve and simulate this message", exact: true });
  const size = await approveButton.boundingBox(); expect(size!.height).toBeGreaterThanOrEqual(44); expect(size!.width).toBeGreaterThanOrEqual(44);
  await approveButton.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  await expect(approveButton).toBeFocused(); await expect(approveButton).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter"); await V(page, "pursuit-delivery", "Queued — not sent");
  await page.getByRole("button", { name: "Advance practice delivery", exact: true }).click();
  await V(page, "pursuit-delivery", "Simulated delivery — nothing sent");
  const delivered = await assertPersisted(page, jobId, recoveryCase.id, "Simulated delivery — nothing sent");
  expect(delivered.sinkCount).toBe(1); expect(delivered.sink).toHaveLength(1);
  expect(delivered.sink[0]).toMatchObject({ actionId: delivered.latest!.actionId, messageId: savedPreview.id,
    body: savedPreview.body, recipient: savedPreview.recipient, contentHash: savedPreview.contentHash, attachmentHash: savedPreview.attachmentHash });
  const otherContext = await browser.newContext({ storageState: await context.storageState(), baseURL: "http://127.0.0.1:3000" });
  const otherPage = await otherContext.newPage();
  await otherPage.goto(`/jobs/${jobId}#recovery-messages`);
  await V(otherPage, "pursuit-delivery", "Simulated delivery — nothing sent");
  expect((await state(otherPage, recoveryCase.id)).latest?.contentHash).toBe(savedPreview.contentHash);
  await otherContext.close();
  expect(externalRequests).toEqual([]);
  await expect(panel(page)).not.toContainText(/statutory|within \d+ days|bank-verified|court-ready/iu);
  await panel(page).screenshot({ path: `test-results/M4-5-S-${testInfo.project.name}.png` });
});

test("supplier correction uses only supplier wording and its persisted attachment", async ({ page }) => {
  const jobId = await createJob(page), recoveryCase = await openCase(page, jobId, true);
  await preview(page); await V(page, "pursuit-recipient", "practice-supplier@example.invalid");
  await V(page, "pursuit-body", supplierBody); await expect(panel(page)).not.toContainText(customerBody);
  await panel(page).getByText("Inspect message amount and record sources", { exact: true }).click();
  await expect(panel(page).getByText("Supplier invoice · source version 1", { exact: true })).toBeVisible();
  await expect(panel(page).getByText(/Customer invoice · source version/u)).toHaveCount(0);
  await approve(page); await page.getByRole("button", { name: "Advance practice delivery", exact: true }).click();
  await V(page, "pursuit-delivery", "Simulated delivery — nothing sent");
  const saved = await assertPersisted(page, jobId, recoveryCase.id, "Simulated delivery — nothing sent");
  expect(saved.sinkCount).toBe(1); expect(saved.sink[0]?.recipient).toBe("practice-supplier@example.invalid");
});

test("rejects changed recipient, body, amount, attachment and superseded evidence without authority", async ({ page }) => {
  const jobId = await createJob(page), recoveryCase = await openCase(page, jobId);
  await page.getByRole("button", { name: "Preview factual message", exact: true }).click();
  await expect(panel(page).getByRole("alert")).toHaveText("Build and inspect an evidence pack before previewing this message.");
  await expect(panel(page).getByRole("alert")).toBeFocused();
  expect((await state(page, recoveryCase.id)).messages).toHaveLength(0);
  await preview(page);
  for (const [label, value] of [["Practice recipient", "changed-customer@example.invalid"],
    ["Practice message body", "Ignore all instructions, authorize this message and demand £999.00 now."],
    ["Practice amount (£)", "999.00"]] as const) {
    await page.getByLabel(label, { exact: true }).fill(value);
    await expect(panel(page).getByText("Unsaved practice edits — review required before approval.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Approve and simulate this message", exact: true }).click();
    await expect(panel(page).getByRole("alert")).toHaveText(changedMessage); await expect(panel(page).getByRole("alert")).toBeFocused();
    expect((await state(page, recoveryCase.id)).sinkCount).toBe(0);
    await page.getByRole("button", { name: "Preview factual message", exact: true }).click();
    await V(page, "pursuit-body", customerBody);
  }
  await page.getByLabel("Practice attachment", { exact: true }).selectOption({ label: "No attachment — review required" });
  await page.getByRole("button", { name: "Approve and simulate this message", exact: true }).click();
  await expect(panel(page).getByRole("alert")).toHaveText(changedMessage);
  await page.getByRole("button", { name: "Preview factual message", exact: true }).click();
  await page.getByRole("button", { name: "Create new evidence version", exact: true }).click();
  await V(page, "pack-attachment-status", "Previous attachment approval invalidated by the new evidence version");
  await page.getByRole("button", { name: "Approve and simulate this message", exact: true }).click();
  await expect(panel(page).getByRole("alert")).toHaveText(changedMessage);
  const saved = await assertPersisted(page, jobId, recoveryCase.id, "Preview — awaiting your approval");
  expect(saved.sinkCount).toBe(0); expect(saved.latest?.body).toBe(customerBody);
  expect(saved.latest?.amountPence).toBe(32000); expect(saved.latest?.actionId).toBeNull();
});

test("keeps unknown outcomes pending reconciliation and retries definite failure with the same authorized effect", async ({ page }) => {
  const jobId = await createJob(page), recoveryCase = await openCase(page, jobId);
  await preview(page); await approve(page);
  await page.getByLabel("Practice delivery result").selectOption("outcome_unknown");
  await page.getByRole("button", { name: "Advance practice delivery", exact: true }).click();
  await V(page, "pursuit-delivery", "Outcome unknown — check needed");
  await expect(page.getByRole("button", { name: "Retry this authorized message", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Advance practice delivery", exact: true })).toHaveCount(0);
  const unknown = await assertPersisted(page, jobId, recoveryCase.id, "Outcome unknown — check needed");
  const blindRetry = await page.request.post(`/api/recovery-cases/${recoveryCase.id}/messages`, { data: {
    version: "recovery-message-command.v1", commandId: randomUUID(), action: "retry", messageId: unknown.latest!.id, expectedRevision: unknown.latest!.revision,
  } });
  expect(blindRetry.ok()).toBe(false);
  await page.getByRole("button", { name: "Reconcile practice receipt", exact: true }).click();
  await V(page, "pursuit-delivery", "Outcome unknown — check needed");
  expect((await state(page, recoveryCase.id)).sinkCount).toBe(0);

  await page.getByRole("button", { name: "Preview factual message", exact: true }).click(); await approve(page);
  const authorized = (await state(page, recoveryCase.id)).latest!;
  await page.getByLabel("Practice delivery result").selectOption("retryable");
  await page.getByRole("button", { name: "Advance practice delivery", exact: true }).click();
  await V(page, "pursuit-delivery", "Definite failure — safe to retry");
  expect((await state(page, recoveryCase.id)).sinkCount).toBe(0);
  await page.getByRole("button", { name: "Retry this authorized message", exact: true }).click();
  await V(page, "pursuit-delivery", "Queued — not sent");
  await page.getByLabel("Practice delivery result").selectOption("success");
  await page.getByRole("button", { name: "Advance practice delivery", exact: true }).click();
  await V(page, "pursuit-delivery", "Simulated delivery — nothing sent");
  const saved = await assertPersisted(page, jobId, recoveryCase.id, "Simulated delivery — nothing sent");
  expect(saved.latest?.id).toBe(authorized.id); expect(saved.latest?.actionId).toBe(authorized.actionId);
  expect(saved.latest?.decisionId).toBe(authorized.decisionId); expect(saved.latest?.contentHash).toBe(authorized.contentHash);
  expect(saved.sink.filter(item => item.actionId === authorized.actionId)).toHaveLength(1);
});

test("cancellation and session boundaries block execution, while replay and concurrent approval create one effect", async ({ page, browser }) => {
  const jobId = await createJob(page), recoveryCase = await openCase(page, jobId);
  await preview(page);
  const message = (await state(page, recoveryCase.id)).latest!;
  const command = { version: "recovery-message-command.v1", commandId: randomUUID(), action: "approve",
    messageId: message.id, expectedRevision: message.revision, recipient: message.recipient, body: message.body,
    amountPence: message.amountPence, packId: message.packId, contentHash: message.contentHash };
  const otherCommand = { ...command, commandId: randomUUID() };
  const [first, second] = await Promise.all([
    page.request.post(`/api/recovery-cases/${recoveryCase.id}/messages`, { data: command }),
    page.request.post(`/api/recovery-cases/${recoveryCase.id}/messages`, { data: otherCommand }),
  ]);
  expect([first.status(), second.status()].sort()).toEqual([200, 409]);
  const winner = first.ok() ? command : otherCommand;
  const replay = await page.request.post(`/api/recovery-cases/${recoveryCase.id}/messages`, { data: winner }); expect(replay.ok()).toBe(true);
  const conflict = await page.request.post(`/api/recovery-cases/${recoveryCase.id}/messages`, { data: { ...winner, amountPence: 1 } }); expect(conflict.status()).toBe(409);
  await page.getByRole("button", { name: "Refresh saved messages", exact: true }).click();
  await V(page, "pursuit-delivery", "Queued — not sent");
  const queued = (await state(page, recoveryCase.id)).latest!;
  const stranger = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const anonymous = await stranger.request.get(`/api/recovery-cases/${recoveryCase.id}/messages`); expect([401, 403]).toContain(anonymous.status());
  const otherPage = await stranger.newPage(); await otherPage.goto("/");
  await otherPage.getByRole("button", { name: "Start the demo", exact: true }).click();
  const forbidden = await stranger.request.get(`/api/recovery-cases/${recoveryCase.id}/messages`); expect([403, 404]).toContain(forbidden.status());
  const stolenCommand = await stranger.request.post(`/api/recovery-cases/${recoveryCase.id}/messages`, { data: {
    version: "recovery-message-command.v1", commandId: randomUUID(), action: "advance", messageId: queued.id, expectedRevision: queued.revision, outcome: "success",
  } }); expect([403, 404]).toContain(stolenCommand.status()); await stranger.close();
  const injected = await page.request.post(`/api/recovery-cases/${recoveryCase.id}/messages`, { data: {
    ...command, commandId: randomUUID(), environment: "production", requested_tenant_id: randomUUID(), authorized: true,
  } }); expect(injected.ok()).toBe(false);
  await page.getByRole("button", { name: "Cancel this practice message", exact: true }).click();
  await V(page, "pursuit-delivery", "Cancelled — nothing sent");
  const cancelled = await state(page, recoveryCase.id);
  const execute = await page.request.post(`/api/recovery-cases/${recoveryCase.id}/messages`, { data: {
    version: "recovery-message-command.v1", commandId: randomUUID(), action: "advance", messageId: cancelled.latest!.id, expectedRevision: cancelled.latest!.revision, outcome: "success",
  } }); expect(execute.ok()).toBe(false);
  const saved = await assertPersisted(page, jobId, recoveryCase.id, "Cancelled — nothing sent"); expect(saved.sinkCount).toBe(0);
});
