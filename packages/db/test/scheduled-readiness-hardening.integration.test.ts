import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, type FinalCheckFixture } from "./final-check-fixture.js";
import { rolledBack } from "./upgrade-proof-utils.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const tables = ["scheduled_readiness_plan", "scheduled_readiness_proposal"] as const;
const migration = new URL("../migrations/0629_scheduled_readiness_hardening.sql", import.meta.url);
it("declares missing-context-safe policies and immutable row/table guards for both stores", () => {
  const sql = readFileSync(migration, "utf8");
  for (const table of tables) {
    expect(sql).toContain(`DROP POLICY tenant_isolation ON app.${table}`);
    expect(sql).toContain(`CREATE POLICY tenant_isolation ON app.${table}`);
    expect(sql).toContain(`CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON app.${table}`);
    expect(sql).toContain(`CREATE TRIGGER immutable_table BEFORE TRUNCATE ON app.${table}`);
  }
  expect(sql.match(/nullif\(current_setting\('app.tenant_id',true\),''\)::uuid/g)).toHaveLength(4);
});

describe("scheduled readiness immutable history on PostgreSQL", () => {
  let f: FinalCheckFixture;
  let job: Awaited<ReturnType<typeof seedFinalCheckJob>>;
  let before: unknown[];
  const taskId = randomUUID(), planHash = "a".repeat(64), proposalKey = "b".repeat(64);
  beforeAll(async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    f = await createFinalCheckFixture(); job = await seedFinalCheckJob(f); await job.lock();
    const audit = (await f.admin.query("SELECT id FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence DESC LIMIT 1", [job.tenantId])).rows[0].id;
    const scope = { tenantId: job.tenantId, jobId: job.jobId, taskId };
    await withTenant(f.runtime, job.context, async db => {
      await db.$client.query(`INSERT INTO app.scheduled_readiness_plan
        (tenant_id,job_id,task_id,fact_revision,plan_hash,payload,audit_event_id) VALUES($1,$2,$3,1,$4,$5,$6)`,
      [job.tenantId, job.jobId, taskId, planHash, { version: "readiness-scheduled-plan.v1", synthetic: true,
        scope, factRevision: 1, status: "confirmed" }, audit]);
      await db.$client.query(`INSERT INTO app.scheduled_readiness_proposal
        (tenant_id,job_id,task_id,proposal_key,plan_hash,payload,audit_event_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [job.tenantId, job.jobId, taskId, proposalKey, planHash, { version: "readiness-prevention-proposal.v1",
        scope, key: proposalKey, planHash, classification: "prevention", status: "proposal",
        feeEligible: false, programmeChanged: false, recoveryFeePence: 0 }, audit]);
    });
    before = await snapshot();
  }, 120_000);
  afterAll(async () => { try { await closeFinalCheckFixture(f); } finally { vi.unstubAllEnvs(); } });
  async function snapshot() {
    return Promise.all(tables.map(async table => (await f.admin.query(`SELECT to_jsonb(r) row FROM app.${table} r ORDER BY tenant_id,job_id,task_id`)).rows));
  }
  it("returns no rows without context, after a pooled context reset, or for another tenant", async () => {
    for (const table of tables) {
      expect((await f.runtime.query(`SELECT * FROM app.${table}`)).rows).toEqual([]);
      expect((await withTenant(f.runtime, job.context, db => db.$client.query(`SELECT * FROM app.${table}`))).rows).toHaveLength(1);
      expect((await withTenant(f.runtime, testTenantContext(randomUUID()), db => db.$client.query(`SELECT * FROM app.${table}`))).rows).toEqual([]);
      await rolledBack(f.runtime, async db => {
        await db.query("SELECT set_config('app.tenant_id','',true)");
        expect((await db.query(`SELECT * FROM app.${table}`)).rows).toEqual([]);
      });
    }
  });
  it("refuses owner and administrator rewrites, deletes and truncates without changing history", async () => {
    for (const table of tables) for (const role of ["jobguard_migration", null]) {
      for (const sql of [`UPDATE app.${table} SET payload=payload`, `DELETE FROM app.${table}`, `TRUNCATE app.${table} CASCADE`]) {
        await expect(rolledBack(f.admin, async db => {
          if (role) await db.query(`SET LOCAL ROLE ${role}`);
          await db.query("SELECT set_config('app.tenant_id',$1,true)", [job.tenantId]);
          await db.query(sql);
        })).rejects.toMatchObject({ code: "55000", message: "SCHEDULED_READINESS_IMMUTABLE" });
        expect(await snapshot()).toEqual(before);
      }
    }
  });
  it("keeps runtime grants restricted to reads and appends", async () => {
    for (const table of tables) {
      for (const privilege of ["UPDATE", "DELETE", "TRUNCATE", "TRIGGER"]) {
        expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,$2) allowed", [`app.${table}`, privilege])).rows[0].allowed).toBe(false);
      }
      for (const sql of [`UPDATE app.${table} SET payload=payload`, `DELETE FROM app.${table}`, `TRUNCATE app.${table} CASCADE`]) {
        await expect(withTenant(f.runtime, job.context, db => db.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
      }
    }
    expect(await snapshot()).toEqual(before);
  });
});
