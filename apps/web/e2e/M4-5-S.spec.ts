import { randomUUID } from "node:crypto";
import { Pool } from "pg";
// The synthetic demo tenant (packages/db/src/demo-seed.ts), inlined as the other specs do: @jobguard/db is ESM-only and cannot load in a Playwright spec.
const DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";
import { E2E_RUNTIME_URL } from "./global-setup";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { get, persistedRecoverySources, post, recordedProof } from "./helpers/recovery-sources";

const banner = "Practice sandbox — synthetic data; nothing is sent or charged";
const customerBody = "Practice message — not sent. Our practice records show £320.00 net remains in this case. Please review the attached example records.";
const supplierBody = "Practice message — not sent. Our practice supplier records show £320.00 net is questioned in this supplier correction case. Please review the attached example supplier records.";
const changed = "Review the changed message before approving";
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
async function click(page: Page, name: string) { await expect(button(page, name)).toBeEnabled(); await button(page, name).click(); }
// The panel's own alert: Next also renders a route announcer with role=alert, so a bare getByRole("alert") is ambiguous.
const alertOf = (page: Page) => page.locator("#recovery-messages").getByRole("alert");
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

/** Ben's approved Jobs substitute, applied to each persisted positive/negative result with saved source identity. */
async function persistence(page: Page, browser: Browser, jobId: string, caseId: string, label: string, sink: string) {
  const saved = (await state(page, caseId)).latest;
  const assert = async (target: Page) => {
    await V(target, "pursuit-delivery", label); await V(target, "pursuit-sink-count", sink);
    await V(target, "pursuit-content-hash", saved.message.contentHash);
    await V(target, "pursuit-body", saved.message.body);
    await V(target, "pursuit-attachment-hash", saved.attachment.contentHash);
    await V(target, "pursuit-pack-revision", String(saved.attachment.packRevision));
    const reloaded = (await state(target, caseId)).latest;
    expect(reloaded.id).toBe(saved.id); expect(reloaded.message.sourceRefs).toEqual(saved.message.sourceRefs);
    expect(reloaded.attachment.sources).toEqual(saved.attachment.sources);
    for (const href of await target.getByTestId("pursuit-sources").getByRole("link").evaluateAll(items => items.map(item => item.getAttribute("href")))) {
      const source = target.locator(href!);
      await expect(source).toHaveCount(1);
      await source.evaluate(element => { (element as HTMLDetailsElement).open = true; });
      await expect(source).toContainText("Source identity");
      await expect(source).toContainText("SHA-256");
      await expect(source.locator("pre")).toBeVisible();
      await source.evaluate(element => { (element as HTMLDetailsElement).open = false; });
    }
    await assertLayout(target, ["Refresh saved messages", "Preview factual message"]);
  };
  await page.reload(); await assert(page);
  await page.goto("/"); await expect(page.getByRole("heading", { name: "Jobs in this demo", exact: true })).toBeVisible();
  await page.goto(`/jobs/${jobId}#recovery-cases`); await assert(page);
  const second = await browser.newContext({ storageState: await page.context().storageState() });
  try { const other = await second.newPage(); await other.goto(`/jobs/${jobId}#recovery-cases`); await assert(other); }
  finally { await second.close(); }
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
  await links.first().click(); await expect(page).toHaveURL(/#pack-source-/u);
  const saved = (await state(page, caseId)).latest;
  expect(saved).toMatchObject({ status: "previewed", revision: 1, changedSinceReview: false, approval: null });
  expect(saved.message).toMatchObject({ body: customerBody, recipient: "practice-customer@example.invalid", amountPence: 32000, packId: pack.id, attachmentHash: pack.contentHash, sourceRefs: [source.invoiceId] });

  // Any change to the preview shows the changed-message line, and the server refuses to approve it.
  const body = page.getByLabel("Practice message body");
  await body.fill(`${customerBody} Pay by Friday.`);
  await V(page, "pursuit-changed", changed);
  await click(page, "Approve this exact message");
  await expect(alertOf(page)).toHaveText(changed); await expect(alertOf(page)).toBeFocused();
  await expect(page.getByLabel("Practice message body")).toHaveValue(customerBody);
  for (const [label, value] of [["Practice recipient", "real.person@gmail.com"], ["Practice amount (£)", "320.01"]] as const) {
    await page.getByLabel(label).fill(value);
    await V(page, "pursuit-changed", changed);
    await click(page, "Approve this exact message");
    await expect(alertOf(page)).toHaveText(changed);
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
  await expect(button(page, "Preview factual message")).toBeDisabled();
  const queuedBefore = await state(page, caseId);
  const replacement = await page.request.post(messagesPath(caseId), { data: { version: "recovery-message-preview.v1", commandId: randomUUID(), expectedCaseRevision: queuedBefore.readiness.caseRevision, packId: pack.id } });
  expect(replacement.status()).toBe(409); expect((await replacement.json()).code).toBe("RECOVERY_MESSAGE_EXISTING_EFFECT");
  await persistence(page, browser, source.jobId, caseId, "Approved — queued, nothing sent", "0");
  await expect(button(page, "Revoke approval")).toBeVisible();
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
  await assertLayout(page, ["Refresh saved messages", "Preview factual message"]);
  await page.screenshot({ path: `test-results/M4-5-S-customer-${testInfo.project.name}.png`, fullPage: true });
});

test("uses supplier wording and recipient, shows an unknown outcome as unknown, and checks rather than resends", async ({ page, browser }, testInfo) => {
  const source = await persistedRecoverySources(page);
  const rate = await post(page, "/api/material-rates", { version: "material-rate-command.v1", merchantName: "Fictional Builders Merchant", sku: `MSG-${randomUUID()}`, description: "Fictional building material", pricePence: 2000, priceUnit: "each", taxBasis: "net", effectiveFrom: "2026-09-01", sourceLabel: "Entered synthetic agreement", expectedVersion: 0 });
  await post(page, `/api/jobs/${source.jobId}/materials`, { version: "material-requirement-command.v1", scopeItemId: source.scopeItemId, skuId: rate.skuId, quantity: "40", unit: "each", expectedRevision: 0 });
  const requirement = (await get(page, `/api/jobs/${source.jobId}/materials`)).materials.at(-1);
  await post(page, `/api/jobs/${source.jobId}/purchase-orders/revisions`, { version: "purchase-order-draft.v1", requirementId: requirement.id, quantity: "40", unitPricePence: 2000, recipient: "orders@fictional-merchant.invalid", requiredDate: "2026-10-01", expectedRevision: 0 });
  const documentsPath = `/api/jobs/${source.jobId}/supplier-documents`;
  await page.goto(`/jobs/${source.jobId}#supplier-documents`);
  const documentPicker = page.locator("#supplier-documents select").first();
  for (const fixtureId of ["materials-B-delivery", "materials-320-invoice"]) {
    await expect(documentPicker).toBeEnabled();
    await documentPicker.selectOption(fixtureId);
    const imported = page.waitForResponse(response => response.url().endsWith("/supplier-documents/intake") && response.request().method() === "POST");
    await click(page, "Import generated document");
    expect((await imported).ok()).toBe(true);
    await expect(button(page, "Import generated document")).toBeEnabled();
  }
  const documents = (await get(page, documentsPath)).state;
  const invoice = documents.facts.filter((fact: { document_number: string }) => fact.document_number === "INV-M320-001").at(-1);
  const delivery = documents.documents.find((document: { document_type: string; status: string }) => document.document_type === "delivery" && document.status === "ready");
  // This fixture is a partial delivery against this very job's order, not an assertion that 40 units were delivered.
  expect(documents.receipt).toMatchObject({ ordered: "40", delivered: "10", accepted: "8", missing: "32" });
  const database = new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 });
  const client = await database.connect();
  try {
    await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
    const associated = await client.query(`SELECT r.document_id,r.ordered_quantity::text,d.job_id
      FROM app.goods_receipt r JOIN app.purchase_order_draft d ON (d.tenant_id,d.id)=(r.tenant_id,r.order_draft_id)
      WHERE r.tenant_id=$1 AND r.job_id=$2 AND r.document_id=$3`, [DEMO_TENANT_ID, source.jobId, delivery.id]);
    expect(associated.rows).toHaveLength(1);
    expect(associated.rows[0]).toMatchObject({ document_id: delivery.id, job_id: source.jobId });
    expect(Number(associated.rows[0].ordered_quantity)).toBe(40);
  } finally { await client.query("ROLLBACK"); client.release(); await database.end(); }
  // Both source selection and case opening use the visible UI. GETs only inspect their authoritative result.
  await page.reload();
  const picker = page.getByLabel("Fictional delivery source", { exact: true });
  await picker.focus(); await expect(picker).toBeFocused();
  expect(await picker.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
  const bounds = await picker.boundingBox(); expect(bounds).not.toBeNull();
  expect(bounds!.height).toBeGreaterThanOrEqual(44); expect(bounds!.width).toBeGreaterThanOrEqual(44);
  await picker.selectOption(delivery.id);
  await click(page, "Open materials-320 overcharge");
  await V(page, "case-claimed-net", "£320.00");
  const opened = (await get(page, `/api/jobs/${source.jobId}/recovery-cases`)).cases.at(-1);
  expect(opened.sourceRefs).toEqual([rate.id, invoice.version_id, delivery.id]);
  const caseId = opened.id as string;
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
  const beforeReplacement = await state(page, caseId);
  const replacement = await page.request.post(messagesPath(caseId), { data: { version: "recovery-message-preview.v1", commandId: randomUUID(), expectedCaseRevision: beforeReplacement.readiness.caseRevision, packId: beforeReplacement.readiness.packId } });
  expect(replacement.status()).toBe(409); expect((await replacement.json()).code).toBe("RECOVERY_MESSAGE_EXISTING_EFFECT");
  await expect(button(page, "Preview factual message")).toBeDisabled();
  await persistence(page, browser, source.jobId, caseId, "Outcome unknown — check needed", "1");
  await expect(button(page, "Check outcome")).toBeVisible();
  await click(page, "Check outcome");
  await V(page, "pursuit-delivery", "Simulated delivery — nothing sent"); await V(page, "pursuit-sink-count", "1");
  const checked = await state(page, caseId);
  expect(checked.sinkCount).toBe(1);
  expect(checked.sink[0]).toMatchObject({ recipient: "practice-supplier@example.invalid", body: supplierBody });
  expect(checked.latest.history.map((event: { kind: string }) => event.kind)).toEqual(["previewed", "approved", "started", "outcome_unknown", "reconcile_started", "reconciled"]);
  await persistence(page, browser, source.jobId, caseId, "Simulated delivery — nothing sent", "1");
  await page.screenshot({ path: `test-results/M4-5-S-supplier-${testInfo.project.name}.png`, fullPage: true });
});

test("revocation and changed evidence both block execution and nothing is sent", async ({ page, browser }, testInfo) => {
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
  await persistence(page, browser, source.jobId, caseId, "Approval revoked — nothing sent", "0");

  // A fresh preview and approval, then the evidence moves on before delivery: the message is flagged and execution is blocked.
  await click(page, "Preview factual message");
  await V(page, "pursuit-delivery", "Preview only — awaiting your approval");
  await click(page, "Approve this exact message");
  await V(page, "pursuit-delivery", "Approved — queued, nothing sent");
  const newProofId = await recordedProof(page, source.jobId);
  await post(page, `/api/jobs/${source.jobId}/proof`, { version: "practice-proof-command.v1", commandId: randomUUID(), action: "invalidate", evidenceId: source.proofId, reasonCode: "object_revoked" });
  await click(page, "Build evidence pack");
  await expect(page.getByTestId("pack-attachment-status")).toHaveText("Previous attachment approval invalidated by the new evidence version");
  await expect(page.getByTestId("pack-explorer")).not.toContainText(`evidence_object:${source.proofId}`);
  // The saved message still contains the invalidated source in its own historical explorer.
  await expect(page.getByRole("region", { name: "Saved attachment source explorer" })).toContainText(`evidence_object:${source.proofId}`);
  await click(page, "Refresh saved messages");
  await V(page, "pursuit-changed", changed);
  await click(page, "Advance practice delivery");
  await V(page, "pursuit-delivery", "Blocked — the message or its evidence changed; nothing sent");
  await expect(alertOf(page)).toContainText("Nothing was sent");
  const blocked = await state(page, caseId);
  expect(blocked.sinkCount).toBe(0); expect(blocked.latest.status).toBe("blocked");
  expect(blocked.latest.history.map((event: { kind: string }) => event.kind)).toEqual(["previewed", "approved", "blocked"]);
  expect(newProofId).toBeTruthy();
  // The blocked message cannot be approved again; a new preview needs the new evidence pack to be approved first.
  await persistence(page, browser, source.jobId, caseId, "Blocked — the message or its evidence changed; nothing sent", "0");
  await expect(button(page, "Preview factual message")).toBeDisabled();
  // The preview button is disabled here, and a disabled button cannot take focus, so the focus check starts from an enabled control.
  await assertLayout(page, ["Refresh saved messages", "Preview factual message"]);
  await page.screenshot({ path: `test-results/M4-5-S-blocked-${testInfo.project.name}.png`, fullPage: true });
});


test("two browser contexts approving the same revision yield one approval and a typed stale conflict", async ({ page, browser }) => {
  const { source, caseId } = await customerCaseWithPack(page);
  await click(page, "Preview factual message");
  // The second context reads the saved preview when its page loads, so the first must have saved it before that page opens.
  await V(page, "pursuit-delivery", "Preview only — awaiting your approval");
  const second = await browser.newContext({ storageState: await page.context().storageState() });
  try {
    const other = await second.newPage(); await other.goto(`/jobs/${source.jobId}#recovery-cases`);
    await expect(button(other, "Approve this exact message")).toBeEnabled();
    const replies = Promise.all([page.waitForResponse(response => response.url().endsWith("/commands") && response.request().method() === "POST"),
      other.waitForResponse(response => response.url().endsWith("/commands") && response.request().method() === "POST")]);
    await Promise.all([button(page, "Approve this exact message").click(), button(other, "Approve this exact message").click()]);
    const responses = await replies;
    expect(responses.map(response => response.status()).sort()).toEqual([200, 409]);
    expect(await responses.find(response => response.status() === 409)!.json()).toEqual({ code: "RECOVERY_MESSAGE_STALE_REVISION" });
    await V(page, "pursuit-delivery", "Approved — queued, nothing sent"); await V(other, "pursuit-delivery", "Approved — queued, nothing sent");
    const saved = await state(page, caseId); expect(saved.messages).toHaveLength(1); expect(saved.latest.revision).toBe(2);
    expect(saved.latest.history.map((event: { kind: string }) => event.kind)).toEqual(["previewed", "approved"]);
    await click(page, "Advance practice delivery");
    await V(page, "pursuit-delivery", "Simulated delivery — nothing sent");
    expect((await state(page, caseId)).sinkCount).toBe(1);
    await other.reload(); await V(other, "pursuit-delivery", "Simulated delivery — nothing sent");
    await persistence(page, browser, source.jobId, caseId, "Simulated delivery — nothing sent", "1");
  } finally { await second.close(); }
});


test("an interrupted claim becomes uncertain after its lease and can be checked without resending", async ({ page, browser }) => {
  const { source, caseId } = await customerCaseWithPack(page);
  await click(page, "Preview factual message"); await click(page, "Approve this exact message");
  await V(page, "pursuit-delivery", "Approved — queued, nothing sent");
  await page.getByLabel("Practice delivery result to simulate").selectOption("process_stopped");
  await click(page, "Advance practice delivery");
  await expect(alertOf(page)).toContainText("practice delivery process stopped"); await expect(alertOf(page)).toBeFocused();
  await V(page, "pursuit-delivery", "Delivery in progress — check again shortly");
  const executing = (await state(page, caseId)).latest;
  expect(executing.attempts).toBe(1); expect(executing.claimAbandoned).toBe(false);
  await page.reload(); await V(page, "pursuit-delivery", "Delivery in progress — check again shortly");
  // Only the elapsed-time input is faked, in the existing real synthetic PostgreSQL fixture. No outcome/approval is fabricated.
  const clock = new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 });
  const db = await clock.connect();
  try {
    await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
    const aged = await db.query("UPDATE app.action_outbox SET claimed_at=clock_timestamp()-interval '10 minutes' WHERE tenant_id=$1 AND id=$2 AND status='executing'", [DEMO_TENANT_ID, executing.approval.outboxActionId]);
    expect(aged.rowCount).toBe(1); await db.query("COMMIT");
  } finally { await db.query("ROLLBACK"); db.release(); await clock.end(); }
  await persistence(page, browser, source.jobId, caseId, "Outcome unknown — check needed", "0");
  await expect(button(page, "Advance practice delivery")).toHaveCount(0);
  await expect(page.getByText("The delivery process stopped before its result was recorded. Check the practice provider before attempting anything else.", { exact: true })).toBeVisible();
  await click(page, "Check outcome"); await V(page, "pursuit-delivery", "Delivery failed — nothing sent, safe to try again");
  await persistence(page, browser, source.jobId, caseId, "Delivery failed — nothing sent, safe to try again", "0");
  await page.getByLabel("Practice delivery result to simulate").selectOption("success");
  await click(page, "Advance practice delivery"); await V(page, "pursuit-delivery", "Simulated delivery — nothing sent");
  expect((await state(page, caseId)).latest.attempts).toBe(2);
  await persistence(page, browser, source.jobId, caseId, "Simulated delivery — nothing sent", "1");
});


test("a new practice session cannot see or act on another session's recovery messages", async ({ page, browser }) => {
  const { source, caseId } = await customerCaseWithPack(page);
  await click(page, "Preview factual message");
  // The click only sends the preview; the panel shows this line once the server has saved it. Read the saved state after that, never straight after the click.
  await V(page, "pursuit-delivery", "Preview only — awaiting your approval");
  const saved = await state(page, caseId), message = saved.latest;
  const missingMessage = await command(page, caseId, randomUUID(), { action: "advance", expectedRevision: message.revision, outcome: "success" });
  expect(missingMessage.status(), await missingMessage.text()).toBe(404);
  expect(await missingMessage.json()).toEqual({ code: "NOT_FOUND" });
  const stranger = await browser.newContext({ baseURL: "http://127.0.0.1:3000", viewport: page.viewportSize() });
  const missing = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  try {
    expect((await stranger.request.post("/api/session")).ok()).toBe(true);
    const paths = [messagesPath(caseId), messagesPath(randomUUID())];
    for (const context of [stranger, missing]) {
      const expected = context === stranger ? { status: 404, code: "NOT_FOUND" } : { status: 401, code: "UNAUTHENTICATED" };
      for (const path of paths) {
        const response = await context.request.get(path);
        expect(response.status(), await response.text()).toBe(expected.status);
        expect(await response.json()).toEqual({ code: expected.code });
      }
      const commands = [
        { path: messagesPath(caseId), data: { version: "recovery-message-preview.v1", commandId: randomUUID(), expectedCaseRevision: saved.readiness.caseRevision, packId: message.message.packId } },
        ...["approve", "advance", "reconcile", "revoke"].map(action => ({ path: `${messagesPath(caseId)}/${message.id}/commands`, data: {
          version: "recovery-message-command.v1", commandId: randomUUID(), messageId: message.id, expectedRevision: message.revision, action,
          ...(action === "approve" ? { recipient: message.message.recipient, body: message.message.body, amountPence: message.message.amountPence, packId: message.message.packId, contentHash: message.message.contentHash } : {}),
          ...(action === "advance" ? { outcome: "success" } : {}),
        } })),
      ];
      for (const { path, data } of commands) {
        const response = await context.request.post(path, { data });
        expect(response.status(), await response.text()).toBe(expected.status);
        expect(await response.json()).toEqual({ code: expected.code });
      }
    }
    const other = await stranger.newPage(); await other.goto(`/jobs/${source.jobId}#recovery-cases`);
    await expect(other.getByRole("heading", { name: "You cannot open this job", exact: true })).toBeVisible();
    await expect(other.getByTestId("pursuit-body")).toHaveCount(0);
    expect(await state(page, caseId)).toEqual(saved);
  } finally { await stranger.close(); await missing.close(); }
});

test("once the register has loaded, the delivery lookup and the evidence-pack tick never disable the Open buttons or move focus", async ({ page }) => {
  const source = await persistedRecoverySources(page);
  const openNames = ["Open materials-320 overcharge", "Open £320 withheld payment", "Open £2,500 withheld payment", "Record prevention"];
  // Hold every read of this job's supplier documents (the workbench's delivery lookup and the supplier panel's own) until the register has loaded and a button has focus,
  // so the lookup settles after the first register read, which is the moment the workbench must stay still.
  const lookups: string[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/jobs/${source.jobId}/supplier-documents`, async route => { if (route.request().method() === "GET") await held; await route.continue(); });
  page.on("response", response => { if (response.request().method() === "GET" && response.url().endsWith(`/api/jobs/${source.jobId}/supplier-documents`)) lookups.push(response.url()); });
  await page.goto(`/jobs/${source.jobId}#recovery-cases`);
  for (const name of openNames) await expect(button(page, name)).toBeEnabled();
  const focused = button(page, "Open £2,500 withheld payment");
  await focused.focus(); await expect(focused).toBeFocused();
  // From here every change to the four buttons' disabled state (or their removal) and every focus move is recorded.
  const watch = async () => page.evaluate(() => {
    const events: string[] = []; (window as unknown as { recoveryWatch: string[] }).recoveryWatch = events;
    const actions = document.querySelector("#recovery-cases .recovery-actions")!;
    new MutationObserver(records => { for (const record of records) events.push(`${record.type}:${record.attributeName ?? ""}:${(record.target.textContent ?? "").slice(0, 40)}`); }).observe(actions, { subtree: true, childList: true, attributes: true });
    for (const kind of ["focusin", "focusout"]) document.addEventListener(kind, event => events.push(`${kind}:${((event.target as Element).textContent ?? "").slice(0, 40)}`), true);
  });
  const events = () => page.evaluate(() => (window as unknown as { recoveryWatch: string[] }).recoveryWatch);
  const twoFrames = () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await watch();
  release();
  await expect.poll(() => lookups.length).toBeGreaterThanOrEqual(2);
  await twoFrames();
  expect(await events()).toEqual([]);
  await expect(focused).toBeFocused();
  for (const name of openNames) await expect(button(page, name)).toBeEnabled();

  // Opening a case is the workbench's own command and does disable the buttons while it runs; open one, then focus a button again and watch the evidence-pack tick.
  await click(page, "Open £320 withheld payment");
  await expect(page.getByTestId("case-claimed-net")).toHaveText("£320.00");
  await focused.focus(); await expect(focused).toBeFocused();
  await watch();
  await expect(button(page, "Build evidence pack")).toBeEnabled();
  // dispatchEvent starts the pack build without moving focus the way a mouse click would.
  await button(page, "Build evidence pack").dispatchEvent("click");
  await expect(page.getByTestId("pack-state")).toHaveText("Sources mapped — inspect the evidence");
  await expect(page.getByTestId("pursuit-not-ready")).toHaveText("Approve the current evidence pack for attachment first.");
  await twoFrames();
  expect(await events()).toEqual([]);
  await expect(focused).toBeFocused();
  for (const name of openNames) await expect(button(page, name)).toBeEnabled();

  // Control: the same watch does see the workbench's own command disable and re-enable the buttons, so an empty list above is a real result.
  await click(page, "Open £2,500 withheld payment");
  await expect.poll(async () => (await events()).some(entry => entry.startsWith("attributes:disabled"))).toBe(true);
  for (const name of openNames) await expect(button(page, name)).toBeEnabled();
});
