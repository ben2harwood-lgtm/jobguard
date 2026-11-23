import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { runMigrations } from "../../apps/api/node_modules/graphile-worker/dist/index.js";
import { provisionSyntheticSchema } from "../../packages/db/dist/demo-bootstrap.js";
import { database, migrationUrl, postgresData, ports, validateSettings } from "./settings.mjs";
import { seedV2 } from "./seed.mjs";

const { settings } = validateSettings({});
const expectedSystemId = process.argv[2];
if (!/^\d+$/u.test(expectedSystemId ?? "") || process.env.JOBGUARD_ENV !== settings.JOBGUARD_ENV) {
  throw new Error("V2 bootstrap requires the dedicated PostgreSQL server identity");
}

const admin = new Pool({ connectionString: migrationUrl, max: 1 });
await using pools = {
  [Symbol.asyncDispose]: () => admin.end(),
};
const client = await admin.connect();
try {
  const { rows: [target] } = await client.query(`SELECT current_database() AS name,
    current_setting('data_directory') AS directory, inet_server_port() AS port,
    system_identifier::text AS id FROM pg_control_system()`);
  // Everything up to here is read-only. The system identifier comes independently
  // from the PostgreSQL container through Compose, never from the subject URL.
  if (target?.name !== database || target.directory !== postgresData || target.port !== 5432 ||
      target.id !== expectedSystemId || new URL(migrationUrl).port !== String(ports.database)) {
    throw new Error("V2 PostgreSQL server identity does not match");
  }

  await client.query("SELECT pg_advisory_lock(hashtext('jobguard_v2_local_bootstrap'))");
  // The common schema bootstrap requires the shadow group to have no ordinary
  // holder during setup. Only the V2-created login is detached on restart.
  await client.query(`DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_v2_shadow') THEN
    REVOKE jobguard_shadow FROM jobguard_v2_shadow;
  END IF; END $$`);
  const runtimePassword = new URL(settings.DATABASE_URL).password;
  const migrations = await provisionSyntheticSchema(client, database, runtimePassword);
  await client.query(`
    ALTER ROLE jobguard_identity LOGIN PASSWORD 'v2-local-identity-only';
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_v2_actions') THEN
        CREATE ROLE jobguard_v2_actions LOGIN PASSWORD 'v2-local-actions-only';
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_v2_queue') THEN
        CREATE ROLE jobguard_v2_queue LOGIN PASSWORD 'v2-local-queue-only';
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_v2_shadow') THEN
        CREATE ROLE jobguard_v2_shadow LOGIN PASSWORD 'v2-local-shadow-only';
      END IF;
    END $$;
    GRANT jobguard_worker TO jobguard_v2_actions;
    GRANT jobguard_infrastructure TO jobguard_v2_queue;
    GRANT jobguard_shadow TO jobguard_v2_shadow;
    GRANT CREATE ON DATABASE "${database}" TO jobguard_v2_queue;
  `);
  try {
    await runMigrations({ connectionString: settings.GRAPHILE_DATABASE_URL });
  } finally {
    await client.query(`REVOKE CREATE ON DATABASE "${database}" FROM jobguard_v2_queue`);
  }
  await seedV2();
  console.log(`V2 PostgreSQL ready (${migrations} schema migrations)`);
} finally {
  client.release();
}
