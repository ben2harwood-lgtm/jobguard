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
  vi.doMock("../src/tenant-context.js", async () => {
    const actual = await vi.importActual<typeof import("../src/tenant-context.js")>("../src/tenant-context.js");
    const scopes = new WeakMap<object, Map<string, object>>();
    const deferredContexts = new WeakMap<import("../src/tenant-context.js").TenantTransaction,
      { original: import("../src/tenant-context.js").VerifiedTenantContext; bound: import("../src/tenant-context.js").VerifiedTenantContext }>();
    return { ...actual,
      // Historical upgrade databases have no binding API; current schemas bind for real.
      bindIssuedCredential: (async (client, context) => {
        const installed = (await client.query(`SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='app' AND p.proname='bind_request' AND oidvectortypes(p.proargtypes)='text, text, uuid') installed`)).rows[0].installed;
        if (installed) await actual.bindIssuedCredential(client, context);
      }) as typeof actual.bindIssuedCredential,
      bindAfterLocks: (async (db, context) => {
        const pair = deferredContexts.get(db);
        return actual.bindAfterLocks(db, pair?.original === context ? pair.bound : context);
      }) as typeof actual.bindAfterLocks,
      withTenant: (async (pool, context, work, deferred) => {
        const { needsTestRequestBinding, bindTestTenantContext, testTenantContext } = await import("./tenant-context-test-utils.js");
        // Production-shaped contexts go straight to the real boundary (no probe connection, so
        // connect counts and race barriers stay exact). Only a historical upgrade database with
        // no binding API retries this fixture client unbound.
        if (!needsTestRequestBinding(context)) {
          try { return await actual.withTenant(pool, context, work, deferred); }
          catch (error) {
            if ((error as { code?: string }).code !== "42883" || !/app\.bind_request/u.test(String((error as Error).message))) throw error;
            return await actual.withTenant(pool, testTenantContext(context.tenantId, { bindRequest: false }), work, deferred);
          }
        }
        // Race/loss fixtures expose connect only. Reuse that same connection:
        // acquiring a probe then a second client changes their race barriers.
        const client = typeof pool.query === "function" ? undefined : await pool.connect();
        let delegated = false;
        const requestPool = client ? { connect: async () => { delegated = true; return client; } } as Pool : pool;
        try {
          const { database, port, binding_installed } = (await (client ?? pool).query<{
            database: string; port: number; administrative: boolean; binding_installed: boolean;
          }>(`SELECT current_database() AS database, inet_server_port() AS port,
            (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS administrative,
            EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='app' AND p.proname='bind_request'
                AND oidvectortypes(p.proargtypes)='text, text, uuid') AS binding_installed`)).rows[0]!;
          // Historical upgrade databases have no binding API. Adapt only this
          // fixture client; current schemas and direct-SQL attacks keep real guards.
          if (!binding_installed) {
            return await actual.withTenant(requestPool, testTenantContext(context.tenantId, { bindRequest: false }), work, deferred);
          }
          const credentials = clusterAdmins.get(Number(port));
          if (!credentials) throw new Error("Missing embedded PostgreSQL admin credentials for request fixture");
          const owner = new Pool({ host: "127.0.0.1", port, database, ...credentials, max: 1 });
          const databases = scopes.get(credentials) ?? new Map<string, object>();
          scopes.set(credentials, databases);
          const scope = databases.get(database) ?? {};
          databases.set(database, scope);
          let bound;
          try { bound = await bindTestTenantContext(owner, context, scope); }
          finally { await owner.end(); }
          return await actual.withTenant(requestPool, bound, async db => {
            deferredContexts.set(db, { original: context, bound });
            try { return await work(db); }
            finally { deferredContexts.delete(db); }
          }, deferred);
        } finally { if (client && !delegated) client.release(); }
      }) as typeof actual.withTenant };
  });
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
      for (const role of ["jobguard_audit_writer", "jobguard_command_writer", "jobguard_binding_owner"]) {
        await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${role}') THEN
          CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
          END IF; END $$`);
      }
    } finally { await admin.end(); }
  };
}
