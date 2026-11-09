import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { SyntheticSyncSnapshotAdapter, type SyntheticSnapshotProvider } from "../../../apps/api/src/sync/snapshot.adapter.js";
import { SyntheticSyncDownloadApplication } from "../../../apps/api/src/sync/download.application.js";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const a = id(1), b = id(2), user = id(3), secondUser = id(4), hash = "a".repeat(64);
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, guardAdmin: Pool, guardRuntime: Pool, directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jobguard-sync-checkpoint-"));
  const port = await freePort(55500, 400);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic-only",
    persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic-only", database: "postgres" });
  try { await control.query("CREATE DATABASE jobguard_synthetic_demo"); } finally { await control.end(); }
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic-only", database: "jobguard_synthetic_demo" });
  // Upgrade proof: install the preceding schema and mark each migration exactly as migrate() does.
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS) {
    if (url.pathname.endsWith("_sync_snapshot_checkpoint.sql")) break;
    let sql = await readFile(url, "utf8");
    if (url.pathname.endsWith("/0095_job_parties.sql")) sql = sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);");
    await admin.query(sql);
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [a, b]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1),($2)", [user, secondUser]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic A'),($3,$4,'Synthetic B')", [id(20), a, id(21), b]);
  await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
    VALUES($1,$2,$3,$4,'owner'),($5,$6,$7,$4,'owner'),($8,$2,$3,$9,'owner')`,
  [id(22), a, id(20), user, id(23), b, id(21), id(24), secondUser]);
  await migrate(admin); // applies 0454 to a populated predecessor schema
  await migrate(admin); // deployment replay must preserve state
  await admin.query("CREATE ROLE sync_test_login LOGIN PASSWORD 'synthetic-runtime' INHERIT NOBYPASSRLS; GRANT jobguard_runtime TO sync_test_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "jobguard_synthetic_demo", user: "sync_test_login", password: "synthetic-runtime", max: 2 });
}, 120_000);
afterAll(async () => {
  await closeTestPools(guardRuntime, guardAdmin, runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const advance = async (client: Pick<PoolClient, "query">, u = user, r = 1, s = 1, h = hash, environment = "synthetic_demo") =>
  Number((await client.query("SELECT app.sync_snapshot_generation($1::uuid,$2::bigint,$3::bigint,$4::text,$5::text) AS g", [u, r, s, h, environment])).rows[0].g);
// Exercise the adapter authority boundary using the provider's actual PostgreSQL transaction.
const adapterAdvance = (client: Pick<PoolClient, "query">, u = user, tenant = a, r = 99) => {
  const provider: SyntheticSnapshotProvider = { withCurrentSession: async (_session, read) =>
    read({ version: "sync-provider-snapshot.v1", environment: "synthetic_demo", sessionId: id(30),
      userId: u, activeTenantId: tenant, authorityRevision: r, authority: null, source: [] }, client) };
  return new SyntheticSyncSnapshotAdapter(provider, { environment: "synthetic_demo", enabled: true, schemaVersion: 1 })
    .readCurrentSession("synthetic-session");
};
// Owner-created credentials exercise the real binding; membership IDs deliberately differ from user IDs.
const credentials = new Map<string, string>();
async function bind(client: Pick<PoolClient, "query">, tenant: string, u = user) {
  let credential = credentials.get(u);
  if (!credential) {
    credential = randomBytes(32).toString("hex");
    await admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${u}@fictional.invalid`, u]);
    await admin.query(`INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id)
      SELECT identity_user_id,tenant_id,id FROM app.membership WHERE identity_user_id=$1`, [u]);
    await admin.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
      VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`, [randomUUID(), u, credential]);
    credentials.set(u, credential);
  }
  await client.query("SELECT app.bind_request('real',$1,$2)", [credential, tenant]);
}
const scoped = (tenant: string, u = user, r = 1, s = 1, h = hash) =>
  withTenant(runtime, testTenantContext(tenant), async db => {
    await bind(db.$client, tenant, u);
    return advance(db.$client, u, r, s, h);
  });

describe("M3-3 durable checkpoint SQL", () => {
  it("refuses synthetic checkpoint writes in a differently named database after a fresh migration", async () => {
    const database = "jobguard_sync_checkpoint_guard";
    await admin.query(`CREATE DATABASE ${database}`);
    // pg hides the password from Pool.options, so state it when reusing the options.
    guardAdmin = new Pool({ ...admin.options, password: "synthetic-only", database });
    await migrate(guardAdmin); // Fresh install of all migrations, including the new guard.
    expect((await guardAdmin.query("SELECT current_database() AS name")).rows[0].name).toBe(database);
    await guardAdmin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [a]);
    await guardAdmin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
    await guardAdmin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic guard fixture')", [id(20), a]);
    await guardAdmin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
      VALUES($1,$2,$3,$4,'owner')`, [id(22), a, id(20), user]);
    guardRuntime = new Pool({ ...runtime.options, password: "synthetic-runtime", database });
    // Valid tenant, active member and synthetic environment: only the database name differs.
    await expect(withTenant(guardRuntime, testTenantContext(a), db => advance(db.$client)))
      .rejects.toThrow("SYNC_CHECKPOINT_INVALID");
    expect((await guardAdmin.query("SELECT * FROM app.sync_snapshot_checkpoint")).rows).toEqual([]);
  });

  it.each(["absent", "foreign", "revoked", "expired"])("refuses a user with %s membership without inserting a checkpoint", async status => {
    const u = id(100 + ["absent", "foreign", "revoked", "expired"].indexOf(status));
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [u]);
    if (status !== "absent") {
      await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role,revoked_at,expires_at)
        VALUES($1,$2,$3,$1,'owner',$4,$5)`, [u, status === "foreign" ? b : a, status === "foreign" ? id(21) : id(20),
        status === "revoked" ? "2020-01-01T00:00:00Z" : null, status === "expired" ? "2020-01-01T00:00:00Z" : null]);
    }
    await expect(withTenant(runtime, testTenantContext(a), async db => {
      await bind(db.$client, a);
      return adapterAdvance(db.$client, u);
    })).rejects.toThrow("SYNC_AUTHORITY_REQUIRED");
    expect((await admin.query("SELECT * FROM app.sync_snapshot_checkpoint WHERE user_id=$1", [u])).rows).toEqual([]);
  });

  it.each(["revoked_at", "expires_at"])("refuses checkpoint advancement after membership %s changes", async column => {
    const u = id(column === "revoked_at" ? 110 : 111);
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [u]);
    await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
      VALUES($1,$2,$3,$1,'owner')`, [u, a, id(20)]);
    expect(await scoped(a, u)).toBe(1);
    await expect(withTenant(runtime, testTenantContext(a), async db => {
      await bind(db.$client, a, u);
      await admin.query(`UPDATE app.membership SET ${column}='2020-01-01T00:00:00Z' WHERE tenant_id=$1 AND id=$2`, [a, u]);
      return adapterAdvance(db.$client, u, a, 2);
    })).rejects.toThrow("SYNC_AUTHORITY_REQUIRED");
    expect((await admin.query("SELECT authority_revision,generation FROM app.sync_snapshot_checkpoint WHERE tenant_id=$1 AND user_id=$2", [a, u])).rows)
      .toEqual([{ authority_revision: "1", generation: "1" }]);
  });

  it("refuses a provider tenant mismatch without bumping either tenant's checkpoint", async () => {
    expect(await scoped(a)).toBe(1); expect(await scoped(b)).toBe(1);
    const before = (await admin.query("SELECT * FROM app.sync_snapshot_checkpoint ORDER BY tenant_id,user_id")).rows;
    const provider: SyntheticSnapshotProvider = { withCurrentSession: async (_session, read) =>
      withTenant(runtime, testTenantContext(b), async db => {
        await bind(db.$client, b);
        return read({ version: "sync-provider-snapshot.v1", environment: "synthetic_demo",
        sessionId: id(30), userId: user, activeTenantId: a, authorityRevision: 99, authority: null, source: [] }, db.$client);
      }) };
    const store = new SyntheticSyncSnapshotAdapter(provider, { environment: "synthetic_demo", enabled: true, schemaVersion: 1 });
    await expect(store.readCurrentSession("synthetic-session")).rejects.toMatchObject({ code: "SYNC_AUTHORITY_REQUIRED" });
    expect((await admin.query("SELECT * FROM app.sync_snapshot_checkpoint ORDER BY tenant_id,user_id")).rows).toEqual(before);
  });

  it("refuses a contractor membership revocation without writing a checkpoint", async () => {
    const u = id(112);
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [u]);
    await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
      VALUES($1,$2,$3,$1,'owner')`, [u, a, id(20)]);
    await admin.query("INSERT INTO app.contractor_member(tenant_id,membership_id,email) VALUES($1,$2,'revoked@example.invalid')", [a, u]);
    await expect(withTenant(runtime, testTenantContext(a), async db => {
      await bind(db.$client, a, u);
      await admin.query("INSERT INTO app.contractor_membership_revocation(tenant_id,id,membership_id) VALUES($1,$2,$2)", [a, u]);
      return adapterAdvance(db.$client, u);
    })).rejects.toThrow("SYNC_AUTHORITY_REQUIRED");
    expect((await admin.query("SELECT * FROM app.sync_snapshot_checkpoint WHERE user_id=$1", [u])).rows).toEqual([]);
  });

  it("allows the bound owner through the adapter and persists its checkpoint", async () => {
    const u = id(115), membership = id(116);
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [u]);
    await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
      VALUES($1,$2,$3,$4,'owner')`, [membership, a, id(20), u]);
    const result = await withTenant(runtime, testTenantContext(a), async db => {
      await bind(db.$client, a, u);
      expect((await db.$client.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(membership);
      return adapterAdvance(db.$client, u, a, 1);
    });
    expect(result).toMatchObject({ userId: u, activeTenantId: a, generation: 1 });
    expect((await admin.query("SELECT authority_revision,generation FROM app.sync_snapshot_checkpoint WHERE tenant_id=$1 AND user_id=$2", [a, u])).rows)
      .toEqual([{ authority_revision: "1", generation: "1" }]);
  });

  it("binds the owner membership ID to its identity user and refuses another active user without writes", async () => {
    const before = (await admin.query("SELECT * FROM app.sync_snapshot_checkpoint ORDER BY tenant_id,user_id")).rows;
    await expect(withTenant(runtime, testTenantContext(a), async db => {
      await bind(db.$client, a);
      expect((await db.$client.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(id(22));
      return adapterAdvance(db.$client, secondUser);
    })).rejects.toThrow("SYNC_AUTHORITY_REQUIRED");
    expect((await admin.query("SELECT * FROM app.sync_snapshot_checkpoint ORDER BY tenant_id,user_id")).rows).toEqual(before);
    expect(await scoped(a)).toBe(1);
  });

  it("refuses a tenant-only unbound transaction without writing even with forged actor settings", async () => {
    const before = (await admin.query("SELECT * FROM app.sync_snapshot_checkpoint ORDER BY tenant_id,user_id")).rows;
    await expect(withTenant(runtime, testTenantContext(a), async db => {
      await db.$client.query("SELECT set_config('app.actor_id',$1,true)", [id(22)]);
      return adapterAdvance(db.$client);
    })).rejects.toThrow("SYNC_AUTHORITY_REQUIRED");
    expect((await admin.query("SELECT * FROM app.sync_snapshot_checkpoint ORDER BY tenant_id,user_id")).rows).toEqual(before);
  });

  it("refuses a tenant setting different from the binding without changing either checkpoint", async () => {
    const before = (await admin.query("SELECT * FROM app.sync_snapshot_checkpoint ORDER BY tenant_id,user_id")).rows;
    await expect(withTenant(runtime, testTenantContext(a), async db => {
      await bind(db.$client, a);
      await db.$client.query("SELECT set_config('app.tenant_id',$1,true)", [b]);
      return adapterAdvance(db.$client);
    })).rejects.toThrow("SYNC_AUTHORITY_REQUIRED");
    expect((await admin.query("SELECT * FROM app.sync_snapshot_checkpoint ORDER BY tenant_id,user_id")).rows).toEqual(before);
  });

  it("refuses a bound membership removed before advancement without inserting a checkpoint", async () => {
    const u = id(113), membership = id(114);
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [u]);
    await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
      VALUES($1,$2,$3,$4,'owner')`, [membership, a, id(20), u]);
    await expect(withTenant(runtime, testTenantContext(a), async db => {
      await bind(db.$client, a, u);
      await admin.query("DELETE FROM identity.membership_locator WHERE user_id=$1", [u]);
      await admin.query("DELETE FROM app.membership WHERE tenant_id=$1 AND id=$2", [a, membership]);
      return adapterAdvance(db.$client, u);
    })).rejects.toThrow("SYNC_AUTHORITY_REQUIRED");
    expect((await admin.query("SELECT * FROM app.sync_snapshot_checkpoint WHERE user_id=$1", [u])).rows).toEqual([]);
  });

  it("serializes concurrent duplicate first use, then preserves generation across migration replay and reconnection", async () => {
    expect(await Promise.all([scoped(a), scoped(a)])).toEqual([1, 1]);
    await migrate(admin);
    expect(await scoped(a)).toBe(1);
    expect(await scoped(a, user, 2)).toBe(2);
    expect(await scoped(a, user, 2, 2)).toBe(3);
    expect(await scoped(a, user, 2, 2)).toBe(3);
    // A new physical connection reads the persisted generation, not process state.
    const client = await runtime.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [a]); await bind(client, a);
      expect(await advance(client, user, 2, 2)).toBe(3); await client.query("COMMIT");
    } finally { client.release(); }
  });

  it("refuses stale/reordered revisions, schema downgrades and same revision/different scope without mutation", async () => {
    await expect(scoped(a, user, 1, 2)).rejects.toThrow("SYNC_CHECKPOINT_STALE");
    await expect(scoped(a, user, 2, 1)).rejects.toThrow("SYNC_CHECKPOINT_STALE");
    await expect(scoped(a, user, 2, 2, "b".repeat(64))).rejects.toThrow("SYNC_CHECKPOINT_STALE");
    expect(await scoped(a, user, 3, 2, "b".repeat(64))).toBe(4);
    expect(await scoped(a, user, 5, 2, hash)).toBe(5); // revoke/regrant not observed by downloads
  });

  it("isolates tenant/user checkpoints and rolls failed transactions back", async () => {
    expect(await scoped(b)).toBe(1); expect(await scoped(a, secondUser)).toBe(1);
    await expect(withTenant(runtime, testTenantContext(b), async db => {
      await bind(db.$client, b);
      expect(await advance(db.$client, user, 2)).toBe(2); throw Error("synthetic rollback");
    })).rejects.toThrow("synthetic rollback");
    expect(await scoped(b)).toBe(1);
    await withTenant(runtime, testTenantContext(b), async db => {
      const rows = await db.$client.query("SELECT tenant_id FROM app.sync_snapshot_checkpoint");
      expect(rows.rows).toEqual([{ tenant_id: b }]);
      expect((await db.$client.query("SELECT * FROM app.sync_snapshot_checkpoint WHERE tenant_id=$1", [a])).rows).toEqual([]);
    });
  });

  it("fails closed without context, live environment, valid bounds, or controlled write permission", async () => {
    await expect(advance(runtime)).rejects.toThrow("SYNC_CHECKPOINT_INVALID");
    for (const [r, s, h, e] of [[-1, 1, hash, "synthetic_demo"], [1, 0, hash, "synthetic_demo"],
      [1, 1, "bad", "synthetic_demo"], [1, 1, hash, "production"], [9007199254740992, 1, hash, "synthetic_demo"]] as const) {
      await expect(withTenant(runtime, testTenantContext(b), async db => {
        await bind(db.$client, b);
        return advance(db.$client, user, r, s, h, e);
      })).rejects.toThrow("SYNC_CHECKPOINT_INVALID");
    }
    for (const statement of ["UPDATE app.sync_snapshot_checkpoint SET generation=1", "DELETE FROM app.sync_snapshot_checkpoint", "TRUNCATE app.sync_snapshot_checkpoint"]) {
      await expect(withTenant(runtime, testTenantContext(b), db => db.$client.query(statement))).rejects.toThrow("permission denied");
    }
    const catalog = await admin.query(`SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner
      FROM pg_class WHERE oid='app.sync_snapshot_checkpoint'::regclass`);
    expect(catalog.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration" }]);
    const acl = await admin.query(`SELECT has_function_privilege('jobguard_runtime','app.sync_snapshot_generation(uuid,bigint,bigint,text,text)','EXECUTE') AS runtime,
      has_function_privilege('jobguard_infrastructure','app.sync_snapshot_generation(uuid,bigint,bigint,text,text)','EXECUTE') AS infrastructure`);
    expect(acl.rows).toEqual([{ runtime: true, infrastructure: false }]);
  });

  it("runs the fake authenticated provider through real persisted checkpoints and the scoped-token gate", async () => {
    const principal = id(9), job = id(10), otherJob = id(11);
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [principal]);
    await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
      VALUES($1,$2,$3,$4,'owner')`, [id(14), a, id(20), principal]);
    const row = (jobId: string, tenantId = a) => ({ tenantId, jobId, workOrderId: id(12), reference: "Synthetic",
      priority: "routine", issuedOn: "2026-10-29", dueOn: null, openVisitId: null, shadow: "HIDDEN", bank: "BANK" });
    const facts = { version: "sync-provider-snapshot.v1", environment: "synthetic_demo", sessionId: id(13), userId: principal,
      activeTenantId: a, authorityRevision: 1, authority: { userId: principal, tenantId: a, membershipId: id(14),
        role: "operative", status: "active", assignedJobIds: [job] }, source: [row(job), row(otherJob), row(job, b)] };
    const provider: SyntheticSnapshotProvider = { withCurrentSession: async (session, read) => session === "synthetic-session"
      ? withTenant(runtime, testTenantContext(a), async db => {
        await bind(db.$client, a, principal);
        return read(structuredClone(facts), db.$client);
      }) : null };
    const app = (schemaVersion = 1) => new SyntheticSyncDownloadApplication(new SyntheticSyncSnapshotAdapter(provider,
      { environment: "synthetic_demo", enabled: true, schemaVersion }), { environment: "synthetic_demo", enabled: true }, () => 1000);
    const request = { version: "sync-subscription-request.v1", requestedTenantId: a, profile: "contractor_assigned_jobs.v1" };
    const subscribe = (application = app()) => application.subscribe("synthetic-session", { version: "sync-server-subscribe.v1", request });
    const old = await subscribe();
    const download = (token: string, application = app()) => application.download("synthetic-session", {
      version: "sync-server-download.v1", request, token, delivered: [job], afterJobId: null, pageSize: 10 });
    const first = await download(old.token);
    expect(first.page.rows.map(r => r.jobId)).toEqual([job]);
    expect(JSON.stringify(first)).not.toMatch(/HIDDEN|BANK/u);
    expect(await download(old.token, app())).toEqual(first); // new adapter; same durable database
    facts.authority.status = "revoked"; facts.authorityRevision++;
    expect((await download(old.token)).resync).toBe("required");
    facts.authority.status = "active"; facts.authorityRevision++;
    expect((await download(old.token)).page.rows).toEqual([]);
    const renewed = await subscribe();
    expect((await download(renewed.token)).page.rows).toHaveLength(1);
    expect((await download(renewed.token, app(2))).resync).toBe("required");
    const upgraded = await subscribe(app(2));
    expect((await download(upgraded.token, app(2))).page.rows).toHaveLength(1);
  });

  it.each(["revoked_at", "expires_at"])("requires download cleanup after persisted membership %s changes", async column => {
    const principal = id(column === "revoked_at" ? 120 : 121), job = id(122), otherJob = id(123);
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [principal]);
    await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
      VALUES($1,$2,$3,$1,'owner')`, [principal, a, id(20)]);
    // Keep provider facts active: the database authority boundary must detect the revocation.
    const facts = { version: "sync-provider-snapshot.v1", environment: "synthetic_demo", sessionId: id(124),
      userId: principal, activeTenantId: a, authorityRevision: 1, authority: { userId: principal, tenantId: a,
        membershipId: principal, role: "operative", status: "active", assignedJobIds: [job, otherJob] },
      source: [job, otherJob].map(jobId => ({ tenantId: a, jobId, workOrderId: id(125), reference: "Synthetic",
        priority: "routine", issuedOn: "2026-10-29", dueOn: null, openVisitId: null })) };
    let revokeAfterBinding = false;
    const provider: SyntheticSnapshotProvider = { withCurrentSession: async (_session, read) =>
      withTenant(runtime, testTenantContext(a), async db => {
        await bind(db.$client, a, principal);
        // Model revocation racing an already authenticated request.
        if (revokeAfterBinding) await admin.query(
          `UPDATE app.membership SET ${column}='2020-01-01T00:00:00Z' WHERE tenant_id=$1 AND id=$2`, [a, principal]);
        return read(facts, db.$client);
      }) };
    const application = new SyntheticSyncDownloadApplication(new SyntheticSyncSnapshotAdapter(provider,
      { environment: "synthetic_demo", enabled: true, schemaVersion: 1 }), { environment: "synthetic_demo", enabled: true }, () => 1000);
    const request = { version: "sync-subscription-request.v1", requestedTenantId: a, profile: "contractor_assigned_jobs.v1" };
    const issued = await application.subscribe("synthetic-session", { version: "sync-server-subscribe.v1", request });
    const input = { version: "sync-server-download.v1", request, token: issued.token,
      delivered: [job, otherJob], afterJobId: null, pageSize: 10 };
    expect((await application.download("synthetic-session", input)).page.rows.map(row => row.jobId)).toEqual([job, otherJob]);
    revokeAfterBinding = true;
    const result = await application.download("synthetic-session", input);
    expect(result.page.outcome).toBe("refused");
    expect(result.page.rows).toEqual([]);
    expect(result.page.cleanup).toBe("required");
    expect(result.resync).toBe("required");
    expect(result.cleanup.outcome).toBe("cleanup_required");
    expect(result.cleanup.tombstones).toEqual([{ jobId: job }, { jobId: otherJob }]);
    expect(result.cleanup.keep).toEqual([]);
  });

  it("refuses generation overflow instead of wrapping or resetting", async () => {
    await admin.query("UPDATE app.sync_snapshot_checkpoint SET generation=9007199254740991 WHERE tenant_id=$1 AND user_id=$2", [b, user]);
    expect(await scoped(b)).toBe(Number.MAX_SAFE_INTEGER);
    await expect(scoped(b, user, 2)).rejects.toThrow();
    expect(await scoped(b)).toBe(Number.MAX_SAFE_INTEGER);
  });
});
