// Synthetic PostgreSQL projections and real company sessions. Both configured projects run headless.
import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { closeTestPools } from "../../../packages/db/test/pool-test-utils.js";
import { meterCompany } from "../../../packages/db/test/meter-persistence-fixtures.js";
import type { WorkFixture } from "../../../packages/db/test/job-work-state-fixtures.js";
// Same local-only credentials as the existing DEMO-J4 fixture; never provider credentials.
const E2E_ADMIN_DATABASE_URL = "postgresql://postgres:sbox-e2e-owner@127.0.0.1:55432/jobguard_synthetic_demo";
const E2E_RUNTIME_URL = "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo";
const E2E_AUTH_CODE_SECRET = process.env.AUTH_CODE_SECRET ?? "sbox-only-identity-hmac-secret-32-bytes";
test.setTimeout(120_000);
let f: WorkFixture;
test.beforeAll(() => { f = { admin: new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 }), runtime: new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 }) } as WorkFixture; });
test.afterAll(() => closeTestPools(f.runtime, f.admin));
test("M4-16 exact preview approval, suppression, stale balance and tenant refusal", async ({ page, context, baseURL }) => {
  const a = await meterCompany(f), token = randomUUID();
  const digest = createHmac("sha256", E2E_AUTH_CODE_SECRET).update(`session:${token}`).digest("hex");
  await f.admin.query("UPDATE identity.session SET token_digest=$1 WHERE id=$2", [digest, a.sessionId]);
  await context.addCookies([{ name: "jobguard_session", value: token, url: baseURL! }]);
  const seed = async (change: Record<string, unknown> = {}) => {
    const projection = { version: "dunning-invoice.v1", environment: "synthetic_demo", tenantId: a.tenantId, jobId: a.jobId,
      invoiceId: randomUUID(), revision: 1, sourceRevision: 1, sourceHash: "a".repeat(64), sourceState: "issued_invoice",
      finalAccountLockId: null, currency: "GBP", originalPence: 10000, outstandingPence: 10000, dueTick: 1, category: "customer",
      recipient: "fictional@example.invalid", pilotNoCharge: false, disputed: false, refundPending: false, reversed: false, cancelled: false, attemptState: "none", ...change };
    await f.admin.query("INSERT INTO app.dunning_invoice(tenant_id,job_id,invoice_id,projection) VALUES($1,$2,$3,$4::jsonb)", [a.tenantId,a.jobId,projection.invoiceId,JSON.stringify(projection)]);
    return projection;
  };
  const current = await seed();
  for (const change of [{ disputed: true }, { reversed: true }, { pilotNoCharge: true }, { outstandingPence: 0 }]) await seed(change);
  // Expired unsent preview remains in history and no longer reserves the snapshot.
  const expired = randomUUID();
  await f.admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'dunning_invoice',$3,'dunning.reminder.preview')", [expired,a.tenantId,current.invoiceId]);
  await f.admin.query(`INSERT INTO app.dunning_reminder(tenant_id,job_id,invoice_id,decision_id,snapshot_hash,snapshot,expires_at)
    SELECT tenant_id,job_id,invoice_id,$3,app.final_lock_hash(projection),projection,clock_timestamp()-interval '1 second'
    FROM app.dunning_invoice WHERE tenant_id=$1 AND invoice_id=$2`, [a.tenantId,current.invoiceId,expired]);
  await page.goto(`/jobs/${a.jobId}/dunning`);
  await expect(page.getByText("Disputed — collection stopped", { exact: true })).toBeVisible();
  await expect(page.getByText("Reversed — collection stopped", { exact: true })).toBeVisible();
  await expect(page.getByText("No-charge pilot — reminders unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Draft reminder Decision" })).toHaveCount(1);
  await expect(page.getByRole("region")).toHaveCount(4); // paid invoices are absent
  await page.getByRole("button", { name: "Draft reminder Decision" }).click();
  await page.getByRole("button", { name: "Approve this exact £100.00 reminder preview" }).click();
  await expect(page.getByText("Approved preview only. Nothing was sent.")).toBeVisible();
  await page.reload(); await expect(page.getByText("Approved preview only. Nothing was sent.")).toBeVisible();
  const session = await (await page.request.get("/api/auth/session")).json();
  const headers = { origin: baseURL!, "x-csrf-token": session.csrfToken, "x-tenant-id": a.tenantId };
  const view = await (await page.request.get(`/api/jobs/${a.jobId}/dunning`, { headers })).json();
  const row = view.invoices.find((r: { invoiceId: string }) => r.invoiceId === current.invoiceId);
  await f.admin.query("UPDATE app.dunning_invoice SET projection=$3::jsonb WHERE tenant_id=$1 AND invoice_id=$2", [a.tenantId,current.invoiceId,JSON.stringify({ ...current,revision:2,outstandingPence:5000 })]);
  const stale = await page.request.post(`/api/jobs/${a.jobId}/dunning/approve`, { headers, data: {
    version: "dunning-persist-command.v1", commandId: randomUUID(), invoiceId: current.invoiceId,
    snapshotHash: row.snapshotHash, nowTick: Date.now(), decisionId: row.decision.decisionId,
  } });
  expect(stale.ok()).toBe(false);
  await page.getByRole("button", { name: "Refresh balances and previews" }).click();
  await page.getByRole("button", { name: "Draft reminder Decision" }).click();
  await expect(page.getByRole("button", { name: "Approve this exact £50.00 reminder preview" })).toBeVisible();
  const b = await meterCompany(f);
  expect((await page.request.get(`/api/jobs/${b.jobId}/dunning`, { headers })).ok()).toBe(false);
  await expect(page.getByRole("link", { name: "job", exact: true })).toHaveAttribute("href", `/jobs/${a.jobId}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const history = (await f.admin.query("SELECT status FROM app.dunning_reminder WHERE tenant_id=$1 AND decision_id=$2", [a.tenantId,expired])).rows;
  expect(history).toEqual([{ status: "expired" }]);
});
