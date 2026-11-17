import { syntheticOwnerPool } from "./pool-test-utils.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrivateVersionedStorage, StoredObject } from "@jobguard/storage";
import { generatePracticePng } from "../../../apps/api/src/proof/proof.application.js";
import { DEMO_TENANT_ID as T, DEMO_ACCOUNT_ID as A, DEMO_IDENTITY_USER_ID as U, DEMO_MEMBERSHIP_ID as M,
  FinalAccountCommandService, EvidenceService, ProofCommandService, PracticeActivationRepository,
  VariationRepository, approvePricedVariation, migrate, prepareActivationFixtureV3, withTenant } from "../src/index.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const context = testTenantContext(T), previousEnvironment = process.env.JOBGUARD_ENV;
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
const command = (jobId: string, expectedRevision: number) => ({ version: "final-account.assemble.v1", commandId: randomUUID(), actorMembershipId: M, jobId, expectedRevision });
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "audit-final-account-pg-"));
  const port = await freePort(56500, 300), password = randomUUID();
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password, persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const connection = { host: "127.0.0.1", port, database: "jobguard_synthetic_demo", user: "postgres", password };
  admin = await syntheticOwnerPool(connection);
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [T]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [U]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional audit builder')", [A, T]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [M, T, A, U]);
  // Existing role, no new grant. This checks effective runtime SQL permissions and physical locks;
  // the superuser session can assume roles, so this is not proof of a least-privilege login boundary.
  runtime = new Pool({ ...connection, options: "-c role=jobguard_runtime", max: 4 });
  expect((await runtime.query("SELECT current_user role")).rows[0].role).toBe("jobguard_runtime");
  process.env.JOBGUARD_ENV = "synthetic_demo";
}, 60000);
afterAll(async () => {
  if (previousEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previousEnvironment;
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function liveJob() {
  const jobId = await prepareActivationFixtureV3(admin, context, "Fictional audit final account", 100000, runtime);
  await new PracticeActivationRepository(runtime).start(context, jobId, { commandId: randomUUID(), scenario: "no_charge" });
  return jobId;
}
async function approveExtra(jobId: string, pence: number) {
  const variationId = randomUUID(), scopeId = randomUUID();
  await new VariationRepository(runtime).logBuilderExtra(context, { version: "log-builder-extra.v1", actorMembershipId: M,
    proposal: { version: "variation-proposal.v1", id: variationId, jobId, scopeItemId: scopeId, existingScopeItemId: null,
      lineageParentScopeItemId: null, captureKind: "text", captureText: "Fictional extra", description: "Fictional extra", suggestion: null },
    price: { quantity: "1", unit: "item", unitRatePence: pence, direction: "addition", confirmedByMembershipId: M,
      rateProvenance: { kind: "human_entered", sourceRef: "synthetic-audit", sourceHash: "a".repeat(64), rateVersion: "synthetic.v1" } },
    deviceId: null, deviceCapturedAt: null });
  await withTenant(runtime, context, async db => {
    const row = (await db.$client.query("SELECT r.* FROM app.variation v JOIN app.variation_revision r ON(r.tenant_id,r.id)=(v.tenant_id,v.current_revision_id) WHERE v.tenant_id=$1 AND v.id=$2", [T, variationId])).rows[0];
    await approvePricedVariation(db, T, variationId, { id: randomUUID(), revisionId: row.id, revision: Number(row.revision),
      contentHash: row.content_hash, signedDeltaPence: Number(row.signed_delta_pence), method: "builder_attestation",
      actorMembershipId: M, evidenceId: null, approvedAt: new Date() });
  });
}

describe("night audit final-account PostgreSQL regressions", () => {
  it("stale concurrent assembly cannot replace newer approved totals", async () => {
    const jobId = await liveJob(), service = new FinalAccountCommandService(runtime);
    await service.assemble(context, command(jobId, 0)); await approveExtra(jobId, 10000);
    const entered = deferred(), resume = deferred();
    // Pause A before its first assembly lock. B uses a separate physical connection.
    const delayed = { connect: async () => {
      const client = await runtime.connect();
      return { release: () => client.release(), query: async (sql: string, values?: unknown[]) => {
        const result = await client.query(sql, values);
        if (sql.startsWith("SELECT 1 FROM app.membership")) { entered.resolve(); await resume.promise; }
        return result;
      } };
    } } as unknown as Pool;
    const a = new FinalAccountCommandService(delayed).assemble(context, command(jobId, 1));
    await entered.promise;
    try {
      await approveExtra(jobId, 20000);
      const b = await service.assemble(context, command(jobId, 1));
      expect(b.totals.net.pence).toBe(130000);
      resume.resolve();
      await expect(a).rejects.toThrow("STALE_FINAL_ACCOUNT_REVISION");
      expect(await service.read(context, jobId)).toMatchObject({ id: b.id, revision: 2, totals: { net: { pence: 130000 } } });
    } finally { resume.resolve(); await a.catch(() => undefined); }
  });

  it("proof invalidation restores the persisted final-account gate", async () => {
    const jobId = await liveJob(), service = new FinalAccountCommandService(runtime);
    expect((await service.assemble(context, command(jobId, 0))).issueBlocked).toBe(true);
    const scopeId = (await withTenant(runtime, context, db => db.$client.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 AND state='confirmed' ORDER BY created_at,id LIMIT 1", [T, jobId]))).rows[0].id;
    await admin.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [T, jobId, scopeId]);
    const bytes = generatePracticePng(), objects = new Map<string, StoredObject>();
    const storage: PrivateVersionedStorage = {
      async createUploadUrl() { return "https://synthetic.invalid/upload"; }, async createDownloadUrl() { return "https://synthetic.invalid/download"; },
      async readExactVersion(key, version) { const found = objects.get(`${key}:${version}`); if (!found) throw new Error("missing fictional original"); return found; },
      async deleteExactVersion() { throw new Error("immutable fictional original"); },
    };
    const evidence = new EvidenceService(runtime, storage), proof = new ProofCommandService(runtime, storage);
    const upload = await evidence.beginUpload(context, { jobId, scopeItemId: scopeId, expectedSha256: createHash("sha256").update(bytes).digest("hex"),
      contentType: "image/png", maximumBytes: bytes.length, expiresAt: new Date(Date.now() + 60000) });
    objects.set(`${upload.objectKey}:synthetic-v1`, { key: upload.objectKey, versionId: "synthetic-v1", bytes, byteLength: bytes.length, contentType: "image/png" });
    const original = await evidence.finalize(context, { uploadId: upload.id, objectVersionId: "synthetic-v1", evidenceType: "electrical_certificate" });
    await proof.complete(context, { version: "proof.complete.v1", commandId: randomUUID(), actorMembershipId: M, jobId, scopeItemId: scopeId,
      stage: "electrical-stage", evidenceId: original.id, requiredEvidenceType: "electrical_certificate", decisionId: null });
    const proven = await service.assemble(context, command(jobId, 1));
    expect(proven.issueBlocked).toBe(false);
    await proof.invalidate(context, { version: "proof.invalidate.v1", commandId: randomUUID(), actorMembershipId: M, evidenceId: original.id, reasonCode: "verification_invalid" });
    const rebuilt = await service.assemble(context, command(jobId, 2));
    expect(rebuilt).toMatchObject({ revision: 3, issueBlocked: true, proof: [] });
    expect(await service.read(context, jobId)).toMatchObject({ id: rebuilt.id, revision: 3, issueBlocked: true, proof: [] });
    expect(await service.assemble(context, command(jobId, 3))).toMatchObject({ id: rebuilt.id, revision: 3, reused: true });
    expect((await admin.query("SELECT issue_blocked FROM app.final_account_revision WHERE tenant_id=$1 AND id=$2", [T, proven.id])).rows[0].issue_blocked).toBe(false);
  });
});
