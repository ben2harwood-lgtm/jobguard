// The unchanged lock SQL must retain transaction lifetime and RLS update checks.
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../src/migrate.js";
import { RecoveryCaseRepository } from "../src/recovery-case-repository.js";
import { RecoveryMessageRepository } from "../src/recovery-message-repository.js";
import { RecoveryFollowUpRepository } from "../src/recovery-follow-up-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

describe("LP-1 row-lock compatibility", () => {
  const phrase = randomUUID(), tenant = randomUUID(), foreign = randomUUID();
  const person = randomUUID(), account = randomUUID(), membership = randomUUID(), foreignAccount = randomUUID(), foreignMember = randomUUID(), job = randomUUID();
  const actor = { membershipId: membership, identityUserId: person, actorRef: `membership:${membership}` }, ctx = testTenantContext(tenant);
  const caseId = randomUUID();
  let postgres: EmbeddedPostgres, owner: Pool, runtime: Pool;
  beforeAll(async () => {
    const directory = await mkdtemp(join(tmpdir(), "jg-lp1-locks-")), port = await freePort(62800, 100);
    postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: phrase, persistent: false,
      createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
    await postgres.initialise(); await postgres.start();
    const options = { host: "127.0.0.1", port, database: "postgres", password: phrase };
    owner = new Pool({ ...options, user: "postgres" });
    await migrate(owner); await installLegacySyntheticPartyFixtures(owner);
    await owner.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [tenant, foreign]);
    await owner.query("INSERT INTO identity.identity_user(id) VALUES($1)", [person]);
    for (const [t, a, m] of [[tenant, account, membership], [foreign, foreignAccount, foreignMember]]) {
      await owner.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'LP1 lock fixture')", [a, t]);
      await owner.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [m, t, a, person]);
    }
    await owner.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'LP1 generated lock job')", [job, tenant]);
    await owner.query(`INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic)
      VALUES($1,$2,$3,32000,'GBP','identified',0,true)`, [caseId, tenant, job]);
    await owner.query(`CREATE ROLE lp1_lock_login LOGIN INHERIT NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS PASSWORD '${phrase}'`);
    await owner.query("GRANT jobguard_runtime TO lp1_lock_login");
    runtime = new Pool({ ...options, user: "lp1_lock_login", max: 2 });
  }, 60_000);
  afterAll(async () => { await closeTestPools(runtime, owner); await postgres?.stop(); });
  async function begin(db: PoolClient, context: string = tenant) {
    await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [context]);
  }
  async function waitBlocked(pid: number, blocker: number) {
    const deadline = performance.now() + 5000;
    let observed: unknown;
    do {
      const row = (await owner.query(`SELECT state,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers,
        $2::int=ANY(pg_blocking_pids(pid)) AS blocked FROM pg_stat_activity WHERE pid=$1::int`, [pid, blocker])).rows[0];
      observed = row;
      if (row?.wait_event_type === "Lock" && row.blocked) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    } while (performance.now() < deadline);
    throw new Error(`Expected PostgreSQL wait for backend ${pid} behind ${blocker}; last activity: ${JSON.stringify(observed)}`);
  }
  const backend = async (db: PoolClient) => Number((await db.query("SELECT pg_backend_pid() AS id")).rows[0]!.id);
  async function values() {
    return Promise.all(["app.account", "app.membership"].map(async table => (await owner.query(`SELECT row_to_json(t)::text AS bytes
      FROM (SELECT ${table === "app.account" ? "id,tenant_id,name,created_at,updated_at" : "id,tenant_id,account_id,identity_user_id,role,created_at,revoked_at,expires_at"}
      FROM ${table}) t ORDER BY row_to_json(t)::text COLLATE "C"`)).rows));
  }

  it("[LP1-06] row locks survive grant withdrawal with their original transaction lifetime", async () => {
    const before = await values();
    for (const table of ["app.account", "app.membership"]) for (const strength of ["UPDATE", "NO KEY UPDATE", "SHARE", "KEY SHARE"]) {
      for (const end of ["COMMIT", "ROLLBACK"]) {
        const reader = await runtime.connect(), writer = await owner.connect();
        let contender: Promise<unknown> | undefined;
        try {
          await begin(reader); await writer.query("BEGIN"); await writer.query("SET LOCAL statement_timeout='10s'");
          const readerPid = await backend(reader), writerPid = await backend(writer);
          // Await the runtime's row lock before starting the conflicting owner-side probe.
          expect((await reader.query(`SELECT id FROM ${table} WHERE tenant_id=$1 FOR ${strength}`, [tenant])).rowCount).toBe(1);
          // Explicit FOR UPDATE conflicts with every mode, including KEY SHARE. A no-op
          // key UPDATE can take NO KEY UPDATE, which is compatible with KEY SHARE.
          contender = writer.query(`SELECT id FROM ${table} WHERE tenant_id=$1 FOR UPDATE`, [tenant]);
          // Attach a handler immediately so a timed-out control never becomes an unhandled rejection.
          void contender.catch(() => undefined);
          await waitBlocked(writerPid, readerPid);
          await reader.query(end);
          await expect(contender).resolves.toMatchObject({ rowCount: 1 });
        } finally {
          await reader.query("ROLLBACK"); await contender?.catch(() => undefined);
          await writer.query("ROLLBACK"); reader.release(); writer.release();
        }
      }
    }
    expect(await values()).toEqual(before);
  }, 30_000);

  it("[LP1-07] row locking retains SELECT and UPDATE RLS boundaries", async () => {
    const db = await runtime.connect();
    try {
      for (const table of ["app.account", "app.membership"]) {
        await begin(db);
        for (const strength of ["UPDATE", "NO KEY UPDATE", "SHARE", "KEY SHARE"]) {
          expect((await db.query(`SELECT id FROM ${table} WHERE tenant_id=$1 FOR ${strength}`, [foreign])).rows).toEqual([]);
        }
        await db.query("COMMIT");
        await db.query("BEGIN");
        expect((await db.query(`SELECT id FROM ${table} FOR SHARE`)).rows).toEqual([]);
        await db.query("ROLLBACK");
        await begin(db, "invalid");
        await expect(db.query(`SELECT id FROM ${table} FOR SHARE`)).rejects.toMatchObject({ code: "22P02" });
        await db.query("ROLLBACK");
        await begin(db); expect((await db.query(`SELECT id FROM ${table} FOR SHARE`)).rowCount).toBe(1);
        await db.query("COMMIT");
        expect((await db.query(`SELECT id FROM ${table}`)).rows).toEqual([]);
      }
    } finally { await db.query("ROLLBACK"); db.release(); }
    // Owner policy setup is transactional. Assert RLS as runtime, never as superuser.
    const control = await owner.connect();
    try {
      await control.query("BEGIN");
      for (const table of ["account", "membership"]) {
        await control.query(`CREATE POLICY lp1_restrict_update ON app.${table} AS RESTRICTIVE FOR UPDATE TO jobguard_runtime USING(false)`);
      }
      await control.query("SET LOCAL ROLE jobguard_runtime");
      await control.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
      for (const table of ["account", "membership"]) {
        expect((await control.query(`SELECT id FROM app.${table}`)).rowCount).toBe(1);
        expect((await control.query(`SELECT id FROM app.${table} FOR UPDATE`)).rows).toEqual([]);
      }
    } finally { await control.query("ROLLBACK"); control.release(); }
  });

  it("[LP1-08] existing callers retain membership locks and revocation ordering", async () => {
    const cases = new RecoveryCaseRepository(runtime), messages = new RecoveryMessageRepository(runtime), followUps = new RecoveryFollowUpRepository(runtime);
    expect((await owner.query("SELECT has_function_privilege('lp1_lock_login','identity.scim_deactivate(uuid,jsonb)','EXECUTE') AS allowed")).rows)
      .toEqual([{ allowed: false }]);
    expect(await cases.listForMember(ctx, job, actor)).toEqual([]);
    // Exercise real entry points through their authority lock before the missing-resource refusal.
    const missing = randomUUID();
    const operations = [
      () => cases.eligibilityCommand(ctx, job, { version: "recovery-eligibility-command.v1", action: "review", commandId: randomUUID(),
        caseId: missing, expectedCaseRevision: 1, evidenceRevision: 1, policyVersion: "reference-d03.v1", policyRevision: 1, scenario: "pending_money" }, actor),
      () => messages.preview(ctx, caseId, { version: "recovery-message-preview.v1", commandId: randomUUID(), expectedCaseRevision: 1, packId: randomUUID() }, actor),
      () => followUps.openReview(ctx, missing, { version: "recovery-follow-up-command.v1", action: "open_review", commandId: randomUUID(),
        followUpId: randomUUID(), expectedRevision: 1, expectedCaseRevision: 1, packId: randomUUID() }, actor),
    ];
    for (const operation of operations) {
      const ownerLock = await owner.connect();
      let call: Promise<unknown> | undefined;
      try {
        await ownerLock.query("BEGIN");
        await ownerLock.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [tenant, membership]);
        call = operation(); void call.catch(() => undefined);
        // Each real repository must reach a membership lock and wait behind revocation.
        const blocker = await backend(ownerLock), deadline = Date.now() + 2500;
        let waiting = false;
        while (Date.now() < deadline && !waiting) {
          waiting = (await owner.query(`SELECT 1 FROM pg_stat_activity WHERE usename='lp1_lock_login' AND $1::int=ANY(pg_blocking_pids(pid))`, [blocker])).rowCount !== 0;
          if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
        }
        expect(waiting, "repository must hold its membership predicate until revocation resolves").toBe(true);
        await ownerLock.query("ROLLBACK");
        await expect(call).rejects.toBeInstanceOf(Error);
      } finally { await ownerLock.query("ROLLBACK"); await call?.catch(() => undefined); ownerLock.release(); }
    }
    // A committed revocation must be visible to a new runtime transaction.
    await owner.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [tenant, membership]);
    await expect(cases.listForMember(ctx, job, actor)).rejects.toMatchObject({ code: "MEMBERSHIP_FORBIDDEN" });
    // Complete positive-case business/audit-last and practice/eligibility trigger proofs remain
    // the unchanged named regression suites; this refusal-path test is preparatory coverage only.
  });
});
