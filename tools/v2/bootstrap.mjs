import { readFileSync } from "node:fs";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { runMigrations } from "../../apps/api/node_modules/graphile-worker/dist/index.js";
import { provisionSyntheticSchema } from "../../packages/db/dist/demo-bootstrap.js";
import { database, migrationUrl, validateSettings, verifyDatabaseTarget } from "./settings.mjs";
import { printSeedLinks, seedV2 } from "./seed.mjs";

const { NODE_OPTIONS, ...env } = process.env;
const { settings } = validateSettings(env);
const expectedSystemId = process.argv[2];
if (!/^\d+$/u.test(expectedSystemId ?? "") || env.JOBGUARD_LOCAL_V2 !== "1" || env.JOBGUARD_ENV !== settings.JOBGUARD_ENV) {
  throw new Error("V2 bootstrap requires the dedicated PostgreSQL server identity");
}

const admin = new Pool({ connectionString: migrationUrl, max: 1 });
await using pools = {
  [Symbol.asyncDispose]: () => admin.end(),
};
const client = await admin.connect();
try {
  await verifyDatabaseTarget(client, expectedSystemId);

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
  await client.query(readFileSync(new URL("./migrations/2001_practice_quote.sql", import.meta.url), "utf8"));
  const jobId = await seedV2(client, expectedSystemId);
  printSeedLinks(settings.AUTH_ALLOWED_ORIGIN, jobId);
  console.log(`V2 PostgreSQL ready (${migrations} schema migrations)`);
} finally {
  client.release();
}
