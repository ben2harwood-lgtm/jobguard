// Real PostgreSQL + company cookies. Only the accepted job, proof and draft are prepared.
// Lock, trial end, run request and completed reveal are never fixture results.
import { createHmac, createHash, randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";
import { FinalAccountCommandService } from "../../../packages/db/src/final-account-repository.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../../../packages/db/src/tenant-context.js";
import { exactTarget } from "../../../packages/db/test/free-first-job-lifecycle-fixtures.js";
import { seedWorkJob, workTenant, type WorkFixture } from "../../../packages/db/test/job-work-state-fixtures.js";
import { meterCompany, verifyBusiness } from "../../../packages/db/test/free-first-job-admission-fixtures.js";
import { FreeFirstJobLifecycleRepository } from "../../../packages/db/src/free-first-job-lifecycle-repository.js";
import { EvidenceService } from "../../../packages/db/src/evidence.js";
import { ProofCommandService } from "../../../packages/db/src/proof-repository.js";
import { MemoryStorage } from "../../../packages/db/test/site-extra-evidence-fixtures.js";
import { generatePracticePng } from "../../../packages/db/src/practice-proof-image.js";
import { closeTestPools } from "../../../packages/db/test/pool-test-utils.js";
const admin = new Pool({ connectionString: "postgresql://postgres:sbox-e2e-owner@127.0.0.1:55432/jobguard_synthetic_demo", max: 2 });
const runtime = new Pool({ connectionString: "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo", max: 2 });
const f = { admin, runtime } as WorkFixture;
test.setTimeout(180_000);
test.afterAll(() => closeTestPools(runtime, admin));
// Prepared baseline/proof recipe from free-first-job-lifecycle-fixtures. This
// uses the existing worker's painted-walls original and matching baseline;
// the shared electrical-certificate recipe has no registered worker decoder.
// No detector outcome, check completion or trial end is seeded.
async function preparedPhotoTrial(f: WorkFixture, withTrial = true) {
 const a = await meterCompany(f), verification = await verifyBusiness(f, a);
 const draftId = randomUUID(), revisionId = randomUUID(), documentId = randomUUID();
 const scopeRevisionId = randomUUID(), lineId = randomUUID(), acceptanceId = randomUUID(), sendId = randomUUID();
 const description = "painted walls", contentHash = "a".repeat(64);
 const documentSnapshot = { schemaVersion: "quote-document.v1", documentVersion: 1,
  reference: "SYN-TRIAL-PREP", quoteRevisionId: revisionId, currency: "GBP",
  issuer: { name: "Fictional trial builder", address: ["1 Fictional Street"], email: "builder@example.invalid" },
  customer: { name: "Fictional customer", address: ["2 Fictional Street"], email: "customer@example.invalid" },
  lines: [{ scopeItemId: a.scopeId, description, quantity: "1", unit: "item", netPence: 100000 }],
  exclusions: [], qualifications: ["Synthetic fixture only"], subtotalPence: 100000,
  discountPence: 0, netPence: 100000, taxPence: 20000, totalPence: 120000 };
 await workTenant(f.admin, a.tenantId, async db => {
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query(`INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence)
   VALUES($1,$2,$3,$4,1,$5,'1','item',100000,100000)`, [scopeRevisionId,a.tenantId,a.jobId,a.scopeId,description]);
  await db.query("INSERT INTO app.quote_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draftId,a.tenantId,a.jobId]);
  await db.query(`INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers)
   VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',100000,0,100000,20000,120000,true,'[]')`, [revisionId,a.tenantId,a.jobId,draftId]);
  await db.query(`INSERT INTO app.quote_line(id,tenant_id,job_id,quote_revision_id,scope_item_id,scope_revision_id,origin,description,included,quantity_decimal,unit,unit_rate_pence,discount_decimal,tax_treatment,rate_provenance,ordinal)
   VALUES($1,$2,$3,$4,$5,$6,'human',$7,true,'1','item',100000,'0','standard_rate_20','entered',1)`, [lineId,a.tenantId,a.jobId,revisionId,a.scopeId,scopeRevisionId,description]);
  await db.query(`INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot,parties_snapshot)
   SELECT $1,$2,$3,$4,1,'SYN-TRIAL-PREP',$5,$6,'synthetic-v1',1,$7,$8,$9,snapshot
   FROM app.job_party_snapshot WHERE tenant_id=$2 AND job_id=$3`, [documentId,a.tenantId,a.jobId,revisionId,contentHash,`synthetic/trial/${documentId}.pdf`,JSON.stringify(documentSnapshot.issuer),JSON.stringify(documentSnapshot.customer),JSON.stringify(documentSnapshot)]);
  await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,100000,'accepted')", [documentId,a.tenantId,a.jobId,contentHash]);
  await db.query(`INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at)
   VALUES($1,$2,$3,$4,1,$5,120000,'GBP','builder_attestation',$6,'Fictional customer','verbal',clock_timestamp())`, [acceptanceId,a.tenantId,a.jobId,documentId,contentHash,a.actorId]);
  await db.query(`INSERT INTO app.quote_send(id,tenant_id,job_id,document_id,content_hash,authorization_id,outbox_action_id,recipients)
   VALUES($1,$2,$3,$4,$5,$6,$7,'["customer@example.invalid"]')`, [sendId,a.tenantId,a.jobId,documentId,contentHash,randomUUID(),randomUUID()]);
  await db.query("UPDATE app.job SET status='accepted',accepted_quote_version_id=$3,revision=revision+1 WHERE tenant_id=$1 AND id=$2", [a.tenantId,a.jobId,documentId]);
 });
 const lifecycle = new FreeFirstJobLifecycleRepository(f.runtime);
 const target = (await lifecycle.read(a.context, a.digest, a.jobId)).target;
 const activation = withTrial ? await lifecycle.activate(a.context, a.digest, a.actorId, {
  version: "trial-switch-live.v1", commandId: randomUUID(), jobId: a.jobId, ...target,
 }) : await workTenant(f.admin, a.tenantId, async db => {
  // Ordinary control's accepted baseline is owner-prepared, as in the existing
  // control fixtures. No trial start/end or check result is installed.
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query("UPDATE app.job SET status='live',baseline_quote_version_id=$3 WHERE tenant_id=$1 AND id=$2", [a.tenantId,a.jobId,documentId]);
  return null;
 });
 // Cover every confirmed scope, including the first scope required by assembly.
 const scopes = (await f.admin.query<{ id: string }>("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 AND state='confirmed' ORDER BY created_at,id", [a.tenantId,a.jobId])).rows;
 await workTenant(f.admin, a.tenantId, async db => {
  for (const scope of scopes) await db.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id,stage) VALUES($1,$2,$3,'not_started') ON CONFLICT DO NOTHING", [a.tenantId,a.jobId,scope.id]);
 });
 const storage = new MemoryStorage(), evidence = new EvidenceService(f.runtime, storage);
 const proof = new ProofCommandService(f.runtime, storage), bytes = generatePracticePng();
 const sha256 = createHash("sha256").update(bytes).digest("hex");
 const proofs = [];
 for (const scope of scopes) {
  const upload = await evidence.beginUpload(a.context, { jobId: a.jobId, scopeItemId: scope.id,
   expectedSha256: sha256, contentType: "image/png", maximumBytes: 100,
   retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + 3600000) });
  storage.put(upload.objectKey, "v1", bytes);
  await evidence.finalize(a.context, { commandId: randomUUID(), uploadId: upload.id,
   objectVersionId: "v1", evidenceType: "electrical_certificate" });
  const completion = await proof.complete(a.context, { version: "proof.complete.v1", commandId: randomUUID(),
   actorMembershipId: a.actorId, jobId: a.jobId, scopeItemId: scope.id, stage: "electrical-stage",
   evidenceId: upload.id, requiredEvidenceType: "electrical_certificate", decisionId: null });
  proofs.push({ scopeId: scope.id, evidenceId: upload.id, completionId: completion.completionId,
   objectKey: upload.objectKey, objectVersionId: "v1", sha256, byteLength: bytes.length });
 }
 return { ...a, verification, draftId, revisionId, documentId, scopeRevisionId, lineId,
  acceptanceId, sendId, contentHash, activation, proofs, storage };
}

async function prepared(context: BrowserContext, baseURL: string, withTrial = true) {
 const a = await preparedPhotoTrial(f, withTrial);
 const user = (await admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId])).rows[0].identity_user_id;
 const bound = verifiedTenantContextFromMembership({ tenantId: a.tenantId, membershipId: a.actorId, identityUserId: user } as AuthenticatedMembership, { kind: "real", credential: a.digest });
 const draft = await new FinalAccountCommandService(runtime).assemble(bound, { version: "final-account.assemble.v1", commandId: randomUUID(), jobId: a.jobId, actorMembershipId: a.actorId, expectedRevision: 0 });
 const token = randomUUID(), digest = createHmac("sha256", "sbox-only-identity-hmac-secret-32-bytes").update(`session:${token}`).digest("hex");
 await admin.query("UPDATE identity.session SET token_digest=$1 WHERE id=$2", [digest, a.sessionId]);
 await context.addCookies([{ name: "jobguard_session", value: token, url: baseURL }]);
 const second = await seedWorkJob(f, a.tenantId); await exactTarget(f, { ...a, jobId: second.jobId });
 return { ...a, draft, second: second.jobId };
}
async function accessibleLayout(page: Page) {
 for (const control of await page.locator("button:visible, select:visible, main a:visible").all()) {
  const box = await control.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
 }
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
const click = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();
async function bind(page: Page, a: Awaited<ReturnType<typeof prepared>>) {
 await page.goto("/demo-s"); await click(page, "Choose trial selection");
 await page.getByRole("link", { name: "Open guided first-job trial", exact: true }).click();
 await page.getByLabel("First accepted job reference").fill(a.jobId); await page.getByLabel("Second accepted job reference").fill(a.second);
 await click(page, "Bind fictional jobs"); await expect(page.getByTestId("trial-missing")).toContainText("Final Check");
 return page.url();
}
const money = async (tenant: string) => (await admin.query(`SELECT
 (SELECT count(*) FROM app.success_fee_journal WHERE tenant_id=$1)::int fees,
 (SELECT count(*) FROM app.customer_invoice WHERE tenant_id=$1)::int invoices,
 (SELECT count(*) FROM app.subscription_period WHERE tenant_id=$1)::int periods,
 (SELECT count(*) FROM app.platform_fee_collection_command WHERE tenant_id=$1)::int collections,
 (SELECT count(*) FROM app.platform_statement WHERE tenant_id=$1)::int statements`, [tenant])).rows[0];

test("DT-02 prepared first job locks, ends trial and completes saved zero check without money effects", async ({ page, context, baseURL, browser }) => {
 const a = await prepared(context, baseURL!), before = await money(a.tenantId);
 const ordinaryContext = await browser.newContext();
 const ordinary = await prepared(ordinaryContext, baseURL!, false);
 expect((await admin.query("SELECT count(*)::int n FROM app.trial_start WHERE tenant_id=$1", [ordinary.tenantId])).rows).toEqual([{ n: 0 }]);
 expect(a.draft.totals).toEqual(ordinary.draft.totals);
 const ordinaryPage = await ordinaryContext.newPage();
 await ordinaryPage.goto(`/demo-s/trial/final-account?${new URLSearchParams({ tenantId: ordinary.tenantId, runId: randomUUID(), jobId: ordinary.jobId })}`);
 await expect(ordinaryPage.getByTestId("trial-final-net")).toHaveText("Final net £1000.00 · VAT £200.00 · Gross £1200.00");
 await ordinaryContext.close();
 const guide = await bind(page, a);
 await page.getByRole("link", { name: "Open first job final account and Final Check" }).click();
 await expect(page.getByTestId("trial-final-net")).toHaveText("Final net £1000.00 · VAT £200.00 · Gross £1200.00");
 await expect(page.getByRole("region", { name: "Saved final check" })).toHaveCount(0);
 await accessibleLayout(page);
 await expect(page.getByRole("button", { name: "Complete final account", exact: true })).toBeDisabled();
 const session = await (await page.request.get("/api/auth/session")).json();
 const send = (action: string, input: Record<string, unknown> = {}) => page.request.post("/demo-s/trial/final-account/commands", { headers: { origin: new URL(page.url()).origin, "x-tenant-id": a.tenantId, "x-csrf-token": session.csrfToken }, data: { action, input: { version: "company-final-check.v1", jobId: a.jobId, ...input } } });
 const lock = { commandId: randomUUID(), finalAccountRevisionId: a.draft.id, expectedRevision: a.draft.revision, declarationVersion: "final_account_declaration.v1" };
 expect((await send("lock", lock)).ok()).toBe(false);
 expect((await admin.query("SELECT count(*)::int n FROM app.trial_end_source WHERE tenant_id=$1", [a.tenantId])).rows).toEqual([{ n: 0 }]);
 await page.getByLabel("Disposition painted walls").selectOption("done");
 await expect(page.getByLabel("Disposition painted walls")).toHaveValue("done");
 await click(page, "Accept final check terms"); await expect(page.getByRole("button", { name: "Accept final check terms", exact: true })).toBeDisabled();
 const publicBefore = await (await send("read")).json();
 expect(await (await send("reveal")).json()).toEqual({ state: "unlocked", items: [] });
 await workTenant(admin, a.tenantId, db => db.query(`INSERT INTO app.shadow_commercial_signal
  (tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
  VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),'Held fictional signal without evidence','low','held_for_final_check')`, [a.tenantId, a.jobId, randomUUID(), randomUUID()]));
 expect(await (await send("read")).json()).toEqual(publicBefore);
 expect(await (await send("reveal")).json()).toEqual({ state: "unlocked", items: [] });
 expect((await send("requestRun")).ok()).toBe(false);
 let successfulLock: Record<string, unknown> | undefined;
 page.on("request", request => {
  if (request.url().endsWith("/demo-s/trial/final-account/commands") && request.method() === "POST") {
   const body = request.postDataJSON(); if (body.action === "lock") successfulLock = body.input;
  }
 });
 await click(page, "Complete final account");
 await expect(page.getByText(/Final account completed · Lock/)).toBeVisible();
 // Replay the actual successful command, then confirm it creates no second lock/end.
 const recorded = (await admin.query("SELECT id FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0];
 expect(recorded.id).toBeTruthy();
 expect(successfulLock).toBeTruthy();
 const replay = await send("lock", successfulLock!); expect(replay.status()).toBe(200);
 expect((await replay.json()).id).toBe(recorded.id);
 await click(page, "Run the final check (practice)");
 await expect(async () => {
  await click(page, "Load saved final account and check");
  await expect(page.getByTestId("final-check-status")).toHaveText("JobGuard's final check found nothing missing from your bill.");
 }).toPass({ timeout: 90_000, intervals: [1000, 3000] });
 await page.reload(); await expect(page.getByTestId("final-check-status")).toHaveText("JobGuard's final check found nothing missing from your bill.");
 await accessibleLayout(page);
 await page.getByRole("link", { name: "Back to guided trial" }).click();
 await expect(page.getByTestId("trial-outcome")).toContainText("Trial ended by lock");
 await expect(page.getByTestId("trial-missing")).not.toContainText("Final Check"); await expect(page.getByTestId("trial-missing")).toContainText("Pro-ration");
 await click(page, "Save source report"); await page.reload();
 await expect(page.getByTestId("trial-outcome")).toContainText("Trial ended by lock");
 await expect(page.getByTestId("trial-missing")).not.toContainText("Final Check");
 expect(await money(a.tenantId)).toEqual(before);
 expect((await admin.query("SELECT count(*)::int n FROM app.trial_end_source WHERE tenant_id=$1 AND kind='lock'", [a.tenantId])).rows).toEqual([{ n: 1 }]);
 await page.goto(guide); await expect(page.getByTestId("trial-outcome")).toContainText("Trial ended by lock");
});

test("foreign and removed company members cannot read, reveal or lock and learn no job facts", async ({ page, context, baseURL }) => {
 const a = await prepared(context, baseURL!), b = await prepared(context, baseURL!);
 await page.goto("/demo-s");
 const session = await (await page.request.get("/api/auth/session")).json();
 const send = (tenant: string, jobId: string, action: string) => page.request.post("/demo-s/trial/final-account/commands", { headers: { origin: new URL(page.url()).origin, "x-tenant-id": tenant, "x-csrf-token": session.csrfToken }, data: { action, input: { version: "company-final-check.v1", jobId, ...(action === "lock" ? { commandId: randomUUID(), finalAccountRevisionId: a.draft.id, expectedRevision: a.draft.revision, declarationVersion: "final_account_declaration.v1" } : {}) } } });
 for (const action of ["read", "reveal", "lock"]) {
  const response = await send(b.tenantId, a.jobId, action); expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({ code: "COMPANY_FINAL_CHECK_FORBIDDEN" });
 }
 await workTenant(admin, b.tenantId, db => db.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [b.tenantId, b.actorId]));
 for (const action of ["read", "reveal", "lock"]) expect((await send(b.tenantId, b.jobId, action)).ok()).toBe(false);
 expect((await admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=ANY($1::uuid[])", [[a.tenantId, b.tenantId]])).rows).toEqual([{ n: 0 }]);
 expect((await admin.query("SELECT count(*)::int n FROM app.trial_end_source WHERE tenant_id=ANY($1::uuid[])", [[a.tenantId, b.tenantId]])).rows).toEqual([{ n: 0 }]);
});
