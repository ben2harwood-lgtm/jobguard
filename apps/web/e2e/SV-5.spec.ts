// SV-5 reveal and real post-lock practice worker journeys. Synthetic; CI only.
import { approveJ3Catches } from "./helpers/j3-customer-approval";
import { sourceFixture } from "./helpers/final-check-source-fixtures";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { openLiveWatchdogJob } from "./helpers/capture-journey";
import { finishDispositionsAndTerms, prepareLockJob, preparePendingCheckJob, withSyntheticShadow } from "./helpers/final-account-lock-journey";
import { jsonResult } from "./helpers/customer-invoice-journey";

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
  const { jobId } = await preparePendingCheckJob(page);
  await finishDispositionsAndTerms(page);
  await page.getByRole("button", { name: "Complete final account", exact: true }).click();
  await expect(page.getByTestId("lock-state")).toHaveText("Final account completed");
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
async function lockedPracticeJob(page: Page, capturedExtra = false, beforeLock?: (tenantId:string,jobId:string)=>Promise<void>) {
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
  if(beforeLock)await beforeLock(tenantId,jobId);
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

test("O (real run): zero-result wording survives reload and replay creates no duplicate classification", async ({ page }) => {
  test.setTimeout(240_000);
  const { jobId, tenantId } = await lockedPracticeJob(page);
  const checkPath = `/api/jobs/${jobId}/final-check`;
  const readCheck = () => jsonResult(page.request.get(checkPath), "Read Test O final check");
  await expect.poll(async () => (await readCheck()).state,
    { timeout: 180_000, intervals: [5_000] }).toBe("completed");
  const completed = await readCheck();
  expect(completed.items).toEqual([]);
  expect(completed.lockId).toBeTruthy();
  expect(completed.runId).toBeTruthy();
  const lock = (await jsonResult(page.request.get(`/api/jobs/${jobId}/final-account`), "Read Test O lock")).lock;
  await page.goto(`/jobs/${jobId}#final-check`);
  const main = page.getByRole("main");
  const panel = main.getByTestId("final-check-reveal");
  const assertZeroResult = async () => {
    await expect(panel.getByTestId("final-check-status")).toHaveText("JobGuard's final check found nothing missing from your bill.");
    await expect(panel.getByTestId("final-check-item")).toHaveCount(0);
    await expect(panel.getByTestId("final-check-post-lock")).toHaveCount(0);
    await expect(panel).toHaveAttribute("aria-busy", "false");
    await expect(main.getByRole("alert")).toHaveCount(0);
  };
  await assertZeroResult();
  await page.reload();
  await assertZeroResult();

  await withSyntheticShadow(tenantId, async (_shadow, admin) => {
    const classifications = () => admin.query("SELECT * FROM app.shadow_signal_classification WHERE tenant_id=$1 AND job_id=$2 ORDER BY id", [tenantId, jobId]);
    const runs = () => admin.query("SELECT * FROM app.shadow_reconciliation_run WHERE tenant_id=$1 AND job_id=$2 ORDER BY id", [tenantId, jobId]);
    const before = (await classifications()).rows;
    // This is an examined baseline photo, not an empty fixture that could pass without classifying anything.
    expect(before).toEqual([expect.objectContaining({ run_id: completed.runId, outcome: "already_in_original_scope" })]);
    const originalRuns = (await runs()).rows;
    expect(originalRuns).toEqual([expect.objectContaining({ id: completed.runId })]);
    // Redeliver the real practice task with the same locked-bill reference. No domain result is fabricated.
    const queued = (await admin.query("SELECT (graphile_worker.add_job('final_check_practice_run',$1::json,job_key := $2,max_attempts := 1)).id AS id", [
      JSON.stringify({ version: "final-check-practice-run.v1", tenantId, jobId, lockId: completed.lockId }),
      `sv5-test-o-replay:${randomUUID()}`,
    ])).rows[0];
    // A failed task stays in the queue: wait for acknowledgment before claiming replay succeeded.
    await expect.poll(async () => (await admin.query("SELECT id FROM graphile_worker._private_jobs WHERE id=$1", [queued.id])).rowCount,
      { timeout: 30_000, intervals: [500] }).toBe(0);
    expect((await classifications()).rows).toEqual(before);
    expect((await runs()).rows).toEqual(originalRuns);
    for (const table of ["variation", "recovery_case", "recovery_fee_journal"]) {
      expect(Number((await admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`, [tenantId, jobId])).rows[0].n)).toBe(0);
    }
  });
  expect(await readCheck()).toEqual(completed);
  expect((await jsonResult(page.request.get(`/api/jobs/${jobId}/final-account`), "Re-read Test O lock")).lock).toEqual(lock);
  await page.reload();
  await assertZeroResult();
});

test("I (practice journey): a £8,000 request fires D13 before lock and stays permanently fee-free", async ({ page }) => {
  test.setTimeout(300_000);
  const { jobId, tenantId } = await prepareLockJob(page);
  await finishDispositionsAndTerms(page);
  const text = "Fictional practice customer request: please build a garden room for £8,000 net; written agreement is required before work starts.";
  const messages = page.getByTestId("customer-messages");
  await messages.getByLabel("Made-up customer name").fill("Fictional Alex");
  await messages.getByLabel("Message", { exact: true }).fill(text);
  await messages.getByRole("button", { name: "Save message", exact: true }).click();
  await expect(messages.getByTestId("customer-message")).toContainText(text);
  const saved = await jsonResult(page.request.get(`/api/jobs/${jobId}/customer-messages`), "Read Test I original");
  const evidence = saved.messages[0].evidence;

  // Existing authorized practice request and scheduled worker; no seeded signal,
  // firing, Decision, disclosure, classification or completion row.
  const examineSources = async () => {
    await page.goto(`/jobs/${jobId}/shadow-journey`);
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith(`/api/jobs/${jobId}/shadow-demo/source-hold`) && r.request().method() === "POST"),
      page.getByRole("button", { name: "Hold signals from saved sources", exact: true }).click(),
    ]);
    expect(response.status()).toBe(200);
    await page.reload();
    await expect(page.getByTestId("guide-hold-state")).toHaveText("Saved sources examined", { timeout: 180_000 });
  };
  await examineSources();
  const decisions = await jsonResult(page.request.get(`/api/decisions?tenantId=${tenantId}&jobId=${jobId}`), "Read Test I Decision");
  const mandatory = decisions.decisions.filter((d: { title: string }) => d.title === "Fictional £8,000 garden room change");
  expect(mandatory).toHaveLength(1);
  const decision = mandatory[0];
  expect(decision).toMatchObject({ classification: "mandatory", resolution: "open", authorizedAction: false });
  const signalId = decision.source.subjectRef;
  const assertDecision = async () => {
    await page.getByRole("button", { name: /Fictional £8,000 garden room change/u }).click();
    await expect(page.locator(".decision-detail .decision-kind")).toHaveText("mandatory");
    await expect(page.getByTestId("decision-source-ref")).toHaveText(signalId);
    await expect(page.getByRole("button", { name: "Dismiss suggestion", exact: true })).toHaveCount(0);
    await expect(page.getByText("Mandatory blockers cannot be suppressed by value, confidence, or advisory budget.", { exact: true })).toBeVisible();
  };
  const openInbox = async () => {
    await page.goto("/classic");
    await page.getByRole("button", { name: /Decisions/u }).first().click();
    await assertDecision();
  };
  await openInbox();
  await page.reload();
  await page.getByRole("button", { name: /Decisions/u }).first().click();
  await assertDecision();
  await page.getByRole("button", { name: "← Jobs", exact: true }).click();
  await openInbox();
  // A second real worker request cannot duplicate or undo the firing/exclusions.
  await examineSources();
  await openInbox();
  await withSyntheticShadow(tenantId, async (shadow, admin) => {
    expect((await shadow.query("SELECT state,disclosed_before_lock,must_surface_now,confidence_band,estimated_value_pence FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND id=$3", [tenantId, jobId, signalId])).rows).toEqual([
      { state: "surfaced_early", disclosed_before_lock: true, must_surface_now: true, confidence_band: "low", estimated_value_pence: "800000" },
    ]);
    expect((await shadow.query("SELECT rule,rule_version,source_ref,object_version_id,decision_id FROM app.shadow_must_surface_firing WHERE tenant_id=$1 AND job_id=$2", [tenantId, jobId])).rows).toEqual([
      { rule: "prior_written_agreement", rule_version: "shadow_attribution_policy_v3", source_ref: evidence.id, object_version_id: evidence.objectVersionId, decision_id: decision.id },
    ]);
    const reasons = (await shadow.query("SELECT reason FROM app.shadow_signal_ineligibility WHERE tenant_id=$1 AND signal_id=$2 ORDER BY reason", [tenantId, signalId])).rows.map(r => r.reason);
    expect(reasons).toEqual(["disclosed_before_lock", "surfaced_early"]);
    expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='shadow.must_surface_fired'", [tenantId, jobId])).rows[0].n).toBe(1);
    expect((await admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2", [tenantId, jobId])).rows[0].n).toBe(0);
    for (const table of ["variation", "recovery_case", "recovery_fee_journal"]) {
      expect(Number((await admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`, [tenantId, jobId])).rows[0].n)).toBe(0);
    }
    // The restricted worker cannot erase the permanent exclusion or disclosure.
    await expect(shadow.query("DELETE FROM app.shadow_signal_ineligibility WHERE tenant_id=$1 AND signal_id=$2", [tenantId, signalId])).rejects.toThrow();
    await expect(shadow.query("UPDATE app.shadow_commercial_signal SET disclosed_before_lock=false WHERE tenant_id=$1 AND id=$2", [tenantId, signalId])).rejects.toThrow();
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
// L uses an explicit fictional connector-source fixture; real connector intake remains outside this suite.
test("L source leg: an old message received after lock is shown at once and never fee eligible", async ({page}) => {
 const {jobId,tenantId} = await lockedPracticeJob(page);
 await withSyntheticShadow(tenantId, async (shadow,admin) => {
  const observation=await sourceFixture(admin,tenantId,jobId,"message"),signalId=randomUUID();
  await shadow.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state) VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic_web.v1',clock_timestamp(),'Old fictional outside tap message','low','held_for_final_check')",[tenantId,jobId,signalId,randomUUID()]);
  const e=observation.evidence;
  await shadow.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz)",[tenantId,jobId,signalId,e.id,e.objectVersionId,e.sha256,e.serverReceivedAt]);
  for(let pass=0;pass<2;pass++) {
   await page.goto(`/jobs/${jobId}#final-check`);
   const panel=page.getByTestId("final-check-reveal");
   await expect(panel.getByTestId("final-check-post-lock")).toHaveCount(1);
   await expect(panel.getByTestId("final-check-post-lock")).toContainText("Old fictional outside tap message");
   await expect(panel).toContainText("it never earns JobGuard a fee");
   await expect(panel.getByTestId("final-check-item")).toHaveCount(0);
   await page.reload();
  }
  expect((await shadow.query("SELECT reason FROM app.shadow_signal_ineligibility WHERE tenant_id=$1 AND job_id=$2 AND signal_id=$3",[tenantId,jobId,signalId])).rows).toContainEqual({reason:"evidence_after_lock"});
  expect((await admin.query("SELECT device_captured_at < l.locked_at old, e.server_received_at > l.locked_at late FROM app.evidence_object e JOIN app.final_account_lock l USING(tenant_id,job_id) WHERE e.tenant_id=$1 AND e.id=$2",[tenantId,e.id])).rows).toEqual([{old:true,late:true}]);
 });
});

test("L: import old evidence through the locked-job control; worker replay preserves one fee-free signal", async ({page}) => {
 test.setTimeout(240_000);
 const {jobId,tenantId}=await lockedPracticeJob(page);
 const read=(suffix:string)=>jsonResult(page.request.get(`/api/jobs/${jobId}/${suffix}`),suffix);
 const lock=(await read("final-account")).lock;
 await page.goto(`/jobs/${jobId}#final-check`);
 const form=page.getByTestId("historical-evidence-import");
 await form.getByLabel("Fictional sender").fill("Fictional Alex");
 await form.getByLabel("Stated message date").fill("2020-01-01T10:00");
 await form.getByLabel("Old fictional message").fill("Fitted outside tap.");
 const response=page.waitForResponse(r=>r.request().method()==="POST"&&r.url().endsWith("/historical-evidence"));
 await form.getByRole("button",{name:"Import as evidence only",exact:true}).click();
 const imported=await response;expect(imported.ok()).toBe(true);
 const saved=await imported.json();
 expect(saved).toMatchObject({evidenceAfterLock:true,realExternalActions:0});
 await expect.poll(async()=> (await read("final-check")).postLockItems?.length,{timeout:180_000,intervals:[5000]}).toBe(1);
 for(let pass=0;pass<2;pass++){
  await page.reload();
  await expect(page.getByTestId("final-check-post-lock")).toContainText("outside tap");
  await page.getByTestId("imported-historical-message").getByText("Old message from Fictional Alex",{exact:true}).click();
  await expect(page.getByTestId("imported-historical-message")).toContainText("Fitted outside tap.");
  await expect(page.getByTestId("final-check-reveal")).toContainText("it never earns JobGuard a fee");
 }
 await withSyntheticShadow(tenantId,async(shadow,admin)=>{
  const evidence=saved.record.evidence;
  expect((await admin.query("SELECT device_captured_at<l.locked_at old,e.server_received_at>l.locked_at late FROM app.evidence_object e JOIN app.final_account_lock l USING(tenant_id,job_id) WHERE e.tenant_id=$1 AND e.id=$2",[tenantId,evidence.id])).rows).toEqual([{old:true,late:true}]);
  const reasons=await shadow.query("SELECT i.reason FROM app.shadow_signal_ineligibility i JOIN app.shadow_signal_evidence e ON(e.tenant_id,e.job_id,e.signal_id)=(i.tenant_id,i.job_id,i.signal_id) WHERE e.tenant_id=$1 AND e.evidence_id=$2",[tenantId,evidence.id]);
  expect(reasons.rows).toContainEqual({reason:"evidence_after_lock"});
  const request=(await admin.query("SELECT id FROM infrastructure.demo_source_hold_request WHERE id=$1",[saved.record.commandId])).rows[0];
  await expect.poll(async()=> (await admin.query("SELECT finished_at IS NOT NULL done FROM infrastructure.demo_source_hold_request WHERE id=$1",[request.id])).rows[0]?.done,{timeout:30_000}).toBe(true);
  const queued=(await admin.query("SELECT (graphile_worker.add_job('hold_demo_sources',$1::json,job_key := $2,max_attempts := 1)).id id",[
   JSON.stringify({version:"demo-source-hold.v1",requestId:request.id,tenantId,jobId}),`sv5-l-replay:${randomUUID()}`])).rows[0];
  await expect.poll(async()=> (await admin.query("SELECT id FROM graphile_worker._private_jobs WHERE id=$1",[queued.id])).rowCount,{timeout:30_000}).toBe(0);
  expect((await read("final-check")).postLockItems).toHaveLength(1);
 });
 expect((await read("final-account")).lock).toEqual(lock);
});

test("J: three fictional sources produce one coalesced catch, one recovery and one fee", async ({page,browser}) => {
 test.setTimeout(360_000);
 const sources:string[]=[];
 const {jobId,tenantId}=await lockedPracticeJob(page,false,async(t,j)=>{
  await withSyntheticShadow(t,async(_shadow,admin)=>{
   for(const kind of ["email","message","completion_photo"] as const)sources.push((await sourceFixture(admin,t,j,kind)).evidence.id);
  });
 });
 const read=(suffix:string)=>jsonResult(page.request.get(`/api/jobs/${jobId}/${suffix}`),suffix);
 const post=(suffix:string,data:unknown)=>jsonResult(page.request.post(`/api/jobs/${jobId}/${suffix}`,{data}),suffix);
 await expect.poll(async()=> (await read("final-check")).state,{timeout:180_000,intervals:[5000]}).toBe("completed");
 const check=await read("final-check"),originalLock=(await read("final-account")).lock;
 expect(check.items).toHaveLength(1);
 expect(check.items[0].evidence.map((e:{id:string})=>e.id).sort()).toEqual(sources.sort());
 await page.goto(`/jobs/${jobId}#final-check`);
 await expect(page.getByTestId("final-check-item")).toHaveCount(1);
 await page.reload();
 await expect(page.getByTestId("final-check-item")).toHaveCount(1);
 const account=(await read("final-account")).account;
 await post("final-account/lock",{version:"lock-bound-invoice.issue.v1",commandId:randomUUID(),finalAccountRevisionId:account.id,
  expectedSourceHash:account.sourceHash,invoiceKind:"final",recipient:"practice-customer@example.invalid",issuedOn:"2026-11-02"});
 const request=page.waitForRequest(r=>r.method()==="POST"&&r.url().endsWith("/final-check/catches"));
 await page.getByTestId("final-check-item").getByRole("button",{name:"Yes — this was extra work",exact:true}).click();
 const confirm=(await request).postDataJSON();
 await expect.poll(async()=> (await read("variations")).variations.length).toBe(1);
 const confirmed=await post("final-check/catches",confirm);
 expect(await post("final-check/catches",confirm)).toEqual(confirmed);
 const variationId=(await read("variations")).variations[0].id;
 await page.goto(`/jobs/${jobId}#variation-${variationId}`);
 const row=page.getByTestId(`variation-${variationId}`);
 await row.getByRole("button",{name:"Change price",exact:true}).click();
 await row.getByLabel("New price Outside tap",{exact:true}).fill("800.00");
 await row.getByRole("button",{name:"Save new proposed revision",exact:true}).click();
 await expect(row.getByRole("button",{name:"Approve exact revision",exact:true})).toBeVisible();
 const catches=(await read("variations")).variations;
 expect(catches).toHaveLength(1);
 await approveJ3Catches(page,browser,jobId,catches);
 const assembled=await post("final-account",{version:"final-account.assemble.v1",commandId:randomUUID(),expectedRevision:account.revision});
 const invoices=await post("final-account/lock",{version:"lock-bound-invoice.issue.v1",commandId:randomUUID(),finalAccountRevisionId:assembled.account.id,
  expectedSourceHash:assembled.account.sourceHash,invoiceKind:"supplementary",recipient:"practice-customer@example.invalid",issuedOn:"2026-11-02"});
 const invoice=invoices.invoices.find((i:{netPence:number})=>i.netPence===80000);
 expect(invoice).toMatchObject({totalPence:96000});
 const receipts=await post(`customer-invoices/${invoice.id}/receipts`,{version:"practice-customer-receipt.record.v1",commandId:randomUUID(),invoiceId:invoice.id,
  paidOn:"2026-11-02",amountPence:96000,method:"bank_transfer",reference:"Fictional Test J receipt"});
 const paymentId=receipts.receipts[0].id;
 let feed=await post("practice-feed",{version:"practice-feed-command.v1",commandId:randomUUID(),action:"connect",expectedRevision:0});
 feed=await post("practice-feed",{version:"practice-feed-command.v1",commandId:randomUUID(),action:"advance",expectedRevision:feed.revision,movement:"receipt-960",step:"settled"});
 await post("practice-feed",{version:"practice-feed-command.v1",commandId:randomUUID(),action:"match_receipt",expectedRevision:feed.revision,movement:"receipt-960",paymentId});
 const allocate=(target:string,command:unknown)=>post("receipt-case-allocations",{version:"receipt-case-allocation-command.v1",target,command});
 const lines=await read("receipt-case-allocations");
 const lineReview=await allocate("receipt_lines",{version:"receipt-line-facts-command.v1",commandId:randomUUID(),action:"review",paymentId,expectedSourceRevision:lines.revision});
 await allocate("receipt_lines",{version:"receipt-line-facts-command.v1",commandId:randomUUID(),action:"approve",reviewId:lineReview.reviewId,approvalHash:lineReview.approvalHash,expectedSourceRevision:lineReview.sourceRevision});
 const cases=(await read("recovery-cases")).cases;
 expect(cases).toHaveLength(1);
 const recovery=cases[0],input=(await read("shadow-demo/review-inputs")).cases[0];
 const line=(await read("receipt-case-allocations")).rows.find((r:{commercialRevisionId:string})=>r.commercialRevisionId===catches[0].currentRevisionId);
 const base={version:"stored-receipt-case-command.v1",factLineId:line.lineAllocationId,caseId:recovery.id,workId:input.workId,expectedCaseRevision:recovery.revision};
 const review=await allocate("case",{...base,action:"review",commandId:randomUUID()});
 await allocate("case",{...base,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash});
 const current=(await read("recovery-cases")).cases[0];
 const attribution={version:"recovery-attribution-command.v1",caseId:current.id,workId:input.workId,lineId:line.lineId,lockId:check.lockId,expectedCaseRevision:current.revision};
 const assessed=await post("success-fee-attribution",{...attribution,action:"assess",commandId:randomUUID(),expectedAttributionRevision:0});
 expect(assessed.valueReceipt.fee).toEqual({pence:8000,currency:"GBP"});
 const reviewInput=(await read("shadow-demo/review-inputs")).cases[0];
 await post("success-fee-attribution",{...attribution,action:"approve_review",commandId:randomUUID(),expectedAttributionRevision:assessed.assessment.revision,
  assessmentId:assessed.assessment.assessmentId,expectedSourceHash:assessed.assessment.sourceHash,reviewArtifactHash:reviewInput.reviewArtifactHash});
 await page.goto(`/jobs/${jobId}`);
 await page.getByRole("button",{name:"Prepare fee statement",exact:true}).click();
 await expect(page.getByTestId("payment-fee")).toHaveText("£80.00");
 await page.getByRole("button",{name:"Approve this exact fee statement",exact:true}).click();
 await expect(page.getByRole("region",{name:"Receipt fee statements"})).toContainText("Approved for simulation");
 const fees=await read("payment-fees");expect(fees.statements).toHaveLength(1);
 await withSyntheticShadow(tenantId,async(_shadow,admin)=>{
  const queued=(await admin.query("SELECT (graphile_worker.add_job('final_check_practice_run',$1::json,job_key := $2,max_attempts := 1)).id id",[
   JSON.stringify({version:"final-check-practice-run.v1",tenantId,jobId,lockId:check.lockId}),`sv5-j-replay:${randomUUID()}`])).rows[0];
  await expect.poll(async()=> (await admin.query("SELECT id FROM graphile_worker._private_jobs WHERE id=$1",[queued.id])).rowCount,{timeout:30_000}).toBe(0);
 });
 await page.reload();
 expect((await read("payment-fees")).statements).toEqual(fees.statements);
 expect((await read("recovery-cases")).cases).toHaveLength(1);
 expect((await read("variations")).variations).toHaveLength(1);
 expect((await read("final-account")).lock).toEqual(originalLock);
});
