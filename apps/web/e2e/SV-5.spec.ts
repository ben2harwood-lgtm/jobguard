// SV-5 reveal and real post-lock practice worker journeys. Synthetic; CI only.
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { openLiveWatchdogJob } from "./helpers/capture-journey";
import { prepareLockJob, withSyntheticShadow } from "./helpers/final-account-lock-journey";
import { jsonResult, prepareInvoiceFinalCheck } from "./helpers/customer-invoice-journey";

test("before lock nothing is revealed; after lock the check shows as running and survives reload", async ({ page }) => {
  await openLiveWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  await page.goto(`/jobs/${jobId}#final-check`);
  const panel = page.getByTestId("final-check-reveal");
  await expect(panel.getByTestId("final-check-status")).toHaveText("JobGuard's final check runs after you complete the final account.");
  await expect(panel.getByTestId("final-check-item")).toHaveCount(0);
  const before = await page.request.get(`/api/jobs/${jobId}/final-check`);
  expect(await before.json()).toMatchObject({ state: "unlocked", items: [] });
});

test("after lock the check is running, shows no items and keeps that state after reload", async ({ page }) => {
  const { jobId, account } = await prepareLockJob(page);
  await prepareInvoiceFinalCheck(page, jobId, account);
  for (let pass = 0; pass < 2; pass++) {
    await page.goto(`/jobs/${jobId}#final-check`);
    const panel = page.getByTestId("final-check-reveal");
    await expect(panel.getByTestId("final-check-status")).toHaveText("Running JobGuard's final check");
    await expect(panel.getByTestId("final-check-item")).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

/** An existing held proposal on the pre-lock proof photo. The actual scheduled worker processes sources
 * and reconciles it; this helper never writes source results or completion facts. */
async function revealedJob(page: Page) {
  test.setTimeout(240_000);
  const { jobId, tenantId, evidenceId, account } = await prepareLockJob(page);
  const signalId = randomUUID();
  await withSyntheticShadow(tenantId, async (shadow, admin) => {
    const row = (await admin.query("SELECT object_version_id,sha256,server_received_at::text received FROM app.evidence_object WHERE tenant_id=$1 AND job_id=$2 AND id=$3", [tenantId, jobId, evidenceId])).rows[0];
    await shadow.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state) VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic_web.v1',clock_timestamp(),'Fitted an outside tap','low','held_for_final_check')", [tenantId, jobId, signalId, randomUUID()]);
    await shadow.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz)", [tenantId, jobId, signalId, evidenceId, row.object_version_id, row.sha256, row.received]);
    // Lock only (terms, dispositions, lock); no invoice-gate fixture completion.
    const trackDb = await admin.connect();
    try { await trackDb.query("BEGIN"); await trackDb.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      await trackDb.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) SELECT tenant_id,id,'small_builder','synthetic_demo','legacy_synthetic_live_fixture' FROM app.job WHERE tenant_id=$1 AND id=$2 ON CONFLICT(tenant_id,job_id) DO NOTHING", [tenantId, jobId]);
      await trackDb.query("COMMIT"); } catch (error) { await trackDb.query("ROLLBACK"); throw error; } finally { trackDb.release(); }
    const path = `/api/jobs/${jobId}/final-account`;
    await jsonResult(page.request.post(`${path}/terms`, { data: { version: "final-check-terms.accept.v1", commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" } }), "Accept final check terms");
    const scope = (await admin.query("SELECT DISTINCT scope_item_id FROM app.final_account_line WHERE tenant_id=$1 AND job_id=$2 AND final_account_revision_id=$3 AND line_kind='baseline'", [tenantId, jobId, account.id])).rows;
    for (const item of scope) await jsonResult(page.request.post(`${path}/dispositions`, { data: { version: "final-account.disposition.v1", commandId: randomUUID(), scopeItemId: item.scope_item_id, disposition: "done" } }), "Record disposition");
    await jsonResult(page.request.post(`${path}/lock`, { data: { version: "final-account.lock.v1", commandId: randomUUID(), finalAccountRevisionId: account.id, expectedRevision: account.revision, declarationVersion: "final_account_declaration.v1" } }), "Lock");
  });
  await expect.poll(async () => (await (await page.request.get(`/api/jobs/${jobId}/final-check`)).json()).state,
    { timeout: 180_000, intervals: [5_000] }).toBe("completed");
  const lock = await jsonResult(page.request.get(`/api/jobs/${jobId}/final-account`), "Read lock");
  await page.goto(`/jobs/${jobId}#final-check`);
  return { jobId, tenantId, lock: JSON.stringify(lock.lock) };
}

test("E (existing proposal, real run): a revealed item answered Not done keeps that answer after reload", async ({ page }) => {
  const { jobId, tenantId } = await revealedJob(page);
  const panel = page.getByTestId("final-check-reveal"), item = panel.getByTestId("final-check-item");
  await expect(panel.getByTestId("final-check-status")).toHaveText("JobGuard's final check found 1 thing that may be missing from your bill.");
  await expect(item).toContainText("Fitted an outside tap");
  // Q2 enabled confirmation; E answers Not done instead.
  await expect(item.getByRole("button", { name: "Yes — this was extra work", exact: true })).toBeEnabled();
  await item.getByLabel("Or answer").selectOption("not_completed");
  await item.getByRole("button", { name: "Save answer", exact: true }).click();
  await expect(item.getByTestId("final-check-disposition")).toHaveText("Your answer: Not done");
  await page.reload();
  await expect(page.getByTestId("final-check-item").getByTestId("final-check-disposition")).toHaveText("Your answer: Not done");
  // A non-confirming answer creates no variation or case.
  await withSyntheticShadow(tenantId, async (_shadow, admin) => {
    for (const table of ["variation", "recovery_case"]) expect(Number((await admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`, [tenantId, jobId])).rows[0].n)).toBe(0);
  });
});

test("K (existing proposal, real run): Already included must name a locked line and leaves the lock unchanged", async ({ page }) => {
  const { jobId, lock } = await revealedJob(page);
  const item = page.getByTestId("final-check-item");
  const save = item.getByRole("button", { name: "Save answer", exact: true });
  await item.getByLabel("Or answer").selectOption("already_included");
  await expect(save).toBeDisabled();
  const line = item.getByLabel("Which locked line?");
  await line.selectOption({ index: 1 });
  await expect(save).toBeEnabled(); await save.click();
  await expect(item.getByTestId("final-check-disposition")).toHaveText("Your answer: Already included in a locked line");
  await page.reload();
  await expect(page.getByTestId("final-check-item").getByTestId("final-check-disposition")).toHaveText("Your answer: Already included in a locked line");
  expect(JSON.stringify((await jsonResult(page.request.get(`/api/jobs/${jobId}/final-account`), "Re-read lock")).lock)).toBe(lock);
});

/** Live job with its generated proof photo, final account assembled, terms, dispositions and lock, all through the app. */
async function lockedPracticeJob(page: Page, capturedExtra = false) {
  await openLiveWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!, tenantId = "11111111-1111-4111-8111-111111111111";
  await jsonResult(page.request.post("/api/decisions", { data: { version: "finding-evaluation-command.v1", commandId: randomUUID(), tenantId, jobId } }), "Evaluate proof requirement");
  const proofPath = `/api/jobs/${jobId}/proof`, initial = await jsonResult(page.request.get(proofPath), "Read proof requirement");
  const proof = (data: Record<string, unknown>) => jsonResult(page.request.post(proofPath, { data: { version: "practice-proof-command.v1", commandId: randomUUID(), ...data } }), "Proof step");
  const selected = await proof({ action: "select_generated", scopeItemId: initial.scopeItemId, fixture: "completion-photo" });
  const finalized = await proof({ action: "finalize", uploadId: selected.upload.id, objectVersionId: selected.upload.objectVersionId });
  await proof({ action: "complete", evidenceId: finalized.upload.evidenceId, scopeItemId: initial.scopeItemId });
  if (capturedExtra) {
    await page.goto(`/jobs/${jobId}#job-diary`);
    const diary = page.getByTestId("job-diary");
    await diary.getByLabel("Note", { exact: true }).fill("Fitted outside tap.");
    await diary.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(diary.getByTestId("diary-entry")).toContainText("Fitted outside tap.");
    const entries = await jsonResult(page.request.get(`/api/jobs/${jobId}/diary`), "Read diary");
    const evidenceId = entries.entries[0].evidence.id;
    // Existing held proposal; all source processing/reconciliation below is performed by the real worker.
    await withSyntheticShadow(tenantId, async (shadow, admin) => {
      const row = (await admin.query("SELECT object_version_id,sha256,server_received_at::text received FROM app.evidence_object WHERE tenant_id=$1 AND job_id=$2 AND id=$3", [tenantId, jobId, evidenceId])).rows[0];
      const signalId = randomUUID();
      await shadow.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state) VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic_web.v1',clock_timestamp(),'outside tap','low','held_for_final_check')", [tenantId, jobId, signalId, randomUUID()]);
      await shadow.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz)", [tenantId, jobId, signalId, evidenceId, row.object_version_id, row.sha256, row.received]);
    });
    await jsonResult(page.request.post(`/api/jobs/${jobId}/final-account/review-extras`, { data: {
      version: "final-review-extra.v1", commandId: randomUUID(), scopeItemId: randomUUID(), description: "outside tap", captureText: "outside tap",
      price: { quantity: "1", unit: "item", unitRatePence: 80000, direction: "addition" },
    } }), "Add £800 final-review capture");
  }
  const path = `/api/jobs/${jobId}/final-account`;
  const account = (await jsonResult(page.request.post(path, { data: { version: "final-account.assemble.v1", commandId: randomUUID(), expectedRevision: 0 } }), "Assemble")).account;
  await jsonResult(page.request.post(`${path}/terms`, { data: { version: "final-check-terms.accept.v1", commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" } }), "Accept terms");
  await withSyntheticShadow(tenantId, async (_shadow, admin) => {
    await admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) SELECT tenant_id,id,'small_builder','synthetic_demo','legacy_synthetic_live_fixture' FROM app.job WHERE tenant_id=$1 AND id=$2 ON CONFLICT(tenant_id,job_id) DO NOTHING", [tenantId, jobId]);
    const scope = (await admin.query("SELECT DISTINCT scope_item_id FROM app.final_account_line WHERE tenant_id=$1 AND job_id=$2 AND final_account_revision_id=$3 AND line_kind='baseline'", [tenantId, jobId, account.id])).rows;
    for (const item of scope) await jsonResult(page.request.post(`${path}/dispositions`, { data: { version: "final-account.disposition.v1", commandId: randomUUID(), scopeItemId: item.scope_item_id, disposition: "done" } }), "Disposition");
  });
  await jsonResult(page.request.post(`${path}/lock`, { data: { version: "final-account.lock.v1", commandId: randomUUID(), finalAccountRevisionId: account.id, expectedRevision: account.revision, declarationVersion: "final_account_declaration.v1" } }), "Lock");
  return { jobId, tenantId };
}

test("D (practice run): a photo of work in the original quote is reconciled, never revealed", async ({ page }) => {
  test.setTimeout(240_000);
  const { jobId, tenantId } = await lockedPracticeJob(page);
  await page.goto(`/jobs/${jobId}#final-check`);
  // Lock itself requests the run; no manual request, fabricated source result or completion certificate.
  // The worker discovers requests once a minute, then freezes, examines, reconciles and publishes.
  await expect.poll(async () => (await (await page.request.get(`/api/jobs/${jobId}/final-check`)).json()).state, { timeout: 180_000, intervals: [5_000] }).toBe("completed");
  await page.reload();
  await expect(page.getByTestId("final-check-status")).toHaveText("JobGuard's final check found nothing missing from your bill.");
  await expect(page.getByTestId("final-check-item")).toHaveCount(0);
  await withSyntheticShadow(tenantId, async (_shadow, admin) => {
    const outcomes = (await admin.query("SELECT c.outcome FROM app.shadow_signal_classification c JOIN app.shadow_commercial_signal s ON (s.tenant_id,s.job_id,s.id)=(c.tenant_id,c.job_id,c.signal_id) WHERE c.tenant_id=$1 AND c.job_id=$2", [tenantId, jobId])).rows.map(r => r.outcome);
    expect(outcomes).toEqual(["already_in_original_scope"]);
  });
});

test("B (real run): a held extra captured for £800 at final review is never revealed", async ({ page }) => {
  test.setTimeout(240_000);
  const { jobId, tenantId } = await lockedPracticeJob(page, true);
  await expect.poll(async () => (await (await page.request.get(`/api/jobs/${jobId}/final-check`)).json()).state,
    { timeout: 180_000, intervals: [5_000] }).toBe("completed");
  for (let pass = 0; pass < 2; pass++) {
    await page.goto(`/jobs/${jobId}#final-check`);
    await expect(page.getByTestId("final-check-status")).toHaveText("JobGuard's final check found nothing missing from your bill.");
    await expect(page.getByTestId("final-check-item")).toHaveCount(0);
    await page.reload();
  }
  await withSyntheticShadow(tenantId, async (_shadow, admin) => {
    const classifications = (await admin.query("SELECT c.outcome FROM app.shadow_signal_classification c JOIN app.shadow_commercial_signal s ON (s.tenant_id,s.job_id,s.id)=(c.tenant_id,c.job_id,c.signal_id) WHERE c.tenant_id=$1 AND c.job_id=$2 AND s.description='outside tap'", [tenantId, jobId])).rows;
    expect(classifications.length).toBeGreaterThan(0);
    expect(classifications.every(c => c.outcome === "builder_captured" || c.outcome === "duplicate_signal")).toBe(true);
    expect(classifications.some(c => c.outcome === "builder_captured")).toBe(true);
    for (const table of ["recovery_case", "recovery_fee_journal"]) {
      expect(Number((await admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`, [tenantId, jobId])).rows[0].n)).toBe(0);
    }
  });
});

// I remains blocked: D13 must-surface activation is held.
// J/L remain blocked: merged SV-7A rejects new post-lock sources with POST_LOCK_WORK_REQUIRES_LINKED_JOB;
// email/photo coalescing and post-lock message imports are not supplied by its bounded text intake.
