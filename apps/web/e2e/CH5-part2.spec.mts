import { createHmac, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";
import { meterCompany, historicalAgreement } from "../../../packages/db/test/subscription-persistence-fixtures.js";
import { activateMeterJob } from "../../../packages/db/test/meter-journey-fixtures.js";
import { seedWorkJob, workTenant, type WorkFixture } from "../../../packages/db/test/job-work-state-fixtures.js";
import { seedSyntheticPartyFixture } from "../../../packages/db/src/synthetic-party-fixture.js";

test("CH-5 part 2: persisted company import reaches Solo grace, reloads, and refuses the catch plainly", async ({ page, context }) => {
 const admin = new Pool({ host: "127.0.0.1", port: 55432, database: "jobguard_synthetic_demo", user: "postgres", password: "sbox-e2e-owner", max: 1 });
 const runtime = new Pool({ connectionString: "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo", max: 1 });
 const f = { admin, runtime } as WorkFixture;
 try {
  const company = await meterCompany(f), token = randomUUID();
  const digest = createHmac("sha256", "sbox-only-identity-hmac-secret-32-bytes").update(`session:${token}`).digest("hex");
  await admin.query("UPDATE identity.session SET token_digest=$1 WHERE id=$2", [digest, company.sessionId]);
  const a = { ...company, digest };
  await historicalAgreement(f, a, "Solo");
  await workTenant(admin, a.tenantId, db => seedSyntheticPartyFixture(db, a.tenantId, a.jobId));
  for (let i = 0; i < 5; i++) await activateMeterJob(f, await seedWorkJob(f, a.tenantId));
  await context.addCookies([{ name: "jobguard_session", value: token, url: "http://127.0.0.1:3000" }]);
  await page.goto(`/meter/jobs/${a.jobId}/imports`);
  await page.getByRole("button", { name: "Preview import" }).click();
  await page.getByRole("checkbox").check();
  const response = page.waitForResponse(r => r.url().endsWith(`/import-v3/adopt`) && r.request().method() === "POST");
  await page.getByRole("button", { name: "Confirm import" }).click();
  const saved = await response; expect(saved.status()).toBe(200);
  const imported = await saved.json();
  await expect(page.getByRole("heading", { name: "Imported live job" })).toBeVisible();
  await page.getByRole("link", { name: "Open saved import" }).click();
  await expect(page.getByRole("heading", { name: "Imported live job" })).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Baseline reference: ${imported.baselineId}`)).toBeVisible();
  await page.getByRole("button", { name: "Check imported catch" }).click();
  await expect(page.getByRole("alert")).toContainText("until SV-6 attribution is connected");
  const notice = (await admin.query("SELECT payload#>>'{references,capacityOutcome}' outcome FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='job.imported_baseline_attested'", [a.tenantId, imported.jobId])).rows;
  expect(notice).toEqual([{ outcome: "grace_place" }]);
  for (const table of ["recovery_fee_journal", "synthetic_obligation"])
   expect((await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [a.tenantId])).rows[0].n).toBe(0);
 } finally { await runtime.end(); await admin.end(); }
});
