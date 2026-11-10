import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { seedActiveContractorAgreement } from "../../../packages/db/test/contractor-agreement-test-fixture";
import { E2E_ADMIN_DATABASE_URL, E2E_RUNTIME_URL } from "./global-setup";
import { taggedCompletionPhoto } from "./helpers/tagged-completion-photo";

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
  for (const role of ["supervisor", "finance", "operative"]) {
   let memberId = demo.operativeMembershipId;
   if (role !== "operative") {
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

test("Possible extras enforces authority, exact hash and replay, then records one origin and a dismissal", async ({ page, context }) => {
 const { c, f, repo, prompt } = await fixture();
 const path = `/api/contractor/jobs/${f.jobId}/possible-extras/${prompt.id}`;
 const command = { version: "confirm-prompt.v1", commandId: crypto.randomUUID(), promptHash: prompt.promptHash };
 const session = async (token: string) => context.addCookies([{ name: "jg_session", value: token, url: origin }]);
 try {
  await session(f.sessions.operative!);
  expect((await page.request.post(`${path}/confirm`, { headers: { origin }, data: command })).status()).toBe(403);
  await page.goto(`/contractor/jobs/${f.jobId}/possible-extras`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("not available");
  await expect(page.getByRole("button", { name: "Confirm possible extra", exact: true })).toHaveCount(0);
  await session(f.sessions.supervisor!);
  const foreign = await fixture();
  try { for (const job of [crypto.randomUUID(), foreign.f.jobId]) expect((await page.request.get(`/api/contractor/jobs/${job}/possible-extras`)).status()).toBe(403); }
  finally { await foreign.c.close(); }
  for (const data of [{ ...command, promptHash: "0".repeat(64) }, { ...command, tenantId: f.p.tenantId }, { ...command, actorId: f.members.supervisor!.member.membershipId }]) {
   const response = await page.request.post(`${path}/confirm`, { headers: { origin }, data });
   expect(response.status()).toBe("tenantId" in data || "actorId" in data ? 400 : 409);
  }
  expect((await page.request.post(`${path}/confirm`, { headers: { origin: "https://untrusted.invalid" }, data: command })).status()).toBe(403);
  await page.goto(`/contractor/jobs/${f.jobId}/possible-extras`);
  await page.getByRole("button", { name: /Materials above the order/ }).click();
  await expect(page.getByRole("heading", { name: "Citations", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Possible extra detail" })).toContainText("materials");
  const sent = page.waitForRequest(r => r.url().endsWith(`${prompt.id}/confirm`) && r.method() === "POST");
  await page.getByRole("button", { name: "Confirm possible extra", exact: true }).click();
  const raw = (await sent).postDataJSON(); expect(raw.promptHash).toBe(prompt.promptHash);
  await expect(page.getByRole("status").first()).toContainText("Resolution recorded");
  expect((await page.request.post(`${path}/confirm`, { headers: { origin }, data: raw })).status()).toBe(201);
  await page.getByRole("button", { name: "Reload prompt", exact: true }).click();
  await expect(page.getByText("Recorded: created", { exact: true })).toBeVisible();
  expect((await c.admin.query("SELECT kind FROM app.extra_origin WHERE tenant_id=$1 AND job_id=$2", [f.p.tenantId, f.jobId])).rows).toEqual([{ kind: "jobguard_surfaced_confirmed" }]);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.prompt_resolution WHERE tenant_id=$1 AND prompt_id=$2", [f.p.tenantId, prompt.id])).rows[0].n).toBe(1);
  const other = { jobId: f.otherJob };
  await repo.importMaterials(f.sessions.finance!, materialsInput(f, { jobId: other.jobId }));
  const next = (await repo.list(f.sessions.supervisor!, { ...listInput(f), jobId: other.jobId })).items[0]!;
  await page.goto(`/contractor/jobs/${other.jobId}/possible-extras?promptId=${next.id}`);
  await page.getByLabel("Reason for dismissal").fill("Fictional review: already recorded elsewhere");
  await page.getByRole("button", { name: "Dismiss possible extra", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Resolution recorded");
  await page.getByRole("button", { name: "Reload prompt", exact: true }).click();
  await expect(page.getByText(/Recorded: dismissed/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
 } finally { await c.close(); }
});

test("an explicit authorised existing-extra choice coalesces without creating an origin", async ({ page, context }) => {
 const { c, f, prompt } = await fixture();
 try {
  const line = (await c.admin.query("SELECT l.scope_item_id,l.sor_version_id FROM app.work_order_line l JOIN app.work_order_current w ON(w.tenant_id,w.revision_id)=(l.tenant_id,l.revision_id) WHERE l.tenant_id=$1 AND l.job_id=$2 AND l.sor_code='REPAIR-DOOR'", [f.p.tenantId, f.jobId])).rows[0]!;
  const db = await database();
  const finance = await new db.ContractorRepository(c.runtime).resolveSession(f.sessions.finance!);
  const financeContext = db.verifiedTenantContextFromMembership(finance, { kind: "contractor_practice", credential: f.sessions.finance! });
  const office = async () => new db.ExtraRepository(c.runtime).raiseExtra(financeContext, { version: "raise-extra.v1", commandId: crypto.randomUUID(), commandType: "RecordOfficeExtra", jobId: f.jobId, actorMembershipId: f.members.finance!.member.membershipId, grantId: f.members.finance!.grant, note: "Fictional office extra", description: "Fictional door excess", sorItem: { versionId: line.sor_version_id, code: "REPAIR-DOOR" }, excessOfScopeItemId: line.scope_item_id });
  await office(); const chosen = await office();
  await context.addCookies([{ name: "jg_session", value: f.sessions.supervisor!, url: origin }]);
  await page.goto(`/contractor/jobs/${f.jobId}/possible-extras?promptId=${prompt.id}`);
  await page.getByLabel("Existing extra (the server verifies the match)").selectOption(chosen.variationId);
  await page.getByRole("button", { name: "Confirm possible extra", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Resolution recorded");
  await page.getByRole("button", { name: "Reload prompt", exact: true }).click();
  await expect(page.getByText("Recorded: coalesced", { exact: true })).toBeVisible();
  expect((await c.admin.query("SELECT kind,variation_id FROM app.prompt_resolution WHERE tenant_id=$1 AND prompt_id=$2", [f.p.tenantId, prompt.id])).rows).toEqual([{ kind: "coalesced", variation_id: chosen.variationId }]);
  expect((await c.admin.query("SELECT kind FROM app.extra_origin WHERE tenant_id=$1 AND job_id=$2", [f.p.tenantId, f.jobId])).rows).toEqual([{ kind: "office_entry" }, { kind: "office_entry" }]);
 } finally { await c.close(); }
});

test("completion observations save real stored photo citations through the checked web route", async ({page,context})=>{
 const {c,f}=await fixture();
 try {
  const db=await database();
  const scope=(await c.admin.query("SELECT scope_item_id FROM app.work_order_line WHERE tenant_id=$1 AND job_id=$2 ORDER BY position LIMIT 1",[f.p.tenantId,f.jobId])).rows[0]!.scope_item_id as string;
  const photo=await taggedCompletionPhoto(db,c.runtime,f.ctx,f.jobId,scope,["Fictional new vent"]);
  const path=`/api/contractor/jobs/${f.jobId}/possible-extras/observations`;
  const command={version:"completion-observation.v1",commandId:crypto.randomUUID(),...photo,workIdentity:"FIT-VENT",locator:{kind:"photo_tag",tag:"Fictional new vent"}};
  const post=(data:unknown=command,sourceOrigin=origin)=>page.request.post(path,{headers:{origin:sourceOrigin},data});
  expect((await post()).status()).toBe(401);
  await context.addCookies([{name:"jg_session",value:f.sessions.operative!,url:origin}]);
  expect((await post()).status()).toBe(403);
  await context.addCookies([{name:"jg_session",value:f.sessions.supervisor!,url:origin}]);
  expect((await post(command,"https://untrusted.invalid")).status()).toBe(403);
  expect((await post({...command,tenantId:f.p.tenantId})).status()).toBe(400);
  expect((await post({...command,sha256:"0".repeat(64)})).status()).toBe(409);
  expect((await page.request.post(`/api/contractor/jobs/${crypto.randomUUID()}/possible-extras/observations`,{headers:{origin},data:command})).status()).toBe(403);
  await page.goto(`/contractor/jobs/${f.jobId}/completion-observations`);
  const main=page.getByRole("main");
  await main.getByLabel("Completion evidence").selectOption(photo.evidenceId);
  await main.getByLabel("Stored photo tag").selectOption("Fictional new vent");
  await main.getByLabel("Work identity",{exact:true}).fill("FIT-VENT");
  const sent=page.waitForRequest(r=>r.url().endsWith(path)&&r.method()==="POST");
  await main.getByRole("button",{name:"Record observation",exact:true}).click();
  const raw=(await sent).postDataJSON();
  await expect(main.getByRole("status")).toContainText("Observation recorded. Reference:");
  expect(raw).toMatchObject({...photo,workIdentity:"FIT-VENT",locator:{kind:"photo_tag",tag:"Fictional new vent"}});
  const replay=await post(raw);expect(replay.status()).toBe(201);
  const saved=await replay.json();
  expect((await c.admin.query("SELECT id,sha256,photo_tags FROM app.extra_completion_observation WHERE tenant_id=$1 AND job_id=$2",[f.p.tenantId,f.jobId])).rows).toEqual([{id:saved.observationId,sha256:photo.sha256,photo_tags:["Fictional new vent"]}]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 } finally {await c.close();}
});
