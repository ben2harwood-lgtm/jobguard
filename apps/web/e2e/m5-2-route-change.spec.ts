import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";
import { E2E_ADMIN_DATABASE_URL, E2E_RUNTIME_URL, E2E_AUTH_CODE_SECRET } from "./global-setup";

// Keep the built API/core/db graph in native ESM, outside Playwright's TS loader.
const nativeImport = new Function("specifier", "return import(specifier)") as <T>(specifier: string) => Promise<T>;
const built = (relative: string) => pathToFileURL(join(process.cwd(), relative)).href;
let admin: Pool, runtime: Pool;
test.setTimeout(180_000);
test.beforeAll(() => {
 admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
 runtime = new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 });
});
test.afterAll(async () => { await runtime.end(); await admin.end(); });
async function fixture() {
 const { createIdentityApplication } = await nativeImport<typeof import("../../api/src/auth/identity.application.js")>(built("../api/dist/auth/identity.application.js"));
 const identity = createIdentityApplication({ JOBGUARD_ENV: "synthetic_demo", AUTH_ALLOWED_ORIGIN: "http://127.0.0.1:3000",
  AUTH_CODE_SECRET: E2E_AUTH_CODE_SECRET, IDENTITY_DATABASE_URL: "postgresql://jobguard_identity:sbox-e2e-identity@127.0.0.1:55432/jobguard_synthetic_demo" });
 try {
  const email = `${randomUUID()}@ch4.invalid`;
  const challenge = await identity.provider.requestCode({ email, purpose: "signup", ip: randomUUID() });
  const session = await identity.provider.verifyCode(email, "signup", challenge.fixtureCode!);
  const view = await identity.session(session.sessionToken), member = view.memberships[0]!;
  const credentials = { ...session, tenantHeader: member.tenantId, origin: identity.allowedOrigin };
  const context = await identity.context(credentials), digest = identity.provider.digest(`session:${session.sessionToken}`);
  const { AccountingExportRepository } = await nativeImport<typeof import("../../../packages/db/src/accounting-export-repository.js")>(built("../../packages/db/dist/accounting-export-repository.js"));
  const { AccountingExportSandbox } = await nativeImport<typeof import("../../api/src/accounting-export.sandbox.js")>(built("../api/dist/accounting-export.sandbox.js"));
  const { FakeCodatAdapter } = await nativeImport<typeof import("../../api/src/accounting-export.fake.js")>(built("../api/dist/accounting-export.fake.js"));
  const { FakeAccountingExportInbox, pushStoredAccountingExport } = await nativeImport<typeof import("../../api/src/accounting-export.persisted.js")>(built("../api/dist/accounting-export.persisted.js"));
  const { ctx, source, scope, consent } = await nativeImport<typeof import("../../api/src/accounting-export.test-fixtures.js")>(built("../api/dist/accounting-export.test-fixtures.js"));
  const tenantId = `demo-${member.tenantId}`, adapter = new FakeCodatAdapter();
  const old = new AccountingExportSandbox(adapter, [{ ...source, tenantId }], [{ ...consent, tenantId }], true)
   .preview({ ...ctx, tenantId }, { ...scope, tenantId, mapping: { ...scope.mapping, tenantId } }, 100).artifact;
  const next = structuredClone(old);
  next.route = "xero"; next.connectionRevision = 2;
  next.scope.sourceId = next.source.sourceId = next.target.sourceId = "demo-next";
  next.scope.mapping.revision++; next.scope.mapping.accountId = next.target.accountId = "demo-new-account";
  for (const artifact of [old, next]) await admin.query("INSERT INTO app.accounting_export_fixture(tenant_id,source_id,artifact,consent_expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')", [member.tenantId, artifact.source.sourceId, artifact]);
  const repo = new AccountingExportRepository(runtime);
  const preview = await repo.execute(context, digest, "preview", old.source.sourceId) as { previewHash: string };
  await repo.execute(context, digest, "approve", old.source.sourceId, { version: 1, decisionId: randomUUID(), previewHash: preview.previewHash,
   expiresAt: new Date(Date.now()+600000).toISOString(), humanConfirmed: true });
  await pushStoredAccountingExport(repo, context, digest, old.source.sourceId, new FakeAccountingExportInbox(admin, adapter));
  const historic = await repo.execute(context, digest, "read", old.source.sourceId);
  return { session, member, next, old, repo, context, digest, historic };
 } finally { await identity.provider.repository.pool.end(); }
}
test("exact stored change survives a lost confirmation response, retry and reload without changing historic IDs", async ({ page, context, baseURL }) => {
 const f = await fixture();
 await context.addCookies([{ name: "jobguard_session", value: f.session.sessionToken, url: baseURL! }]);
 await page.goto("/accounting-exports/demo-next");
 const section = page.getByRole("region", { name: "Practice export route change" });
 await expect(section).toContainText("codat → xero");
 await expect(section).toContainText("Target company: demo-company");
 await expect(section).toContainText("Historic entries: 1");
 await expect(page.getByTestId("route-change-artifact")).toContainText("demo-new-account");
 const bodies: string[] = [];
 await page.route("**/api/accounting-exports/demo-next/route-change", async route => {
  if (route.request().method() !== "POST") return route.continue();
  bodies.push(route.request().postData()!);
  if (bodies.length === 1) { await route.fetch(); return route.abort("failed"); }
  if (bodies.length === 2 || bodies.length === 3) return route.fulfill({
   status: bodies.length === 2 ? 408 : 429, contentType: "application/json",
   body: JSON.stringify({ version: 1, code: "EXPORT_UNAVAILABLE" }),
  });
  return route.continue();
 });
 const confirm = section.getByRole("button", { name: "Confirm this exact route change" });
 await confirm.click();
 await expect(page.getByRole("main").getByRole("alert")).toContainText("result is uncertain");
 for (let retry = 0; retry < 2; retry++) {
  await confirm.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("result is uncertain");
  await expect(confirm).toBeEnabled();
 }
 await confirm.click();
 await expect(section.getByRole("status")).toContainText("Stored route: xero. Revision 1.");
 expect(bodies).toHaveLength(4); expect(bodies.every(body => body === bodies[0])).toBe(true);
 await page.reload();
 await expect(section.getByRole("status")).toContainText("Stored route: xero. Revision 1.");
 const saved = await f.repo.routeChangeRead(f.context, f.digest, "demo-next");
 expect(saved.history).toHaveLength(1);
 await expect(page.getByTestId("route-change-history")).toContainText(saved.history[0]!.artifact.entries[0]!.externalId);
 expect(await f.repo.execute(f.context, f.digest, "read", f.old.source.sourceId)).toEqual(f.historic);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
test("changed proposal and stale connection refuse confirmation, then unknown export and missing permission remain held", async ({ page, context, baseURL }) => {
 const f = await fixture();
 await context.addCookies([{ name: "jobguard_session", value: f.session.sessionToken, url: baseURL! }]);
 await page.goto("/accounting-exports/demo-next");
 const section = page.getByRole("region", { name: "Practice export route change" });
 const confirm = section.getByRole("button", { name: "Confirm this exact route change" });
 await expect(confirm).toBeVisible();
 f.next.connectionRevision++;
 await admin.query("UPDATE app.accounting_export_fixture SET artifact=$2 WHERE tenant_id=$1 AND source_id='demo-next'", [f.member.tenantId, f.next]);
 await confirm.click();
 await expect(page.getByRole("main").getByRole("alert")).toContainText("proposal changed");
 await expect(confirm).toHaveCount(0);
 expect((await admin.query("SELECT count(*)::int n FROM app.accounting_export_route_change WHERE tenant_id=$1", [f.member.tenantId])).rows[0].n).toBe(0);
 await section.getByRole("button", { name: "Load current route change" }).click();
 await expect(confirm).toBeVisible();
 const pending = structuredClone(f.old);
 pending.scope.sourceId = pending.source.sourceId = pending.target.sourceId = "demo-held";
 await admin.query("INSERT INTO app.accounting_export_fixture(tenant_id,source_id,artifact,consent_expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')", [f.member.tenantId, pending.source.sourceId, pending]);
 const preview = await f.repo.execute(f.context, f.digest, "preview", "demo-held") as { previewHash: string };
 await f.repo.execute(f.context, f.digest, "approve", "demo-held", { version: 1, decisionId: randomUUID(), previewHash: preview.previewHash, expiresAt: new Date(Date.now()+600000).toISOString(), humanConfirmed: true });
 await f.repo.execute(f.context, f.digest, "claim", "demo-held", { version: 1, attemptId: randomUUID() });
 await confirm.click();
 await expect(page.getByRole("main").getByRole("alert")).toContainText("outcome is unknown");
 expect((await admin.query("SELECT count(*)::int n FROM app.accounting_export_route_change WHERE tenant_id=$1", [f.member.tenantId])).rows[0].n).toBe(0);
 await admin.query("UPDATE app.membership SET role='read_only' WHERE tenant_id=$1 AND id=$2", [f.member.tenantId, f.member.id]);
 await page.reload();
 await expect(page.getByRole("main").getByRole("alert")).toContainText("do not have permission");
 await expect(confirm).toHaveCount(0);
});
