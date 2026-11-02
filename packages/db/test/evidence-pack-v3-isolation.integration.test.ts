import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { prepareEvidencePackV3Sources, withEvidencePackV3Snapshot } from "../src/evidence-pack-v3-sources.js";
import { asFixtureTenant } from "./recovery-attribution-fixture.js";
import { createEvidencePackV3Fixture, closeEvidencePackV3Fixture, readOrdinary, recordingPool, type V3Fixture } from "./evidence-pack-v3-fixture.js";
let f: V3Fixture;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createEvidencePackV3Fixture(); }, 90_000);
afterAll(async () => { if (f) await closeEvidencePackV3Fixture(f); vi.unstubAllEnvs(); });
it("establishes read-only repeatable-read before tenant setup in PostgreSQL", async () => {
  const statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
  await withEvidencePackV3Snapshot(recordingPool(f.runtime, statements), f.auth.context, async tx => {
    expect((await tx.$client.query("SHOW transaction_isolation")).rows[0].transaction_isolation).toBe("repeatable read");
    expect((await tx.$client.query("SHOW transaction_read_only")).rows[0].transaction_read_only).toBe("on");
    expect((await tx.$client.query("SELECT current_setting('app.tenant_id') tenant_id")).rows[0].tenant_id).toBe(f.source.tenantId);
  });
  expect(statements.slice(0, 2)).toEqual([
    { sql: "BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY", values: undefined },
    { sql: "SELECT set_config('app.tenant_id', $1, true)", values: [f.source.tenantId] },
  ]);
  expect(statements.at(-1)?.sql).toBe("COMMIT");
});

it("SB-02 activation: completed pre-lock artifacts, source revision and runtime statement shape stay identical with zero/many hidden signals", async () => {
  const { EvidencePackV3Repository, EvidencePackV3WorkerRepository } = await import("../src/evidence-pack-v3-repository.js");
  const { FinalAccountLockRepository } = await import("../src/final-account-lock-repository.js");
  const { executeEvidencePackV3 } = await import("../../../apps/api/src/evidence-pack-v3.worker.js");
  const { ShadowObservationReader, FixtureObservationSources } = await import("../src/shadow-observation-reader.js");
  const { ShadowDetectionRepository } = await import("../src/shadow-detection-repository.js");
  const { detectShadowObservations } = await import("@jobguard/core");
  await new FinalAccountLockRepository(f.runtime).acceptTerms(f.auth.context, { actorMembershipId: f.auth.membershipId, commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
  // Must-surface reads require a live, session-scoped small-builder job. The
  // ordinary pack fixture above has already reached invoiced, so create a live
  // job through the existing quote/activation writers rather than alter its state.
  const { prepareActivationFixtureV3 } = await import("../src/demo-seed.js");
  const { PracticeActivationRepository } = await import("../src/activation-repository.js");
  const { practiceMaterialPool } = await import("../src/practice-session.js");
  const { RecoveryCaseRepository } = await import("../src/recovery-case-repository.js");
  const { recoverySourceCatalogueV1 } = await import("@jobguard/core");
  const scoped = practiceMaterialPool(f.runtime, f.auth.digest);
  const jobId = await prepareActivationFixtureV3(f.admin, f.auth.context, "CH8 pre-lock isolation", 100000, scoped, 100000, f.auth.digest);
  await new PracticeActivationRepository(scoped).start(f.auth.context, jobId, { commandId: randomUUID(), scenario: "no_charge" });
  const opened = await new RecoveryCaseRepository(scoped).command(f.auth.context, jobId, {
    version: "recovery-case-command.v1", action: "open", commandId: randomUUID(),
    caseType: "merchant_overcharge", claimedNetPence: 32000, counterparty: "Fictional supplier",
    book: "supplier_cost", sourceType: "supplier_documents",
    sourceRefs: [recoverySourceCatalogueV1.supplier_documents[0]!.ref], expectedRevision: 0,
  }, { membershipId: f.auth.membershipId, identityUserId: f.auth.identityUserId });
  const caseId = opened.id;
  const statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const runtime = new EvidencePackV3Repository(recordingPool(f.runtime, statements)), worker = new EvidencePackV3WorkerRepository(f.shadow);
  const reader = new ShadowObservationReader(scoped, new FixtureObservationSources([])), detector = new ShadowDetectionRepository(f.shadow);
  const run = async () => {
    statements.length = 0;
    const before = await runtime.read(f.auth.context, caseId, f.auth.digest), commandId = randomUUID();
    await runtime.request(f.auth.context, caseId, f.auth.digest, { version: "evidence-pack-command.v3", commandId, format: "TEXT", expectedVisibleSourceRevision: before.visibleSourceRevision });
    await executeEvidencePackV3(f.auth.context, { version: "evidence-pack-task.v3", tenantId: f.source.tenantId, commandId }, worker, async jobId => {
      const { observations, captures } = await reader.read(f.auth.context, { version: "shadow-observation-read.v1", jobId });
      await detector.persist(f.auth.context, { version: "shadow-detection-batch.v1", jobId, observations, captures, proposals: detectShadowObservations(observations, captures, new Date().toISOString()) });
    }, "synthetic_demo");
    const pack = (await runtime.read(f.auth.context, caseId, f.auth.digest)).packs.find(p => p.id === commandId)!;
    expect(pack.manifest.lifecycle).toEqual({ state: "pre_lock" });
    expect(pack.manifest.sections).toEqual([]);
    expect(pack.sources.every(s => s.kind === "ordinary")).toBe(true);
    return { bytes: pack.artifactText, revision: before.visibleSourceRevision, sql: statements.map(s => s.sql) };
  };
  const zero = await run();
  await asFixtureTenant(f.shadow, f.source.tenantId, async db => {
    for (let n = 0; n < 100; n++) await db.query(`INSERT INTO app.shadow_commercial_signal
      (tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
      VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:SB02',clock_timestamp(),'Hidden fixture','low','held_for_final_check')`, [f.source.tenantId, jobId, randomUUID()]);
  });
  expect(await run()).toEqual(zero);
  // At activation, an ordinary read/material fetch must not wait on hidden-table
  // locks. The negative control proves the lock is effective; this is not a
  // claim of identical HTTP latency. Must-surface detection is intentionally separate.
  const ordinaryMaterial = await asFixtureTenant(f.admin, f.source.tenantId, async db =>
    (await db.query("SELECT app.evidence_pack_v3_material($1,$2,true) material", [f.source.tenantId, caseId])).rows[0].material);
  const blocker = await f.admin.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query("LOCK TABLE app.shadow_commercial_signal, app.final_check_run_binding, app.recovery_attribution_revision IN ACCESS EXCLUSIVE MODE");
    await expect(asFixtureTenant(f.admin, f.source.tenantId, async db => {
      await db.query("SET LOCAL lock_timeout='500ms'");
      await db.query("SELECT count(*) FROM app.shadow_commercial_signal");
    })).rejects.toMatchObject({ code: "55P03" });
    await asFixtureTenant(f.admin, f.source.tenantId, async db => {
      await db.query("SET LOCAL lock_timeout='500ms'");
      const result = await db.query(`SELECT app.read_evidence_pack_v3($1,$2,$3) view,
        app.evidence_pack_v3_material($1,$2,true) material`, [f.source.tenantId, caseId, f.auth.digest]);
      expect(result.rows[0].view.visibleSourceRevision).toBe(zero.revision);
      expect(result.rows[0].material).toEqual(ordinaryMaterial);
    });
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  // Structural timing check: the public read/request and ordinary material branch
  // never query a hidden relation. Wall-clock equality is not inferred from a stopwatch.
  const definitions = (await f.admin.query(`SELECT proname,pg_get_functiondef(oid) body FROM pg_proc WHERE pronamespace='app'::regnamespace
    AND proname IN('read_evidence_pack_v3','request_evidence_pack_v3','evidence_pack_v3_ordinary','evidence_pack_v3_material',
      'prepare_evidence_pack_v3','complete_evidence_pack_v3_check','finish_evidence_pack_v3','evidence_pack_v3_owner')`)).rows;
  expect(definitions).toHaveLength(8);
  for (const def of definitions) {
    const ordinaryBody = def.proname === "evidence_pack_v3_material" ? def.body.split("SELECT b0.*")[0] : def.body;
    if (def.proname === "evidence_pack_v3_material") {
      expect(def.body).toContain("SELECT b0.*");
      expect(ordinaryBody).toContain("IF NOT FOUND OR ordinary_only THEN RETURN");
      expect(ordinaryBody).not.toContain("b app.final_check_run_binding");
    }
    expect(ordinaryBody).not.toMatch(/app\.(?:shadow_|final_check_run_binding|recovery_attribution_revision)/u);
  }
});

it("ordinary-source bytes and held-request SQL are identical before/after ordinary hidden signals", async () => {
  // This proves this bounded source path only: no v3 artifact, real worker receipt,
  // HTTP timing, server nested-query log or twin-world browser claim is made.
  const requestId = randomUUID(), statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const pool = recordingPool(f.runtime, statements);
  const held = async () => {
    statements.length = 0;
    const result = await prepareEvidencePackV3Sources(pool, f.source.sessionToken, f.caseId, requestId)
      .then(() => { throw new Error("unexpected success"); }, error => ({ code: error.code, message: error.message }));
    expect(result).toEqual({ code: "EVIDENCE_PACK_V3_DEPENDENCY_HELD", message: "EVIDENCE_PACK_V3_DEPENDENCY_HELD" });
    expect(statements.length).toBeGreaterThan(0);
    expect(statements.map(s => s.sql).join("\n")).not.toMatch(/app\.(?:shadow|recovery_attribution)|reveal_shadow|break_glass/u);
    return { bytes: JSON.stringify(result), statements: structuredClone(statements) };
  };
  const beforeHidden = (await f.admin.query("SELECT count(*)::int n FROM app.shadow_commercial_signal WHERE job_id=$1", [f.source.jobId])).rows[0].n;
  const zeroSources = JSON.stringify(await readOrdinary(f)), zero = await held();
  await asFixtureTenant(f.shadow, f.source.tenantId, async db => {
    for (let n = 0; n < 25; n++) await db.query(`INSERT INTO app.shadow_commercial_signal
      (tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
      VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:CH8-V',clock_timestamp(),'Fictional held extra','low','held_for_final_check')`,
    [f.source.tenantId, f.source.jobId, randomUUID()]);
  });
  expect((await f.admin.query("SELECT count(*)::int n FROM app.shadow_commercial_signal WHERE job_id=$1", [f.source.jobId])).rows[0].n).toBe(beforeHidden + 25);
  expect(JSON.stringify(await readOrdinary(f))).toBe(zeroSources);
  expect(await held()).toEqual(zero);
});
it("no worker or builder path can use the source preparation to write an artifact", async () => {
  await expect(prepareEvidencePackV3Sources(f.runtime, f.source.sessionToken, f.caseId, randomUUID())).rejects.toThrow("EVIDENCE_PACK_V3_DEPENDENCY_HELD");
  const rows = await f.admin.query("SELECT count(*)::int n FROM app.evidence_pack_revision WHERE case_id=$1", [f.caseId]);
  expect(rows.rows[0].n).toBe(0);
});
