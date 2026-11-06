import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { seedActiveContractorAgreement } from "../../../packages/db/test/contractor-agreement-test-fixture";
import { E2E_ADMIN_DATABASE_URL, E2E_RUNTIME_URL } from "./global-setup";

test.setTimeout(180_000);
const origin = "http://127.0.0.1:3000";
// Playwright runs this project as CommonJS; workspace packages expose ESM only.
const nativeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@jobguard/db")>;
const database = () => nativeImport(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
const materialsInput = (f: { jobId: string }, overrides: Record<string, unknown> = {}) => ({ version: "materials-issue.v1", commandId: crypto.randomUUID(), jobId: f.jobId, sourceId: "fictional-store", eventId: crypto.randomUUID(), workIdentity: "REPAIR-DOOR", unit: "each", quantity: "100", occurredAtMicros: "1792310400000000", kind: "issue", ...overrides });
const listInput = (f: { jobId: string }) => ({ version: "live-prompt-list.v1", jobId: f.jobId });
// Reuse the generated work-order fixtures and checked writers, on CI's existing database.
async function fixture() {
 const db = await database();
 const admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 }), runtime = new Pool({ connectionString: E2E_RUNTIME_URL, max: 2 });
 const c = { admin, runtime, close: async () => { await runtime.end(); await admin.end(); } };
 try {
  const contractors = new db.ContractorRepository(runtime), p = await contractors.startPractice(crypto.randomUUID());
  await seedActiveContractorAgreement(admin, p.tenantId);
  const demo = await db.prepareWorkOrderDemo(runtime, p, { siteCount: 3 });
  await new db.WorkOrderRepository(runtime).importCsv(p, { commandId: crypto.randomUUID(), name: "fictional-inbox.csv", kind: "csv", csv: db.demoFile([db.demoRow(demo, 1), db.demoRow(demo, 2)]) });
  const jobs = (await admin.query("SELECT job_id,id FROM app.work_order WHERE tenant_id=$1 ORDER BY reference", [p.tenantId])).rows;
  const sessions: Record<string, string> = {}, members: Record<string, { member: { membershipId: string }; grant: string }> = {};
  for (const role of ["owner", "supervisor", "finance", "operative"]) {
   let memberId = demo.operativeMembershipId;
   if (role === "owner") memberId = p.membershipId;
   else if (role !== "operative") {
    const view = await contractors.query(p, { version: "contractor-query.v1", tenantId: p.tenantId, resource: "organisation" });
    memberId = (await contractors.command(p, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: crypto.randomUUID(), id: crypto.randomUUID(), expectedRevision: view.revision, kind: "member.invite", role, email: `${role}@fictional.invalid`, scope: { kind: "tenant", id: p.tenantId }, clientId: null, contractId: null })).id;
   }
   const actor = (await admin.query("SELECT m.identity_user_id,g.id FROM app.membership m JOIN app.role_grant g ON(g.tenant_id,g.membership_id)=(m.tenant_id,m.id) WHERE m.tenant_id=$1 AND m.id=$2 ORDER BY g.id LIMIT 1", [p.tenantId, memberId])).rows[0]!;
   const token = crypto.randomUUID();
   await admin.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '6 days')", [crypto.randomUUID(), p.tenantId, memberId, actor.identity_user_id, createHash("sha256").update(token).digest("hex")]);
   sessions[role] = token; members[role] = { member: { membershipId: memberId }, grant: actor.id };
  }
  const f = { p, ctx: db.verifiedTenantContextFromMembership(p), jobId: jobs[0]!.job_id as string, otherJob: jobs[1]!.job_id as string, sessions, members };
  const repo = new db.EnterpriseLivePromptRepository(runtime);
  await repo.importMaterials(sessions.finance!, materialsInput(f));
  return { c, f, repo, prompt: (await repo.list(sessions.supervisor!, listInput(f))).items[0]! };
 } catch (error) { await c.close(); throw error; }
}

test("only the owner can finish with one confirmation and the existing prompt coalesces", async ({ page, context }) => {
 const { c, f, repo } = await fixture();
 const session = async (token: string) => context.addCookies([{ name: "jg_session", value: token, url: origin }]);
 try {
  const ag = crypto.randomUUID();
  await c.admin.query(`INSERT INTO app.enterprise_agreement_version
   (tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
   VALUES($1,$2,'fictional-browser-finish',1,10,'on_payment','enterprise_site_capture_policy_v1','2020-01-01',true,$3,'synthetic_demo','fictional-browser')`, [f.p.tenantId,ag,"a".repeat(64)]);
  const path = `/contractor/jobs/${f.jobId}/possible-extras`, endpoint = `/api/contractor/jobs/${f.jobId}/finish`;
  for (const role of ["operative", "supervisor", "finance"]) {
   await session(f.sessions[role]!); await page.goto(path);
   await expect(page.getByRole("button", { name: "Finish job", exact: true })).toHaveCount(0);
   expect((await page.request.post(endpoint, { headers: { origin }, data: { version: "end-check.v1", commandId: crypto.randomUUID() } })).status()).toBe(403);
  }
  const lane = await repo.list(f.sessions.supervisor!, listInput(f));
  await session(f.sessions.owner!); await page.goto(path);
  await page.getByRole("button", { name: "Finish job", exact: true }).click();
  await expect(page.getByRole("region", { name: "Confirm job finish" })).toContainText("Finish this job?");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await c.admin.query("SELECT count(*)::int n FROM app.contractor_job_finish WHERE tenant_id=$1", [f.p.tenantId])).rows[0].n).toBe(0);
  await page.getByRole("button", { name: "Finish job", exact: true }).click();
  const post = page.waitForRequest(r => r.method() === "POST" && r.url().endsWith(endpoint));
  await page.getByRole("button", { name: "Confirm finish", exact: true }).click();
  const submitted = (await post).postDataJSON();
  await expect(page.getByRole("status").filter({ hasText: "Job finished" })).toContainText("0 possible extras raised");
  await expect(page.getByRole("button", { name: "Finish job", exact: true })).toHaveCount(0);
  expect((await page.request.post(endpoint, { headers: { origin }, data: submitted })).status()).toBe(201);
  expect((await page.request.post(endpoint, { headers: { origin }, data: { ...submitted, commandId: crypto.randomUUID() } })).status()).toBe(409);
  await page.reload(); await expect(page.getByRole("status").filter({ hasText: "Job finished" })).toBeVisible();
  await session(f.sessions.supervisor!); await page.goto(path);
  await expect(page.getByRole("region", { name: "Possible extras lane" })).toContainText("Materials above the order");
  expect(await repo.list(f.sessions.supervisor!, listInput(f))).toEqual(lane);
 } finally { await c.close(); }
});
