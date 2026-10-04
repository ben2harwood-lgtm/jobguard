import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { get, persistedRecoverySources, post, recordedProof } from "./helpers/recovery-sources";

test.setTimeout(360_000);
const banner = "Practice sandbox — synthetic data; nothing is sent or charged";
const customerBody = "Practice message — not sent. Our practice records show £320.00 net remains in this case. Please review the attached example records.";
const supplierBody = "Practice message — not sent. Our practice supplier records show £320.00 net is questioned in this supplier correction case. Please review the attached example supplier records.";
const changed = "Review the changed message before approving";
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
async function click(page: Page, name: string) { await expect(button(page, name)).toBeEnabled(); await button(page, name).click(); }
const V = (page: Page, id: string, value: string) => expect(page.getByTestId(id)).toHaveText(value);
const messagesPath = (caseId: string) => `/api/recovery-cases/${caseId}/messages`;
const state = (page: Page, caseId: string) => get(page, messagesPath(caseId));
const command = (page: Page, caseId: string, messageId: string, body: Record<string, unknown>) =>
  page.request.post(`${messagesPath(caseId)}/${messageId}/commands`, { data: { version: "recovery-message-command.v1", commandId: randomUUID(), messageId, ...body } });

/** Opens the £320 customer case through the real UI, builds the pack, approves it for attachment and previews the message. */
async function customerCaseWithPack(page: Page) {
  const source = await persistedRecoverySources(page);
  await page.goto(`/jobs/${source.jobId}#recovery-cases`);
  await click(page, "Open £320 withheld payment");
  await expect(page.getByTestId("case-claimed-net")).toHaveText("£320.00");
  const caseId = (await get(page, `/api/jobs/${source.jobId}/recovery-cases`)).cases.at(-1).id as string;
  await expect(page.getByTestId("pursuit-not-ready")).toHaveText("Build an evidence pack for this case first.");
  await expect(button(page, "Preview factual message")).toBeDisabled();
  await click(page, "Build evidence pack");
  await expect(page.getByTestId("pack-state")).toHaveText("Sources mapped — inspect the evidence");
  await expect(page.getByTestId("pursuit-not-ready")).toHaveText("Approve the current evidence pack for attachment first.");
  await expect(button(page, "Preview factual message")).toBeDisabled();
  await click(page, "Approve this pack for attachment");
  await expect(page.getByTestId("pack-current-attachment-status")).toHaveText("Attachment approval recorded for these exact hashes");
  await expect(button(page, "Preview factual message")).toBeEnabled();
  return { source, caseId };
}
async function assertLayout(page: Page, names: string[]) {
  await expect(page.getByText(banner, { exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const first = button(page, names[0]!); await first.focus(); await expect(first).toBeFocused();
  const focus = await first.evaluate(element => ({ outline: getComputedStyle(element).outlineStyle, shadow: getComputedStyle(element).boxShadow }));
  expect(focus.outline !== "none" || focus.shadow !== "none").toBe(true);
  for (const name of names) { const bounds = await button(page, name).boundingBox(); expect(bounds, name).not.toBeNull(); expect(bounds!.height, name).toBeGreaterThanOrEqual(44); expect(bounds!.width, name).toBeGreaterThanOrEqual(44); }
}

test("previews, approves and simulates one factual customer message that is delivered exactly once", async ({ page, browser, request }, testInfo) => {
  const { source, caseId } = await customerCaseWithPack(page);
  const pack = (await get(page, `/api/recovery-cases/${caseId}/evidence-packs`)).packs.at(-1);
  await click(page, "Preview factual message");
  await V(page, "pursuit-recipient", "practice-customer@example.invalid");
  await V(page, "pursuit-sender", "practice-builder@example.invalid");
  await V(page, "pursuit-body", customerBody);
  await V(page, "pursuit-claim-net", "£320.00");
  await V(page, "pursuit-attachment-hash", pack.contentHash);
  await V(page, "pursuit-delivery", "Preview only — awaiting your approval");
  await V(page, "pursuit-sink-count", "0"); await V(page, "pursuit-real-actions", "0");
  // The sources are linked, each to the exact immutable version in the evidence pack explorer.
  const links = page.getByTestId("pursuit-sources").getByRole("link");
  expect(await links.count()).toBeGreaterThanOrEqual(4);
  for (const href of await links.evaluateAll(items => items.map(item => item.getAttribute("href")))) {
    expect(href).toMatch(/^#pack-source-/u);
    await expect(page.locator(href!)).toHaveCount(1);
  }
  await links.first().click(); expect(page.url()).toContain("#pack-source-");
  const saved = (await state(page, caseId)).latest;
  expect(saved).toMatchObject({ status: "previewed", revision: 1, changedSinceReview: false, approval: null });
  expect(saved.message).toMatchObject({ body: customerBody, recipient: "practice-customer@example.invalid", amountPence: 32000, packId: pack.id, attachmentHash: pack.contentHash, sourceRefs: [source.invoiceId] });

  // Any change to the preview shows the changed-message line, and the server refuses to approve it.
  const body = page.getByLabel("Practice message body");
  await body.fill(`${customerBody} Pay by Friday.`);
  await V(page, "pursuit-changed", changed);
  await click(page, "Approve this exact message");
  await expect(page.getByRole("alert")).toHaveText(changed); await expect(page.getByRole("alert")).toBeFocused();
  await expect(page.getByLabel("Practice message body")).toHaveValue(customerBody);
  for (const [label, value] of [["Practice recipient", "real.person@gmail.com"], ["Practice amount (£)", "320.01"]] as const) {
    await page.getByLabel(label).fill(value);
    await V(page, "pursuit-changed", changed);
    await click(page, "Approve this exact message");
    await expect(page.getByRole("alert")).toHaveText(changed);
  }
  expect((await state(page, caseId)).latest).toMatchObject({ status: "previewed", approval: null });
  // Forged commands are refused the same way, and invent no authority.
  const exact = { action: "approve", expectedRevision: 1, recipient: saved.message.recipient, body: saved.message.body, amountPence: 32000, packId: pack.id, contentHash: saved.message.contentHash };
  for (const forged of [{ amountPence: 9_000_000 }, { body: `${customerBody} Pay today or face court.` }, { contentHash: "f".repeat(64) }]) {
    const response = await command(page, caseId, saved.id, { ...exact, ...forged });
    expect(response.status()).toBe(409); expect(await response.json()).toEqual({ code: "RECOVERY_MESSAGE_CHANGED" });
  }
  for (const forged of [{ tenantId: randomUUID() }, { actorRef: "forged" }, { mode: "production" }, { recipient: "real.person@gmail.com" }]) {
    expect((await command(page, caseId, saved.id, { ...exact, ...forged })).status()).toBe(400);
  }
  expect((await request.get(messagesPath(caseId))).status()).toBe(401);

  // The exact approval creates a queued, not-yet-sent action. Approval is not delivery.
  await click(page, "Approve this exact message");
  await V(page, "pursuit-delivery", "Approved — queued, nothing sent");
  await V(page, "pursuit-sink-count", "0");
  const approvedState = (await state(page, caseId)).latest;
  expect(approvedState.approval).toMatchObject({ revoked: false }); expect(approvedState.attempts).toBe(0);
  // Approving again at the old revision is a typed stale-revision conflict, not a second effect.
  const stale = await command(page, caseId, saved.id, { ...exact, expectedRevision: 1 });
  expect(stale.status()).toBe(409); expect((await stale.json()).code).toBe("RECOVERY_MESSAGE_STALE_REVISION");

  await click(page, "Advance practice delivery");
  await V(page, "pursuit-delivery", "Simulated delivery — nothing sent");
  await V(page, "pursuit-sink-count", "1"); await V(page, "pursuit-real-actions", "0");
  const delivered = await state(page, caseId);
  expect(delivered.sinkCount).toBe(1);
  expect(delivered.sink[0]).toMatchObject({ messageId: saved.id, recipient: "practice-customer@example.invalid", body: customerBody, contentHash: saved.message.contentHash, attachmentHash: pack.contentHash, environment: "synthetic_demo" });
  expect(delivered.latest.history.map((event: { kind: string }) => event.kind)).toEqual(["previewed", "approved", "started", "succeeded"]);
  expect(delivered).toMatchObject({ environment: "synthetic_demo", realExternalActions: 0 });
  // Advancing again, or reusing the delivered message, creates no second effect.
  const again = await command(page, caseId, saved.id, { action: "advance", expectedRevision: delivered.latest.revision, outcome: "success" });
  expect(again.status()).toBe(409); expect((await again.json()).code).toBe("RECOVERY_MESSAGE_ALREADY_DELIVERED");
  expect((await state(page, caseId)).sinkCount).toBe(1);
  await expect(button(page, "Advance practice delivery")).toHaveCount(0);

  // Refresh, a fresh navigation and a second browser context all read the same persisted result.
  await page.reload();
  await V(page, "pursuit-delivery", "Simulated delivery — nothing sent"); await V(page, "pursuit-sink-count", "1");
  await V(page, "pursuit-content-hash", saved.message.contentHash);
  // A captured practice job has no card on the Jobs home to click (it lists only the seeded fixtures), so leave through Jobs
  // and reopen the saved job by a fresh navigation, then read it from a separate browser context as well.
  await page.goto("/"); await expect(page.getByRole("heading", { name: "Jobs in this demo", exact: true })).toBeVisible();
  await page.goto(`/jobs/${source.jobId}#recovery-cases`);
  await V(page, "pursuit-delivery", "Simulated delivery — nothing sent"); await V(page, "pursuit-sink-count", "1");
  const second = await browser.newContext({ storageState: await page.context().storageState() });
  try {
    const other = await second.newPage();
    await other.goto(`/jobs/${source.jobId}#recovery-cases`);
    await V(other, "pursuit-delivery", "Simulated delivery — nothing sent"); await V(other, "pursuit-sink-count", "1");
    await V(other, "pursuit-content-hash", saved.message.contentHash); await V(other, "pursuit-body", customerBody);
  } finally { await second.close(); }
  await assertLayout(page, ["Preview factual message", "Refresh saved messages"]);
  await page.screenshot({ path: `test-results/M4-5-S-customer-${testInfo.project.name}.png`, fullPage: true });
});

test("uses supplier wording and recipient, shows an unknown outcome as unknown, and checks rather than resends", async ({ page }, testInfo) => {
  const source = await persistedRecoverySources(page);
  const rate = await post(page, "/api/material-rates", { version: "material-rate-command.v1", merchantName: "Fictional Builders Merchant", sku: `MSG-${randomUUID()}`, description: "Fictional building material", pricePence: 2000, priceUnit: "each", taxBasis: "net", effectiveFrom: "2026-09-01", sourceLabel: "Entered synthetic agreement", expectedVersion: 0 });
  await post(page, `/api/jobs/${source.jobId}/materials`, { version: "material-requirement-command.v1", scopeItemId: source.scopeItemId, skuId: rate.skuId, quantity: "40", unit: "each", expectedRevision: 0 });
  const requirement = (await get(page, `/api/jobs/${source.jobId}/materials`)).materials.at(-1);
  await post(page, `/api/jobs/${source.jobId}/purchase-orders/revisions`, { version: "purchase-order-draft.v1", requirementId: requirement.id, quantity: "40", unitPricePence: 2000, recipient: "orders@fictional-merchant.invalid", requiredDate: "2026-10-01", expectedRevision: 0 });
  const documentsPath = `/api/jobs/${source.jobId}/supplier-documents`;
  for (const fixtureId of ["materials-B-delivery", "materials-320-invoice"]) {
    const before = await get(page, documentsPath);
    await post(page, `${documentsPath}/intake`, { version: "supplier-document-intake.v1", fixtureId, channel: "picker", expectedRevision: before.state.intakeRevision });
  }
  const documents = (await get(page, documentsPath)).state;
  const invoice = documents.facts.filter((fact: { document_number: string }) => fact.document_number === "INV-M320-001").at(-1);
  const delivery = documents.documents.find((document: { document_type: string; status: string }) => document.document_type === "delivery" && document.status === "ready");
  // The workbench's own picker attaches only the agreement and invoice; a message needs a pack with no omissions, so the case
  // names the recorded delivery note too. This is the supplied practice records, not a rule about real supplier documents.
  await post(page, `/api/jobs/${source.jobId}/recovery-cases`, {
    version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), caseType: "merchant_overcharge", claimedNetPence: 32000, counterparty: "Fictional Builders Merchant",
    book: "supplier_cost", sourceType: "supplier_documents", sourceRefs: [rate.id, invoice.version_id, delivery.id], reviewerRef: "practice-owner", expectedRevision: 0,
  });
  const caseId = ((await get(page, `/api/jobs/${source.jobId}/recovery-cases`)).cases.at(-1)).id as string;
  await page.goto(`/jobs/${source.jobId}#recovery-cases`);
  await click(page, "Build evidence pack");
  await expect(page.getByTestId("pack-state")).toHaveText("Sources mapped — inspect the evidence");
  await click(page, "Approve this pack for attachment");
  await expect(page.getByTestId("pack-current-attachment-status")).toHaveText("Attachment approval recorded for these exact hashes");
  await click(page, "Preview factual message");
  await V(page, "pursuit-recipient", "practice-supplier@example.invalid");
  await V(page, "pursuit-body", supplierBody);
  await V(page, "pursuit-claim-net", "£320.00");
  expect(await page.getByTestId("pursuit-sources").getByRole("link").count()).toBeGreaterThanOrEqual(3);
  await click(page, "Approve this exact message");
  await V(page, "pursuit-delivery", "Approved — queued, nothing sent");
  await page.getByLabel("Practice delivery result to simulate").selectOption("response_lost");
  await click(page, "Advance practice delivery");
  await V(page, "pursuit-delivery", "Outcome unknown — check needed");
  const unknown = (await state(page, caseId)).latest;
  expect(unknown.status).toBe("outcome_unknown");
  // An unknown outcome is never blindly resent: advancing is refused until it is checked.
  const refused = await command(page, caseId, unknown.id, { action: "advance", expectedRevision: unknown.revision, outcome: "success" });
  expect(refused.status()).toBe(409); expect((await refused.json()).code).toBe("RECOVERY_MESSAGE_RECONCILE_REQUIRED");
  await expect(button(page, "Advance practice delivery")).toHaveCount(0);
  await expect(page.getByTestId("pursuit-delivery")).not.toHaveText("Simulated delivery — nothing sent");
  await page.reload(); await V(page, "pursuit-delivery", "Outcome unknown — check needed");
  await click(page, "Check outcome");
  await V(page, "pursuit-delivery", "Simulated delivery — nothing sent"); await V(page, "pursuit-sink-count", "1");
  const checked = await state(page, caseId);
  expect(checked.sinkCount).toBe(1);
  expect(checked.sink[0]).toMatchObject({ recipient: "practice-supplier@example.invalid", body: supplierBody });
  expect(checked.latest.history.map((event: { kind: string }) => event.kind)).toEqual(["previewed", "approved", "started", "outcome_unknown", "reconcile_started", "reconciled"]);
  await assertLayout(page, ["Preview factual message", "Refresh saved messages"]);
  await page.screenshot({ path: `test-results/M4-5-S-supplier-${testInfo.project.name}.png`, fullPage: true });
});

test("revocation and changed evidence both block execution and nothing is sent", async ({ page }, testInfo) => {
  const { source, caseId } = await customerCaseWithPack(page);
  await click(page, "Preview factual message");
  await click(page, "Approve this exact message");
  await V(page, "pursuit-delivery", "Approved — queued, nothing sent");
  await click(page, "Revoke approval");
  await V(page, "pursuit-delivery", "Approval revoked — nothing sent");
  await expect(button(page, "Advance practice delivery")).toHaveCount(0);
  const revoked = (await state(page, caseId)).latest;
  expect(revoked).toMatchObject({ status: "revoked", approval: { revoked: true } });
  const blockedByRevoke = await command(page, caseId, revoked.id, { action: "advance", expectedRevision: revoked.revision, outcome: "success" });
  expect(blockedByRevoke.status()).toBe(409); expect((await blockedByRevoke.json()).code).toBe("RECOVERY_MESSAGE_REVOKED");
  expect((await state(page, caseId)).sinkCount).toBe(0);
  await page.reload(); await V(page, "pursuit-delivery", "Approval revoked — nothing sent"); await V(page, "pursuit-sink-count", "0");

  // A fresh preview and approval, then the evidence moves on before delivery: the message is flagged and execution is blocked.
  await click(page, "Preview factual message");
  await V(page, "pursuit-delivery", "Preview only — awaiting your approval");
  await click(page, "Approve this exact message");
  await V(page, "pursuit-delivery", "Approved — queued, nothing sent");
  const newProofId = await recordedProof(page, source.jobId);
  await click(page, "Build evidence pack");
  await expect(page.getByTestId("pack-attachment-status")).toHaveText("Previous attachment approval invalidated by the new evidence version");
  await click(page, "Refresh saved messages");
  await V(page, "pursuit-changed", changed);
  await click(page, "Advance practice delivery");
  await V(page, "pursuit-delivery", "Blocked — the message or its evidence changed; nothing sent");
  await expect(page.getByRole("alert")).toContainText("Nothing was sent");
  const blocked = await state(page, caseId);
  expect(blocked.sinkCount).toBe(0); expect(blocked.latest.status).toBe("blocked");
  expect(blocked.latest.history.map((event: { kind: string }) => event.kind)).toEqual(["previewed", "approved", "blocked"]);
  expect(newProofId).toBeTruthy();
  // The blocked message cannot be approved again; a new preview needs the new evidence pack to be approved first.
  await page.reload();
  await V(page, "pursuit-delivery", "Blocked — the message or its evidence changed; nothing sent"); await V(page, "pursuit-sink-count", "0");
  await expect(button(page, "Preview factual message")).toBeDisabled();
  await assertLayout(page, ["Preview factual message", "Refresh saved messages"]);
  await page.screenshot({ path: `test-results/M4-5-S-blocked-${testInfo.project.name}.png`, fullPage: true });
});
