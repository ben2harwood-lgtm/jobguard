import { readFileSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { expect } from "vitest";

// Tests that execute migration SQL directly still need the administrative
// prerequisite. This starts real PostgreSQL and provisions cluster roles only;
// no migration SQL, permission check or query result is mocked. The bootstrap
// suites importing bootstrapSyntheticDemo deliberately start without these roles
// and exercise ensureRoles themselves (including the restricted-owner suites).
const testPath = expect.getState().testPath;
if (testPath && !readFileSync(testPath, "utf8").includes("bootstrapSyntheticDemo")) {
  const start = EmbeddedPostgres.prototype.start;
  EmbeddedPostgres.prototype.start = async function () {
    await start.call(this);
    const { port, user, password } = (this as unknown as { options: { port: number; user: string; password: string } }).options;
    const admin = new Pool({ host: "127.0.0.1", port, user, password, database: "postgres" });
    try {
      for (const role of ["jobguard_audit_writer"]) {
        await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${role}') THEN
          CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
          END IF; END $$`);
      }
    } finally { await admin.end(); }
  };
}
