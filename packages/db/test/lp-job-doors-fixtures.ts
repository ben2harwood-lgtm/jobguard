// LP-2 tests-first preparation. Enforcement is stopped on coordinator-owned fixtures.
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { migrate } from "../src/migrate.js";
import type { ConsequentialCommand } from "../src/commands.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

export async function jobDoorsDatabase(practice = false) {
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
    await migrate(owner);
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
