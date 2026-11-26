import { existsSync, readFileSync } from "node:fs";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { runMigrations } from "../../apps/api/node_modules/graphile-worker/dist/index.js";
import { provisionSyntheticSchema } from "../../packages/db/dist/demo-bootstrap.js";
import { database, migrationUrl, validateSettings } from "./settings.mjs";
import { authSecret, checkLocalTargets, storageData, verifyDatabaseTarget } from "./local-targets.mjs";
import { printSeedLinks, seedV2 } from "./seed.mjs";

const { NODE_OPTIONS, ...env } = process.env;
const { settings } = validateSettings(env);
const [, , expectedSystemId, backend] = process.argv;
const embedded = backend === "embedded";
if (!/^\d+$/u.test(expectedSystemId ?? "") || process.env.JOBGUARD_ENV !== settings.JOBGUARD_ENV ||
    env.JOBGUARD_LOCAL_V2 !== "1" || backend !== env.JOBGUARD_V2_BACKEND || !["docker", "embedded"].includes(backend)) {
  throw new Error("V2 bootstrap requires the dedicated PostgreSQL server identity");
}

if (embedded) {
  if (process.env.JOBGUARD_V2_STORAGE_DIR !== storageData || !existsSync(storageData)) throw new Error("V2 storage target does not match");
  checkLocalTargets();
}

const admin = new Pool({ connectionString: migrationUrl, max: 1 });
await using pools = {
  [Symbol.asyncDispose]: () => admin.end(),
};
const client = await admin.connect();
try {
  // The expected ID comes from Compose or the embedded cluster's control file.
  await verifyDatabaseTarget(client, expectedSystemId, embedded);

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
  process.env.AUTH_CODE_SECRET = authSecret();
  await client.query(readFileSync(new URL("./migrations/2001_practice_quote.sql", import.meta.url), "utf8"));
  await client.query(readFileSync(new URL("../../packages/db/migrations/2002_v2_work_plan.sql", import.meta.url), "utf8"));
  await client.query(readFileSync(new URL("../../packages/db/migrations/2003_v2_work_plan_edits.sql", import.meta.url), "utf8"));
  await client.query(readFileSync(new URL("../../packages/db/migrations/2004_v2_plan_disposition.sql", import.meta.url), "utf8"));
  await client.query(readFileSync(new URL("../../packages/db/migrations/2020_v2_plan_variation_scope.sql", import.meta.url), "utf8"));
  // V2-K2A: reserved calendar link migration.
  await client.query(readFileSync(new URL("../../packages/db/migrations/2021_v2_calendar_feed.sql", import.meta.url), "utf8"));
  // V2-PX photo lock (2025): evidence and photo rows follow the firm's job visibility.
  await client.query(readFileSync(new URL("./migrations/2025_v2_evidence_firm_lock.sql", import.meta.url), "utf8"));
  // V2-C3C crew records (2027).
  await client.query(readFileSync(new URL("../../packages/db/migrations/2027_v2_crew_contact.sql", import.meta.url), "utf8"));
  const jobId = await seedV2(client, expectedSystemId);
  printSeedLinks(settings.AUTH_ALLOWED_ORIGIN, jobId);
  console.log(`V2 PostgreSQL ready (${migrations} schema migrations)`);
} finally {
  client.release();
}
