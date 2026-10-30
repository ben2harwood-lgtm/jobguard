import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdoptInFlightJobMutation } from "../src/job-import-repository.js";
import { UserCommandDispatcher } from "../src/commands.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { adoptionAuthority, adoptionFixture, callAdoption, importedShape, insertJob, jobDoorCounts, jobDoorsActor, jobDoorsDatabase, transaction, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(); }, 300_000);
afterAll(async () => { await db?.close(); });

describe("LP-2 imported insertion boundary", () => {
  const invalidAuthority: Array<[string, NonNullable<Parameters<typeof adoptionAuthority>[1]>]> = [
    ...(["worker", "revoked", "expired"] as const).map(member => [`${member} member`, { member }] as [string, { member: typeof member }]),
    ...(["missing", "actor", "type", "subject", "succeeded"] as const).map(receipt => [`${receipt} receipt`, { receipt }] as [string, { receipt: typeof receipt }]),
    ...(["missing", "actor", "resolution_actor", "subject_type", "subject", "action", "recipient", "hash", "value", "terms", "revision", "revoked", "expired", "rejected"] as const)
      .map(approval => [`${approval} approval`, { approval }] as [string, { approval: typeof approval }]),
  ];
  it.each(invalidAuthority)("[LP2-A05] SQL itself refuses %s and preserves every pre-call effect count", async (_name, change) => {
    const f = await adoptionAuthority(db, change), before = await jobDoorCounts(db.owner, f.actor.tenant);
    await expect(transaction(db.runtime, f.actor.tenant, client => callAdoption(client, f))).rejects.toMatchObject({ code: "42501" });
    expect(await jobDoorCounts(db.owner, f.actor.tenant)).toEqual(before);
  });

  it("[LP2-A05] a valid actor and approval do not authorize a foreign tenant", async () => {
    const f = await adoptionAuthority(db), other = await jobDoorsActor(db.owner);
    const before = await jobDoorCounts(db.owner, f.actor.tenant), otherBefore = await jobDoorCounts(db.owner, other.tenant);
    await expect(transaction(db.runtime, f.actor.tenant, client => callAdoption(client, f, { tenant: other.tenant }))).rejects.toMatchObject({ code: "42501" });
    expect(await jobDoorCounts(db.owner, f.actor.tenant)).toEqual(before);
    expect(await jobDoorCounts(db.owner, other.tenant)).toEqual(otherBefore);
  });

  it.each(["customer", "site", "payer"] as const)("[LP2-A05] missing %s refuses before a job or party effect", async name => {
    const f = await adoptionAuthority(db), before = await jobDoorCounts(db.owner, f.actor.tenant);
    await expect(transaction(db.runtime, f.actor.tenant, client => callAdoption(client, f, { [name]: randomUUID() }))).rejects.toMatchObject({ code: "22023", message: "JOB_PARTIES_REQUIRED" });
    expect(await jobDoorCounts(db.owner, f.actor.tenant)).toEqual(before);
  });

  const flags = [undefined, "", "false", "malformed", "enabled"];
  it.each(flags)("[LP2-A03] a valid tenant plus adoption setting %s cannot insert an imported job", async flag => {
    const actor = await jobDoorsActor(db.owner), before = await jobDoorCounts(db.owner, actor.tenant);
    const runtime = db.freshRuntime();
    try {
      await expect(transaction(runtime, actor.tenant, async client => {
        // An untouched physical connection exercises the actual NULL setting branch.
        if (flag !== undefined) await client.query("SELECT set_config('app.import_command',$1,true)", [flag]);
        await insertJob(client, actor.tenant, randomUUID(), importedShape);
      })).rejects.toMatchObject({ code: "42501" });
    } finally { await runtime.end(); }
    expect(await jobDoorCounts(db.owner, actor.tenant)).toEqual(before);
  });

  it.each([undefined, "", "false", "invalid", "foreign"])("[LP2-A03] tenant setting %s plus a forged enabled adoption flag fails closed", async setting => {
    const actor = await jobDoorsActor(db.owner), other = await jobDoorsActor(db.owner);
    const before = await jobDoorCounts(db.owner, actor.tenant);
    const tenantSetting = setting === "foreign" ? other.tenant : setting;
    const runtime = db.freshRuntime();
    try {
      await expect(transaction(runtime, tenantSetting, async client => {
        await client.query("SELECT set_config('app.import_command','enabled',true)");
        await insertJob(client, actor.tenant, randomUUID(), importedShape);
      })).rejects.toMatchObject({ code: setting === "false" || setting === "invalid" ? "22P02" : "42501" });
    } finally { await runtime.end(); }
    expect(await jobDoorCounts(db.owner, actor.tenant)).toEqual(before);
  });

  it("[LP2-A04] shared migration ownership plus a forged adoption flag cannot mint an imported job", async () => {
    const actor = await jobDoorsActor(db.owner), before = await jobDoorCounts(db.owner, actor.tenant);
    await expect(transaction(db.owner, actor.tenant, async client => {
      await client.query("SET LOCAL ROLE jobguard_migration");
      await client.query("SELECT set_config('app.import_command','enabled',true)");
      await insertJob(client, actor.tenant, randomUUID(), importedShape);
    })).rejects.toMatchObject({ code: "42501" });
    expect(await jobDoorCounts(db.owner, actor.tenant)).toEqual(before);
  });

  it("[LP2-A06] the old thirteen-argument adoption overload is effectively unavailable to inherited runtime", async () => {
    const actor = await jobDoorsActor(db.owner), before = await jobDoorCounts(db.owner, actor.tenant);
    await expect(transaction(db.runtime, actor.tenant, client => client.query(
      "SELECT app.adopt_in_flight_job($1,$2,$3,$4::varchar,$5::varchar,$6::char(64),$7::varchar,$8::bigint,$9::bigint,$10::varchar,$11::varchar,$12,$13::timestamptz)",
      [actor.tenant, randomUUID(), randomUUID(), "Fictional import", "live", "a".repeat(64), "Fictional baseline", 100100, 1502,
        "reference_fee_policy_v1", "synthetic_import_terms_candidate.v1", actor.member, new Date(0)],
    ))).rejects.toMatchObject({ code: "42501" });
    expect(await jobDoorCounts(db.owner, actor.tenant)).toEqual(before);
  });

  it("[LP2-A05] [LP2-A06] the current checked adoption preserves parties, weaker attestation and historical v1 values without billing", async () => {
    const f = await adoptionFixture(db), dispatcher = new UserCommandDispatcher(db.runtime);
    const mutation = new AdoptInFlightJobMutation(f.actor.tenant, "synthetic_candidate", f.input);
    const result = await dispatcher.dispatch(testTenantContext(f.actor.tenant), f.command, mutation);
    expect(result).toMatchObject({ jobId: f.input.jobId, baselineId: f.input.baselineId, provenance: "imported",
      lineageStrength: "builder_attested_weaker", acceptedNetValuePence: 100100, recoveryCapPence: 1502, billing: "none", historicFeesCreated: 0 });
    expect((await db.owner.query(`SELECT j.status,j.provenance,j.accepted_quote_version_id,j.baseline_quote_version_id,
      j.accepted_net_value_pence,j.recovery_cap_pence,b.lineage_strength,b.fee_policy_version,p.customer_revision_id,p.site_revision_id
      FROM app.job j JOIN app.imported_job_baseline b ON(b.tenant_id,b.job_id)=(j.tenant_id,j.id)
      JOIN app.job_party_current c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
      JOIN app.job_party_binding p ON(p.tenant_id,p.id)=(c.tenant_id,c.binding_id)
      WHERE j.tenant_id=$1 AND j.id=$2`, [f.actor.tenant, f.input.jobId])).rows).toEqual([{
        status: "live", provenance: "imported", accepted_quote_version_id: null, baseline_quote_version_id: null,
        accepted_net_value_pence: "100100", recovery_cap_pence: "1502", lineage_strength: "builder_attested_weaker",
        fee_policy_version: "reference_fee_policy_v1", customer_revision_id: f.input.parties.customerRevisionId, site_revision_id: f.input.parties.siteRevisionId,
      }]);
    for (const table of ["recovery_fee_journal", "synthetic_obligation", "customer_invoice"]) {
      expect((await db.owner.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [f.actor.tenant])).rows[0]!.n).toBe(0);
    }
    const before = await jobDoorCounts(db.owner, f.actor.tenant);
    expect(await dispatcher.dispatch(testTenantContext(f.actor.tenant), f.command, mutation)).toEqual(result);
    expect(await jobDoorCounts(db.owner, f.actor.tenant)).toEqual(before);
    await expect(transaction(db.runtime, f.actor.tenant, client => client.query("UPDATE app.imported_job_baseline SET accepted_net_value_pence=100101 WHERE tenant_id=$1 AND job_id=$2", [f.actor.tenant, f.input.jobId]))).rejects.toMatchObject({ code: "42501" });
  });

  it("[LP2-A05] adoption failure after its business writes rolls back parties, job, receipt, authorization and audit together", async () => {
    const f = await adoptionFixture(db), mutation = new AdoptInFlightJobMutation(f.actor.tenant, "synthetic_candidate", f.input);
    const before = await jobDoorCounts(db.owner, f.actor.tenant);
    await expect(new UserCommandDispatcher(db.runtime).dispatch(testTenantContext(f.actor.tenant), f.command, {
      async mutate(database, command) { await mutation.mutate(database, command); throw new Error("LP2 synthetic rollback"); },
    })).rejects.toThrow("LP2 synthetic rollback");
    expect(await jobDoorCounts(db.owner, f.actor.tenant)).toEqual(before);
    // Reusing the pool after rollback must allow the same exact operation to commit.
    await expect(new UserCommandDispatcher(db.runtime).dispatch(testTenantContext(f.actor.tenant), f.command, mutation)).resolves.toMatchObject({ jobId: f.input.jobId });
  });
});

describe("LP-2 private permit consumption", () => {
  async function mint(client: import("pg").PoolClient, tenant: string, job: string, actor: string,
    change: { job?: string; backend?: number; transaction?: string; shape?: boolean } = {}) {
    await client.query(`INSERT INTO app.lp_job_insert_permit
      (tenant_id,job_id,backend_pid,transaction_id,operation,insert_shape,actor_membership_id)
      SELECT $1,$2,coalesce($4,pg_backend_pid()),coalesce($5::xid8,pg_current_xact_id()),'work_order',
        app.lp_job_insert_shape(jsonb_populate_record(NULL::app.job,$6::jsonb)),$3`,
    [tenant, change.job ?? job, actor, change.backend ?? null, change.transaction ?? null,
      JSON.stringify({ tenant_id: tenant, id: job, title: "Fictional LP2 initial job", status: "draft", revision: 0,
        provenance: "work_order", ...(change.shape ? { accepted_net_value_pence: 1 } : {}) })]);
  }
  it.each(["job", "shape", "backend", "transaction"])("[LP2-A04] a permit bound to another %s cannot authorize insertion", async field => {
    const actor = await jobDoorsActor(db.owner), job = randomUUID();
    await expect(transaction(db.owner, actor.tenant, async client => {
      await mint(client, actor.tenant, job, actor.member, field === "job" ? { job: randomUUID() }
        : field === "shape" ? { shape: true } : field === "backend" ? { backend: 0 } : { transaction: "1" });
      await client.query("SET LOCAL ROLE jobguard_migration");
      await insertJob(client, actor.tenant, job, { provenance: "work_order" });
    })).rejects.toMatchObject({ code: "42501" });
    expect((await db.owner.query("SELECT count(*)::int n FROM app.lp_job_insert_permit")).rows).toEqual([{ n: 0 }]);
  });
  it("[LP2-A04] [LP2-A10] an exact permit is consumed once and rollback restores both insertion and permit atomically", async () => {
    const actor = await jobDoorsActor(db.owner), job = randomUUID(), before = await jobDoorCounts(db.owner, actor.tenant);
    await expect(transaction(db.owner, actor.tenant, async client => {
      await mint(client, actor.tenant, job, actor.member);
      // The unchanged work-order guard independently requires the migration role.
      await client.query("SET LOCAL ROLE jobguard_migration");
      await insertJob(client, actor.tenant, job, { provenance: "work_order" });
      expect((await client.query("SELECT count(*)::int n FROM app.lp_job_insert_permit")).rows).toEqual([{ n: 0 }]);
      await client.query("SAVEPOINT reuse");
      await expect(insertJob(client, actor.tenant, job, { provenance: "work_order" })).rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK TO SAVEPOINT reuse");
      throw new Error("LP2 permit rollback");
    })).rejects.toThrow("LP2 permit rollback");
    expect(await jobDoorCounts(db.owner, actor.tenant)).toEqual(before);
    expect((await db.owner.query("SELECT count(*)::int n FROM app.lp_job_insert_permit")).rows).toEqual([{ n: 0 }]);
  });
  it("[LP2-A04] a stale committed permit cannot cross a transaction or a physical connection", async () => {
    const actor = await jobDoorsActor(db.owner), job = randomUUID();
    // The migration-owned deferred guard prevents a committed unused capability.
    await expect(transaction(db.owner, actor.tenant, client => mint(client, actor.tenant, job, actor.member)))
      .rejects.toMatchObject({ code: "23514", message: "JOB_INSERT_PERMIT_UNCONSUMED" });
    const fresh = db.freshRuntime();
    try { await expect(transaction(fresh, actor.tenant, client => insertJob(client, actor.tenant, job, { provenance: "work_order" })))
      .rejects.toMatchObject({ code: "42501" }); }
    finally { await fresh.end(); }
    expect((await db.owner.query("SELECT count(*)::int n FROM app.lp_job_insert_permit")).rows).toEqual([{ n: 0 }]);
  });
});
