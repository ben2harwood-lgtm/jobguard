import { readFileSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, expect, vi } from "vitest";

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
  // Existing journey assertions execute against a genuinely separate, table-free
  // worker login. The fixture supplies credentials; no production code derives them.
  const workers = new Map<string, Promise<Pool>>();
  afterAll(async () => { for (const pool of workers.values()) await (await pool).end(); });
  vi.doMock("../src/worker-pool.js", async () => {
    const actual = await vi.importActual<typeof import("../src/worker-pool.js")>("../src/worker-pool.js");
    return { ...actual, outboundWorkerPool: async (source: Pool) => {
      const {database,port}=(await source.query<{database:string;port:number}>(
        "SELECT current_database() AS database,inet_server_port() AS port")).rows[0]!;
      const key=`${port}:${database}`;
      if (!workers.has(key)) workers.set(key,(async () => {
        const credentials=clusterAdmins.get(Number(port));
        if (!credentials) throw new Error("Missing worker fixture cluster credentials");
        const admin=new Pool({host:"127.0.0.1",port,database,...credentials,max:1});
        try {
          await admin.query(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='lp10_fixture_worker') THEN
            CREATE ROLE lp10_fixture_worker LOGIN PASSWORD 'synthetic-worker-only' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
            GRANT jobguard_worker TO lp10_fixture_worker; END IF; END $$`);
        } finally { await admin.end(); }
        return new Pool({host:"127.0.0.1",port,database,user:"lp10_fixture_worker",password:"synthetic-worker-only",max:2});
      })());
      return workers.get(key)!;
    }};
  });
  vi.doMock("../src/outbox.js", async () => {
    const actual = await vi.importActual<typeof import("../src/outbox.js")>("../src/outbox.js");
    const legacy = await import("./legacy-outbox-fixture.js");
    const historical = async (pool: Pool) => (await pool.query(
      `SELECT to_regprocedure('app.claim_worker_action(uuid,text[])') IS NULL
        AND to_regprocedure('app.control_outbox(uuid,text)') IS NULL
        AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='control_plane' AND c.relname='worker_action_binding') AS historical`,
    )).rows[0]?.historical === true;
    return { ...actual,
      ActionExecutor: class {
        constructor(private pool: Pool, private adapters: Map<string, import("../src/outbox.js").OutboundAdapter>,
          private telemetry: import("../src/outbox.js").SafeTelemetry, private digest?: (value: string) => string) {}
        async execute(context: import("../src/tenant-context.js").VerifiedTenantContext, id: string, guard?: (action: string) => void) {
          const Executor = await historical(this.pool) ? legacy.ActionExecutor : actual.ActionExecutor;
          return new Executor(this.pool, this.adapters, this.telemetry, this.digest).execute(context, id, guard);
        }
      },
      operateOutbox: (async (pool, ...args) => (await historical(pool) ? legacy.operateOutbox : actual.operateOutbox)(pool, ...args)) as typeof actual.operateOutbox,
      reconcileOutbox: (async (pool, ...args) => (await historical(pool) ? legacy.reconcileOutbox : actual.reconcileOutbox)(pool, ...args)) as typeof actual.reconcileOutbox,
    };
  });
  vi.doMock("../src/tenant-context.js", async () => {
    const actual = await vi.importActual<typeof import("../src/tenant-context.js")>("../src/tenant-context.js");
    const scopes = new WeakMap<object, Map<string, object>>();
    const deferredContexts = new WeakMap<import("../src/tenant-context.js").TenantTransaction,
      { original: import("../src/tenant-context.js").VerifiedTenantContext; bound: import("../src/tenant-context.js").VerifiedTenantContext }>();
    return { ...actual,
      bindAfterLocks: (async (db, context) => {
        const pair = deferredContexts.get(db);
        return actual.bindAfterLocks(db, pair?.original === context ? pair.bound : context);
      }) as typeof actual.bindAfterLocks,
      withTenant: (async (pool, context, work, deferred) => {
        const { needsTestRequestBinding, bindTestTenantContext } = await import("./tenant-context-test-utils.js");
        const legacyWork: typeof work = async db => {
          const { historicalOutboxTransaction } = await import("./legacy-outbox-transaction.js");
          await historicalOutboxTransaction(db);
          return work(db);
        };
        if (!needsTestRequestBinding(context)) return actual.withTenant(pool, context, legacyWork, deferred);
        // Race/loss fixtures expose connect only. Reuse that same connection:
        // acquiring a probe then a second client changes their race barriers.
        const client = typeof pool.query === "function" ? undefined : await pool.connect();
        let delegated = false;
        const requestPool = client ? { connect: async () => { delegated = true; return client; } } as Pool : pool;
        try {
          const { database, port, administrative } = (await (client ?? pool).query<{
            database: string; port: number; administrative: boolean;
          }>(`SELECT current_database() AS database, inet_server_port() AS port,
            (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS administrative`)).rows[0]!;
          // Owner fixture writes are setup, not authenticated business requests.
          if (administrative) return await actual.withTenant(requestPool, context, legacyWork, deferred);
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
            try { return await legacyWork(db); }
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
      for (const role of ["jobguard_audit_writer", "jobguard_command_writer", "jobguard_binding_owner", "jobguard_worker"]) {
        await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${role}') THEN
          CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
          END IF; END $$`);
      }
    } finally { await admin.end(); }
  };
}
