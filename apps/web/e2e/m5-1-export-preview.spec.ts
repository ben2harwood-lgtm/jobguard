import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL, E2E_RUNTIME_URL, E2E_AUTH_CODE_SECRET } from "./global-setup";
import { meterCompany } from "../../../packages/db/test/meter-persistence-fixtures.js";
import type { WorkFixture } from "../../../packages/db/test/job-work-state-fixtures.js";
import { closeTestPools } from "../../../packages/db/test/pool-test-utils.js";

test.setTimeout(180_000);
let f: WorkFixture;
test.beforeAll(() => { f = { admin: new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 }),
  runtime: new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 }) } as WorkFixture; });
test.afterAll(() => closeTestPools(f.runtime, f.admin));

// Runs through the real Next routes, company identity and checked PostgreSQL function in both
// configured projects (360 and 1280). No route mocks, live adapter or privileged web credential.
test("human confirmation binds exact bytes; stale approval fails; fake retries and conflicts stay visible", async ({ page, context, baseURL }) => {
  // Use native ESM for the built API/db graph, matching CH-9 and DEMO-J3.
  const nativeImport = new Function("specifier", "return import(specifier)") as <T>(specifier: string) => Promise<T>;
  const { AccountingExportRepository, storedAccountingExportV1 } = await nativeImport<typeof import("../../../packages/db/src/accounting-export-repository.js")>(pathToFileURL(join(process.cwd(), "../../packages/db/dist/accounting-export-repository.js")).href);
  const { AccountingExportSandbox } = await nativeImport<typeof import("../../api/src/accounting-export.sandbox.js")>(pathToFileURL(join(process.cwd(), "../api/dist/accounting-export.sandbox.js")).href);
  const { FakeCodatAdapter } = await nativeImport<typeof import("../../api/src/accounting-export.fake.js")>(pathToFileURL(join(process.cwd(), "../api/dist/accounting-export.fake.js")).href);
  const { FakeAccountingExportInbox, pushStoredAccountingExport } = await nativeImport<typeof import("../../api/src/accounting-export.persisted.js")>(pathToFileURL(join(process.cwd(), "../api/dist/accounting-export.persisted.js")).href);
  const { ctx, source, scope, consent } = await nativeImport<typeof import("../../api/src/accounting-export.test-fixtures.js")>(pathToFileURL(join(process.cwd(), "../api/dist/accounting-export.test-fixtures.js")).href);
  const { verifiedTenantContextForQueuedJob } = await nativeImport<typeof import("@jobguard/db")>(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
  const a = await meterCompany(f), token = randomUUID();
  // Keep the fake executor context in the same ESM module as its database driver.
  const exportContext = verifiedTenantContextForQueuedJob(a.tenantId);
  const digest = createHmac("sha256", E2E_AUTH_CODE_SECRET).update(`session:${token}`).digest("hex");
  await f.admin.query("UPDATE identity.session SET token_digest=$1 WHERE id=$2", [digest, a.sessionId]);
  await context.addCookies([{ name: "jobguard_session", value: token, url: baseURL! }]);
  const tenantId = `demo-${a.tenantId}`, adapter = new FakeCodatAdapter();
  const artifact = new AccountingExportSandbox(adapter, [{ ...source, tenantId }], [{ ...consent, tenantId }], true)
    .preview({ ...ctx, tenantId }, { ...scope, tenantId, mapping: { ...scope.mapping, tenantId } }, 100).artifact;
  await f.admin.query("INSERT INTO app.accounting_export_fixture(tenant_id,source_id,artifact,consent_expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')", [a.tenantId, source.sourceId, artifact]);
  await page.goto(`/accounting-exports/${source.sourceId}`);
  const load = page.getByRole("button", { name: "Load current preview" });
  await load.click();
  await expect(page.getByTestId("export-artifact")).toContainText('"accountId": "demo-sales"');
  await expect(page.getByTestId("export-artifact")).toContainText('"companyId": "demo-company"');
  const oldHash = await page.getByTestId("preview-hash").textContent();
  const approve = page.getByRole("button", { name: "Approve this preview" });
  await expect(approve).toBeDisabled();
  artifact.source.revision++; artifact.scope.sourceRevision++; artifact.target.sourceRevision++;
  await f.admin.query("UPDATE app.accounting_export_fixture SET artifact=$2 WHERE tenant_id=$1", [a.tenantId, artifact]);
  await page.getByRole("checkbox").check(); await approve.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("EXPORT_APPROVAL_REQUIRED");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.accounting_export_decision WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(0);
  await load.click();
  await expect(page.getByTestId("preview-hash")).not.toHaveText(oldHash!);
  await page.getByRole("checkbox").check();
  const sent = page.waitForRequest(r => r.method() === "POST" && r.url().includes("/api/accounting-exports/"));
  await approve.click(); const approvedRequest = await sent;
  await expect(page.getByRole("region", { name: "Export status" })).toContainText("pending");
  const session = await (await page.request.get("/api/auth/session")).json();
  const headers = { origin: baseURL!, "x-csrf-token": session.csrfToken, "x-tenant-id": a.tenantId };
  const replay = await page.request.post(`/api/accounting-exports/${source.sourceId}`, { headers, data: approvedRequest.postDataJSON() });
  expect(replay.status()).toBe(200);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.accounting_export_decision WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(1);
  const repo = new AccountingExportRepository(f.runtime), inbox = new FakeAccountingExportInbox(f.admin, adapter);
  const push = () => pushStoredAccountingExport(repo, exportContext, digest, source.sourceId, inbox);
  adapter.next = "unknown_after";
  expect(await push()).toMatchObject({ status: "outcome_unknown" });
  const show = async (state: string) => {
    await page.getByRole("button", { name: "Refresh status" }).click();
    await expect(page.getByRole("region", { name: "Export status" })).toContainText(state);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };
  await show("outcome_unknown"); expect(await push()).toMatchObject({ status: "pushed" });
  adapter.objects[0]!.paid = true;
  const reconcile = async () => {
    const entry = storedAccountingExportV1.parse(await repo.execute(exportContext, digest, "read", source.sourceId));
    await inbox.observe(exportContext, entry);
    return repo.execute(exportContext, digest, "reconcile", source.sourceId, { version: 1, attemptId: entry.attemptId });
  };
  expect(await reconcile()).toMatchObject({ qualifyingRecoveryProof: false }); await show("pushed");
  await expect(page.getByText("Qualifying recovery proof: false.", { exact: true })).toBeVisible();
  adapter.objects[0]!.payload.amount.pence++; await reconcile(); await show("external_edit");
  adapter.objects[0]!.payload.amount.pence--;
  adapter.objects.push({ ...structuredClone(adapter.objects[0]!), id: "demo-duplicate" });
  await reconcile(); await show("duplicate_import");
  adapter.objects.pop(); adapter.objects[0]!.id = "demo-conflicting-id";
  await reconcile(); await show("reference_conflict");
  await push(); expect(adapter.pushes).toBe(1);
  await page.reload(); await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByRole("region", { name: "Export status" })).toContainText("reference_conflict");

  // Another company's source cannot be read through the signed-in company's headers.
  const other = await meterCompany(f);
  const foreign = structuredClone(artifact), foreignId = "demo-foreign-source";
  foreign.source.sourceId = foreignId; foreign.scope.sourceId = foreignId; foreign.target.sourceId = foreignId;
  foreign.source.tenantId = `demo-${other.tenantId}`; foreign.scope.tenantId = foreign.source.tenantId; foreign.scope.mapping.tenantId = foreign.source.tenantId;
  await f.admin.query("INSERT INTO app.accounting_export_fixture(tenant_id,source_id,artifact,consent_expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')", [other.tenantId, foreignId, foreign]);
  expect((await page.request.get(`/api/accounting-exports/${foreignId}?view=preview`, { headers })).status()).toBe(404);
  expect((await page.request.get(`/api/accounting-exports/${foreignId}?view=preview`, { headers: { ...headers, "x-tenant-id": other.tenantId } })).status()).toBe(403);

  // Malformed target object and unsupported tax never reach approval.
  for (const kind of ["tax", "object"]) {
    const invalid = structuredClone(artifact), id = `demo-unsupported-${kind}`;
    invalid.source.sourceId = id; invalid.scope.sourceId = id; invalid.target.sourceId = id;
    if (kind === "tax") invalid.source.tax = "unsupported";
    else (invalid.target as { objectType: string }).objectType = "supplier_bill";
    await f.admin.query("INSERT INTO app.accounting_export_fixture(tenant_id,source_id,artifact,consent_expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')", [a.tenantId, id, invalid]);
    await page.goto(`/accounting-exports/${id}`); await page.getByRole("button", { name: "Load current preview" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("EXPORT_UNSUPPORTED_MAPPING");
    await expect(page.getByRole("button", { name: "Approve this preview" })).toHaveCount(0);
  }
});
