import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, MIGRATION_URLS, PracticeFeedRepository, withTenant, type VerifiedTenantContext } from "../src/index.js";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "../src/demo-seed.js";
import { closeTestPools } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const password = "synthetic-feed-test-only", context = { tenantId: DEMO_TENANT_ID } as VerifiedTenantContext;
const previousJob = randomUUID(), otherTenant = randomUUID();
const command = (expectedRevision: number, extra: Record<string, unknown>) => ({ version: "practice-feed-command.v1", commandId: randomUUID(), expectedRevision, ...extra });
const repo = () => new PracticeFeedRepository(runtime, "synthetic_demo");
async function fixture() {
  const jobId = randomUUID(), sessionId = randomUUID();
  await admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Generated recovery-18800')", [jobId, DEMO_TENANT_ID]);
  return { jobId, sessionId };
}
async function connected() {
  const f = await fixture(), state = await repo().command(f.sessionId, f.jobId, command(0, { action: "connect" }));
  return { ...f, state };
}
async function settings(db: Parameters<Parameters<typeof withTenant>[2]>[0], sessionId: string) {
  await db.$client.query("SELECT set_config('app.practice_feed_session',$1,true),set_config('app.practice_feed_environment','synthetic_demo',true)", [sessionId]);
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jobguard-practice-feed-"));
  const port = 60300 + Math.floor(Math.random() * 200);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password,
    persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password });
  // Upgrade from exactly the preceding supported schema, retaining a prior job.
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.filter(url => url.pathname.split("/").at(-1)! < "0043")) {
    await admin.query(await readFile(url, "utf8"));
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [DEMO_TENANT_ID, otherTenant]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Generated practice account')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Previous schema job')", [previousJob, DEMO_TENANT_ID]);
  await migrate(admin); await migrate(admin);
  await admin.query("CREATE ROLE practice_feed_test_login LOGIN PASSWORD 'synthetic-feed-test-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO practice_feed_test_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "practice_feed_test_login", password, max: 5 });
}, 60_000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

describe("M4-7-S real PostgreSQL practice feed", () => {
  it("upgrades from 0041, preserves prior rows and applies 0043 once without taking 0042", async () => {
    expect((await admin.query("SELECT title FROM app.job WHERE id=$1", [previousJob])).rows[0].title).toBe("Previous schema job");
    const names = (await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name);
    expect(names).toHaveLength(MIGRATION_URLS.length); expect(names).toContain("0043_practice_feed.sql"); expect(names.some(name => name.startsWith("0042"))).toBe(false);
  });
  it("persists pending £384, exact settlement and stable source identity without allocation", async () => {
    const f = await connected();
    let state = await repo().command(f.sessionId, f.jobId, command(1, { action: "advance", scenario: "pending_384" }));
    expect(state.movements).toMatchObject([{ grossPence: 38400, state: "pending", eligibleForAllocation: false, allocatedEligibleNetPence: 0 }]);
    const movementId = state.movements[0]!.id;
    state = await repo().command(f.sessionId, f.jobId, command(state.revision, { action: "advance", scenario: "settled_384" }));
    expect(state.movements).toMatchObject([{ id: movementId, state: "settled", allocatedEligibleNetPence: 0, eventIds: ["pending-384", "settled-384"] }]);
    expect(await new PracticeFeedRepository(runtime, "synthetic_demo").view(f.sessionId, f.jobId)).toEqual(state);
    const rows = (await admin.query("SELECT source_hash FROM app.practice_feed_event WHERE job_id=$1 ORDER BY created_at,event_id", [f.jobId])).rows;
    expect(state.movements[0]!.sourceHashes).toEqual(rows.map(row => row.source_hash));
    expect(Number((await admin.query("SELECT count(*) n FROM app.landing_allocation WHERE job_id=$1", [f.jobId])).rows[0].n)).toBe(0);
    expect(Number((await admin.query("SELECT count(*) n FROM app.recovery_fee_journal WHERE job_id=$1", [f.jobId])).rows[0].n)).toBe(0);
  });
  it("replays command/events and overlapping pages, aliases, late pending all retain one underlying movement", async () => {
    const f = await connected(), settle = command(1, { action: "advance", scenario: "settled_384" });
    let state = await repo().command(f.sessionId, f.jobId, settle);
    expect(await repo().command(f.sessionId, f.jobId, settle)).toEqual(state);
    await expect(repo().command(f.sessionId, f.jobId, { ...settle, scenario: "pending_384" })).rejects.toMatchObject({ code: "IDEMPOTENCY_PAYLOAD_CONFLICT" });
    for (const scenario of ["replay_event", "page_overlap", "alternate_representation", "pending_384"]) state = await repo().command(f.sessionId, f.jobId, command(state.revision, { action: "advance", scenario }));
    expect(state.movements).toHaveLength(1); expect(state.movements[0]!.state).toBe("settled"); expect(state.eventCount).toBe(3);
    expect(Number((await admin.query("SELECT count(*) n FROM app.practice_feed_event WHERE job_id=$1", [f.jobId])).rows[0].n)).toBe(3);
  });
  it("holds ambiguous duplicate identities, paginates authoritatively and reconciles without losing past facts", async () => {
    const f = await connected();
    let state = await repo().command(f.sessionId, f.jobId, command(1, { action: "advance", scenario: "settled_384" }));
    state = await repo().command(f.sessionId, f.jobId, command(state.revision, { action: "advance", scenario: "unknown_duplicate" }));
    expect(state.movements).toHaveLength(2); expect(state.movements.every(m => !m.eligibleForAllocation)).toBe(true);
    const first = await repo().view(f.sessionId, f.jobId, { version: "practice-feed-query.v1", limit: 1 });
    expect(first.nextCursor).toBe("1");
    const second = await repo().view(f.sessionId, f.jobId, { version: "practice-feed-query.v1", limit: 1, cursor: first.nextCursor });
    expect(second.movements[0]!.state).toBe("possible_duplicate"); expect(second.nextCursor).toBeNull();
    state = await repo().command(f.sessionId, f.jobId, command(state.revision, { action: "reconcile_duplicate" }));
    expect(state.movements).toHaveLength(1); expect(state.movements[0]).toMatchObject({ eligibleForAllocation: true, allocatedEligibleNetPence: 0, eventIds: ["settled-384", "unknown-384"] });
    expect(state.eventCount).toBe(2);
  });
  it("disconnect is durable, preserves history and refuses new ingestion", async () => {
    const f = await connected();
    let state = await repo().command(f.sessionId, f.jobId, command(1, { action: "advance", scenario: "pending_384" }));
    const movements = state.movements;
    state = await repo().command(f.sessionId, f.jobId, command(state.revision, { action: "disconnect" }));
    expect(state.feedState).toBe("disconnected"); expect(state.movements).toEqual(movements);
    await expect(repo().command(f.sessionId, f.jobId, command(state.revision, { action: "advance", scenario: "settled_384" }))).rejects.toMatchObject({ code: "PRACTICE_FEED_DISCONNECTED" });
    expect((await repo().view(f.sessionId, f.jobId)).movements).toEqual(movements);
  });
  it("competing browsers create one account/effect or a typed stale conflict", async () => {
    const f = await fixture(), input = command(0, { action: "connect" });
    const result = await Promise.all([repo().command(f.sessionId, f.jobId, input), repo().command(f.sessionId, f.jobId, input)]);
    expect(result[0]!.accountId).toBe(result[1]!.accountId);
    const race = await Promise.allSettled(["pending_384", "settled_384"].map(scenario => repo().command(f.sessionId, f.jobId, command(1, { action: "advance", scenario }))));
    expect(race.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(race.find(row => row.status === "rejected")).toMatchObject({ reason: { code: "PRACTICE_FEED_STALE_REVISION" } });
    expect(Number((await admin.query("SELECT count(*) n FROM app.practice_feed_command WHERE job_id=$1", [f.jobId])).rows[0].n)).toBe(2);
    expect(Number((await admin.query("SELECT count(*) n FROM app.audit_event WHERE subject_ref=$1 AND event_type LIKE 'practice_feed.%'", [f.jobId])).rows[0].n)).toBe(2);
  });
  it("refuses foreign session, non-member tenant/job, forged browser fields and revoked or expired membership", async () => {
    const f = await connected(), otherJob = randomUUID();
    await admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Foreign')", [otherJob, otherTenant]);
    await expect(repo().view(randomUUID(), f.jobId)).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
    await expect(repo().command(randomUUID(), f.jobId, command(1, { action: "disconnect" }))).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
    await expect(repo().view(f.sessionId, otherJob)).rejects.toMatchObject({ code: "PRACTICE_FEED_NOT_FOUND" });
    for (const key of ["tenantId", "accountId", "eventId", "grossPence", "state", "environment"]) await expect(repo().command(f.sessionId, f.jobId, { ...command(1, { action: "advance", scenario: "settled_384" }), [key]: "forged" })).rejects.toBeTruthy();
    for (const field of ["revoked_at", "expires_at"]) {
      await admin.query(`UPDATE app.membership SET ${field}=now()-interval '1 hour' WHERE id=$1`, [DEMO_MEMBERSHIP_ID]);
      try {
        await expect(repo().view(f.sessionId, f.jobId)).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
        await expect(repo().command(f.sessionId, f.jobId, command(1, { action: "disconnect" }))).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
      } finally { await admin.query(`UPDATE app.membership SET ${field}=NULL WHERE id=$1`, [DEMO_MEMBERSHIP_ID]); }
    }
  });
  it("refuses production/pilot repository consumption and pilot-activated job writes", async () => {
    const f = await connected();
    for (const environment of ["production", "production_billing", "pilot_no_charge", "unconfigured"]) {
      await expect(new PracticeFeedRepository(runtime, environment).view(f.sessionId, f.jobId)).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
      await expect(new PracticeFeedRepository(runtime, environment).command(f.sessionId, f.jobId, command(1, { action: "advance", scenario: "settled_384" }))).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
    }
    // Privileged fixture only: create a pilot activation without unrelated quote workflow.
    const client = await admin.connect();
    try {
      await client.query("SET session_replication_role=replica");
      await client.query(`INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at)
        VALUES($1,$2,$3,$4,1,$5,'pilot_no_charge','pilot_no_charge.v1','reference_fee_policy_v1',$6,now())`, [randomUUID(), DEMO_TENANT_ID, f.jobId, randomUUID(), "a".repeat(64), DEMO_MEMBERSHIP_ID]);
    } finally { await client.query("SET session_replication_role=origin"); client.release(); }
    await expect(repo().view(f.sessionId, f.jobId)).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
    await expect(repo().command(f.sessionId, f.jobId, command(1, { action: "advance", scenario: "settled_384" }))).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
  });
  it("actual runtime SQL cannot forge settlement, cross-account/job references or missing tenant context", async () => {
    const f = await connected(), other = await connected(), pending = command(1, { action: "advance", scenario: "pending_384" });
    await repo().command(f.sessionId, f.jobId, pending);
    const insert = async (extra: { accountId?: string; jobId?: string; tenantId?: string; eventId?: string; environment?: string } = {}) => withTenant(runtime, context, async db => {
      await settings(db, f.sessionId);
      return db.$client.query(`INSERT INTO app.practice_feed_event(id,tenant_id,job_id,account_id,command_id,event_id,underlying_movement_id,representation_id,gross_pence,currency,state,environment,version,source_hash)
        VALUES($1,$2,$3,$4,$5,$6,'receipt-384','feed-384',38400,'GBP','settled',$7,'practice-feed-event.v1',$8)`,
      [randomUUID(), extra.tenantId ?? DEMO_TENANT_ID, extra.jobId ?? f.jobId, extra.accountId ?? f.state.accountId, pending.commandId, extra.eventId ?? "settled-384", extra.environment ?? "synthetic_demo", "a".repeat(64)]);
    });
    for (const extra of [{}, { accountId: other.state.accountId! }, { jobId: other.jobId }, { tenantId: otherTenant }, { eventId: "forged" }, { environment: "production" }, { environment: "production_billing" }, { environment: "pilot_no_charge" }]) await expect(insert(extra)).rejects.toBeTruthy();
    expect((await repo().view(f.sessionId, f.jobId)).movements[0]!.state).toBe("pending");
    expect((await runtime.query("SELECT * FROM app.practice_feed_event")).rowCount).toBe(0);
    expect((await withTenant(runtime, { tenantId: otherTenant } as VerifiedTenantContext, db => db.$client.query("SELECT * FROM app.practice_feed_event"))).rowCount).toBe(0);
  });
  it("rejects orphan account/un-audited command commits and rolls all writes back", async () => {
    const f = await fixture();
    await expect(withTenant(runtime, context, async db => {
      await settings(db, f.sessionId);
      await db.$client.query("INSERT INTO app.practice_feed_account(id,tenant_id,job_id,session_id,actor_membership_id,environment,scenario) VALUES($1,$2,$3,$4,$5,'synthetic_demo','recovery-18800')", [randomUUID(), DEMO_TENANT_ID, f.jobId, f.sessionId, DEMO_MEMBERSHIP_ID]);
    })).rejects.toThrow("PRACTICE_FEED_CONNECTION_REQUIRED");
    expect((await repo().view(f.sessionId, f.jobId)).feedState).toBe("not_connected");
    const c = await connected();
    await expect(withTenant(runtime, context, async db => {
      await settings(db, c.sessionId);
      await db.$client.query("INSERT INTO app.practice_feed_command(id,tenant_id,job_id,account_id,revision,action,actor_membership_id,payload_hash,environment) VALUES($1,$2,$3,$4,2,'disconnect',$5,$6,'synthetic_demo')", [randomUUID(), DEMO_TENANT_ID, c.jobId, c.state.accountId, DEMO_MEMBERSHIP_ID, createHash("sha256").update("synthetic").digest("hex")]);
    })).rejects.toThrow("PRACTICE_FEED_AUDIT_REQUIRED");
    expect((await repo().view(c.sessionId, c.jobId)).feedState).toBe("connected");
  });
  it("catalogs enforce FORCE RLS, correct owners, both policy roles, append-only grants and no definer writers", async () => {
    const tables = ["practice_feed_account", "practice_feed_command", "practice_feed_event"];
    const rows = (await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1)`, [tables])).rows;
    expect(rows).toHaveLength(3); expect(rows.every(row => row.relrowsecurity && row.relforcerowsecurity && row.owner === "jobguard_migration")).toBe(true);
    const policies = (await admin.query("SELECT roles FROM pg_policies WHERE schemaname='app' AND tablename=ANY($1)", [tables])).rows;
    expect(policies).toHaveLength(3); expect(policies.every(row => row.roles.includes("jobguard_migration") && row.roles.includes("jobguard_runtime"))).toBe(true);
    for (const table of tables) for (const operation of [`UPDATE app.${table} SET environment='synthetic_demo'`, `DELETE FROM app.${table}`, `TRUNCATE app.${table}`]) await expect(withTenant(runtime, context, db => db.$client.query(operation))).rejects.toMatchObject({ code: "42501" });
    const routines = (await admin.query("SELECT proname,prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND proname IN('guard_practice_feed_account','guard_practice_feed_command','guard_practice_feed_event','require_practice_feed_audit','require_practice_feed_connection')")).rows;
    expect(routines).toHaveLength(5); expect(routines.every(row => !row.prosecdef)).toBe(true);
  });
});
