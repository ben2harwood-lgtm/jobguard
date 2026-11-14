import { bindTestClient } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jobDoorsActor, jobDoorsDatabase, transaction, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(true); }, 300_000);
afterAll(async () => { await db?.close(); });

async function fixture() {
  const actor = await jobDoorsActor(db.owner), jobA = randomUUID(), jobB = randomUUID();
  // Historical v1 activation setup follows recovery-legacy-later's owner fixture.
  // Only made-up records bypass current activation triggers; calls below use runtime.
  await transaction(db.owner, actor.tenant, async client => {
    await client.query("SET LOCAL session_replication_role=replica");
    for (const job of [jobA, jobB]) {
      await client.query("INSERT INTO app.job(id,tenant_id,title,status,revision) VALUES($1,$2,'Fictional recovery replay','live',1)", [job, actor.tenant]);
      await client.query(`INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,
        accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at)
        VALUES($1,$2,$3,$4,1,$5,'synthetic_demo','synthetic_demo_illustrative.v1','reference_fee_policy_v1',$6,now())`,
      [randomUUID(), actor.tenant, job, randomUUID(), "a".repeat(64), actor.member]);
    }
  });
  members.set(actor.tenant, actor.member);
  return { ...actor, jobA, jobB, command: randomUUID() };
}

// LP-6d: each selection is the tenant's fixture member's own bound request (its persisted fixture credential).
const members = new Map<string, string>();
function select(tenant: string, job: string, command: string, scenario = "manual_receipt") {
  return transaction(db.runtime, tenant, async client => {
    await bindTestClient(db.owner, client, tenant, members.get(tenant)!);
    return (await client.query("SELECT app.configure_recovery_demo($1,$2,$3) id", [job, command, scenario])).rows[0]!.id;
  });
}

async function selections(tenant: string) {
  return (await transaction(db.runtime, tenant, client => client.query(
    "SELECT * FROM app.recovery_demo_selection WHERE tenant_id=$1 ORDER BY job_id", [tenant],
  ))).rows;
}

describe("LATER-SAFETY-122 recovery demo command replay", () => {
  it("returns the same id and preserves one selection for an identical replay", async () => {
    const f = await fixture();
    expect(await select(f.tenant, f.jobA, f.command)).toBe(f.command);
    const before = await selections(f.tenant);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ job_id: f.jobA, command_id: f.command, scenario: "manual_receipt" });
    expect(await select(f.tenant, f.jobA, f.command)).toBe(f.command);
    expect(await selections(f.tenant)).toEqual(before);
  });

  it("refuses reuse for another job belonging to the same owner without selecting job B", async () => {
    const f = await fixture();
    await select(f.tenant, f.jobA, f.command);
    const before = await selections(f.tenant);
    await expect(select(f.tenant, f.jobB, f.command)).rejects.toMatchObject({ code: "23505" });
    expect(await selections(f.tenant)).toEqual(before);
    expect((await selections(f.tenant)).filter(row => row.job_id === f.jobB)).toEqual([]);
  });

  it("refuses reuse for a different scenario on the same job without changing its selection", async () => {
    const f = await fixture();
    await select(f.tenant, f.jobA, f.command);
    const before = await selections(f.tenant);
    await expect(select(f.tenant, f.jobA, f.command, "eligible")).rejects.toMatchObject({ code: "23505" });
    expect(await selections(f.tenant)).toEqual(before);
  });

  it("reproduces silent cross-job success with the old replay line and rolls back the scratch definition", async () => {
    const f = await fixture();
    await select(f.tenant, f.jobA, f.command);
    const before = await selections(f.tenant);
    const source = await readFile(new URL("../migrations/0356_unchecked_job_doors.sql", import.meta.url), "utf8");
    const oldRoutine = "CREATE OR REPLACE FUNCTION app.configure_recovery_demo"
      + source.split("CREATE OR REPLACE FUNCTION app.configure_recovery_demo")[1]!.split("END$$;")[0]! + "END$$;";
    const fixedMigration = await readFile(new URL("../migrations/0670_recovery_demo_replay_job.sql", import.meta.url), "utf8");
    const client = await db.owner.connect();
    try {
      const definition = (await client.query("SELECT pg_get_functiondef('app.configure_recovery_demo(uuid,uuid,varchar)'::regprocedure) definition")).rows[0]!.definition;
      await client.query("BEGIN");
      await client.query(oldRoutine);
      await client.query("SET LOCAL ROLE jobguard_runtime");
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [f.tenant]);
      expect((await client.query("SELECT app.configure_recovery_demo($1,$2,'manual_receipt') id", [f.jobB, f.command])).rows)
        .toEqual([{ id: f.command }]);
      expect((await client.query("SELECT * FROM app.recovery_demo_selection WHERE tenant_id=$1 ORDER BY job_id", [f.tenant])).rows)
        .toEqual(before);
      await client.query("ROLLBACK");
      const restored = (await client.query("SELECT pg_get_functiondef('app.configure_recovery_demo(uuid,uuid,varchar)'::regprocedure) definition")).rows[0]!.definition;
      expect(restored).toBe(definition);
      // LP-6d (0740) installs its binding guard ahead of the unchanged 0670 body.
      const guarded = (await readFile(new URL("../migrations/0740_lp6d_remaining_routines.sql", import.meta.url), "utf8"))
        .split("FUNCTION app.configure_recovery_demo(").at(-1)!.split("AS $$")[1]!.split("$$;")[0]!;
      expect(restored.split("$function$")[1]).toBe(guarded);
      expect(guarded).toContain(fixedMigration.split("AS $$")[1]!.split("$$;")[0]!.trim());
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    await expect(select(f.tenant, f.jobB, f.command)).rejects.toMatchObject({ code: "23505" });
    expect(await selections(f.tenant)).toEqual(before);
  });
});
