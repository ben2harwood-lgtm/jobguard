import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { seedActiveContractorAgreement } from "../../../packages/db/test/contractor-agreement-test-fixture";
import { E2E_ADMIN_DATABASE_URL, E2E_RUNTIME_URL } from "./global-setup";
const database = () => (new Function("specifier", "return import(specifier)") as (s: string) => Promise<typeof import("@jobguard/db")>)(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
const origin = "http://127.0.0.1:3000";
test.setTimeout(180000);
// Historical synthetic invoice setup follows sv5pre-fixtures. The run itself is
// seeded through the real repository, never a run-starting route or forged row.
async function fixture() {
 const db = await database(), admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 }), runtime = new Pool({ connectionString: E2E_RUNTIME_URL, max: 2 });
 try {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const contractors = new db.ContractorRepository(runtime), p = await contractors.startPractice(randomUUID());
  await seedActiveContractorAgreement(admin, p.tenantId);
  const tenantId = p.tenantId, jobId = randomUUID(), scopeItemId = randomUUID(), baselineId = randomUUID(), draftId = randomUUID(), revisionId = randomUUID();
  const ctx = db.verifiedTenantContextFromMembership(p), sessions: string[] = [];
  for (let i = 0; i < 2; i++) {
   const view = await contractors.query(p, { version: "contractor-query.v1", tenantId, resource: "organisation" });
   const member = await contractors.command(p, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: view.revision, kind: "member.invite", role: "finance", email: `finance-${i}@fictional.invalid`, scope: { kind: "tenant", id: tenantId }, clientId: null, contractId: null });
   const actor = (await admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [tenantId, member.id])).rows[0];
   const token = randomUUID(); sessions.push(token);
   await admin.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 day')", [randomUUID(), tenantId, member.id, actor.identity_user_id, createHash("sha256").update(token).digest("hex")]);
  }
  const owner = await admin.connect();
  try {
   await owner.query("BEGIN"); await owner.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
   await owner.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional reconciliation','live')", [jobId, tenantId]);
   await owner.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeItemId, tenantId, jobId]);
   await owner.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,10000,'accepted')", [baselineId, tenantId, jobId, 'a'.repeat(64)]);
   await owner.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draftId, tenantId, jobId]);
   await owner.query("INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings) VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',10000,2000,12000,false,'[]')", [revisionId, tenantId, jobId, draftId, 'a'.repeat(64), baselineId]);
   await owner.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal) VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional baseline',10000,1)", [randomUUID(), tenantId, jobId, revisionId, baselineId, scopeItemId]);
   await owner.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=1 WHERE tenant_id=$2 AND id=$3", [revisionId, tenantId, draftId]);
   // Existing test-only historical issuer, unchanged. No runtime authorization bypass.
   const sql = await readFile(join(process.cwd(), '../../packages/db/migrations/0187_final_account_sources_and_pdf.sql'), 'utf8');
   const start = sql.indexOf('CREATE OR REPLACE FUNCTION app.issue_practice_customer_invoice('), end = sql.indexOf('END $$;', start) + 'END $$;'.length;
   if (start < 0 || end <= start) throw new Error('Historical issuer missing');
   await owner.query(sql.slice(start, end).replace('app.issue_practice_customer_invoice(', 'app.historical_issue_practice_customer_invoice('));
   await owner.query('REVOKE ALL ON FUNCTION app.historical_issue_practice_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,date) FROM PUBLIC');
   await owner.query('SELECT * FROM app.historical_issue_practice_customer_invoice($1,$2,$3,$4,$5,$6,$7::date)', [tenantId, jobId, revisionId, p.membershipId, randomUUID(), 'fictional@example.invalid', '2026-11-04']);
   await owner.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','legacy_synthetic_live_fixture')", [tenantId, jobId]);
   await owner.query('COMMIT');
  } catch (e) { await owner.query('ROLLBACK'); throw e; } finally { owner.release(); }
  const invoice = (await admin.query("SELECT id FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2", [tenantId, jobId])).rows[0];
  const scope = { tenantId, jobId }, repo = new db.FinancialReconciliationQueueRepository(runtime);
  const run = await repo.run(ctx, sessions[0]!, { version: "financial-reconciliation-store.v1", commandId: randomUUID(), trigger: "on_demand", day: "2026-11-04", snapshot: {
   version: "financial-reconciliation-snapshot.v1", environment: "synthetic_demo", ...scope, corrections: [], journals: [],
   invoices: [{ ...scope, id: invoice.id, revision: revisionId, net: 10000, vat: 2000, gross: 12000 }],
   provider: [{ ...scope, id: randomUUID(), effectId: randomUUID(), invoiceId: invoice.id, kind: "payment", amount: 12000, parentId: null, late: true }],
  } });
  return { jobId, run, sessions, close: async () => { await runtime.end(); await admin.end(); } };
 } catch (error) { await runtime.end(); await admin.end(); throw error; }
}
test("finance proposes, reloads waiting content and another finance user approves the exact hash", async ({ page, context }) => {
 const f = await fixture();
 try {
  const session = async (token: string) => context.addCookies([{ name: "jg_session", value: token, url: origin }]);
  await session(f.sessions[0]!);
  await page.goto(`/jobs/${f.jobId}/reconciliation/${f.run.runId}/adjustments`);
  const main = page.getByRole('main');
  await expect(main.getByText(/Simulation only/)).toBeVisible();
  await expect(main.getByText(/MISSING_OR_DUPLICATE_JOURNAL/)).toBeVisible();
  const proposalBodies: string[] = [];
  let lost = false;
  await page.route(`**/api/jobs/${f.jobId}/reconciliation/${f.run.runId}/adjustments`, async route => {
   if (route.request().method() === 'POST' && route.request().postDataJSON().version === 'financial-reconciliation-propose.v1') {
    proposalBodies.push(route.request().postData()!);
    if (!lost) { lost = true; await route.fetch(); await route.abort('failed'); return; }
   }
   await route.continue();
  });
  await main.getByRole('button', { name: 'Propose correction', exact: true }).click();
  await expect(main.getByRole('status')).toContainText('result is uncertain');
  await page.reload();
  await expect(main.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible();
  await main.getByRole('button', { name: 'Retry saved command' }).click();
  await expect(main.getByRole('button', { name: 'Retry saved command' })).toHaveCount(0);
  expect(proposalBodies).toHaveLength(2); expect(proposalBodies[0]).toBe(proposalBodies[1]);
  await expect(main.getByRole('heading', { name: 'Waiting for approval' })).toHaveCount(1);
  await main.getByRole('button', { name: 'Approve this exact content' }).click();
  await expect(main.getByRole('status')).toContainText('Another finance user');
  await session(f.sessions[1]!); await page.reload();
  await expect(main.getByText(/Exact content hash:/)).toBeVisible();
  const approvalButton = main.getByRole('button', { name: 'Approve this exact content' });
  const box = await approvalButton.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
  await approvalButton.click();
  await expect(main.getByRole('heading', { name: 'Approved for simulation review' })).toBeVisible();
  await page.reload();
  await expect(main.getByRole('heading', { name: 'Approved for simulation review' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
 } finally { await f.close(); }
});
