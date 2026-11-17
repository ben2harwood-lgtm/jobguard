import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { JobImportV3Repository, AdoptInFlightJobV3Mutation } from "../src/job-import-v3-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { importTargetJobIdV3 } from "../src/job-import-v3-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { scriptedImportPool, command, intent, approved, D, J } from "./job-import-v3-fixtures.js";

beforeEach(() => { process.env.JOBGUARD_ENV = "synthetic_demo"; });
function company() {
 const f = scriptedImportPool(), original = f.query.getMockImplementation()!;
 const tenant = randomUUID(), context = testTenantContext(tenant);
 const receipt = { version: "job-import-result.v3", importId: randomUUID(), jobId: command.subjectRef, termsId: randomUUID(), baselineId: randomUUID(),
  provenance: "imported", lineageStrength: "builder_attested_weaker", lifecyclePoint: "live", linkedJobIds: [], meterResultRef: randomUUID(),
  actionHash: intent.previewHash, environment: "synthetic_demo", realExternalActions: 0,
  baseline: { acceptedNetPence: 300000, lines: approved.baseline.lines.map(line => ({ sourceLineId: line.sourceLineId, netPence: line.netPence, scopeItemId: randomUUID(), origin: "builder_baseline" })) } };
 f.query.mockImplementation(async (sql, values) => {
  if (sql.startsWith("SELECT j.id FROM app.job")) return { rows: f.state.owns ? [{ id: J }] : [], rowCount: f.state.owns ? 1 : 0 };
  if (sql.includes("FROM app.job_import_v3")) return { rows: [{ snapshot: approved, result: receipt, adopted_at: new Date("2026-10-28T18:00:00Z") }], rowCount: 1 };
  return original(sql, values);
 });
 return { ...f, tenant, context, receipt };
}
describe("CH-5 part 2 source/authority boundaries (scripted transport only)", () => {
 it("normal company preview declares checked admission, never a supplied permit", async () => {
  const f = company();
  const result = await new JobImportV3Repository(f.pool).preview(f.context, D, J, { version: "job-import-preview.v3", expectedBindingId: intent.expectedBindingId, fixtureId: intent.fixtureId, lifecyclePoint: "live" });
  expect(result.availability).toEqual({ status: "checked_on_adoption", reason: "ordinary_start_rule" });
  expect(f.query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE/u.test(sql))).toBe(false);
 });
 it("catch replay, reversal, allocation and locked-bill attacks cannot reach hidden data or a writer", async () => {
  const f = company(), repo = new JobImportV3Repository(f.pool);
  const input = { version: "import-catch-command.v1", commandId: randomUUID(), baselineId: f.receipt.baselineId };
  for (let i = 0; i < 2; i++) await expect(repo.assessCatch(f.context, D, J, input)).rejects.toMatchObject({ code: "ATTRIBUTION_UNAVAILABLE" });
  for (const extra of [{ allocationPence: 999999 }, { finalAccountRevisionId: randomUUID() }, { reversalId: randomUUID() }, { feePence: 0 }])
   await expect(repo.assessCatch(f.context, D, J, { ...input, ...extra })).rejects.toMatchObject({ code: "INVALID_IMPORT" });
  await expect(repo.assessCatch(f.context, D, J, { ...input, baselineId: randomUUID() })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  expect(f.query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE|app\.(shadow|recovery|receipt_allocation|final_account)/u.test(sql))).toBe(false);
 });
 it("foreign job and revoked session refuse before revealing the dependency", async () => {
  const f = company(), repo = new JobImportV3Repository(f.pool);
  f.state.owns = false;
  await expect(repo.assessCatch(f.context, D, J, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  f.state.owns = true; f.state.authenticated = false;
  await expect(repo.assessCatch(f.context, D, J, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(f.query.mock.calls.some(([sql]) => sql.includes("FROM app.job_import_v3"))).toBe(false);
 });
 it("the internal admission envelope binds a durable audit notice without changing public replay identities", async () => {
  const f = company(), original = f.query.getMockImplementation()!;
  const exact = { ...command, authorizationId: randomUUID(), subjectRef: importTargetJobIdV3(f.tenant, D, intent.commandId) };
  f.receipt.jobId = exact.subjectRef;
  f.query.mockImplementation(async (sql, values) => sql.includes("app.adopt_invoiced_job_v3")
    ? { rows: [{ result: { result: f.receipt, admission: { sourceHash: "b".repeat(64), outcome: "track_review_due" } } }], rowCount: 1 }
    : original(sql, values));
  const mutation = new AdoptInFlightJobV3Mutation(f.tenant, D, J, intent, approved);
  await withTenant(f.pool, f.context, async db => {
    const result = await mutation.mutate(db, exact);
    expect(result).toEqual(f.receipt);
    expect(result).not.toHaveProperty("admission");
    expect(mutation.auditEvents(result, exact)[0]?.payload).toMatchObject({
      references: { capacityOutcome: "track_review_due" }, hashes: { meterSourceHash: "b".repeat(64) },
    });
  });
 });
 it("production refuses catch requests before SQL", async () => {
  const f = company();
  process.env.JOBGUARD_ENV = "production";
  await expect(new JobImportV3Repository(f.pool).assessCatch(f.context, D, J, {})).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" });
  expect(f.query).not.toHaveBeenCalled();
 });
});
