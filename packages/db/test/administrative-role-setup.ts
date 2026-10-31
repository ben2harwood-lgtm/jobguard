import { readFileSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { expect, vi } from "vitest";

// Tests that execute migration SQL directly still need the administrative
// prerequisite. This starts real PostgreSQL and provisions cluster roles only;
// no migration SQL, permission check or query result is mocked. The bootstrap
// suites importing bootstrapSyntheticDemo deliberately start without these roles
// and exercise ensureRoles themselves (including the restricted-owner suites).
const testPath = expect.getState().testPath;
const clusterAdmins = new Map<number, {user:string;password:string}>();
// Every real integration suite can use partial schemas through shared fixtures
// (sessions, repositories or seeds). Select the client per connected database,
// not per filename/migration list, so mixed old/current databases stay honest.
// Protocol/unit doubles retain the unwrapped production module.
if (testPath?.endsWith(".integration.test.ts")) {
  vi.doMock("../src/repository-command.js", async () => {
    const actual=await vi.importActual<typeof import("../src/repository-command.js")>("../src/repository-command.js");
    const {legacyRepositoryCommandModule}=await import("./legacy-repository-command-fixture.js");
    return legacyRepositoryCommandModule(actual);
  });
  vi.doMock("../src/recovery-command.js", async () => {
    const actual=await vi.importActual<typeof import("../src/recovery-command.js")>("../src/recovery-command.js");
    const {legacyRecoveryCommandModule}=await import("./legacy-repository-command-fixture.js");
    return legacyRecoveryCommandModule(actual);
  });
  vi.doMock("../src/commands.js", async () => {
    const commands = await vi.importActual<typeof import("../src/commands.js")>("../src/commands.js");
    const {legacyCommandModule} = await import("./legacy-command-fixture.js");
    return legacyCommandModule(commands);
  });
  vi.doMock("../src/enterprise-identity-repository.js", async () => {
    const identity=await vi.importActual<typeof import("../src/enterprise-identity-repository.js")>("../src/enterprise-identity-repository.js");
    const audit=await vi.importActual<typeof import("../src/audit.js")>("../src/audit.js");
    const {legacySsoAuditModule,historicalSchema}=await import("./legacy-audit-fixture.js");
    return legacySsoAuditModule(identity,audit,async client => {
      // Connection wrappers in concurrency tests may not expose pool options.
      const {database,port}=(await client.query<{database:string;port:number}>(
        "SELECT current_database() AS database, inet_server_port() AS port")).rows[0]!;
      const credentials=clusterAdmins.get(Number(port));
      if (!credentials) throw new Error("Missing embedded PostgreSQL admin credentials for SSO fixture");
      // Inspect the same database as the identity connection, using only the cluster
      // admin credentials. Do not cache across partial/full migration steps.
      const admin=new Pool({host:"127.0.0.1",port,database,...credentials,max:1});
      try { return await historicalSchema(admin); } finally { await admin.end(); }
    });
  });
  vi.doMock("../src/audit.js", async () => {
    const audit = await vi.importActual<typeof import("../src/audit.js")>("../src/audit.js");
    const {legacyAuditModule} = await import("./legacy-audit-fixture.js");
    return legacyAuditModule(audit);
  });
}
if (testPath) {
  const start = EmbeddedPostgres.prototype.start;
  EmbeddedPostgres.prototype.start = async function () {
    await start.call(this);
    const { port, user, password } = (this as unknown as { options: { port: number; user: string; password: string } }).options;
    clusterAdmins.set(port,{user,password});
    if (readFileSync(testPath, "utf8").includes("bootstrapSyntheticDemo")) return;
    const admin = new Pool({ host: "127.0.0.1", port, user, password, database: "postgres" });
    try {
      for (const role of ["jobguard_audit_writer", "jobguard_command_writer"]) {
        await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${role}') THEN
          CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
          END IF; END $$`);
      }
    } finally { await admin.end(); }
  };
}
