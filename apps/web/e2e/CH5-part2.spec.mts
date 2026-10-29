import { createHmac, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { meterCompany, historicalAgreement } from "../../../packages/db/test/subscription-persistence-fixtures.js";
import { activateMeterJob } from "../../../packages/db/test/meter-journey-fixtures.js";
import { seedWorkJob, workTenant, type WorkFixture } from "../../../packages/db/test/job-work-state-fixtures.js";
import { seedSyntheticPartyFixture } from "../../../packages/db/src/synthetic-party-fixture.js";

test.setTimeout(120_000);
async function company(context: BrowserContext, places: number, plan: "Solo" | "Builder" = "Solo") {
 const admin = new Pool({ host: "127.0.0.1", port: 55432, database: "jobguard_synthetic_demo", user: "postgres", password: "sbox-e2e-owner", max: 1 });
 const runtime = new Pool({ connectionString: "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo", max: 1 });
 const f = { admin, runtime } as WorkFixture;
 try {
  const a = await meterCompany(f), token = randomUUID();
  const digest = createHmac("sha256", "sbox-only-identity-hmac-secret-32-bytes").update(`session:${token}`).digest("hex");
  await admin.query("UPDATE identity.session SET token_digest=$1 WHERE id=$2", [digest, a.sessionId]);
  await historicalAgreement(f, { ...a, digest }, plan);
  await workTenant(admin, a.tenantId, db => seedSyntheticPartyFixture(db, a.tenantId, a.jobId));
  for (let i = 0; i < places; i++) await activateMeterJob(f, await seedWorkJob(f, a.tenantId));
  await context.addCookies([{ name: "jobguard_session", value: token, url: "http://127.0.0.1:3000" }]);
  return { ...f, ...a, close: async () => { await runtime.end(); await admin.end(); } };
 } catch (error) { await runtime.end(); await admin.end(); throw error; }
}
async function importJob(page: Page, jobId: string, stage = "live") {
 await page.goto(`/meter/jobs/${jobId}/imports`);
 const main = page.getByRole("main");
 await main.getByLabel("Import stage").selectOption(stage);
 await main.getByRole("button", { name: "Preview import", exact: true }).click();
 await expect(main.getByRole("button", { name: "Confirm import", exact: true })).toBeDisabled();
 await main.getByRole("checkbox").check();
 const response = page.waitForResponse(r => r.url().endsWith(`/import-v3/adopt`) && r.request().method() === "POST");
 await main.getByRole("button", { name: "Confirm import", exact: true }).click();
 return response;
}

test("CH5-J: Solo grace persists, duplicate replays retain IDs, and the next import refuses", async ({ page, context }) => {
 const f = await company(context, 5), main = page.getByRole("main");
 try {
  const response = await importJob(page, f.jobId); expect(response.status()).toBe(200);
  const imported = await response.json();
  await expect(main.getByRole("status")).toContainText("free grace place");
  expect(imported.linkedJobIds).toEqual([f.jobId]);
  await main.getByRole("link", { name: "Open saved import", exact: true }).click();
  await page.reload();
  await expect(main.getByRole("status")).toContainText("free grace place");
  await expect(main.getByText(`Baseline reference: ${imported.baselineId}`, { exact: true })).toBeVisible();
  await expect(main.getByRole("link", { name: `Linked overlapping job: ${f.jobId}`, exact: true })).toHaveAttribute("href", `/jobs/${f.jobId}`);
  const headers = response.request().headers();
  const authHeaders = { origin: headers.origin!, "x-csrf-token": headers["x-csrf-token"]!, "x-tenant-id": headers["x-tenant-id"]! };
  const replay = await page.request.fetch(response.url(), { method: "POST", headers: authHeaders, data: response.request().postDataJSON() });
  expect(replay.status()).toBe(200); expect(await replay.json()).toEqual(imported);
  await main.getByRole("button", { name: "Check imported catch", exact: true }).click();
  await expect(main.getByRole("alert")).toContainText("until SV-6 attribution is connected");
  const next = await seedWorkJob(f, f.tenantId);
  await workTenant(f.admin, f.tenantId, db => seedSyntheticPartyFixture(db, f.tenantId, next.jobId));
  for (let i = 0; i < 2; i++) {
   const refused = await importJob(page, next.jobId);
   expect(refused.status()).toBe(409); expect(await refused.json()).toEqual({ code: "PLAN_LIMIT_REACHED" });
   await expect(main.getByRole("alert")).toContainText("Solo plan and grace place are full");
   await expect(main.getByRole("region", { name: "Imported job" })).toHaveCount(0);
   await page.reload();
  }
  expect((await f.admin.query("SELECT count(*)::int n FROM app.job_import_v3 WHERE tenant_id=$1", [f.tenantId])).rows[0].n).toBe(1);
  for (const table of ["recovery_fee_journal", "synthetic_obligation"])
   expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [f.tenantId])).rows[0].n).toBe(0);
 } finally { await f.close(); }
});

test("CH5-J: invoiced import links and stays zero even when Solo has used its grace place", async ({ page, context }) => {
 const f = await company(context, 6), main = page.getByRole("main");
 try {
  const response = await importJob(page, f.jobId, "invoiced"); expect(response.status()).toBe(200);
  const imported = await response.json(); expect(imported.linkedJobIds).toEqual([f.jobId]);
  await main.getByRole("link", { name: "Open saved import", exact: true }).click();
  await page.reload();
  await expect(main.getByRole("region", { name: "Imported job" })).toContainText("Counted places: 0");
  await expect(main.getByRole("region", { name: "Imported job" })).toContainText("pre_adoption_evidence");
  await expect(main.getByRole("region", { name: "Imported job" })).toContainText("£0.00 recovery fee");
  await expect(main.getByRole("region", { name: "Imported job" })).toContainText("no historical evidence or catches");
  await expect(main.getByRole("link", { name: `Linked overlapping job: ${f.jobId}`, exact: true })).toBeVisible();
  const stored = await page.request.get(`/api/meter/jobs/${imported.jobId}/import-v3/read`, { headers: { "x-csrf-token": response.request().headers()["x-csrf-token"]!, "x-tenant-id": f.tenantId } });
  expect(stored.status()).toBe(200);
  expect((await stored.json()).meter).toEqual({ countedPlaces: 0, reason: "imported_at_invoiced_stage" });
 } finally { await f.close(); }
});

test("CH5-J: Builder remains admitted beyond grace, reloads track review and preserves its maximum", async ({ page, context }) => {
 const f = await company(context, 13, "Builder"), main = page.getByRole("main");
 try {
  const response = await importJob(page, f.jobId); expect(response.status()).toBe(200);
  await expect(main.getByRole("status")).toContainText("track_review_due");
  await main.getByRole("link", { name: "Open saved import", exact: true }).click();
  await page.reload();
  await expect(main.getByRole("status")).toContainText("track_review_due");
  await expect(main.getByRole("status")).toContainText("approved monthly maximum is unchanged");
  expect((await f.admin.query("SELECT maximum_pence::int maximum FROM app.subscription_agreement_revision WHERE tenant_id=$1", [f.tenantId])).rows).toEqual([{ maximum: 16900 }]);
 } finally { await f.close(); }
});
