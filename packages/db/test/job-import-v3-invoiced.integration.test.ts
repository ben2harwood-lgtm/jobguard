import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobImportV3Repository } from "../src/job-import-v3-repository.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { FinalAccountCommandService } from "../src/final-account-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { seedWorkPractice } from "./job-work-state-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { createImportFixture, closeWorkFixture, freshIntent, type ImportFixture } from "./job-import-v3-fixtures.js";

describe("CH-5 positive invoiced import — PostgreSQL CI", () => {
  let f: ImportFixture;
  beforeAll(async () => { f = await createImportFixture(); }, 60000);
  afterAll(async () => { await closeWorkFixture(f); });
  async function prepared() {
    const { auth } = f.practice, repo = new JobImportV3Repository(f.runtime);
    const p = await repo.preview(auth.context, auth.digest, f.practice.jobId, { ...f.request, lifecyclePoint: "invoiced" });
    return { repo, auth, p, input: freshIntent(f.request.expectedBindingId, p.previewHash, "invoiced") };
  }
  it("stores v3 terms, stable scope, linked overlap and a durable zero-count exclusion; replay retains every ID", async () => {
    const { repo, auth, p, input } = await prepared();
    expect(p.availability).toEqual({ status: "available", reason: "imported_at_invoiced_stage", countedPlaces: 0 });
    const [a, b] = await Promise.all([repo.adopt(auth.context, auth.digest, f.practice.jobId, input), repo.adopt(auth.context, auth.digest, f.practice.jobId, input)]);
    expect(b).toEqual(a);
    expect(a).toMatchObject({ version: "job-import-result.v3", lifecyclePoint: "invoiced", linkedJobIds: [f.practice.jobId], lineageStrength: "builder_attested_weaker" });
    const read = await repo.read(auth.context, auth.digest, String(a.jobId));
    expect(read.result).toEqual(a); expect(read.snapshot).toEqual(p.snapshot);
    expect(read.meter).toEqual({ countedPlaces: 0, reason: "imported_at_invoiced_stage" });
    expect(read.snapshot.terms.policyVersion).toBe("reference_fee_policy_v3");
    const job = (await f.admin.query("SELECT status,fee_policy_version,recovery_cap_pence,baseline_quote_version_id,accepted_quote_version_id FROM app.job WHERE tenant_id=$1 AND id=$2", [auth.context.tenantId, a.jobId])).rows[0];
    expect(job).toEqual({ status: "invoiced", fee_policy_version: "reference_fee_policy_v3", recovery_cap_pence: null, baseline_quote_version_id: null, accepted_quote_version_id: null });
    expect((await f.admin.query("SELECT count(*)::int n FROM app.job_import_v3 WHERE tenant_id=$1 AND command_id=$2", [auth.context.tenantId, input.commandId])).rows[0].n).toBe(1);
    await expect(repo.adopt(auth.context, auth.digest, f.practice.jobId, { ...input, commandId: randomUUID() })).rejects.toMatchObject({ code: "IMPORT_ALREADY_ADOPTED" });
    // No new fee, invoice, ledger payment, quote acceptance, or customer lock was fabricated.
    for (const table of ["customer_invoice", "synthetic_obligation", "quote_acceptance", "final_account_lock", "recovery_fee_journal"])
      expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`, [auth.context.tenantId, a.jobId])).rows[0].n).toBe(0);
    await expect(new FinalAccountLockRepository(f.runtime).lock(auth.context, { jobId: String(a.jobId), actorMembershipId: auth.membershipId,
      commandId: randomUUID(), finalAccountRevisionId: String(a.baselineId), expectedRevision: 1,
      declarationVersion: "final_account_declaration.v1" })).rejects.toMatchObject({ code: "STALE_REVISION" });
    await expect(new FinalAccountCommandService(f.runtime).assemble(auth.context, { version: "final-account.assemble.v1", commandId: randomUUID(),
      actorMembershipId: auth.membershipId, jobId: a.jobId, expectedRevision: 0 })).rejects.toThrow("FROZEN_BASELINE_REQUIRED");
    await expect(withTenant(f.runtime, auth.context, db => db.$client.query("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2", [auth.context.tenantId, a.jobId]))).rejects.toThrow();
    await expect(withTenant(f.runtime, auth.context, db => db.$client.query("UPDATE app.job_import_v3 SET snapshot='{}' WHERE tenant_id=$1 AND job_id=$2", [auth.context.tenantId, a.jobId]))).rejects.toThrow("permission denied");
    const other = await seedWorkPractice(f);
    for (const [context, digest] of [[auth.context, other.auth.digest], [testTenantContext(randomUUID()), auth.digest]] as const)
      await expect(repo.read(context, digest, String(a.jobId))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await withTenant(f.runtime, testTenantContext(randomUUID()), db => db.$client.query("SELECT * FROM app.job_import_v3"))).rowCount).toBe(0);
    expect((await f.runtime.query("SELECT * FROM app.job_import_v3")).rowCount).toBe(0);
    const changed = { ...input, lifecyclePoint: "live" };
    await expect(repo.adopt(auth.context, auth.digest, f.practice.jobId, changed)).rejects.toThrow("IMPORT_INTENT_SNAPSHOT_MISMATCH");
    await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [auth.digest]);
    await expect(repo.adopt(auth.context, auth.digest, f.practice.jobId, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repo.read(auth.context, auth.digest, String(a.jobId))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("SQL writer rejects missing authorization and a forged snapshot before any import", async () => {
    const other = await seedWorkPractice(f), repo = new JobImportV3Repository(f.runtime);
    const binding = (await f.admin.query("SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2", [other.auth.context.tenantId, other.jobId])).rows[0].binding_id;
    const p = await repo.preview(other.auth.context, other.auth.digest, other.jobId, { ...f.request, expectedBindingId: binding, lifecyclePoint: "invoiced" });
    for (const snapshot of [p.snapshot, { ...p.snapshot, historyManifest: [{ evidenceId: randomUUID() }] }])
      await expect(withTenant(f.runtime, other.auth.context, db => db.$client.query("SELECT app.adopt_invoiced_job_v3($1,$2,$3,$4,$5,$6,$7)",
        [other.auth.context.tenantId, other.jobId, other.auth.digest, randomUUID(), randomUUID(), snapshot, "a".repeat(64)]))).rejects.toThrow();
  });
});
