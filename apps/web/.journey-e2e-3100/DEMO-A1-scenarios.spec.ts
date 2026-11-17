import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { Pool } from "pg";
import { openLiveWatchdogJob, startWatchdogJob } from "./helpers/capture-journey";
import { finishDispositionsAndTerms, prepareLockJob, withSyntheticShadow } from "./helpers/final-account-lock-journey";
import { get, post } from "./helpers/recovery-sources";
import { E2E_ADMIN_DATABASE_URL, E2E_RUNTIME_URL } from "./global-setup";

// Dedicated DEMO-S refusal journeys. All business state comes from real app
// commands; no seeded invoice, settlement, lock, signal or completed check.
// PostgreSQL and both browser projects run in CI, not the builder sandbox.
test.setTimeout(180_000);
const tenantId = "11111111-1111-4111-8111-111111111111";
const path = (jobId: string, resource: string) => `/api/jobs/${jobId}/${resource}`;
const proofCommand = (fields: Record<string, unknown>) => ({ version: "practice-proof-command.v1", commandId: randomUUID(), ...fields });
async function live(page: Page) {
  await openLiveWatchdogJob(page);
  return (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
}
async function refuses(response: APIResponse, status: number, code: string) {
  expect(response.status(), await response.text()).toBe(status);
  expect(await response.json()).toMatchObject({ code });
}
async function noMoney(page: Page, jobId: string) {
  const invoices = await get(page, path(jobId, "customer-invoices"));
  expect(invoices.invoices).toEqual([]);
  const cases = await get(page, path(jobId, "recovery-cases"));
  expect(cases.realExternalActions).toBe(0);
  for (const c of cases.cases) expect(c).toMatchObject({ landedNetPence: 0, approvedLandedNetPence: 0,
    feeJobLiabilityPence: 0, feeObligationsPostedPence: 0, feeCompensationsPostedPence: 0 });
}
async function evaluateProof(page: Page, jobId: string) {
  await post(page, "/api/decisions", { version: "finding-evaluation-command.v1", commandId: randomUUID(), tenantId, jobId });
  return get(page, path(jobId, "proof"));
}

test("DEMO-S no proof: a pending original cannot complete work or authorize an invoice", async ({ page }) => {
  const jobId = await live(page), proof = await evaluateProof(page, jobId);
  expect(proof.upload).toBeNull(); expect(proof.completion).toBeNull();
  const select = proofCommand({ action: "select_generated", scopeItemId: proof.scopeItemId, fixture: "completion-photo" });
  const pending = await post(page, path(jobId, "proof"), select);
  expect(await post(page, path(jobId, "proof"), select)).toEqual(pending);
  expect(pending.upload.state).toBe("pending");
  const complete = proofCommand({ action: "complete", scopeItemId: proof.scopeItemId, evidenceId: pending.upload.id });
  for (const patch of [{ allocationPence: 1 }, { reversal: true }, { lockId: randomUUID() }, { verified: true }]) {
    await refuses(await page.request.post(path(jobId, "proof"), { data: { ...complete, ...patch } }), 400, "INVALID_COMMAND");
  }
  for (let attempt = 0; attempt < 2; attempt++) await refuses(await page.request.post(path(jobId, "proof"), { data: complete }), 422, "PROOF_INVALID");
  const final = await post(page, path(jobId, "final-account"), { version: "final-account.assemble.v1", commandId: randomUUID(), expectedRevision: 0 });
  expect(final.account.issueBlocked).toBe(true);
  await refuses(await page.request.post(path(jobId, "customer-invoices"), { data: {
    version: "practice-customer-invoice.issue.v1", commandId: randomUUID(), finalAccountRevisionId: final.account.id,
    expectedSourceHash: final.account.sourceHash, recipient: "fictional@example.invalid", issuedOn: "2026-10-29",
  } }), 409, "STALE_OR_BLOCKED_FINAL_ACCOUNT");
  await page.reload(); expect((await get(page, path(jobId, "proof"))).completion).toBeNull();
  await noMoney(page, jobId);
});

test("DEMO-S prevention: advisory checks and prevented spend never become recovered cash", async ({ page }) => {
  const jobId = await live(page);
  const checks = await get(page, path(jobId, "prevention-checks"));
  const check = { version: "prevention-command.v1", commandId: randomUUID(), action: "property",
    expectedBindingId: checks.parties.bindingId, scenarioNow: "2026-10-07T13:00:00.000Z", fixture: "mixed" };
  const checked = await post(page, path(jobId, "prevention-checks/property"), check);
  expect(await post(page, path(jobId, "prevention-checks/property"), check)).toEqual(checked);
  await refuses(await page.request.post(path(jobId, "prevention-checks/property"), { data: { ...check, fixture: "fresh" } }), 409, "COMMAND_CONFLICT");
  // The existing closed catalogue is explicitly fictional source input, not an
  // asserted invoice/settlement. No provider or money-chain helper is invoked.
  const open = { version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), caseType: "prevention",
    claimedNetPence: 32000, counterparty: "Fictional merchant", book: "supplier_cost", sourceType: "supplier_documents",
    sourceRefs: ["Supplier agreement AG-320"], expectedRevision: 0 };
  const opened = await post(page, path(jobId, "recovery-cases"), open), caseId = opened.affectedCaseId;
  expect((await post(page, path(jobId, "recovery-cases"), open)).affectedCaseId).toBe(caseId);
  const current = opened.cases.find((c: { id: string }) => c.id === caseId);
  const review = { version: "recovery-eligibility-command.v3", action: "review", commandId: randomUUID(), caseId,
    expectedCaseRevision: current.revision, expectedReviewRevision: 0, fixture: "F22" };
  const reviewed = await post(page, path(jobId, "recovery-cases/eligibility"), review);
  expect(reviewed.eligibilityV3CommandResult.result).toMatchObject({ outcome: "excluded", qualifyingPrincipal: { pence: 0 }, productionEnabled: false });
  for (const eventType of ["record_landing", "reverse_landing"]) await refuses(await page.request.post(path(jobId, "recovery-cases"), { data: {
    version: "recovery-case-command.v1", action: "transition", commandId: randomUUID(), caseId,
    expectedRevision: current.revision, eventType, amountPence: 1,
  } }), 400, "RECOVERY_TRANSITION_FORBIDDEN");
  await page.reload();
  const saved = (await get(page, path(jobId, "recovery-cases"))).cases;
  expect(saved).toHaveLength(1); expect(saved[0].state).toBe("prevented");
  expect(saved[0].eligibilityV3).toEqual(reviewed.eligibilityV3CommandResult);
  await noMoney(page, jobId);
});

test("DEMO-S corrupted evidence: wrong immutable version fails verification and cannot complete", async ({ page }) => {
  const jobId = await live(page), proof = await evaluateProof(page, jobId);
  const selected = await post(page, path(jobId, "proof"), proofCommand({ action: "select_generated", scopeItemId: proof.scopeItemId, fixture: "completion-photo" }));
  const finalize = proofCommand({ action: "finalize", uploadId: selected.upload.id, objectVersionId: `${selected.upload.objectVersionId}-wrong` });
  for (let attempt = 0; attempt < 2; attempt++) await refuses(await page.request.post(path(jobId, "proof"), { data: finalize }), 422, "PROOF_INVALID");
  await refuses(await page.request.post(path(jobId, "proof"), { data: proofCommand({ action: "complete", evidenceId: selected.upload.id, scopeItemId: proof.scopeItemId }) }), 422, "PROOF_INVALID");
  await page.reload();
  const saved = await get(page, path(jobId, "proof"));
  expect(saved.upload.evidenceId).toBeNull(); expect(saved.upload.state).not.toBe("verified"); expect(saved.completion).toBeNull();
  const final = await post(page, path(jobId, "final-account"), { version: "final-account.assemble.v1", commandId: randomUUID(), expectedRevision: 0 });
  expect(final.account.issueBlocked).toBe(true); await noMoney(page, jobId);
});

// Load built ESM through the native loader, as existing recovery journeys do.
const loadDb = () => (new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@jobguard/db")>)(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);

test("DEMO-S disclosure before lock: real detection and support disclosure remain ineligible after lock", async ({ page }) => {
  test.setTimeout(240_000);
  const { jobId, account } = await prepareLockJob(page);
  await post(page, path(jobId, "final-account/terms"), { version: "final-check-terms.accept.v1", commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
  const note = { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: "Fitted outside tap." };
  const receipt = await post(page, path(jobId, "diary"), note);
  expect(await post(page, path(jobId, "diary"), note)).toEqual(receipt);
  const before = await get(page, path(jobId, "diary"));
  await withSyntheticShadow(tenantId, async (shadow, admin) => {
    const runtime = new Pool({ connectionString: E2E_RUNTIME_URL });
    try {
      const db = await loadDb();
      const token = (await page.context().cookies()).find(c => c.name === "jg_session")!.value;
      const auth = await db.authorizePracticeJob(runtime, token, jobId);
      const reader = new db.ShadowObservationReader(runtime, new db.FixtureObservationSources([]));
      const sources = await reader.read(auth.context, { version: "shadow-observation-read.v1", jobId });
      expect(sources.observations.map(o => o.evidence.id)).toContain(before.entries[0].evidence.id);
      const core = await (new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@jobguard/core")>)(pathToFileURL(join(process.cwd(), "../../packages/core/dist/index.js")).href);
      const batch = { version: "shadow-detection-batch.v1", jobId, ...sources, proposals: core.detectShadowObservations(sources.observations, sources.captures, new Date().toISOString()) };
      const detector = new db.ShadowDetectionRepository(shadow);
      const groups = await detector.persist(auth.context, batch);
      await detector.persist(auth.context, batch);
      const signalId = groups.find(g => g.observations.some(o => o.evidence.id === before.entries[0].evidence.id))!.primary.signalId;
      // Ordinary hidden detection changes neither the diary response nor reveal.
      expect(await get(page, path(jobId, "diary"))).toEqual(before);
      expect(await get(page, path(jobId, "final-check"))).toMatchObject({ state: "unlocked", items: [] });
      // Break-glass support uses a separate login; the detector cannot disclose.
      const supportLogin = `demo_a1_support_${randomUUID().replaceAll("-", "")}`;
      const supportPassword = randomUUID();
      await admin.query(`CREATE ROLE "${supportLogin}" LOGIN PASSWORD '${supportPassword}' IN ROLE jobguard_shadow_emergency_access NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
      const supportUrl = new URL(E2E_ADMIN_DATABASE_URL);
      supportUrl.username = supportLogin; supportUrl.password = supportPassword;
      const supportPool = new Pool({ connectionString: supportUrl.href });
      const support = new db.ShadowRepository(supportPool);
      const disclosure = { version: "shadow-support-disclosure.v1", jobId, signalId, eventId: randomUUID() };
      await expect(new db.ShadowRepository(shadow).supportDisclosure(auth.context, disclosure)).rejects.toMatchObject({ code: "42501" });
      try {
        expect(await support.supportDisclosure(auth.context, disclosure)).toBe(disclosure.eventId);
        expect(await support.supportDisclosure(auth.context, disclosure)).toBe(disclosure.eventId);
      } finally {
        await supportPool.end();
        await admin.query(`DROP ROLE "${supportLogin}"`);
      }
      await page.goto(`/jobs/${jobId}#final-account-title`);
      await finishDispositionsAndTerms(page);
      await page.getByRole("main").getByRole("button", { name: "Complete final account", exact: true }).click();
      // The account endpoint returns the draft only; lock state has its own view.
      await expect.poll(async () => (await get(page, path(jobId, "final-account/lock"))).lock?.finalAccountRevisionId).toBe(account.id);
      await page.goto(`/jobs/${jobId}#final-check`);
      // Locking saves the bill; the separate checked request starts the worker.
      const panel = page.getByRole("main").getByTestId("final-check-reveal");
      await panel.getByRole("button", { name: "Run the final check (practice)", exact: true }).click();
      await expect(panel.getByTestId("final-check-run-requested")).toBeVisible();
      // Same bounded wait as SV-5: discovery runs once a minute, then processes
      // sources and publishes. The completed-state assertion remains mandatory.
      await expect.poll(async () => (await get(page, path(jobId, "final-check"))).state,
        { timeout: 180_000, intervals: [5_000] }).toBe("completed");
      await db.withTenant(shadow, auth.context, async tx => {
        const signal = await tx.$client.query("SELECT disclosed_before_lock FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND id=$3", [tenantId, jobId, signalId]);
        expect(signal.rows).toEqual([{ disclosed_before_lock: true }]);
        const reasons = await tx.$client.query("SELECT reason FROM app.shadow_signal_ineligibility WHERE tenant_id=$1 AND job_id=$2 AND signal_id=$3", [tenantId, jobId, signalId]);
        expect(reasons.rows).toContainEqual({ reason: "disclosed_before_lock" });
      });
      const report = await get(page, path(jobId, "shadow-demo"));
      const check = await get(page, path(jobId, "final-check"));
      expect(check.lockId).toBe(report.account.lock.id);
      expect(report.account.lock.finalAccountRevisionId).toBe(account.id);
      expect(report.assessments).toEqual([]);
      await noMoney(page, jobId);
    } finally { await runtime.end(); }
  });
});

test("DEMO-S tenant isolation: foreign session and same-session foreign job cannot read or attach evidence", async ({ page, browser }) => {
  const jobId = await live(page), proof = await evaluateProof(page, jobId);
  const select = proofCommand({ action: "select_generated", scopeItemId: proof.scopeItemId, fixture: "completion-photo" });
  const selected = await post(page, path(jobId, "proof"), select);
  const other = await browser.newContext();
  try {
    const stranger = await other.newPage(); await live(stranger);
    await refuses(await page.request.get(`/api/jobs/${jobId}?requested_tenant_id=22222222-2222-4222-8222-222222222222`), 403, "TENANT_FORBIDDEN");
    for (const target of [jobId, randomUUID()]) {
      await refuses(await stranger.request.get(path(target, "proof")), 404, "NOT_FOUND");
      await refuses(await stranger.request.post(path(target, "proof"), { data: select }), 404, "NOT_FOUND");
    }
    // A second real job of the owner still cannot consume the first job's upload.
    await page.goto("/");
    await page.getByRole("main").getByRole("button", { name: "＋ Start a new job", exact: true }).click();
    await page.getByRole("main").getByRole("button", { name: "Make my draft", exact: true }).click();
    await page.getByRole("main").getByRole("button", { name: "Check and edit my draft", exact: true }).click();
    await page.getByRole("main").getByRole("button", { name: "Save customer and site", exact: true }).click();
    await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
    for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) {
      await page.getByRole("main").getByRole("button", { name: `Accept ${name}`, exact: true }).click();
    }
    await page.getByRole("main").getByRole("button", { name: "Dismiss Replace shelves", exact: true }).click();
    await page.getByLabel("Dismissal reason Replace shelves").fill("Outside this second fictional job");
    await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
    await page.getByRole("main").getByRole("button", { name: "Confirm scope", exact: true }).click();
    await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");
    await startWatchdogJob(page);
    const secondId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
    expect(secondId).not.toBe(jobId);
    const second = await evaluateProof(page, secondId);
    await refuses(await page.request.post(path(secondId, "proof"), { data: proofCommand({ action: "finalize", uploadId: selected.upload.id, objectVersionId: selected.upload.objectVersionId }) }), 404, "NOT_FOUND");
    await refuses(await page.request.post(path(secondId, "proof"), { data: proofCommand({ action: "complete", scopeItemId: second.scopeItemId, evidenceId: selected.upload.id }) }), 404, "NOT_FOUND");
    expect((await get(page, path(jobId, "proof"))).upload).toEqual(selected.upload);
    expect((await get(page, path(secondId, "proof"))).upload).toBeNull();
    await noMoney(page, jobId); await noMoney(page, secondId);
  } finally { await other.close(); }
});

test("DEMO-S stale authority: revoked session cannot replay a successful command or create new work", async ({ page }) => {
  const jobId = await live(page), proof = await evaluateProof(page, jobId);
  const select = proofCommand({ action: "select_generated", scopeItemId: proof.scopeItemId, fixture: "completion-photo" });
  await post(page, path(jobId, "proof"), select);
  const token = (await page.context().cookies()).find(c => c.name === "jg_session")!.value;
  const admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL });
  try {
    // Fault injection only: revoke the actual token after the command commits.
    // No business outcome is seeded and no shared demo membership is changed.
    const revoked = await admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1 AND revoked_at IS NULL RETURNING token_digest", [createHash("sha256").update(token).digest("hex")]);
    expect(revoked.rowCount).toBe(1);
    for (const command of [select, { ...select, commandId: randomUUID() }]) await refuses(await page.request.post(path(jobId, "proof"), { data: command }), 401, "UNAUTHENTICATED");
    await refuses(await page.request.get(path(jobId, "proof")), 401, "UNAUTHENTICATED");
    const uploads = await admin.query("SELECT id FROM app.evidence_upload WHERE tenant_id=$1 AND job_id=$2", [tenantId, jobId]);
    expect(uploads.rows).toEqual([{ id: select.commandId }]);
    expect((await admin.query("SELECT id FROM app.stage_completion WHERE tenant_id=$1 AND job_id=$2", [tenantId, jobId])).rows).toEqual([]);
  } finally { await admin.end(); }
});
