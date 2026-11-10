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
if (testPath?.endsWith("/audit-dbsrc-03.test.ts")) {
  vi.doMock("../src/customer-billing-repository.js",async()=>{
    const actual=await vi.importActual<typeof import("../src/customer-billing-repository.js")>("../src/customer-billing-repository.js");
    const {legacyBillingTransport}=await import("./lp8a-legacy-billing-transport.js");
    return legacyBillingTransport(actual);
  });
}

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
      bindAfterLocks: (async (db, context) => {
        const pair = deferredContexts.get(db);
        return actual.bindAfterLocks(db, pair?.original === context ? pair.bound : context);
      }) as typeof actual.bindAfterLocks,
      withTenant: (async (pool, context, work, deferred) => {
        const { needsTestRequestBinding, bindTestTenantContext } = await import("./tenant-context-test-utils.js");
        if (!needsTestRequestBinding(context)) return actual.withTenant(pool, context, work, deferred);
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
          if (administrative) return await actual.withTenant(requestPool, context, work, deferred);
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
  // These two unchanged historical specs exercise legacy API receipts and credit
  // races. Supply their now-required real lock/check fixtures before FIRST issue;
  // refusal/attack suites and all explicit contexts remain untouched.
  if (["final-account.integration.test.ts", "audit-dbsrc-03.integration.test.ts"].some(name => testPath?.endsWith(`/` + name))) {
    vi.doMock("../src/customer-billing-repository.js", async () => {
      const actual = await vi.importActual<typeof import("../src/customer-billing-repository.js")>("../src/customer-billing-repository.js");
      class LegacyBillingFixture extends actual.CustomerBillingCommandService {
        constructor(private readonly fixturePool: Pool) { super(fixturePool); }
        override async issue(context: Parameters<import("../src/customer-billing-repository.js").CustomerBillingCommandService["issue"]>[0], raw: unknown) {
          const input = actual.issueCustomerInvoiceV1.parse(raw);
          const connection = (await this.fixturePool.query<{database:string;port:number}>("SELECT current_database() database,inet_server_port() port")).rows[0]!;
          const credentials = clusterAdmins.get(Number(connection.port));
          if (!credentials) throw new Error("Missing legacy billing fixture administrator");
          const owner = new Pool({host:"127.0.0.1",port:connection.port,database:connection.database,...credentials,max:1});
          try {
            const row = (await owner.query(`SELECT r.* FROM app.final_account_revision r JOIN app.final_account_draft d
              ON(d.tenant_id,d.job_id,d.id)=(r.tenant_id,r.job_id,r.final_account_draft_id)
              WHERE r.tenant_id=$1 AND r.job_id=$2 AND r.id=$3 AND d.current_revision_id=r.id AND NOT r.issue_blocked
              AND r.revision=$4 AND r.total_pence=$5
              AND NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=r.tenant_id AND job_id=r.job_id)`,
              [context.tenantId,input.command.subjectRef,input.finalAccountRevisionId,input.command.action.aggregateRevision,input.command.action.amountPence])).rows[0];
            if(row) {
              const {prepareBaselineInvoice} = await import("./sv5pre-fixtures.js");
              await prepareBaselineInvoice(owner,this.fixturePool,context.tenantId,row.job_id,input.command.actorMembershipId,row.id,row.baseline_quote_version_id,Number(row.net_pence));
            }
          } finally { await owner.end(); }
          return super.issue(context,raw);
        }
      }
      return {...actual,CustomerBillingCommandService:LegacyBillingFixture};
    });
  }
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
