// LP-2 tests-first preparation. Enforcement is stopped on coordinator-owned fixtures.
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import type { ConsequentialCommand } from "../src/commands.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

export async function jobDoorsDatabase(practice = false, stopBefore?: string) {
  const phrase = randomUUID(), directory = await mkdtemp(join(tmpdir(), "jg-lp2-"));
  const port = await freePort(62700, 100);
  const postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: phrase,
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  let owner: Pool | undefined, runtime: Pool | undefined;
  try {
    await postgres.initialise(); await postgres.start();
    const options = { host: "127.0.0.1", port, password: phrase };
    const database = practice ? "jobguard_synthetic_demo" : "postgres";
    if (practice) {
      const control = new Pool({ ...options, user: "postgres", database: "postgres" });
      try { await control.query("CREATE DATABASE jobguard_synthetic_demo"); }
      finally { await control.end(); }
    }
    owner = new Pool({ ...options, user: "postgres", database, max: 2 });
    if (stopBefore === undefined) await migrate(owner);
    else {
      await owner.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
      for (const url of MIGRATION_URLS) {
        const name = url.pathname.split("/").at(-1)!;
        if (name >= stopBefore) continue;
        const sql = await readFile(url, "utf8");
        await owner.query(name === "0095_job_parties.sql" ? sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);") : sql);
        await owner.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
      }
    }
    // Disposable test login inherits runtime only; it never receives fixture writes.
    await owner.query(`CREATE ROLE lp2_login LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${phrase}'`);
    await owner.query("GRANT jobguard_runtime TO lp2_login");
    runtime = new Pool({ ...options, user: "lp2_login", database, max: 2 });
    const savedOwner = owner, savedRuntime = runtime;
    return { owner: savedOwner, runtime: savedRuntime, directory,
      freshRuntime: () => new Pool({ ...options, user: "lp2_login", database, max: 1 }),
      async close() { await closeTestPools(savedRuntime, savedOwner); await postgres.stop(); } };
  } catch (error) {
    await closeTestPools(runtime, owner); await postgres.stop(); throw error;
  }
}
export type JobDoorsDatabase = Awaited<ReturnType<typeof jobDoorsDatabase>>;

export async function jobDoorsActor(owner: Pool, tenant = randomUUID()) {
  const member = randomUUID(), account = randomUUID(), person = randomUUID();
  await owner.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [tenant]);
  await owner.query("INSERT INTO identity.identity_user(id) VALUES($1)", [person]);
  await owner.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional LP2 builder')", [tenant, account]);
  await owner.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [tenant, member, account, person]);
  return { tenant, member, account, person };
}

const shapeColumns = ["status", "revision", "provenance", "accepted_quote_version_id", "baseline_quote_version_id",
  "accepted_net_value_pence", "fee_policy_version", "recovery_cap_pence"] as const;
export type InitialShape = Partial<Record<typeof shapeColumns[number], string | number | null>>;
export async function insertJob(client: PoolClient, tenant: string, id: string, shape: InitialShape = {}) {
  const entries = Object.entries(shape);
  if (entries.some(([name]) => !shapeColumns.includes(name as typeof shapeColumns[number]))) throw new Error("Unknown test shape column");
  const columns = entries.map(([name]) => name), values = entries.map(([, value]) => value);
  return client.query(`INSERT INTO app.job(tenant_id,id,title${columns.map(name => `,${name}`).join("")})
    VALUES($1,$2,'Fictional LP2 initial job'${values.map((_, index) => `,$${index + 3}`).join("")})`, [tenant, id, ...values]);
}

export const importedShape: InitialShape = { provenance: "imported", status: "draft", revision: 1,
  accepted_net_value_pence: 100100, fee_policy_version: "reference_fee_policy_v1", recovery_cap_pence: 1502 };

export async function jobDoorCounts(owner: Pool, tenant: string) {
  const result: Record<string, number> = {};
  for (const table of ["job", "job_party_binding", "job_party_current", "job_commercial_track", "imported_job_baseline",
    "command_receipt", "decision", "decision_resolution", "action_authorization", "audit_event", "customer_invoice", "recovery_fee_journal"]) {
    result[table] = (await owner.query(`SELECT count(*)::integer AS n FROM app.${table} WHERE tenant_id=$1`, [tenant])).rows[0]!.n as number;
  }
  return result;
}

export async function transaction<T>(pool: Pool, tenant: string | undefined, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (tenant !== undefined) await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
    const result = await work(client); await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function adoptionFixture(db: JobDoorsDatabase) {
  const actor = await jobDoorsActor(db.owner), customer = randomUUID(), customerRevision = randomUUID();
  const site = randomUUID(), siteRevision = randomUUID(), jobId = randomUUID();
  await db.owner.query("INSERT INTO app.customer(tenant_id,id) VALUES($1,$2)", [actor.tenant, customer]);
  await db.owner.query(`INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload)
    VALUES($1,$2,$3,1,'{"version":"customer.v1","name":"Fictional LP2 customer","type":"person"}')`, [actor.tenant, customerRevision, customer]);
  await db.owner.query("INSERT INTO app.site(tenant_id,id) VALUES($1,$2)", [actor.tenant, site]);
  await db.owner.query(`INSERT INTO app.site_revision(tenant_id,id,site_id,revision,payload,match_key)
    VALUES($1,$2,$3,1,'{"version":"site.v1","addressLines":["14 Fictional Street"],"town":"London","postcode":"SW1A 1AA"}','[]')`, [actor.tenant, siteRevision, site]);
  const input = { version: "adopt-job.v1" as const, jobId, baselineId: randomUUID(), title: "Fictional LP2 underway job",
    lifecyclePoint: "live" as const, provenance: "imported" as const, lineageStrength: "builder_attested_weaker" as const,
    baselineHash: "a".repeat(64), baselineDescription: "Fictional builder-attested scope", acceptedNetValuePence: 100100,
    recoveryCapPence: 1502, acceptedValueSource: "builder_attestation" as const, attestedByMembershipId: actor.member,
    attestedAt: new Date(0), importTermsVersion: "synthetic_import_terms_candidate.v1" as const,
    feePolicyVersion: "reference_fee_policy_v1" as const, mode: "synthetic_candidate" as const,
    parties: { customerRevisionId: customerRevision, siteRevisionId: siteRevision } };
  const command: ConsequentialCommand = { version: "command.v1", commandId: randomUUID(), commandType: "job.adopt_in_flight",
    semanticKey: `import:${jobId}`, actorMembershipId: actor.member, subjectType: "job", subjectRef: jobId,
    action: { actionType: "job.adopt_in_flight", recipient: null, contentHash: input.baselineHash, aggregateRevision: 0,
      amountPence: input.acceptedNetValuePence, currency: "GBP", policyVersion: input.importTermsVersion, expiresAt: new Date("2099-01-01T00:00:00Z") } };
  return { actor, input, command };
}

/** Owner setup only. The runtime subsequently invokes SQL directly, bypassing service prechecks. */
export async function adoptionAuthority(db: JobDoorsDatabase, change: {
  member?: "worker" | "revoked" | "expired";
  receipt?: "missing" | "actor" | "type" | "subject" | "succeeded";
  approval?: "missing" | "actor" | "resolution_actor" | "subject_type" | "subject" | "action" |
    "recipient" | "hash" | "value" | "terms" | "revision" | "revoked" | "expired" | "rejected";
} = {}) {
  const f = await adoptionFixture(db), other = await jobDoorsActor(db.owner, f.actor.tenant);
  const decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID();
  await transaction(db.owner, f.actor.tenant, async client => {
    if (change.member === "worker") await client.query("UPDATE app.membership SET role='worker' WHERE tenant_id=$1 AND id=$2", [f.actor.tenant, f.actor.member]);
    if (change.member === "revoked") await client.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.actor.tenant, f.actor.member]);
    if (change.member === "expired") await client.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [f.actor.tenant, f.actor.member]);
    if (change.receipt !== "missing") await client.query(`INSERT INTO app.command_receipt
      (tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $6='succeeded' THEN clock_timestamp() ELSE NULL END)`,
    [f.actor.tenant, f.command.commandId, change.receipt === "type" ? "quote.send" : f.command.commandType,
      change.receipt === "subject" ? `import:${randomUUID()}` : f.command.semanticKey, "c".repeat(64),
      change.receipt === "succeeded" ? "succeeded" : "processing", change.receipt === "actor" ? other.member : f.actor.member,
      change.receipt === "succeeded" ? {} : null]);
    const action = change.approval === "action" ? "quote.send" : "job.adopt_in_flight";
    await client.query("INSERT INTO app.decision(tenant_id,id,subject_type,subject_ref,action_type) VALUES($1,$2,$3,$4,$5)",
      [f.actor.tenant, decision, change.approval === "subject_type" ? "quote_document" : "job",
        change.approval === "subject" ? randomUUID() : f.input.jobId, action]);
    await client.query("INSERT INTO app.decision_resolution(tenant_id,id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,$4,$5)",
      [f.actor.tenant, resolution, decision, change.approval === "rejected" ? "rejected" : "approved",
        change.approval === "resolution_actor" ? other.member : f.actor.member]);
    // A rejected resolution cannot acquire an authorization even in owner setup.
    if (change.approval !== "missing" && change.approval !== "rejected") await client.query(`INSERT INTO app.action_authorization
      (tenant_id,id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,
       amount_pence,currency,policy_version,expires_at,revoked_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'GBP',$11,$12,$13)`,
    [f.actor.tenant, authorization, decision, resolution, change.approval === "actor" ? other.member : f.actor.member, action,
      change.approval === "recipient" ? "customer@example.invalid" : null,
      change.approval === "hash" ? "b".repeat(64) : f.input.baselineHash, change.approval === "revision" ? 1 : 0,
      change.approval === "value" ? 100101 : f.input.acceptedNetValuePence,
      change.approval === "terms" ? "different_import_terms.v1" : f.input.importTermsVersion,
      change.approval === "expired" ? new Date(0) : new Date("2099-01-01T00:00:00Z"),
      change.approval === "revoked" ? new Date(0) : null]);
  });
  return { ...f, authorization };
}

export async function callAdoption(client: PoolClient, f: Awaited<ReturnType<typeof adoptionAuthority>>, change: {
  tenant?: string; actor?: string; customer?: string; site?: string; payer?: string;
} = {}) {
  return client.query(`SELECT app.adopt_in_flight_job($1,$2,$3,$4::varchar,$5::varchar,$6::char(64),$7::varchar,
    $8::bigint,$9::bigint,$10::varchar,$11::varchar,$12,$13::timestamptz,$14,$15,$16,$17,$18)`,
  [change.tenant ?? f.actor.tenant, f.input.jobId, f.input.baselineId, f.input.title, f.input.lifecyclePoint,
    f.input.baselineHash, f.input.baselineDescription, f.input.acceptedNetValuePence, f.input.recoveryCapPence,
    f.input.feePolicyVersion, f.input.importTermsVersion, change.actor ?? f.actor.member, f.input.attestedAt,
    change.customer ?? f.input.parties.customerRevisionId, change.site ?? f.input.parties.siteRevisionId,
    change.payer ?? null, f.command.commandId, f.authorization]);
}
