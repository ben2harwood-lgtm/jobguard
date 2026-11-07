// Synthetic PostgreSQL authorization regression; no providers or customer data.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS } from "../src/migrate.js";
import {
  createIntegrityFixture, importIntegrityJob, member, seedIntegrityJob, tenant, transaction,
  type IntegrityFixture,
} from "./commercial-integrity-v3-fixtures.js";

const migration = new URL("../migrations/0955_recovery_timeline_import_anchor.sql", import.meta.url);
const sql = readFileSync(migration, "utf8");
const reference = readFileSync(new URL("../migrations/0660_baseline_ancestry_audit_trust.sql", import.meta.url), "utf8");
// Copy the reviewed predicate, changing only the local tenant/child/parent aliases.
const anchor = reference.match(/ AND \(EXISTS\(SELECT 1 FROM app\.job_import_v3[^\n]+/)![0]
  .replaceAll("iv.tenant_id=t", "iv.tenant_id=p_tenant")
  .replaceAll("rv.tenant_id=t", "rv.tenant_id=p_tenant")
  .replaceAll("child.id", "j.id").replaceAll("parent.id", "source.id");
const forbidden = { code: "42501", message: "RECOVERY_TIMELINE_FORBIDDEN" };

it("copies the prior routine and privileges with only the reviewed import anchor added", () => {
  const pattern = /CREATE (?:OR REPLACE )?FUNCTION app\.apply_recovery_timeline_signal\([\s\S]*?GRANT EXECUTE ON FUNCTION app\.apply_recovery_timeline_signal\(uuid,jsonb\) TO jobguard_runtime;/g;
  const previous = MIGRATION_URLS.filter(url => url.pathname < migration.pathname)
    .flatMap(url => [...readFileSync(url, "utf8").matchAll(pattern)].map(match => match[0]));
  expect(previous).toHaveLength(1);
  expect(sql.split(anchor)).toHaveLength(2);
  expect(sql).toBe(`BEGIN;\n${previous[0]!.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION").replace(
    "       AND j.provenance='imported' AND j.practice_session_digest IS NULL",
    "       AND j.provenance='imported' AND j.practice_session_digest IS NULL" + anchor,
  )}\nCOMMIT;\n`);
});

describe("recovery timeline import authority (real PostgreSQL)", () => {
  let f: IntegrityFixture;
  // The existing fixture applies every migration, including this forward fix,
  // to a fresh synthetic database and uses a non-owner runtime login.
  beforeAll(async () => { f = await createIntegrityFixture(); }, 300_000);
  afterAll(async () => { await f?.close(); });

  async function followUp(jobId: string) {
    const ref = { tenantId: tenant, jobId, caseId: randomUUID(), runId: randomUUID(), followUpId: randomUUID() };
    await transaction(f.admin, async db => {
      // Owner-only input fixture for the timeline boundary. Use the immutable
      // intent shape from recovery-follow-up.integration.test.ts. Scheduling,
      // messages and clock behavior remain covered there with unchanged tests;
      // this isolated fixture does not claim to exercise their command paths.
      await db.query("SET LOCAL session_replication_role='replica'");
      await db.query(`INSERT INTO app.recovery_follow_up(id,tenant_id,job_id,case_id,run_id,source_message_id,
        source_message_sequence,case_revision,case_event_sequence,created_tick,due_tick,due_after_ticks,
        fixture_version,command_id,request_hash,actor_membership_id,environment)
        VALUES($1,$2,$3,$4,$5,$6,1,2,1,0,1,1,'recovery-follow-up-fixture.v1',$7,$8,$9,'synthetic_demo')`,
      [ref.followUpId, tenant, jobId, ref.caseId, ref.runId, randomUUID(), randomUUID(), "a".repeat(64), member]);
      await db.query("SET LOCAL session_replication_role='origin'");
    });
    return { version: "recovery-timeline-signal.v2", signalId: randomUUID(), eventId: randomUUID(), kind: "timer", ref };
  }
  type Signal = Awaited<ReturnType<typeof followUp>>;
  async function apply(signal: Signal, digest = f.auth.digest, contextTenant = tenant, targetTenant = tenant) {
    return transaction(f.runtime, async db => {
      await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true)", [contextTenant, digest]);
      return db.query("SELECT app.apply_recovery_timeline_signal($1,$2) state", [targetTenant, JSON.stringify(signal)]);
    });
  }
  async function history(signal: Signal) {
    const run = await f.admin.query("SELECT * FROM app.recovery_timeline_run WHERE tenant_id=$1 AND follow_up_id=$2", [tenant, signal.ref.followUpId]);
    const signals = await f.admin.query("SELECT * FROM app.recovery_timeline_signal WHERE tenant_id=$1 AND follow_up_id=$2", [tenant, signal.ref.followUpId]);
    return { runs: run.rows, signals: signals.rows };
  }
  async function forged() {
    const a = await seedIntegrityJob(f, false);
    const bFixture = { ...f, auth: f.other };
    const b = await seedIntegrityJob(bFixture, false);
    // A real import belonging to B, with its genuine anchor pointing at B.
    // Forging another parent must not hijack even an already anchored child.
    const child = await importIntegrityJob(bFixture, b.job);
    const signal = await followUp(child);
    const event = { id: randomUUID(), version: "audit.v1", actorRef: `membership:${member}`,
      eventType: "job.imported_baseline_attested", subjectType: "job", subjectRef: child,
      payload: { references: { sourceJobId: a.job } } };
    const appended = await transaction(f.runtime, db => db.query("SELECT * FROM app.append_audit($1)", [JSON.stringify([event])]));
    expect(appended.rows[0].payload.references.auditTrust).toBe("lower_trust");
    return signal;
  }

  it("records signals for A's own job and a genuine lower-trust import through the adoption path", async () => {
    const root = await seedIntegrityJob(f, false);
    const child = await importIntegrityJob(f, root.job);
    const events = await f.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='job.imported_baseline_attested'", [tenant, child]);
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0].payload.references.auditTrust).toBe("lower_trust");
    for (const job of [root.job, child]) {
      const signal = await followUp(job);
      expect((await apply(signal)).rows[0].state).toBe("waiting");
      expect(await history(signal)).toMatchObject({ runs: [{ job_id: job }], signals: [{ signal_id: signal.signalId }] });
    }
  });

  it("refuses B's imported job linked to A only by a runtime-appended audit event, writing no history", async () => {
    const signal = await forged();
    expect(await history(signal)).toEqual({ runs: [], signals: [] });
    await expect(apply(signal)).rejects.toMatchObject(forbidden);
    expect(await history(signal)).toEqual({ runs: [], signals: [] });
    // B's unchanged genuine ownership still works after A's rejected attempt.
    expect((await apply(signal, f.other.digest)).rows[0].state).toBe("waiting");
  });

  it("refuses another tenant with 42501 and leaves no history", async () => {
    const signal = await followUp((await seedIntegrityJob(f, false)).job);
    const otherTenant = randomUUID();
    await expect(apply(signal, f.auth.digest, otherTenant)).rejects.toMatchObject(forbidden);
    await expect(apply(signal, f.auth.digest, otherTenant, otherTenant)).rejects.toMatchObject({ code: "42501" });
    expect(await history(signal)).toEqual({ runs: [], signals: [] });
  });

  it("kills a scratch mutation removing the anchor, restoring the routine and history by rollback", async () => {
    const signal = await forged();
    await expect(apply(signal)).rejects.toMatchObject(forbidden);
    const db = await f.admin.connect();
    try {
      await db.query("BEGIN");
      const definition = (await db.query("SELECT pg_get_functiondef('app.apply_recovery_timeline_signal(uuid,jsonb)'::regprocedure) body")).rows[0].body as string;
      expect(definition.split(anchor)).toHaveLength(2);
      await db.query(definition.replace(anchor, ""));
      await db.query(`SET LOCAL ROLE ${f.login}`);
      await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true)", [tenant, f.auth.digest]);
      const granted = await db.query("SELECT app.apply_recovery_timeline_signal($1,$2) state", [tenant, JSON.stringify(signal)]);
      expect(granted.rows[0].state).toBe("waiting");
      // The same forged-case rejection assertion must fail without the anchor.
      await expect(expect(Promise.resolve(granted)).rejects.toMatchObject(forbidden)).rejects.toThrow();
      expect((await db.query("SELECT signal_id FROM app.recovery_timeline_signal WHERE tenant_id=$1 AND signal_id=$2", [tenant, signal.signalId])).rows).toHaveLength(1);
    } finally { await db.query("ROLLBACK"); db.release(); }
    expect(await history(signal)).toEqual({ runs: [], signals: [] });
    await expect(apply(signal)).rejects.toMatchObject(forbidden);
  });
});
