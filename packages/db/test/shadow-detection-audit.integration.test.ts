import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseObservation, proposalFromObservation, shadowCaptureV1 } from "@jobguard/core";
import { ShadowDetectionRepository } from "../src/shadow-detection-repository.js";
import { migrate } from "../src/migrate.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

const tenant = randomUUID(), job = randomUUID(), at = "2026-10-01T00:00:00Z";
const baseline = "f0000000-0000-4000-8000-000000000001";
const variation = "10000000-0000-4000-8000-000000000001", variationScope = randomUUID();
const context = testTenantContext(tenant);
let postgres: EmbeddedPostgres, admin: Pool, shadow: Pool, directory: string;

describe("AUDIT-FIX-DBSRC-14 real PostgreSQL mixed capture references", () => {
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "audit-dbsrc-14-pg16-"));
    const port = await freePort(58600, 400), password = randomUUID();
    postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password,
      persistent: false, createPostgresUser: process.getuid?.() === 0,
      initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
    await postgres.initialise(); await postgres.start();
    const connection = { host: "127.0.0.1", port, database: "postgres", password };
    admin = new Pool({ ...connection, user: "postgres" });
    await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
    // Disposable cluster only; use the migrated shadow privileges without any GRANT.
    await admin.query(`ALTER ROLE jobguard_shadow LOGIN PASSWORD '${password}'`);
    shadow = new Pool({ ...connection, user: "jobguard_shadow" });
    await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
    await withTenant(admin, context, async db => {
      await db.$client.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Synthetic mixed match','live')", [job, tenant]);
      for (const id of [baseline, variationScope]) await db.$client.query(
        "INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [id, tenant, job]);
      await db.$client.query(`INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,capture_kind,capture_text,description,state)
        VALUES($1,$2,$3,$4,'text','outside tap','outside tap','draft')`, [variation, tenant, job, variationScope]);
    });
  }, 60000);
  afterAll(async () => {
    await closeTestPools(shadow, admin); await postgres?.stop();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("mixed match stores the baseline reference", async () => {
    const observation = parseObservation({
      version: "observation.v1", tenantId: tenant, jobId: job, kind: "completion_photo",
      evidence: { id: randomUUID(), objectVersionId: "synthetic-v1", sha256: "a".repeat(64), serverReceivedAt: at },
      text: "Fitted outside tap.", citations: [{ start: 0, end: 19, quote: "Fitted outside tap." }],
      facts: { workReference: randomUUID(), scopeArea: "job", description: "outside tap", status: "completed",
        estimatedValuePence: null, safetyImplication: false, customerClearlyRequested: false,
        needsPriorWrittenAgreement: false, significantWork: null, activeDispute: false,
        silenceMateriallyWorsensDispute: false, disclosureDuty: false },
    });
    const source = observation.evidence, upload = randomUUID();
    await withTenant(admin, context, async db => {
      await db.$client.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)
        VALUES($1,$2,$3,$4,$5,'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day')`,
      [upload, tenant, job, `synthetic/${upload}`, source.sha256]);
      await db.$client.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
        VALUES($1,$2,$3,$4,'original','completion_photo',$5,$6,$7,100,'image/png','standard_evidence',$8,$8)`,
      [source.id, tenant, upload, job, `synthetic/${upload}`, source.objectVersionId, source.sha256, at]);
    });
    const captures = [
      { id: variation, scopeItemId: variationScope, kind: "log_extra", state: "draft" },
      { id: baseline, scopeItemId: baseline, kind: "baseline", state: null },
    ].map(c => shadowCaptureV1.parse({ version: "shadow-capture.v1", tenantId: tenant, jobId: job,
      ...c, revisionId: c.id, serverRecordedAt: at, valuePence: null, scopeArea: "job",
      description: "outside tap", recordedPhase: "pre_lock", aiStructured: false, sourceRef: c.id }));
    const proposal = proposalFromObservation(observation, "ai_proposal", "synthetic.v1", at,
      { lock: "before_lock", adoption: "after_adoption" });
    const batch = { version: "shadow-detection-batch.v1", jobId: job,
      observations: [observation], proposals: [proposal], captures };
    const repo = new ShadowDetectionRepository(shadow);
    await expect(repo.persist(context, batch)).resolves.toHaveLength(1);
    const read = () => withTenant(shadow, context, db => db.$client.query(
      "SELECT outcome,matched_scope_item_id,matched_variation_id,revision,disclosed_before_lock FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND id=$3",
      [tenant, job, proposal.signalId]));
    const beforeReplay = (await read()).rows;
    expect(beforeReplay).toEqual([{ outcome: "already_in_original_scope", matched_scope_item_id: baseline,
      matched_variation_id: null, revision: 1, disclosed_before_lock: false }]);
    await repo.persist(context, batch);
    expect((await read()).rows).toEqual(beforeReplay);
    expect((await admin.query("SELECT id FROM app.shadow_must_surface_firing WHERE tenant_id=$1 AND job_id=$2", [tenant, job])).rows).toEqual([]);
  });
});
