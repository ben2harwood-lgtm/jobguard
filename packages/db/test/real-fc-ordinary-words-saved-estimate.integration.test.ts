// RED: real PostgreSQL and the actual worker; fictional practice material only.
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { generatePracticePng } from "../src/practice-proof-image.js";
import { JobSourceRepository } from "../src/job-source-repository.js";
import { FinalCheckCompletionRepository, practiceFinalCheckPorts } from "../src/shadow-detection-repository.js";
import { FinalCheckWorker } from "../../../apps/api/src/final-check.worker.js";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, finalCheckTenant, FINAL_CHECK_ACTOR, type FinalCheckFixture } from "./final-check-fixture.js";
import { jobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const migration = "0945_real_fc_revealed_estimate.sql";
const diary = "Customer asked for an extra heated towel rail while we were on site. Agreed 180 pounds. Fitted it today.";
const message = "Hi, yes please go ahead and fit the heated towel rail as well. 180 pounds is fine. Thanks.";
let f: FinalCheckFixture;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createFinalCheckFixture(); }, 300000);
afterAll(async () => { await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });

async function setup(note = diary, request = message, fixture = f, beforeLock?: (a: Awaited<ReturnType<typeof seedFinalCheckJob>>) => Promise<void>) {
  const a = await seedFinalCheckJob(fixture), sources = new JobSourceRepository(fixture.runtime);
  await sources.intake(a.context, a.jobId, a.digest, "diary", { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: note });
  await sources.intake(a.context, a.jobId, a.digest, "customer_message", { version: "customer-message-input.v1", commandId: randomUUID(), fictionalCustomer: { kind: "named_fictional_customer", name: "Fictional Example" }, text: request });
  const reader = new FinalCheckRepository(fixture.runtime);
  const read = () => reader.read(a.context, a.jobId, a.digest);
  expect(await read()).toEqual({ state: "unlocked", items: [] });
  if (beforeLock) await beforeLock(a);
  await a.lock();
  const repo = new FinalCheckRepository(fixture.shadow), m = await repo.begin(a.workerContext, a.jobId);
  const ports = practiceFinalCheckPorts(fixture.shadow, fixture.runtime, createHash("sha256").update(generatePracticePng()).digest("hex"));
  const execute = () => new FinalCheckWorker(ports, "synthetic_demo").execute(a.workerContext, { version: "final-check.task.v1", jobId: a.jobId, manifestId: m.id });
  const complete = async () => {
    const result = await execute() as { runId: string };
    const publication = { version: "final-check-publication.v1" as const, jobId: a.jobId, runId: result.runId, checkId: randomUUID() };
    const publisher = new FinalCheckCompletionRepository(fixture.shadow);
    await publisher.publish(a.workerContext, publication);
    await publisher.publish(a.workerContext, publication);
    expect(await execute()).toMatchObject({ runId: result.runId });
    return read();
  };
  return { ...a, reader, read, repo, m, ports, execute, complete };
}

it.each([
  [diary, message, 18000],
  [diary, "Please fit the heated towel rail as well.", 18000],
  ["Fitted the heated towel rail as an extra.", "Please fit the heated towel rail as well.", null],
  [diary, message.replace("180 pounds", "200 pounds"), null],
] as const)("ordinary words survive the authorised saved reveal with £180.00 and one finding: %s", async (note, request, estimate) => {
  const a = await setup(note, request);
  expect(await a.read()).toMatchObject({ state: "pending", items: [] });
  const view = await a.complete();
  expect(view).toMatchObject({ state: "completed", items: [{ description: "heated towel rail", estimatedValuePence: estimate, variationId: null }] });
  expect(view.items).toHaveLength(1);
  expect((view.items[0]!.evidence as unknown[])).toHaveLength(2);
  expect((view.items[0]!.evidence as { source: string }[]).map(source => source.source).sort()).toEqual(["customer_message_text", "job_diary_text"]);
  expect(await new FinalCheckRepository(f.runtime).read(a.context, a.jobId, a.digest)).toEqual(view);
});

it("the generated certificate preserves one true ceiling finding with 15000 pence and no painted-walls finding", async () => {
  const { EvidenceService } = await import("../src/evidence.js");
  const { practiceMaterialPool } = await import("../src/practice-session.js");
  const bytes = generatePracticePng("completion-photo"), hash = createHash("sha256").update(bytes).digest("hex"), version = "saved-ceiling-certificate-v1";
  const a = await setup("Painted the kitchen ceiling as an extra, customer asked for it. Estimated extra: £150", "Please paint the kitchen ceiling.", f, async job => {
    // Match the browser's distinct Paint walls baseline, not the generic kitchen fixture.
    await finalCheckTenant(f.admin, job.tenantId, async db => {
      await db.query("SET LOCAL session_replication_role='replica'");
      await db.query("UPDATE app.final_account_line SET description='Paint walls' WHERE tenant_id=$1 AND job_id=$2", [job.tenantId, job.jobId]);
    });
    const service = new EvidenceService(practiceMaterialPool(f.runtime, job.digest), {
      createUploadUrl: async () => "memory://upload", createDownloadUrl: async () => "memory://download",
      readExactVersion: async key => ({ key, versionId: version, bytes, byteLength: bytes.length, contentType: "image/png" }), deleteExactVersion: async () => undefined,
    });
    const upload = await service.beginUpload(job.context, { jobId: job.jobId, scopeItemId: job.scopeItemId, expectedSha256: hash, contentType: "image/png", maximumBytes: 10000, retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + 3600000) }, async (tx, u) => {
      await tx.$client.query("INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes) VALUES($1,$2,$3,$4,$5,$6,'synthetic_demo','image/png',$7)", [job.tenantId, u.id, job.jobId, job.scopeItemId, u.objectKey, version, bytes]);
    });
    await service.finalize(job.context, { uploadId: upload.id, objectVersionId: version, evidenceType: "electrical_certificate" });
  });
  const view = await a.complete();
  expect(view.items).toHaveLength(1);
  expect(view.items[0]).toMatchObject({ description: "kitchen ceiling", estimatedValuePence: 15000, variationId: null });
  expect(view.items[0]!.evidence).toHaveLength(2);
  expect(await a.read()).toEqual(view);
});

it.each([null, "20000"])("a historical persisted group with %s beside 18000 stays unpriced on retry", async historical => {
  const a = await setup();
  for (const source of a.m.sources) await a.ports.process(a.workerContext, a.m, source);
  const signals = (await finalCheckTenant(f.admin, a.tenantId, db => db.query("SELECT id FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 ORDER BY id", [a.tenantId, a.jobId]))).rows;
  expect(signals).toHaveLength(2);
  // Owner-only historical fixture, never a runtime write or a migration backfill.
  await finalCheckTenant(f.admin, a.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("UPDATE app.shadow_commercial_signal SET estimated_value_pence=$3 WHERE tenant_id=$1 AND job_id=$2 AND id=$4", [a.tenantId, a.jobId, historical, signals[0].id]);
  });
  const view = await a.complete();
  expect(view.items).toHaveLength(1);
  expect(view.items[0]).toMatchObject({ estimatedValuePence: null, variationId: null });
  expect(await a.read()).toEqual(view);
});

it.each([[0, 0], [1000000000000, 1000000000000], [-1, null], [1000000000001, null]] as const)("completed estimates validate the persisted range: %s", async (value, expected) => {
  const a = await setup(); await a.complete();
  const db = await f.admin.connect();
  try {
    // Rollback-only corruption probes the reader as well as the table constraint.
    await db.query("BEGIN");
    await db.query("ALTER TABLE app.shadow_commercial_signal DROP CONSTRAINT shadow_commercial_signal_estimated_value_pence_check");
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
    await db.query("UPDATE app.shadow_commercial_signal SET estimated_value_pence=$3 WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId, value]);
    await db.query("SELECT app.bind_request('practice',$1,$2)", [a.digest, a.tenantId]);
    await db.query("SELECT set_config('app.practice_material_digest',$1,true)", [a.digest]);
    await db.query("SET LOCAL ROLE jobguard_runtime");
    const view = (await db.query("SELECT app.read_final_check_reveal($1,$2,$3) result", [a.tenantId, a.jobId, a.digest])).rows[0].result;
    expect(view.state).toBe("completed"); expect(view.items).toHaveLength(1);
    expect(view.items[0].estimatedValuePence).toBe(expected);
  } finally { await db.query("ROLLBACK"); db.release(); }
  expect((await a.read()).items[0]).toMatchObject({ estimatedValuePence: 18000 });
});

it("a failed source reveals no estimate, then latest successful attempts recover without duplicate findings", async () => {
  const a = await setup();
  const broken = new FinalCheckWorker({ ...a.ports, process: async () => { throw new Error("fictional transient reader fault"); } }, "synthetic_demo");
  await expect(broken.execute(a.workerContext, { version: "final-check.task.v1", jobId: a.jobId, manifestId: a.m.id })).rejects.toThrow("FINAL_CHECK_PENDING");
  const failed = await a.read();
  expect(failed).toMatchObject({ state: "failed", items: [] });
  expect(JSON.stringify(failed)).not.toMatch(/estimatedValuePence|variationId/u);
  const history = (await f.admin.query("SELECT id,status FROM app.final_check_source_attempt WHERE manifest_id=$1 ORDER BY id", [a.m.id])).rows;
  expect(history.length).toBeGreaterThan(0); expect(history.every(row => row.status === "failed")).toBe(true);
  const view = await a.complete();
  expect(view.items).toHaveLength(1); expect(view.items[0]).toMatchObject({ estimatedValuePence: 18000, variationId: null });
  expect((await f.admin.query("SELECT id,status FROM app.final_check_source_attempt WHERE manifest_id=$1 AND id=ANY($2::uuid[]) ORDER BY id", [a.m.id, history.map(row => row.id)])).rows).toEqual(history);
});

it("confirmed catch identity reloads the same unpriced draft and rejects inconsistent origin/command bindings", async () => {
  const a = await setup(), view = await a.complete(), item = view.items[0]!;
  const command = { version: "final-check.catch.v1" as const, commandId: randomUUID(), lockId: view.lockId!, runId: view.runId!, signalId: item.signalId as string, expectedSignalRevision: item.signalRevision as number };
  const confirmed = await a.reader.confirmCatch(a.context, a.jobId, a.digest, command) as { variationId: string };
  expect(await a.reader.confirmCatch(a.context, a.jobId, a.digest, command)).toEqual(confirmed);
  expect((await a.read()).items[0]).toMatchObject({ estimatedValuePence: 18000, variationId: confirmed.variationId, disposition: "confirmed_extra" });
  const other = await setup(), otherView = await other.complete();
  const otherCatch = await other.reader.confirmCatch(other.context, other.jobId, other.digest, {
    version: "final-check.catch.v1", commandId: randomUUID(), lockId: otherView.lockId!, runId: otherView.runId!,
    signalId: otherView.items[0]!.signalId, expectedSignalRevision: otherView.items[0]!.signalRevision,
  }) as { variationId: string };
  for (const changed of [
    { sql: "UPDATE app.extra_origin SET source_signal_id=$3 WHERE tenant_id=$1 AND variation_id=$2", value: randomUUID() },
    { sql: "UPDATE app.extra_origin SET job_id=$3 WHERE tenant_id=$1 AND variation_id=$2", value: other.jobId },
    // Both practice firms share the demo tenant: free the other catch's command key inside this rolled-back transaction first.
    { pre: "UPDATE app.final_check_disposition_binding SET command_id=gen_random_uuid() WHERE tenant_id=$1 AND command_id=$2", sql: "UPDATE app.final_check_disposition_binding SET command_id=$3 WHERE tenant_id=$1 AND command_id=$2", value: otherCatch.variationId },
    { sql: "UPDATE app.command_receipt SET result=jsonb_set(result,'{variationId}',to_jsonb($3::text)) WHERE tenant_id=$1 AND command_id=$2", value: randomUUID() },
  ]) {
    const db = await f.admin.connect();
    try {
      await db.query("BEGIN"); await db.query("SET LOCAL session_replication_role='replica'");
      await db.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
      if ("pre" in changed && changed.pre) await db.query(changed.pre, [a.tenantId, changed.value]);
      await db.query(changed.sql, [a.tenantId, confirmed.variationId, changed.value]);
      await db.query("SELECT app.bind_request('practice',$1,$2)", [a.digest, a.tenantId]);
      await db.query("SELECT set_config('app.practice_material_digest',$1,true)", [a.digest]);
      const raw = (await db.query("SELECT app.read_final_check_reveal($1,$2,$3) result", [a.tenantId, a.jobId, a.digest])).rows[0].result;
      expect(raw.items[0].variationId).toBeNull();
    } finally { await db.query("ROLLBACK"); db.release(); }
  }
  expect((await new FinalCheckRepository(f.runtime).read(a.context, a.jobId, a.digest)).items[0]).toMatchObject({ variationId: confirmed.variationId });
  expect((await f.admin.query("SELECT id,state,origin,current_revision_id FROM app.variation WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows)
    .toEqual([{ id: confirmed.variationId, state: "draft", origin: "jobguard_catch", current_revision_id: null }]);
  for (const table of ["variation_revision", "variation_approval", "recovery_case", "customer_invoice"])
    expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`, [a.tenantId, a.jobId])).rows[0].n).toBe(0);
});

it("pre-lock responses stay fixed with zero or many priced hidden signals", async () => {
  const a = await seedFinalCheckJob(f), reader = new FinalCheckRepository(f.runtime);
  const read = () => reader.read(a.context, a.jobId, a.digest);
  expect(await read()).toEqual({ state: "unlocked", items: [] });
  await finalCheckTenant(f.admin, a.tenantId, async db => {
    for (const value of [null, 0, 18000, 1000000000000])
      await db.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,estimated_value_pence,confidence_band) VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),'Hidden fictional work',$5,'low')", [a.tenantId, a.jobId, randomUUID(), randomUUID(), value]);
  });
  expect(await read()).toEqual({ state: "unlocked", items: [] });
});

it("wrong job/tenant, revoked session and invalidated evidence disclose no saved estimate or catch identity", async () => {
  const a = await setup(); await a.complete();
  const other = await seedFinalCheckJob(f);
  await expect(a.reader.read(other.context, a.jobId, other.digest)).rejects.toBeDefined();
  await expect(a.reader.read(testTenantContext(randomUUID()), a.jobId, a.digest)).rejects.toBeDefined();
  await finalCheckTenant(f.admin, a.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')", [randomUUID(), a.tenantId, a.m.sources[0]!.evidenceId, FINAL_CHECK_ACTOR]);
  });
  expect(await a.read()).toMatchObject({ state: "failed", items: [] });
  await a.reader.requestRun(a.context, a.jobId, a.digest);
  const pending = await a.read();
  expect(["pending", "failed"]).toContain(pending.state); expect(pending.items).toEqual([]);
  await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [a.digest]);
  await expect(a.read()).rejects.toBeDefined();
});

it("fresh install and repeat migration pin the exact successor with unchanged security metadata", async () => {
  const sql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
  const catalog = async () => (await f.admin.query("SELECT pg_get_functiondef(oid) definition,proowner,proacl,prosecdef,proconfig FROM pg_proc WHERE oid='app.read_final_check_reveal(uuid,uuid,text)'::regprocedure")).rows[0];
  const before = await catalog(); await f.admin.query(sql); expect(await catalog()).toEqual(before);
  const proof = JSON.parse(await readFile(new URL(`./migration-proofs/${migration.replace('.sql', '.proof.json')}`, import.meta.url), "utf8"));
  expect(createHash("sha256").update(before.definition).digest("hex")).toBe(proof.lp0[0].after.definitionSha256);
  expect(before).toMatchObject({ prosecdef: true, proconfig: ["search_path=pg_catalog, app"] });
});

it("populated immediate-predecessor upgrade changes only the reveal body, refuses drift and retains retry/failure history", async () => {
  const db = await jobDoorsDatabase(true, migration);
  let shadow: Pool | undefined;
  try {
    await installLegacySyntheticPartyFixtures(db.owner);
    const ddl = await db.owner.query("SELECT format('CREATE ROLE saved_estimate_shadow LOGIN INHERIT IN ROLE jobguard_shadow PASSWORD %L',$1::text) ddl", [db.owner.options.password]);
    await db.owner.query(ddl.rows[0].ddl);
    // pg-pool keeps the password non-enumerable, so pass it explicitly as other suites do.
    shadow = new Pool({ ...db.owner.options, password: db.owner.options.password, user: "saved_estimate_shadow" });
    const fixture = { ...f, admin: db.owner, runtime: db.runtime, shadow };
    const a = await setup(diary, message, fixture); await a.complete();
    const tables = ["shadow_commercial_signal", "final_check_manifest", "final_check_source_attempt", "final_check_run_binding", "shadow_final_check_completion"];
    const rows = async () => Promise.all(tables.map(async table => (await db.owner.query(`SELECT to_jsonb(r) data FROM app.${table} r ORDER BY to_jsonb(r)::text`)).rows));
    const history = await rows();
    const requests = (await db.owner.query("SELECT to_jsonb(r) data FROM infrastructure.final_check_request r ORDER BY job_id,attempt")).rows;
    const catalog = async () => (await db.owner.query("SELECT p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','infrastructure','identity') AND p.prokind='f' ORDER BY p.oid")).rows;
    const before = await catalog(), sql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
    await db.owner.query(sql); await db.owner.query(sql);
    expect(await rows()).toEqual(history);
    expect((await db.owner.query("SELECT to_jsonb(r) data FROM infrastructure.final_check_request r ORDER BY job_id,attempt")).rows).toEqual(requests);
    const after = await catalog(); expect(after).toHaveLength(before.length);
    for (let i = 0; i < before.length; i++) {
      if (before[i].definition.startsWith("CREATE OR REPLACE FUNCTION app.read_final_check_reveal(")) {
        expect({ ...after[i], definition: before[i].definition }).toEqual(before[i]);
        expect(after[i].definition.split("$function$")[1]).toBe(sql.split("AS $$")[1]!.split("$$;")[0]);
      } else expect(after[i]).toEqual(before[i]);
    }
    expect((await a.read()).items[0]).toMatchObject({ estimatedValuePence: 18000, variationId: null });
    const original = after.find(row => row.definition.startsWith("CREATE OR REPLACE FUNCTION app.read_final_check_reveal("))!.definition;
    const client = await db.owner.connect();
    try {
      await client.query(original.replace("Fixed pre-lock branch", "Unexpected pre-lock branch"));
      await expect(client.query(sql)).rejects.toThrow("SAVED_ESTIMATE_UNEXPECTED_PREDECESSOR");
    } finally { await client.query("ROLLBACK"); await client.query(original); client.release(); }
  } finally { await shadow?.end(); await db.close(); }
}, 300000);
