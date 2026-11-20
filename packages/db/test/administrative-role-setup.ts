import { readFileSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { expect, vi } from "vitest";
import { closeWorkerFixtureCluster, registerWorkerFixtureCluster, workerFixturePool } from "./worker-login-fixture.js";

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
  // Existing journey assertions execute against a genuinely separate, table-free
  // worker login. The fixture supplies credentials; no production code derives them.
  vi.doMock("../src/worker-pool.js", async () => {
    const actual = await vi.importActual<typeof import("../src/worker-pool.js")>("../src/worker-pool.js");
    return { ...actual, outboundWorkerPool: workerFixturePool };
  });
  vi.doMock("../src/tenant-context.js", async () => {
    const actual = await vi.importActual<typeof import("../src/tenant-context.js")>("../src/tenant-context.js");
    const scopes = new WeakMap<object, Map<string, object>>();
    const deferredContexts = new WeakMap<import("../src/tenant-context.js").TenantTransaction,
      { original: import("../src/tenant-context.js").VerifiedTenantContext; bound: import("../src/tenant-context.js").VerifiedTenantContext }>();
    return { ...actual,
      // Historical upgrade databases predate LP-6d's credential bridge (0740): their contractor session
      // bridge never bound, so the issued credential has nothing to bind against. Current schemas bind for real.
      bindIssuedCredential: Object.assign(async (client: import("pg").PoolClient, context: import("../src/tenant-context.js").VerifiedTenantContext) => {
        const installed = (await client.query(`SELECT to_regprocedure('app.lp6d_contractor_session_identity(uuid)') IS NOT NULL installed`)).rows[0].installed;
        if (installed) await actual.bindIssuedCredential(client, context);
      }, { recordVisitRefusal: actual.bindIssuedCredential.recordVisitRefusal }),
      bindAfterLocks: (async (db, context) => {
        const pair = deferredContexts.get(db);
        return actual.bindAfterLocks(db, pair?.original === context ? pair.bound : context);
      }) as typeof actual.bindAfterLocks,
      withTenant: (async (pool, context, work, deferred) => {
        const { needsTestRequestBinding, bindTestTenantContext, testTenantContext } = await import("./tenant-context-test-utils.js");
        // A historical database has no binding API, so this fixture client runs unbound. Map a
        // late-binding approval's own context to that replacement, as the bound path below does.
        const historical = async (target: Pool, original: typeof context, run: typeof work, label: typeof deferred) => {
          const replacement = testTenantContext(original.tenantId, { bindRequest: false });
          return actual.withTenant(target, replacement, async db => {
            deferredContexts.set(db, { original, bound: replacement });
            try { return await run(db); } finally { deferredContexts.delete(db); }
          }, label);
        };
        // Production-shaped contexts go straight to the real boundary (no probe connection, so
        // connect counts and race barriers stay exact). Only a historical upgrade database with
        // no binding API retries this fixture client unbound.
        if (!needsTestRequestBinding(context)) {
          try { return await actual.withTenant(pool, context, work, deferred); }
          catch (error) {
            if ((error as { code?: string }).code !== "42883" || !/app\.bind_request/u.test(String((error as Error).message))) throw error;
            return await historical(pool, context, work, deferred);
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
            return await historical(requestPool, context, work, deferred);
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
          // LP-11's fixture binds on the checked-out client while looking up its
          // persisted credential through the admin pool.
          const owner = new Pool({host:"127.0.0.1",port:connection.port,database:connection.database,...credentials,max:2});
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
  if (["extra-approval-authority.integration.test.ts", "extra-approval-upgrade.integration.test.ts", "real-gap-proof-by-trade.integration.test.ts"]
    .some(name => testPath.endsWith(`/${name}`))) {
    vi.doMock("../src/evidence.js", async () => {
      const actual = await vi.importActual<typeof import("../src/evidence.js")>("../src/evidence.js");
      class HistoricalEvidenceFixture extends actual.EvidenceService {
        constructor(pool: Pool, storage: ConstructorParameters<typeof actual.EvidenceService>[1], syntheticAudio?: boolean) {
          const fixturePool = Object.create(pool) as Pool;
          // The fixture's direct catalogue probe uses pg's callback-based pool query.
          fixturePool.query = pool.query.bind(pool);
          fixturePool.connect = (async () => {
            const client = await pool.connect();
            return {
              release: client.release.bind(client),
              query: async (sql: string, params?: unknown[]) => {
                if (sql.startsWith("SELECT app.verify_evidence_upload(")) {
                  const installed = await client.query("SELECT to_regprocedure('app.verify_evidence_upload(uuid,uuid,text,text,bytea)') IS NOT NULL installed");
                  if (!installed.rows[0].installed) {
                    // Seed through the historical PostgreSQL rules before the
                    // cutover. The current schema always calls its verifier.
                    return client.query(`UPDATE app.evidence_upload SET state='verified',server_verified_at=clock_timestamp(),rejection_code=NULL
                      WHERE (tenant_id,id)=($1,$2)`, params?.slice(0, 2));
                  }
                }
                return client.query(sql, params);
              },
            };
          }) as Pool["connect"];
          super(fixturePool, storage, syntheticAudio);
        }
      }
      return { ...actual, EvidenceService: HistoricalEvidenceFixture };
    });
  }
  const historicalOutboxSpecs = [
    "builder-acceptance-sent-head.integration.test.ts",
    "lp6d-worker-presence.integration.test.ts",
    "practice-firm-name.integration.test.ts",
    "quote-reacceptance-upgrade.integration.test.ts",
    "lp8a-billing-revokes.integration.test.ts",
    "migfix-4-upgrade.integration.test.ts",
    "migfix-8-upgrade.integration.test.ts",
    "practice-supplier-credit-upgrade.integration.test.ts",
    "recovery-case-terms-upgrade.integration.test.ts",
    "recovery-follow-up-upgrade.integration.test.ts",
    "recovery-message-upgrade.integration.test.ts",
    "recovery-pursuit-terms-upgrade.integration.test.ts",
  ];
  if (historicalOutboxSpecs.some(name => testPath.endsWith(`/${name}`))) {
    vi.doMock("../src/outbox.js", async () => {
      const actual = await vi.importActual<typeof import("../src/outbox.js")>("../src/outbox.js");
      const { createHash } = await import("node:crypto");
      const append: typeof actual.appendOutboundAction = async (db, tenant, raw) => {
        // The upgrade fixtures populate genuine old databases using their original
        // transport. Once 0767 exists, they exercise the checked transport.
        const installed = await db.$client.query("SELECT to_regprocedure('app.lp8b_outbox_guard()') IS NOT NULL installed");
        if (installed.rows[0].installed) return actual.appendOutboundAction(db, tenant, raw);
        const action = actual.outboundActionV1Schema.parse(raw);
        if (createHash("sha256").update(action.immutableContent).digest("hex") !== action.contentHash) {
          throw new Error("CONTENT_HASH_MISMATCH");
        }
        await db.$client.query(`INSERT INTO app.action_outbox
          (id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,
           immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [action.id,tenant,action.authorizationId,action.adapter,action.providerEffectKey,action.actionType,
         action.recipient,action.contentHash,action.immutableContent,action.aggregateRevision,action.amountPence,
         action.currency,action.policyVersion,action.authorizationExpiresAt]);
      };
      return { ...actual, appendOutboundAction: append };
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
  const stop = EmbeddedPostgres.prototype.stop;
  const clusterPort = (postgres: EmbeddedPostgres) =>
    (postgres as unknown as { options: { port: number } }).options.port;
  EmbeddedPostgres.prototype.stop = async function () {
    const port = clusterPort(this);
    clusterAdmins.delete(port);
    try {
      await closeWorkerFixtureCluster(port);
    } finally {
      await stop.call(this);
    }
  };
  EmbeddedPostgres.prototype.start = async function () {
    await start.call(this);
    const { port, user, password } = (this as unknown as { options: { port: number; user: string; password: string } }).options;
    clusterAdmins.set(port,{user,password});
    registerWorkerFixtureCluster(port, {user,password});
    if (readFileSync(testPath, "utf8").includes("bootstrapSyntheticDemo")) return;
    const admin = new Pool({ host: "127.0.0.1", port, user, password, database: "postgres" });
    try {
      for (const role of ["jobguard_audit_writer", "jobguard_command_writer", "jobguard_binding_owner", "jobguard_worker", "jobguard_session_lookup", "jobguard_money_owner"]) {
        await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${role}') THEN
          CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
          END IF; END $$`);
      }
    } finally { await admin.end(); }
  };
}
