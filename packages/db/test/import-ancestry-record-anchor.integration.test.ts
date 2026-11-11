import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendAuditBatch } from "../src/audit.js";
import { JobImportV3Repository } from "../src/job-import-v3-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { closeWorkFixture, createImportFixture, freshIntent, type ImportFixture } from "./job-import-v3-fixtures.js";
import { importWorkJob } from "./job-work-state-command-fixtures.js";
import { seedWorkPractice, workTenant } from "./job-work-state-fixtures.js";

const migration = readFileSync(new URL("../migrations/0690_import_ancestry_record_anchor.sql", import.meta.url), "utf8");
const sources = {
  guard_practice_material_requirement: "0171_evidence_proof_rework.sql",
  ch4_read_work_facts: "0523_ch4_company_workspace_read.sql",
  read_job_sources: "0164_job_sources.sql",
  ch4_require_command_owner: "0201_job_work_state_commands.sql",
  final_check_builder: "0238_final_check.sql",
  evidence_pack_v3_owner: "0306_evidence_pack_v3.sql",
  adopt_invoiced_job_v3: "0625_company_import_once.sql",
  apply_recovery_timeline_signal: "0506_recovery_timeline_store.sql",
};
const anchor = /\n    AND \(EXISTS \(SELECT 1 FROM app\.job_import_v3 iv WHERE iv\.tenant_id=([\w.]+) AND iv\.job_id=(\w+)\.id AND iv\.source_job_id=(\w+)\.id\)\n     OR EXISTS \(SELECT 1 FROM app\.command_receipt rv WHERE rv\.tenant_id=\1 AND rv\.command_type='job.adopt_in_flight' AND rv\.status='succeeded'\n      AND rv\.semantic_key='import:'\|\|\2\.id::text AND rv\.result->>'jobId'=\2\.id::text AND rv\.result->>'sourceJobId'=\3\.id::text\)\)/g;
function definition(sql: string, name: string) {
  const start = sql.search(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION app\\.${name}\\(`));
  expect(start, name).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf("$$;", start) + 3).replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
}

describe("LATER-SAFETY-109 migration source", () => {
  it("preserves all eight latest bodies statement for statement except for one import anchor each", () => {
    expect(migration.trim().startsWith("BEGIN;")).toBe(true);
    expect(migration.trim().endsWith("COMMIT;")).toBe(true);
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(8);
    expect(migration.match(anchor)).toHaveLength(8);
    expect(migration).not.toMatch(/\b(?:GRANT|ALTER FUNCTION|REVOKE)\b/);
    for (const [name, file] of Object.entries(sources)) {
      const original = readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8");
      const replacement = definition(migration, name);
      expect(replacement.match(anchor), name).toHaveLength(1);
      expect(replacement.replace(anchor, ""), name).toBe(definition(original, name));
    }
  });
});

describe("LATER-SAFETY-109 import ancestry — real PostgreSQL", () => {
  let f: ImportFixture;
  let realJob: string, wrongParentJob: string, v1Job: string, v1WrongParentJob: string;
  const forgedJob = randomUUID(), unownedJob = randomUUID(), sku = randomUUID();
  const facts = new Map<string, { caseId: string; runId: string; followUpId: string }>();
  beforeAll(async () => {
    // This fixture migrates from empty, including 0690. The positive edge is written
    // by the real product command, not by labelling a hand-written event trusted.
    f = await createImportFixture();
    const { auth } = f.practice, repo = new JobImportV3Repository(f.runtime);
    const preview = await repo.preview(auth.context, auth.digest, f.practice.jobId, { ...f.request, lifecyclePoint: "invoiced" });
    const result = await repo.adopt(auth.context, auth.digest, f.practice.jobId,
      freshIntent(f.request.expectedBindingId, preview.previewHash, "invoiced"));
    realJob = String(result.jobId);
    const other = await seedWorkPractice(f);
    const binding = (await f.admin.query("SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2",
      [auth.context.tenantId, other.jobId])).rows[0].binding_id as string;
    const otherPreview = await repo.preview(other.auth.context, other.auth.digest, other.jobId,
      { ...f.request, expectedBindingId: binding, lifecyclePoint: "invoiced" });
    wrongParentJob = String((await repo.adopt(other.auth.context, other.auth.digest, other.jobId,
      freshIntent(binding, otherPreview.previewHash, "invoiced"))).jobId);
    // v1 uses the product-shaped command receipt, without a job_import_v3 row.
    v1Job = (await importWorkJob(f, f.practice)).jobId;
    v1WrongParentJob = (await importWorkJob(f, other)).jobId;
    const receipts = (await f.admin.query(`SELECT semantic_key,result FROM app.command_receipt
      WHERE tenant_id=$1 AND command_type='job.adopt_in_flight' AND status='succeeded'
       AND result->>'jobId'=ANY($2::text[])`, [auth.context.tenantId, [v1Job, v1WrongParentJob]])).rows;
    expect(receipts).toHaveLength(2);
    expect(receipts).toContainEqual(expect.objectContaining({ semantic_key: `import:${v1Job}`,
      result: expect.objectContaining({ jobId: v1Job, sourceJobId: f.practice.jobId }) }));
    expect((await f.admin.query("SELECT count(*)::int n FROM app.job_import_v3 WHERE job_id=ANY($1::uuid[])",
      [[v1Job, v1WrongParentJob]])).rows[0].n).toBe(0);
    await workTenant(f.admin, auth.context.tenantId, async db => {
      // Owner-only synthetic fixture rows: copy a constraint-valid imported shape,
      // but deliberately create neither import records nor inherited ownership.
      await db.query("SET LOCAL session_replication_role='replica'");
      for (const id of [forgedJob, unownedJob]) {
        await db.query(`INSERT INTO app.job SELECT (jsonb_populate_record(NULL::app.job,to_jsonb(j)||jsonb_build_object('id',$1::uuid))).*
          FROM app.job j WHERE j.tenant_id=$2 AND j.id=$3`, [id, auth.context.tenantId, realJob]);
        await db.query(`INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance)
          VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')`, [auth.context.tenantId, id]);
      }
      // 1401: practice acceptance belongs to the accepting firm (this fixture's own session).
      const perFirm = (await db.query("SELECT to_regprocedure('app.final_check_job_scope(uuid,uuid)') IS NOT NULL installed")).rows[0].installed;
      await db.query(`INSERT INTO app.final_check_terms_acceptance(tenant_id,id,terms_version,accepting_membership_id,accepted_at,command_id,audit_event_id${perFirm ? ",practice_session_digest" : ""})
        VALUES($1,$2,'synthetic_final_check_terms.v1',$3,clock_timestamp(),$4,$5${perFirm ? ",$6" : ""})`,
      [auth.context.tenantId, randomUUID(), auth.membershipId, randomUUID(), randomUUID(), ...(perFirm ? [auth.digest] : [])]);
      const merchant = randomUUID();
      await db.query("INSERT INTO app.merchant(id,tenant_id,name) VALUES($1,$2,'Fictional ancestry supplier')", [merchant, auth.context.tenantId]);
      await db.query(`INSERT INTO app.merchant_sku(id,tenant_id,merchant_id,sku,description,base_unit,practice_session_digest)
        VALUES($1,$2,$3,'ANCESTRY-109','Fictional item','each',$4)`, [sku, auth.context.tenantId, merchant, auth.digest]);
      for (const job of [realJob, forgedJob, unownedJob, wrongParentJob, v1Job, v1WrongParentJob]) {
        const row = { caseId: randomUUID(), runId: randomUUID(), followUpId: randomUUID() };
        facts.set(job, row);
        await db.query(`INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,synthetic)
          VALUES($1,$2,$3,100,'GBP','identified',true)`, [row.caseId, auth.context.tenantId, job]);
        // Only the follow-up's bound identifiers are relevant to this ownership
        // boundary. Unrelated scheduling/message fixtures are owner-seeded.
        await db.query(`INSERT INTO app.recovery_follow_up(id,tenant_id,job_id,case_id,run_id,source_message_id,source_message_sequence,
          case_revision,case_event_sequence,created_tick,due_tick,due_after_ticks,fixture_version,command_id,request_hash,actor_membership_id,environment)
          VALUES($1,$2,$3,$4,$5,$6,1,1,1,0,1,1,'recovery-follow-up-fixture.v1',$7,$8,$9,'synthetic_demo')`,
        [row.followUpId, auth.context.tenantId, job, row.caseId, row.runId, randomUUID(), randomUUID(), "a".repeat(64), auth.membershipId]);
      }
    });
    // Private helpers are normally called inside definer commands. These test-only
    // wrappers preserve that execution role and the real runtime session_user.
    await f.admin.query(`CREATE FUNCTION app.later109_owner_probe(kind text,t uuid,j uuid,d text,c uuid) RETURNS text
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
       CASE kind
        WHEN 'command' THEN RETURN app.ch4_require_command_owner(t,j,d)::text;
        WHEN 'final' THEN RETURN (SELECT member_id::text FROM app.final_check_builder(t,j,d));
        WHEN 'pack' THEN RETURN app.evidence_pack_v3_owner(t,c,d)::text;
       END CASE;
       RAISE EXCEPTION 'UNKNOWN_PROBE';
      END $$;
      ALTER FUNCTION app.later109_owner_probe(text,uuid,uuid,text,uuid) OWNER TO jobguard_migration;
      REVOKE ALL ON FUNCTION app.later109_owner_probe(text,uuid,uuid,text,uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION app.later109_owner_probe(text,uuid,uuid,text,uuid) TO jobguard_runtime;
      CREATE TABLE app.later109_material_probe(tenant_id uuid,job_id uuid,sku_id uuid);
      CREATE TRIGGER ancestry_material BEFORE INSERT ON app.later109_material_probe FOR EACH ROW EXECUTE FUNCTION app.guard_practice_material_requirement();
      GRANT INSERT ON app.later109_material_probe TO jobguard_runtime;`);
    expect((await f.admin.query("SELECT count(*)::int n FROM app.job_import_v3 WHERE job_id=ANY($1::uuid[])", [[forgedJob, unownedJob]])).rows[0].n).toBe(0);
  }, 120_000);
  afterAll(async () => { await closeWorkFixture(f); });

  async function call(name: keyof typeof sources, job: string, digest = f.practice.auth.digest) {
    const { auth } = f.practice, row = facts.get(job)!;
    return withTenant(f.runtime, auth.context, async db => {
      await db.$client.query("SELECT set_config('app.practice_material_digest',$1,true)", [digest]);
      switch (name) {
        case "guard_practice_material_requirement":
          return db.$client.query("INSERT INTO app.later109_material_probe VALUES($1,$2,$3)", [auth.context.tenantId, job, sku]);
        case "ch4_read_work_facts":
          return db.$client.query("SELECT app.ch4_read_work_facts($1,$2,$3) value", [auth.context.tenantId, job, digest]);
        case "read_job_sources":
          return db.$client.query("SELECT app.read_job_sources($1,$2,$3,'diary') value", [auth.context.tenantId, job, digest]);
        case "ch4_require_command_owner":
        case "final_check_builder":
        case "evidence_pack_v3_owner": {
          const kind = name === "ch4_require_command_owner" ? "command" : name === "final_check_builder" ? "final" : "pack";
          return db.$client.query("SELECT app.later109_owner_probe($1,$2,$3,$4,$5) value", [kind, auth.context.tenantId, job, digest, row.caseId]);
        }
        case "adopt_invoiced_job_v3":
          return db.$client.query("SELECT app.adopt_invoiced_job_v3($1,$2,$3,$4,$5,$6::jsonb,$7)",
            [auth.context.tenantId, job, digest, randomUUID(), randomUUID(), { lifecyclePoint: "invoiced" }, "a".repeat(64)]);
        case "apply_recovery_timeline_signal":
          return db.$client.query("SELECT app.apply_recovery_timeline_signal($1,$2) value", [auth.context.tenantId, {
            version: "recovery-timeline-signal.v2", signalId: randomUUID(), eventId: randomUUID(), kind: "timer",
            ref: { tenantId: auth.context.tenantId, jobId: job, caseId: row.caseId, runId: row.runId, followUpId: row.followUpId },
          }]);
      }
    });
  }
  const refusals: Record<keyof typeof sources, string> = {
    guard_practice_material_requirement: "PRACTICE_MATERIAL_NOT_FOUND",
    ch4_read_work_facts: "WORK_STATE_FORBIDDEN", read_job_sources: "JOB_SOURCE_FORBIDDEN",
    ch4_require_command_owner: "WORK_STATE_FORBIDDEN", final_check_builder: "FINAL_CHECK_FORBIDDEN",
    evidence_pack_v3_owner: "NOT_FOUND", adopt_invoiced_job_v3: "FORBIDDEN",
    apply_recovery_timeline_signal: "RECOVERY_TIMELINE_FORBIDDEN",
  };
  const cases = (Object.keys(sources) as (keyof typeof sources)[]).flatMap(name =>
    (["v3", "v1"] as const).map(version => ({ name, version })));
  it.each(cases)("$name preserves $version adoption and refuses forged/unowned ancestry", async ({ name, version }) => {
    const { auth } = f.practice;
    const ownJob = version === "v3" ? realJob : v1Job;
    const strangerJob = version === "v3" ? wrongParentJob : v1WrongParentJob;
    if (name === "adopt_invoiced_job_v3") {
      // A valid lifecycle snapshot reaches the ownership and chain guards.
      await expect(call(name, ownJob)).rejects.toThrow("IMPORT_ALREADY_ADOPTED");
    } else {
      const result = await call(name, ownJob);
      expect(result.rowCount).toBe(1);
      if (name === "ch4_read_work_facts") expect(result.rows[0].value).toMatchObject({ jobId: ownJob, version: "job-work-state-read.v1" });
      if (name === "ch4_require_command_owner" || name === "final_check_builder") expect(result.rows[0].value).toBe(auth.membershipId);
      if (name === "evidence_pack_v3_owner") expect(result.rows[0].value).toBe(ownJob);
    }
    await expect(call(name, strangerJob)).rejects.toThrow(refusals[name]);
    await expect(call(name, unownedJob)).rejects.toThrow(refusals[name]);
    // app.append_audit is runtime reachable; it must not turn its caller's claim
    // into ownership. Each routine receives a fresh forged event through it.
    await withTenant(f.runtime, auth.context, db => appendAuditBatch(db, [{
      id: randomUUID(), version: "audit.v1", actorRef: `membership:${auth.membershipId}`,
      eventType: "job.imported_baseline_attested", subjectType: "job", subjectRef: forgedJob,
      payload: { references: { sourceJobId: f.practice.jobId } },
    }]));
    await expect(call(name, forgedJob)).rejects.toThrow(refusals[name]);
    // A real import record or receipt for a DIFFERENT parent cannot validate this claim.
    await withTenant(f.runtime, auth.context, db => appendAuditBatch(db, [{
      id: randomUUID(), version: "audit.v1", actorRef: `membership:${auth.membershipId}`,
      eventType: "job.imported_baseline_attested", subjectType: "job", subjectRef: strangerJob,
      payload: { references: { sourceJobId: f.practice.jobId } },
    }]));
    await expect(call(name, strangerJob)).rejects.toThrow(refusals[name]);
  });

  it.each(["receipt", "parent"] as const)("detects a removed v1 %s check (transactional scratch mutation)", async removed => {
    const { auth } = f.practice, client = await f.admin.connect();
    try {
      await client.query("BEGIN");
      const original = (await client.query("SELECT pg_get_functiondef('app.ch4_read_work_facts(uuid,uuid,text)'::regprocedure) body")).rows[0].body as string;
      const weakened = removed === "receipt"
        ? original.replace(/\n     OR EXISTS \(SELECT 1 FROM app\.command_receipt rv[^;]*?rv\.result->>'sourceJobId'=source\.id::text\)/, "")
        : original.replace(" AND rv.result->>'sourceJobId'=source.id::text", "");
      expect(weakened).not.toBe(original);
      await client.query(weakened);
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [auth.context.tenantId]);
      await client.query("SET LOCAL ROLE jobguard_runtime");
      if (removed === "receipt") {
        await expect(client.query("SELECT app.ch4_read_work_facts($1,$2,$3)",
          [auth.context.tenantId, v1Job, auth.digest])).rejects.toThrow("WORK_STATE_FORBIDDEN");
      } else {
        // The preceding cases appended an event falsely naming this session's parent.
        const leaked = await client.query("SELECT app.ch4_read_work_facts($1,$2,$3) value",
          [auth.context.tenantId, v1WrongParentJob, auth.digest]);
        expect(leaked.rows[0].value).toMatchObject({ jobId: v1WrongParentJob });
      }
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    expect((await call("ch4_read_work_facts", v1Job)).rowCount).toBe(1);
    await expect(call("ch4_read_work_facts", v1WrongParentJob)).rejects.toThrow("WORK_STATE_FORBIDDEN");
  });

  it("the forged work-state assertion detects a removed anchor (transactional scratch mutation)", async () => {
    const { auth } = f.practice, signature = "app.ch4_read_work_facts(uuid,uuid,text)";
    const client = await f.admin.connect();
    try {
      await client.query("BEGIN");
      const original = (await client.query("SELECT pg_get_functiondef($1::regprocedure) body", [signature])).rows[0].body as string;
      const weakened = original.replace(anchor, "");
      expect(weakened).not.toBe(original);
      await client.query(weakened);
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [auth.context.tenantId]);
      await client.query("SET LOCAL ROLE jobguard_runtime");
      // Confirm this is a successful unauthorized read, rather than an unrelated
      // fixture/permission error that also trips the rejection assertion.
      const leaked = await client.query("SELECT app.ch4_read_work_facts($1,$2,$3) value",
        [auth.context.tenantId, forgedJob, auth.digest]);
      expect(leaked.rows[0].value).toMatchObject({ jobId: forgedJob });
      // The same forged-case assertion above now fails because the read succeeds.
      await expect(expect(Promise.resolve(leaked)).rejects.toThrow("WORK_STATE_FORBIDDEN")).rejects.toThrow();
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    await expect(call("ch4_read_work_facts", forgedJob)).rejects.toThrow("WORK_STATE_FORBIDDEN");
  });
});
