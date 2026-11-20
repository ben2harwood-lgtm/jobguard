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
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
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
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const advance = async (client: Pick<PoolClient, "query">, u = user, r = 1, s = 1, h = hash, environment = "synthetic_demo") =>
  Number((await client.query("SELECT app.sync_snapshot_generation($1::uuid,$2::bigint,$3::bigint,$4::text,$5::text) AS g", [u, r, s, h, environment])).rows[0].g);
const scoped = (tenant: string, u = user, r = 1, s = 1, h = hash) =>
  withTenant(runtime, testTenantContext(tenant), db => advance(db.$client, u, r, s, h));

describe("M3-3 durable checkpoint SQL", () => {
  it.each(["absent", "foreign", "revoked", "expired"])("refuses a user with %s membership without inserting a checkpoint", async status => {
    const u = id(100 + ["absent", "foreign", "revoked", "expired"].indexOf(status));
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [u]);
    if (status !== "absent") {
      await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role,revoked_at,expires_at)
        VALUES($1,$2,$3,$1,'owner',$4,$5)`, [u, status === "foreign" ? b : a, status === "foreign" ? id(21) : id(20),
        status === "revoked" ? "2020-01-01T00:00:00Z" : null, status === "expired" ? "2020-01-01T00:00:00Z" : null]);
    }
    await expect(scoped(a, u)).rejects.toThrow("SYNC_CHECKPOINT_INVALID");
    expect((await admin.query("SELECT * FROM app.sync_snapshot_checkpoint WHERE user_id=$1", [u])).rows).toEqual([]);
  });

  it.each(["revoked_at", "expires_at"])("refuses checkpoint advancement after membership %s changes", async column => {
    const u = id(column === "revoked_at" ? 110 : 111);
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [u]);
    await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
      VALUES($1,$2,$3,$1,'owner')`, [u, a, id(20)]);
    expect(await scoped(a, u)).toBe(1);
    await admin.query(`UPDATE app.membership SET ${column}='2020-01-01T00:00:00Z' WHERE tenant_id=$1 AND id=$2`, [a, u]);
    await expect(scoped(a, u, 2)).rejects.toThrow("SYNC_CHECKPOINT_INVALID");
    expect((await admin.query("SELECT authority_revision,generation FROM app.sync_snapshot_checkpoint WHERE tenant_id=$1 AND user_id=$2", [a, u])).rows)
      .toEqual([{ authority_revision: "1", generation: "1" }]);
  });

  it("refuses a provider tenant mismatch without bumping either tenant's checkpoint", async () => {
    expect(await scoped(a)).toBe(1); expect(await scoped(b)).toBe(1);
    const before = (await admin.query("SELECT * FROM app.sync_snapshot_checkpoint ORDER BY tenant_id,user_id")).rows;
    const provider: SyntheticSnapshotProvider = { withCurrentSession: async (_session, read) =>
      withTenant(runtime, testTenantContext(b), db => read({ version: "sync-provider-snapshot.v1", environment: "synthetic_demo",
        sessionId: id(30), userId: user, activeTenantId: a, authorityRevision: 99, authority: null, source: [] }, db.$client)) };
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
    await admin.query("INSERT INTO app.contractor_membership_revocation(tenant_id,id,membership_id) VALUES($1,$2,$2)", [a, u]);
    await expect(scoped(a, u)).rejects.toThrow("SYNC_CHECKPOINT_INVALID");
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
      await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [a]);
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
      await expect(withTenant(runtime, testTenantContext(b), db => advance(db.$client, user, r, s, h, e))).rejects.toThrow("SYNC_CHECKPOINT_INVALID");
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
      ? withTenant(runtime, testTenantContext(a), db => read(structuredClone(facts), db.$client)) : null };
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

  it("refuses generation overflow instead of wrapping or resetting", async () => {
    await admin.query("UPDATE app.sync_snapshot_checkpoint SET generation=9007199254740991 WHERE tenant_id=$1 AND user_id=$2", [b, user]);
    expect(await scoped(b)).toBe(Number.MAX_SAFE_INTEGER);
    await expect(scoped(b, user, 2)).rejects.toThrow();
    expect(await scoped(b)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("connected synthetic native downloads", () => {
  it("pages real assignments, resumes a lost page, and purges on reassignment, switching and revocation", async () => {
    const { randomUUID } = await import("node:crypto");
    const { PostgresSyntheticMobileAuthStore, WorkOrderRepository, demoFile, demoRow } = await import("../src/index.js");
    const { MemoryAuthProvider } = await import("../../../apps/api/src/auth/auth-provider.js");
    const { SyntheticMobileAuthApplication } = await import("../../../apps/api/src/auth/mobile-auth.application.js");
    const { SyntheticNativeDownloadConnection } = await import("../../../apps/api/src/sync/native-download.connection.js");
    const { cluster, command, reviseOrder, visitFixture } = await import("./site-visit-fixtures.js");
    const { NativeDownloadConnection } = await import(new URL("../../../apps/mobile/src/download-transport.ts", import.meta.url).href);
    const { NativeDownloads } = await import(new URL("../../../apps/mobile/src/download.ts", import.meta.url).href);
    const { WorkspaceDocument } = await import(new URL("../../../apps/mobile/src/workspace-document.ts", import.meta.url).href);
    const { MobileClient } = await import(new URL("../../../apps/mobile/src/lifecycle.ts", import.meta.url).href);
    const c = await cluster();
    let identity: Pool | undefined;
    try {
      const north = await visitFixture(c), south = await visitFixture(c);
      const orders = new WorkOrderRepository(c.runtime);
      const added = await orders.importCsv(north.p, {
        commandId: randomUUID(), name: "fictional-download-pages.csv", kind: "csv",
        csv: demoFile(Array.from({ length: 204 }, (_, i) => demoRow(north.demo, i + 3))),
      });
      expect(added.rows).toHaveLength(204);
      expect(added.rows.every(row => row.outcome === "created")).toBe(true);

      type Member = import("../../../apps/api/src/auth/auth-provider.js").ActiveMembership;
      class FictionalAuth extends MemoryAuthProvider {
        readonly roster: Member[] = [];
        override fixtureMemberships() { return this.roster; }
        override async findMembership(principal: import("../../../apps/api/src/auth/auth-provider.js").AuthPrincipal, tenantId: string) {
          return this.roster.find(m => m.identityUserId === principal.identityUserId && m.tenantId === tenantId);
        }
      }
      const origin = "https://fictional-jobguard.example.test";
      const source = new FictionalAuth("fictional-download-session-secret", () => {}, () => 1000, () => "12345678");
      async function enroll(label: string, members: { member: import("../src/index.js").AuthenticatedMembership; role: Member["role"] }[]) {
        const email = `${label}@example.invalid`;
        await source.requestCode({ email, purpose: "signup", ip: "192.0.2.1" });
        const credentials = await source.verifyCode(email, "signup", "12345678");
        const principal = (await source.authenticate(credentials.sessionToken))!;
        await c.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [principal.identityUserId]);
        for (const { member, role } of members) {
          await c.admin.query("UPDATE app.membership SET identity_user_id=$3 WHERE tenant_id=$1 AND id=$2",
            [member.tenantId, member.membershipId, principal.identityUserId]);
          source.roster.push({ id: member.membershipId, tenantId: member.tenantId, identityUserId: principal.identityUserId, role, email });
        }
        return (tenantId: string) => ({ ...credentials, origin, requestedTenantId: tenantId });
      }
      const operative = await enroll("fictional-operative", [north.members.operative, south.members.operative].map(({ member }) => ({ member, role: "operative" })));
      const supervisor = await enroll("fictional-supervisor", [{ member: north.named.member, role: "foreman" }]);
      const finance = await enroll("fictional-finance", [{ member: north.members.finance.member, role: "finance" }]);
      const policy = { version: "mobile-auth-policy-specimen.v1", environment: "synthetic_demo", policyVersion: "fictional_mobile_auth_policy_v1",
        accessDurationMs: 100, refreshDurationMs: 500, sessionDurationMs: 1000, readLeaseDurationMs: 200 };
      await c.admin.query("ALTER ROLE jobguard_identity LOGIN PASSWORD 'fictional-native-identity'");
      identity = new Pool({ ...c.config, database: "jobguard_synthetic_demo",
        user: "jobguard_identity", password: "fictional-native-identity" });
      const auth = new SyntheticMobileAuthApplication(source, policy, {
        enabled: true, environment: "synthetic_demo", allowedOrigin: origin, now: () => 1000,
        store: new PostgresSyntheticMobileAuthStore(identity),
      });
      const server = new SyntheticNativeDownloadConnection(source, auth, c.runtime, {
        enabled: true, environment: "synthetic_demo", allowedOrigin: origin,
        // Replication fixture deliberately crosses RLS and includes a same-tenant unassigned row.
        replica: rows => [
          ...rows.map(row => ({ ...row, bankHistory: "FICTIONAL-BANK", secret: "FICTIONAL-SECRET", amountPence: 999 })),
          { ...rows[0], tenantId: north.p.tenantId, jobId: north.otherJob, reference: "UNASSIGNED-ROW" },
          ...(rows[0]?.tenantId === north.p.tenantId ? [{ ...rows[0], tenantId: south.p.tenantId,
            jobId: rows[0].jobId, reference: "CROSS-TENANT-ROW" }] : []),
        ],
      });
      const cred = (p: { tenantId: string }) => operative(p.tenantId);
      const vaultData = new Map<string, string>(), bytes = new Map<string, string>();
      const vault = {
        get: async (k: string) => vaultData.get(k) ?? null,
        set: async (k: string, v: string) => { vaultData.set(k, v); },
        remove: async (k: string) => { vaultData.delete(k); },
      };
      const resources = {
        open: async (p: { mobileSessionId: string }) => ({
          encryption: "sqlcipher", read: async () => bytes.get(p.mobileSessionId) ?? null,
          write: async (v: string) => { bytes.set(p.mobileSessionId, v); }, close: async () => {},
        }),
        destroy: async (p: { mobileSessionId: string }) => { bytes.delete(p.mobileSessionId); },
      };
      const makeLifecycle = (deviceInstanceId: string) => new MobileClient({
        exchange: (input: { requestedTenantId: string }) => auth.exchange(input, cred({ tenantId: input.requestedTenantId })),
        rotate: (input: unknown, p: { tenantId: string }) => auth.rotate(input, cred(p)),
        reconnect: (input: unknown, p: { tenantId: string }) => auth.reconnect(input, cred(p)),
        deviceCommand: (input: unknown, p: { tenantId: string }) => auth.deviceCommand(input, cred(p)),
      }, vault, resources, {
        enabled: true, environment: "synthetic_demo", policy, uuid: randomUUID, deviceInstanceId,
        clock: () => ({ status: "trusted_fixture", nowMs: 1000 }), partitionKey: async (p: { mobileSessionId: string }) => p.mobileSessionId,
      });
      const active = () => JSON.parse(vaultData.get("jobguard.synthetic.active.v1")!).partition;
      const local = (p = active()) => JSON.parse(bytes.get(p.mobileSessionId)!);
      const checkpoint = async (tenant: string, userId: string) => Number((await c.admin.query(
        "SELECT generation FROM app.sync_snapshot_checkpoint WHERE tenant_id=$1 AND user_id=$2", [tenant, userId],
      )).rows[0]?.generation);

      const lifecycle = makeLifecycle("fictional-download-device");
      await lifecycle.exchange(north.p.tenantId);
      const first = active();
      let dropPage = 2, pageCalls = 0;
      const cursors: (string | null)[] = [];
      const requests: unknown[] = [];
      const send = async (message: unknown) => {
        const wire = JSON.parse(JSON.stringify(message)) as {
          operation: { kind: string; request: { afterJobId: string | null } };
        };
        const result = await server.call(wire, cred(first));
        if (wire.operation.kind === "page") {
          requests.push(wire.operation.request);
          cursors.push(wire.operation.request.afterJobId);
          if (++pageCalls === dropPage) throw Error("fictional dropped reply");
        }
        return JSON.parse(JSON.stringify(result));
      };
      const downloads = async (p = active(), channel: (message: unknown) => Promise<unknown> = message => server.call(message, cred(p))) => {
        const store = await resources.open(p);
        return new NativeDownloads(new WorkspaceDocument(store, p),
          new NativeDownloadConnection(p, async () => JSON.parse(vaultData.get(`m32.session.${p.mobileSessionId}`)!).access, channel));
      };
      const initial = await downloads(first, send);
      await expect(initial.refresh()).rejects.toMatchObject({ code: "MOBILE_RECOVERY_REQUIRED" });
      expect(local().sync.rows).toHaveLength(100);
      expect(local().sync.pending.afterJobId).toBe(cursors[1]);
      const restarted = await downloads(first, send);
      const all = await restarted.refresh();
      expect(all.jobs).toHaveLength(205);
      expect(cursors).toEqual([null, expect.any(String), cursors[1], expect.any(String)]);
      expect(cursors[3]).not.toBe(cursors[1]);
      expect(JSON.stringify(local())).not.toMatch(/FICTIONAL-BANK|FICTIONAL-SECRET|amountPence|UNASSIGNED-ROW|CROSS-TENANT-ROW|token|credential/u);
      const generation = await checkpoint(first.tenantId, first.userId);

      const request = { version: "sync-subscription-request.v1", requestedTenantId: first.tenantId, profile: "contractor_assigned_jobs.v1" };
      const storedAccess = JSON.parse(vaultData.get(`m32.session.${first.mobileSessionId}`)!).access;
      const call = (operation: unknown, access = storedAccess, deviceInstanceId = first.deviceInstanceId) =>
        ({ version: "native-download-call.v1", deviceInstanceId, access, operation });
      await expect(server.call(call({ kind: "subscribe", request: { ...request, requestedTenantId: south.p.tenantId } }), cred(first)))
        .resolves.toMatchObject({ outcome: "denied" });
      await expect(server.call(call({ kind: "subscribe", request }, { ...storedAccess, credential: "z".repeat(43) }), cred(first)))
        .resolves.toMatchObject({ outcome: "denied" });
      await expect(server.call(call({ kind: "subscribe", request: { ...request, membershipId: north.named.member.membershipId } }), cred(first)))
        .rejects.toMatchObject({ code: "SYNC_INVALID_INPUT" });

      dropPage = pageCalls + 2;
      await expect(restarted.refresh()).rejects.toMatchObject({ code: "MOBILE_RECOVERY_REQUIRED" });
      expect(local().sync.pending.afterJobId).not.toBeNull();
      await reviseOrder(c, north, 2, [north.named.member.membershipId]);
      const replay = await server.call(call({ kind: "page", request: requests[0] }), cred(first));
      expect(replay).toMatchObject({ outcome: "ok", value: { resync: "required", page: { rows: [] } } });
      const recovered = await downloads(first, send);
      const remaining = await recovered.refresh();
      expect(cursors.at(-3)).toBeNull(); // New generation starts at the beginning.
      expect(remaining.jobs).toHaveLength(204);
      expect(remaining.jobs.some((row: { jobId: string }) => row.jobId === north.jobId)).toBe(false);
      expect(await checkpoint(first.tenantId, first.userId)).toBeGreaterThan(generation);

      for (const [sessionCredentials, expected] of [[supervisor, [north.jobId]], [finance, null]] as const) {
        const credentials = sessionCredentials(north.p.tenantId);
        const session = await auth.exchange({ version: "mobile-exchange.v1", commandId: randomUUID(),
          deviceInstanceId: "fictional-role-device", requestedTenantId: north.p.tenantId }, credentials);
        const p = session.partition;
        const link = new NativeDownloadConnection(p, async () => session.access, (message: unknown) => server.call(message, credentials));
        const doc = await resources.open(p);
        await doc.write(JSON.stringify({ version: "mobile-cache.v1", metadata: {
          version: "mobile-local-metadata.v1", partition: p, localSchemaVersion: 1,
        }, notes: [], files: [], unsyncedWork: "none" }));
        const client = new NativeDownloads(new WorkspaceDocument(doc, p), link);
        if (expected) expect((await client.refresh()).jobs.map((row: { jobId: string }) => row.jobId)).toEqual(expected);
        else await expect(client.refresh()).rejects.toMatchObject({ code: "MOBILE_DENIED" });
      }

      const beforeSwitch = await checkpoint(first.tenantId, first.userId);
      await lifecycle.switchTenant(south.p.tenantId);
      expect(bytes.has(first.mobileSessionId)).toBe(false);
      await expect(server.call(call({ kind: "page", request: requests[0] }), cred(first))).resolves.toMatchObject({ outcome: "denied" });
      const southern = await downloads();
      expect((await southern.refresh()).jobs.map((row: { jobId: string }) => row.jobId)).toEqual([south.jobId]);
      await lifecycle.logout();
      // The existing synthetic switch tombstones the old device/tenant family.
      const reEnrolled = makeLifecycle("fictional-download-reenrolment");
      await reEnrolled.exchange(north.p.tenantId);
      await reEnrolled.reconnect();
      const returned = await downloads();
      expect((await returned.refresh()).jobs).toEqual(remaining.jobs);
      expect(await checkpoint(first.tenantId, first.userId)).toBeGreaterThan(beforeSwitch);
      await command(c, north, { kind: "membership.revoke", membershipId: north.members.operative.member.membershipId });
      await expect(returned.refresh()).rejects.toMatchObject({ code: "MOBILE_DENIED" });
      expect(local().sync).toBeNull();
    } finally { await closeTestPools(identity); await c.close(); }
  }, 120_000);
});
