import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { migrate } from "./migrate.js";
import {
  DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_JOB_ID, DEMO_MEMBERSHIP_ID,
  DEMO_TENANT_ID, seedDemo, type DemoSeedCommand,
} from "./demo-seed.js";

export const SYNTHETIC_DATABASE_NAME = "jobguard_synthetic_demo";

export class DemoBootstrapSafetyError extends Error { readonly code = "DEMO_BOOTSTRAP_TARGET_FORBIDDEN"; }

function connection(value: string, label: string) {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new DemoBootstrapSafetyError(`${label} must be a PostgreSQL URL`); }
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol) || parsed.pathname.slice(1) !== SYNTHETIC_DATABASE_NAME) {
    throw new DemoBootstrapSafetyError(`${label} must target the database ${SYNTHETIC_DATABASE_NAME}`);
  }
  return parsed;
}

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const quoteLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

async function ensureRoles(admin: PoolClient, runtimePassword: string) {
  await admin.query(`DO $$ BEGIN CREATE ROLE jobguard_migration NOLOGIN NOCREATEDB NOCREATEROLE NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await admin.query(`DO $$ BEGIN CREATE ROLE jobguard_runtime LOGIN NOCREATEDB NOCREATEROLE NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await admin.query(`DO $$ BEGIN CREATE ROLE jobguard_infrastructure NOLOGIN NOCREATEDB NOCREATEROLE NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await admin.query(`ALTER ROLE jobguard_migration NOLOGIN NOCREATEROLE NOINHERIT`);
  await admin.query(`ALTER ROLE jobguard_runtime LOGIN PASSWORD ${quoteLiteral(runtimePassword)} NOCREATEROLE NOINHERIT`);
  await admin.query(`ALTER ROLE jobguard_infrastructure NOLOGIN NOCREATEROLE NOINHERIT`);
  const runtimePosture = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolinherit: boolean; rolcanlogin: boolean }>(
    "SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolcanlogin FROM pg_roles WHERE rolname='jobguard_runtime'",
  );
  const runtimeRole = runtimePosture.rows[0];
  if (runtimePosture.rowCount !== 1 || !runtimeRole || runtimeRole.rolsuper || runtimeRole.rolbypassrls ||
      runtimeRole.rolcreatedb || runtimeRole.rolcreaterole || runtimeRole.rolinherit || !runtimeRole.rolcanlogin) {
    throw new Error("jobguard_runtime does not have the required least-privilege posture");
  }
  const owner = (await admin.query<{ current_user: string }>("SELECT current_user")).rows[0]!.current_user;
  await admin.query(`GRANT jobguard_migration TO ${quoteIdentifier(owner)}`);
  await admin.query(`GRANT jobguard_runtime TO ${quoteIdentifier(owner)}`);
  await admin.query(`GRANT jobguard_infrastructure TO ${quoteIdentifier(owner)}`);
  await admin.query(`GRANT CREATE ON DATABASE ${quoteIdentifier(SYNTHETIC_DATABASE_NAME)} TO jobguard_migration`);
  await admin.query("GRANT USAGE,CREATE ON SCHEMA public TO jobguard_migration");
}

async function migrateAsMigrationOwner(client: PoolClient) {
  await client.query("SET ROLE jobguard_migration");
  try {
    await migrate(client);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.query("RESET ROLE");
  }
}

async function seedDatabase(client: PoolClient) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
    await client.query("SET LOCAL ROLE jobguard_migration");
    await client.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [DEMO_TENANT_ID]);
    await client.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING", [DEMO_IDENTITY_USER_ID]);
    await client.query("SET LOCAL ROLE jobguard_runtime");
    await client.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'JobGuard synthetic demo') ON CONFLICT DO NOTHING", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
    await client.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
    await client.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Synthetic kitchen extension','draft') ON CONFLICT DO NOTHING", [DEMO_JOB_ID, DEMO_TENANT_ID]);
    await seedDemo("synthetic_demo", { execute: async (command: DemoSeedCommand) => {
      const result = await client.query(
        `INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
         VALUES($1,$2,'synthetic_demo.seed',$3,$4,'succeeded',$5::jsonb,$6,transaction_timestamp())
         ON CONFLICT(tenant_id,command_type,semantic_key) DO NOTHING RETURNING command_id`,
        [command.commandId, command.tenantId, command.semanticKey,
          createHash("sha256").update(JSON.stringify(command)).digest("hex"), JSON.stringify({ checkpoint: command.checkpoint }), DEMO_MEMBERSHIP_ID],
      );
      return result.rowCount === 1 ? "created" : "replayed";
    }});
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

export async function bootstrapSyntheticDemo(options: { ownerUrl: string; runtimeUrl: string }) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new DemoBootstrapSafetyError("JOBGUARD_ENV=synthetic_demo is required");
  const owner = connection(options.ownerUrl, "MIGRATION_DATABASE_URL");
  const runtime = connection(options.runtimeUrl, "DATABASE_URL");
  if (runtime.username !== "jobguard_runtime" || !runtime.password) throw new DemoBootstrapSafetyError("DATABASE_URL must authenticate as jobguard_runtime with a password");
  if (owner.hostname.endsWith(".neon.tech") && (owner.hostname.includes("-pooler") || !runtime.hostname.includes("-pooler"))) {
    throw new DemoBootstrapSafetyError("Neon migrations require DIRECT and runtime requires POOLED endpoints");
  }
  const pool = new Pool({ connectionString: owner.toString(), max: 1 });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('jobguard_demo_bootstrap_v1'))");
    await ensureRoles(client, decodeURIComponent(runtime.password));
    await migrateAsMigrationOwner(client);
    await seedDatabase(client);
    return { database: SYNTHETIC_DATABASE_NAME, tenantId: DEMO_TENANT_ID, migrations: 21 };
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('jobguard_demo_bootstrap_v1'))").catch(() => undefined);
    client.release(); await pool.end();
  }
}
