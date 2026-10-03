import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const loadVerifier = () => (new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@jobguard/core")>)(pathToFileURL(join(process.cwd(), "../../packages/core/dist/index.js")).href);
import { openReview } from "./helpers/capture-journey";

test.setTimeout(360_000);
const banner = "Practice sandbox — synthetic data; nothing is sent or charged";
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
async function click(page: Page, name: string) { await expect(button(page, name)).toBeEnabled(); await button(page, name).click(); }
async function get(page: Page, path: string) { const response = await page.request.get(path); expect(response.ok(), await response.text()).toBe(true); return response.json(); }
async function post(page: Page, path: string, data: unknown) { const response = await page.request.post(path, { data }); expect(response.ok(), await response.text()).toBe(true); return response.json(); }
async function recordedProof(page: Page, jobId: string, complete = false) {
  const path = `/api/jobs/${jobId}/proof`, before = await get(page, path);
  await post(page, path, { version: "practice-proof-command.v1", commandId: randomUUID(), action: "select_generated", fixture: "completion-photo", scopeItemId: before.scopeItemId });
  const pending = await get(page, path);
  await post(page, path, { version: "practice-proof-command.v1", commandId: randomUUID(), action: "finalize", uploadId: pending.upload.id, objectVersionId: pending.upload.objectVersionId });
  const verified = await get(page, path);
  expect(verified.upload.state).toBe("verified");
  if (complete) await post(page, path, { version: "practice-proof-command.v1", commandId: randomUUID(), action: "complete", scopeItemId: verified.scopeItemId, evidenceId: verified.upload.evidenceId });
  return verified.upload.evidenceId as string;
}
async function persistedSources(page: Page) {
  await openReview(page);
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) await click(page, `Accept ${name}`);
  await click(page, "Dismiss Replace shelves");
  await page.getByLabel("Dismissal reason Replace shelves").fill("Not included in this fictional job");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");
  await click(page, "Confirm scope");
  const price = button(page, "Price the work"), heading = page.getByRole("heading", { name: "Price the work", exact: true });
  await Promise.race([price.waitFor({ state: "visible", timeout: 30_000 }), heading.waitFor({ state: "visible", timeout: 30_000 })]);
  if (await price.isVisible()) await click(page, "Price the work");
  await expect(heading).toBeVisible();
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
  await page.getByLabel("Unit rate Clean site").fill("200.00");
  await click(page, "Save draft revision"); await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await click(page, "Preview immutable quote"); await click(page, "Simulate sending this quote");
  await click(page, "Continue fake worker"); await click(page, "Record practice acceptance"); await click(page, "Start this practice job");
  // Activation is asynchronous: wait for its persisted result (as m1-15 does) before calling live-job APIs.
  await expect(page.getByRole("heading", { name: "Live · baseline frozen" })).toBeVisible();
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  const quote = await get(page, `/api/jobs/${jobId}/quotes/delivery`);
  const variationsPath = `/api/jobs/${jobId}/variations`, variationBefore = await get(page, variationsPath);
  const proposalId = randomUUID();
  const proposed = await post(page, variationsPath, {
    version: "variation-command.v1", action: "propose", proposalId, scopeItemId: randomUUID(), existingScopeItemId: null,
    lineageParentScopeItemId: variationBefore.parentScopeItemId, description: "Fictional extra preparation", captureText: "Fictional extra preparation",
    price: { quantity: "1", unit: "each", unitRatePence: 12500, direction: "addition" },
  });
  const variation = proposed.variations.find((item: { id: string }) => item.id === proposalId);
  await post(page, variationsPath, { version: "variation-command.v1", action: "approve", variationId: proposalId, revisionId: variation.currentRevisionId, approvalId: randomUUID(), attestation: "Builder-recorded practice acceptance — not an authenticated customer signature" });
  const proofId = await recordedProof(page, jobId, true);
  const final = await post(page, `/api/jobs/${jobId}/final-account`, { version: "final-account.assemble.v1", commandId: randomUUID() });
  expect(final.account.issueBlocked).toBe(false);
  const invoices = await post(page, `/api/jobs/${jobId}/customer-invoices`, { version: "practice-customer-invoice.issue.v1", commandId: randomUUID(), finalAccountRevisionId: final.account.id, expectedSourceHash: final.account.sourceHash, recipient: "practice-customer@example.invalid", issuedOn: "2026-09-25" });
  return { jobId, quoteId: quote.documentId as string, proofId, variationId: variation.currentRevisionId as string, invoiceId: invoices.invoices.at(-1).id as string, scopeItemId: variationBefore.parentScopeItemId as string };
}
async function currentPack(page: Page, caseId: string) { return (await get(page, `/api/recovery-cases/${caseId}/evidence-packs`)).packs.at(-1); }
async function assertLayout(page: Page) {
  await expect(page.getByText(banner, { exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const build = button(page, "Build evidence pack"); await build.focus(); await expect(build).toBeFocused();
  const focus = await build.evaluate(element => ({ outline: getComputedStyle(element).outlineStyle, shadow: getComputedStyle(element).boxShadow }));
  expect(focus.outline !== "none" || focus.shadow !== "none").toBe(true);
  for (const name of ["Build evidence pack", "Approve this pack for attachment"]) {
    const bounds = await button(page, name).boundingBox(); expect(bounds!.height).toBeGreaterThanOrEqual(44); expect(bounds!.width).toBeGreaterThanOrEqual(44);
  }
}

test("maps immutable customer sources, verifies exports server-side and invalidates recorded attachment approval", async ({ page, browser, request }, testInfo) => {
  const { parseStandalonePack, verifyStandalonePack } = await loadVerifier();
  const source = await persistedSources(page);
  await page.goto(`/jobs/${source.jobId}#recovery-cases`);
  await click(page, "Open £320 withheld payment");
  await expect(page.getByTestId("case-claimed-net")).toHaveText("£320.00");
  const caseView = (await get(page, `/api/jobs/${source.jobId}/recovery-cases`)).cases.at(-1);
  expect(caseView.sourceRefs).toEqual([source.invoiceId]);
  const caseId = caseView.id as string;
  await click(page, "Build evidence pack");
  await expect(page.getByTestId("pack-state")).toHaveText("Sources mapped — inspect the evidence");
  await expect(page.getByTestId("pack-claim-money")).toHaveText("£320.00");
  const first = await currentPack(page, caseId);
  for (const id of [source.quoteId, source.proofId, source.variationId, source.invoiceId]) expect(first.sources.some((item: { sourceId: string }) => item.sourceId.endsWith(`:${id}`))).toBe(true);
  expect(first.sources.every((item: { jobId: string }) => item.jobId === source.jobId)).toBe(true);
  expect(first.manifest.omissions ?? []).toEqual([]);
  const proof = first.manifest.entries.find((entry: {sourceId:string}) => entry.sourceId === `evidence_object:${source.proofId}`);
  const redacted = first.manifest.entries.find((entry: {redactedFrom?:{sourceId:string}}) => entry.redactedFrom?.sourceId === proof.sourceId);
  expect(redacted.redactedFrom).toEqual({ sourceId: proof.sourceId, version: proof.version, hash: proof.contentHash });
  expect(redacted.contentHash).not.toBe(proof.contentHash);
  const explorer = page.getByTestId("pack-explorer");
  for (const label of ["Accepted quote immutable record", "Accepted quote approval record", "Relevant proof original", "Approved variation immutable revision", "Recovery case claim revision", "Customer invoice immutable record"]) {
    const summary = explorer.locator("summary").filter({ hasText: label });
    await expect(summary).toBeVisible(); await summary.click();
  }
  await explorer.locator("summary").filter({ hasText: "Relevant proof — least-disclosure metadata copy" }).click();
  await expect(explorer.getByText(`Redacted derivative of ${proof.sourceId} version ${proof.version}, original hash ${proof.contentHash}`, { exact: true })).toBeVisible();
  expect(first.attachmentApprovalRecorded).toBe(false);
  await expect(page.getByTestId("pack-attachment-status")).toHaveCount(0);
  await click(page, "Build evidence pack"); await expect(page.getByTestId("pack-revision")).toHaveText("2");
  const rebuilt = await currentPack(page, caseId);
  expect(rebuilt.id).not.toBe(first.id); expect(rebuilt.manifestHash).toBe(first.manifestHash); expect(rebuilt.contentHash).toBe(first.contentHash);
  for (const [scenario, finding] of [["missing", "Missing original source"], ["tampered", "Content hash mismatch"], ["wrong-version", "Wrong source version"], ["checkpoint", "Checkpoint not independently trusted"]] as const) {
    const serverResponse = page.waitForResponse(response => response.url().includes(`/${rebuilt.id}/inspect?scenario=${scenario}`));
    await page.getByLabel("Check a pack scenario").selectOption(scenario);
    const server = await (await serverResponse).json();
    expect(verifyStandalonePack(server.artifactText).findings).toEqual(server.findings);
    expect(server.findings).toContain(finding); expect(server.complete).toBe(false);
    await expect(page.getByTestId(`pack-finding-${finding.toLowerCase().replaceAll(" ", "-")}`)).toBeVisible();
    await expect(page.getByTestId("pack-complete")).toHaveCount(0);
  }
  await page.getByLabel("Check a pack scenario").selectOption("intact");
  await expect(page.getByTestId("pack-server-inspection").getByText("Content matches manifest", { exact: true })).toBeVisible();
  await expect(page.getByTestId("pack-finding-checkpoint-not-independently-trusted")).toBeVisible();
  const downloadResponse = await page.request.get(`/api/recovery-cases/${caseId}/evidence-packs/${rebuilt.id}/download`);
  expect(downloadResponse.headers()["content-type"]).toContain("text/plain");
  const downloading = page.waitForEvent("download"); await page.getByRole("link", { name: "Download evidence pack (.txt)", exact: true }).click();
  const download = await downloading; expect(download.suggestedFilename()).toMatch(/\.txt$/u);
  const artifact = await readFile((await download.path())!, "utf8"), bundle = parseStandalonePack(artifact);
  expect(bundle.banner).toContain(banner); expect(bundle.manifest).toEqual(rebuilt.manifest);
  expect(verifyStandalonePack(artifact).findings).toEqual(rebuilt.findings);
  expect(artifact).toContain("Content mapping does not establish the truth of a claim.");
  await click(page, "Approve this pack for attachment");
  await expect(page.getByTestId("pack-current-attachment-status")).toHaveText("Attachment approval recorded for these exact hashes");
  expect((await currentPack(page, caseId)).attachmentApprovalRecorded).toBe(true);
  await page.reload(); await expect(page.getByTestId("pack-current-attachment-status")).toHaveText("Attachment approval recorded for these exact hashes");
  const newProofId = await recordedProof(page, source.jobId);
  expect(newProofId).not.toBe(source.proofId);
  await click(page, "Build evidence pack"); await expect(page.getByTestId("pack-revision")).toHaveText("3");
  const changed = await currentPack(page, caseId); expect(changed.manifestHash).not.toBe(first.manifestHash);
  expect(changed.sources.some((item: { sourceId: string }) => item.sourceId === `evidence_object:${newProofId}`)).toBe(true);
  await expect(page.getByTestId("pack-attachment-status")).toHaveText("Previous attachment approval invalidated by the new evidence version");
  const stale = await page.request.post(`/api/recovery-cases/${caseId}/evidence-packs/${rebuilt.id}/attachment-approval`, { data: { version: "evidence-pack-attachment-approval.v1", commandId: randomUUID(), expectedManifestHash: rebuilt.manifestHash, expectedContentHash: rebuilt.contentHash } });
  expect(stale.status()).toBe(409);
  const unauthorized = await request.get(`/api/recovery-cases/${caseId}/evidence-packs`); expect(unauthorized.status()).toBe(401);
  const forged = await page.request.post(`/api/recovery-cases/${caseId}/evidence-packs`, { data: { version: "evidence-pack-command.v1", commandId: randomUUID(), actorRef: "forged", evidenceVersion: 99 } }); expect(forged.status()).toBe(400);
  await page.reload(); await expect(page.getByTestId("pack-manifest-hash")).toHaveText(changed.manifestHash);
  // The Jobs home is a deliberately filtered fixture list that hides capture-created jobs (packages/db/src/demo-runtime.ts)
  // and a capture-created job page has no link back to it (workspace-shell.tsx), so no Jobs row exists to click for this
  // job. Leave through Jobs, then reopen the saved job by a fresh navigation (not a reload) and read the persisted pack.
  await page.goto("/"); await expect(page.getByRole("heading", { name: "Jobs in this demo", exact: true })).toBeVisible();
  await page.goto(`/jobs/${source.jobId}#recovery-cases`);
  await expect(page.getByTestId("pack-manifest-hash")).toHaveText(changed.manifestHash);
  const second = await browser.newContext({ storageState: await page.context().storageState() });
  try { const deep = await second.newPage(); await deep.goto(`/jobs/${source.jobId}#recovery-cases`); await expect(deep.getByTestId("pack-manifest-hash")).toHaveText(changed.manifestHash); await expect(deep.getByTestId("pack-attachment-status")).toBeVisible(); }
  finally { await second.close(); }
  await assertLayout(page); await page.screenshot({ path: `test-results/M4-3-S-${testInfo.project.name}.png`, fullPage: true });
});

test("includes only the merchant case's recorded supplier versions", async ({ page }) => {
  const source = await persistedSources(page);
  const rate = await post(page, "/api/material-rates", { version: "material-rate-command.v1", merchantName: "Fictional Builders Merchant", sku: `PACK-${randomUUID()}`, description: "Fictional building material", pricePence: 2000, priceUnit: "each", taxBasis: "net", effectiveFrom: "2026-09-01", sourceLabel: "Entered synthetic agreement", expectedVersion: 0 });
  await post(page, `/api/jobs/${source.jobId}/materials`, { version: "material-requirement-command.v1", scopeItemId: source.scopeItemId, skuId: rate.skuId, quantity: "40", unit: "each", expectedRevision: 0 });
  // A delivery note can only be receipted against an existing purchase-order draft (supplier-document intake rule).
  const requirement = (await get(page, `/api/jobs/${source.jobId}/materials`)).materials.at(-1);
  await post(page, `/api/jobs/${source.jobId}/purchase-orders/revisions`, { version: "purchase-order-draft.v1", requirementId: requirement.id, quantity: "40", unitPricePence: 2000, recipient: "orders@fictional-merchant.invalid", requiredDate: "2026-10-01", expectedRevision: 0 });
  const documentsPath = `/api/jobs/${source.jobId}/supplier-documents`;
  for (const fixtureId of ["materials-B-delivery", "materials-320-invoice", "materials-B-credit"]) {
    const before = await get(page, documentsPath);
    await post(page, `${documentsPath}/intake`, { version: "supplier-document-intake.v1", fixtureId, channel: "picker", expectedRevision: before.state.intakeRevision });
  }
  const documents = (await get(page, documentsPath)).state.documents;
  const excludedDelivery = documents.find((document: { document_type: string }) => document.document_type === "delivery");
  const excludedCredit = documents.find((document: { document_type: string }) => document.document_type === "credit");
  expect(excludedDelivery).toBeTruthy(); expect(excludedCredit).toBeTruthy();
  await page.goto(`/jobs/${source.jobId}#recovery-cases`); await click(page, "Open materials-320 overcharge");
  await expect(page.getByTestId("case-claimed-net")).toHaveText("£320.00");
  const claim = (await get(page, `/api/jobs/${source.jobId}/recovery-cases`)).cases.at(-1);
  expect(claim.sourceRefs).toContain(rate.id);
  await click(page, "Build evidence pack");
  await expect(page.getByTestId("pack-state")).toHaveText("Sources mapped — inspect the evidence");
  const pack = await currentPack(page, claim.id);
  for (const kind of ["supplier_agreement", "supplier_invoice"]) expect(pack.sources.some((entry: { kind: string }) => entry.kind === kind)).toBe(true);
  for (const kind of ["invoice", "supplier_delivery"]) expect(pack.sources.some((entry: { kind: string }) => entry.kind === kind)).toBe(false);
  for (const document of [excludedDelivery, excludedCredit]) expect(JSON.stringify(pack.sources)).not.toContain(document.id);
  expect(JSON.stringify(pack.sources)).not.toContain(source.invoiceId);
  await page.reload(); await expect(page.getByTestId("pack-manifest-hash")).toHaveText(pack.manifestHash);
  await assertLayout(page);
});
