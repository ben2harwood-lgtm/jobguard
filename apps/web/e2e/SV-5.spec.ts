// SV-5 reveal screen: what can be shown before the Final Check worker is scheduled (Q6). Synthetic; CI only.
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

/** FIXTURE-SEEDED, not detection proof: one hidden signal on the job's pre-lock proof photo, then the
 * Final Check's own begin/record/complete routines run through the restricted shadow login. */
async function revealedJob(page: Page) {
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
    const m = (await shadow.query("SELECT app.begin_final_check($1,$2,'shadow-detection.v1','final-check.reconciliation.v1') result", [tenantId, jobId])).rows[0].result;
    for (const source of m.sources) {
      const signalIds = source.evidenceId === evidenceId ? [signalId] : [];
      await shadow.query("SELECT app.record_final_check_source_result($1,$2,$3,$4,$5,$6::jsonb)", [tenantId, jobId, m.id, source.id, randomUUID(),
        JSON.stringify({ version: "final-check.source-result.v1", inputHash: source.inputHash, status: signalIds.length ? "detected" : "zero_result", failureCode: null, signalIds })]);
    }
    const ids = (rows: { id: string }[]) => rows.map(item => item.id).sort();
    await shadow.query("SELECT app.complete_final_check($1,$2,$3,$4::jsonb)", [tenantId, jobId, m.id, JSON.stringify([{ signalId, expectedRevision: 0, outcome: "reveal", references: [],
      comparisons: { baselineItemIds: m.comparisons.baselineItemIds, captureIds: ids(m.comparisons.captures), lockedLineIds: ids(m.comparisons.lines) } }])]);
  });
  const lock = await jsonResult(page.request.get(`/api/jobs/${jobId}/final-account`), "Read lock");
  await page.goto(`/jobs/${jobId}#final-check`);
  return { jobId, tenantId, lock: JSON.stringify(lock.lock) };
}

test("E (fixture-seeded): a revealed item answered Not done keeps that answer after reload", async ({ page }) => {
  const { jobId, tenantId } = await revealedJob(page);
  const panel = page.getByTestId("final-check-reveal"), item = panel.getByTestId("final-check-item");
  await expect(panel.getByTestId("final-check-status")).toHaveText("JobGuard's final check found 1 thing that may be missing from your bill.");
  await expect(item).toContainText("Fitted an outside tap");
  await expect(item.getByRole("button", { name: "Yes — this was extra work", exact: true })).toBeDisabled();
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

test("K (fixture-seeded): Already included must name a locked line and leaves the lock unchanged", async ({ page }) => {
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
