import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { migrate } from "../src/migrate.js";
import { withTenant } from "../src/tenant-context.js";
import { WormBoundaryError } from "@jobguard/storage";
import { WormCommandRepository } from "../src/worm-command-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

const tenant = randomUUID(), other = randomUUID(), job = randomUUID(), evidence = randomUUID();
const actor = randomUUID(), second = randomUUID(), samePerson = randomUUID(), user = randomUUID();
const context = testTenantContext(tenant);
let pg: EmbeddedPostgres, admin: Pool, runtime: Pool, executor: Pool, dir: string, repo: WormCommandRepository;
let held = false;
const storage = { retain: async () => undefined, hold: async (_v: unknown, value: boolean) => { held = value; },
  read: async () => ({ held, retainUntil: null }) };
const tsa = { anchor: async () => ({ status: "pending" as const, reason: "service_unavailable" as const }) };
const command = (extra: Record<string, unknown> = {}) => ({ version: "worm.command.v1", policyVersion: "synthetic_d07_v1",
  commandId: randomUUID(), idempotencyKey: randomUUID(), actorMembershipId: actor, jobId: job, evidenceId: evidence,
  action: "apply_hold", ...extra });
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "worm-pg-"));
  const port = await freePort(57400, 200);
  pg = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic-only",
    persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await pg.initialise(); await pg.start();
  // Use the actual migration chain and the same non-owner runtime role as the application.
  const config = { host: "127.0.0.1", port, database: "postgres" };
  admin = new Pool({ ...config, user: "postgres", password: "synthetic-only" });
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [tenant, other]);
  const account = randomUUID(), otherUser = randomUUID();
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1),($2)", [user, otherUser]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic fixture')", [account, tenant]);
  for (const [id, uid] of [[actor, user], [second, otherUser], [samePerson, user]]) {
    await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [id, tenant, account, uid]);
  }
  await importWatchdogFixtureJob(admin, tenant, job, "Synthetic retention");
  const key = `synthetic/tenants/${tenant}/manifest`;
  await admin.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)
    VALUES($1,$2,$3,$4,$5,'application/json',100,'standard_evidence',now()+interval '1 day')`, [evidence, tenant, job, key, "a".repeat(64)]);
  await admin.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
    VALUES($1,$2,$1,$3,'original','manifest',$4,'v1',$5,2,'application/json','standard_evidence',now(),now())`, [evidence, tenant, job, key, "a".repeat(64)]);
  await admin.query("INSERT INTO app.worm_synthetic_version VALUES($1,$2,$3)", [tenant, evidence, job]);
  await admin.query("CREATE ROLE worm_test_login LOGIN PASSWORD 'synthetic-runtime' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS");
  await admin.query("GRANT jobguard_runtime TO worm_test_login");
  runtime = new Pool({ ...config, user: "worm_test_login", password: "synthetic-runtime" });
  await admin.query("CREATE ROLE worm_executor_login LOGIN PASSWORD 'synthetic-executor' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS");
  await admin.query("GRANT jobguard_worm_executor TO worm_executor_login");
  executor = new Pool({ ...config, user: "worm_executor_login", password: "synthetic-executor" });
  repo = new WormCommandRepository(runtime, true, executor);
}, 60000);
afterAll(async () => { await closeTestPools(runtime, executor, admin); await pg?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); });
describe("durable synthetic WORM SQL", () => {
  it("rejects wrong-job/cross-tenant references and unadmitted evidence", async () => {
    await expect(repo.submit(context, command({ jobId: randomUUID() }))).rejects.toThrow("WORM_REFUSED");
    await expect(repo.submit(testTenantContext(other), command())).rejects.toThrow("WORM_REFUSED");
    await expect(repo.submit(context, command({ evidenceId: randomUUID() }))).rejects.toThrow("WORM_REFUSED");
    await expect(repo.submit(context, command({ action: "release_hold", releaseOf: randomUUID() }))).rejects.toThrow("WORM_REFUSED");
  });
  it("atomically records one authorization/audit/outbox for concurrent duplicates, refusing either conflicting identity", async () => {
    const c = command();
    const [a, b] = await Promise.all([repo.submit(context, c), repo.submit(context, c)]);
    expect(a).toEqual(b);
    await expect(repo.submit(context, { ...c, jobId: randomUUID() })).rejects.toThrow("WORM_REPLAY_CONFLICT");
    await expect(repo.submit(context, { ...c, commandId: randomUUID() })).rejects.toThrow("WORM_REPLAY_CONFLICT");
    await expect(repo.submit(context, { ...c, idempotencyKey: randomUUID() })).rejects.toThrow("WORM_REPLAY_CONFLICT");
    await expect(repo.submit(context, command({ action: "release_hold", releaseOf: c.commandId, actorMembershipId: second }))).rejects.toThrow("WORM_REFUSED");
    await repo.execute(context, c.commandId, storage, tsa);
    await repo.execute(context, c.commandId, storage, tsa); expect(held).toBe(true);
    await expect(repo.submit(context, command({ action: "release_hold", releaseOf: c.commandId, actorMembershipId: samePerson }))).rejects.toThrow("WORM_REFUSED");
    const release = command({ action: "release_hold", releaseOf: c.commandId, actorMembershipId: second });
    await repo.submit(context, release); await repo.execute(context, release.commandId, storage, tsa); expect(held).toBe(false);
    await expect(repo.submit(context, command({ action: "release_hold", releaseOf: c.commandId, actorMembershipId: second }))).rejects.toThrow("WORM_REFUSED");
    const audit = await admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='worm.authorized' AND payload->'references'->>'command'=$2", [tenant, c.commandId]);
    expect(audit.rows).toHaveLength(1); expect(JSON.stringify(audit.rows)).not.toContain("synthetic/tenants");
  });
  it("persists a refused attempt and audit, without retrying or blocking a fresh hold", async () => {
    const c = command();
    await repo.submit(context, c);
    let calls = 0;
    const refusing = { ...storage, hold: async () => { calls++; throw new WormBoundaryError("INVALID_INPUT"); } };
    expect((await repo.execute(context, c.commandId, refusing, tsa)).status).toBe("refused");
    const fresh = new WormCommandRepository(runtime, true, executor);
    expect((await fresh.execute(context, c.commandId, refusing, tsa)).status).toBe("refused");
    expect(calls).toBe(1);
    expect((await admin.query("SELECT outcome FROM app.worm_attempt WHERE command_id=$1", [c.commandId])).rows).toEqual([{ outcome: "refused" }]);
    expect((await admin.query("SELECT id FROM app.audit_event WHERE tenant_id=$1 AND event_type='worm.refused' AND payload->'references'->>'command'=$2", [tenant, c.commandId])).rows).toHaveLength(1);
    const retry = command();
    await repo.submit(context, retry);
    expect((await repo.execute(context, retry.commandId, refusing, tsa)).status).toBe("refused");
  });
  it("rolls back a submitted command with its enclosing transaction", async () => {
    const c = command({ action: "request_anchor", subject: "manifest" });
    await expect(withTenant(runtime, context, async db => {
      await db.$client.query("SELECT * FROM app.worm_submit($1::jsonb)", [JSON.stringify(c)]);
      throw new Error("synthetic rollback");
    })).rejects.toThrow("synthetic rollback");
    expect((await admin.query("SELECT id FROM app.worm_command WHERE id=$1", [c.commandId])).rows).toEqual([]);
  });
  it("persists pending TSA attempts across repository instances and cancels revoked queued authority", async () => {
    const c = command({ action: "request_anchor", subject: "manifest", actorMembershipId: second });
    await repo.submit(context, c); await repo.execute(context, c.commandId, storage, tsa);
    const fresh = new WormCommandRepository(runtime, true, executor);
    expect((await fresh.execute(context, c.commandId, storage, tsa)).status).toBe("pending");
    expect((await admin.query("SELECT * FROM app.worm_attempt WHERE command_id=$1", [c.commandId])).rows).toHaveLength(2);
    const saved = await fresh.execute(context, c.commandId, storage, { anchor: async () => ({
      status: "anchored", token: new Uint8Array([1, 2]), query: new Uint8Array([3]),
      certificatePem: "synthetic-leaf", caCertificatePem: "synthetic-ca", signerSha256: "b".repeat(64),
      algorithm: "sha256", policyOid: "1.2.3", generatedAt: "2026-10-29T00:00:00Z", claim: "synthetic_integrity_and_existence_only",
    }) });
    expect(saved.result).toMatchObject({ token: "AQI=", query: "Aw==", certificatePem: "synthetic-leaf" });
    expect((await admin.query("SELECT result FROM app.worm_command WHERE id=$1", [c.commandId])).rows[0]?.result).toEqual(saved.result);
    const pending = command({ action: "request_anchor", subject: "manifest", actorMembershipId: second });
    await repo.submit(context, pending);
    await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [tenant, second]);
    expect((await fresh.execute(context, pending.commandId, storage, tsa)).status).toBe("cancelled");
    await expect(fresh.submit(context, pending)).rejects.toThrow("WORM_REFUSED");
  });
  it("denies runtime claim/completion and executor role assumption, including forged applied holds", async () => {
    for (const [sql, args] of [
      ["SELECT * FROM app.worm_claim($1)", [randomUUID()]],
      ["SELECT * FROM app.worm_finish($1,1,'applied','{}'::jsonb)", [randomUUID()]],
      ["SET LOCAL ROLE jobguard_worm_executor", []],
    ] as const) {
      await expect(withTenant(runtime, context, db => db.$client.query(sql, [...args]))).rejects.toMatchObject({ code: "42501" });
    }
    const c = command();
    await repo.submit(context, c);
    await withTenant(executor, context, db => db.$client.query("SELECT * FROM app.worm_claim($1)", [c.commandId]));
    await expect(withTenant(runtime, context, db => db.$client.query(
      "SELECT * FROM app.worm_finish($1,1,'applied','{}'::jsonb)", [c.commandId]))).rejects.toMatchObject({ code: "42501" });
    expect((await admin.query("SELECT status FROM app.worm_command WHERE id=$1", [c.commandId])).rows[0]?.status).toBe("executing");
    await expect(new WormCommandRepository(runtime, true, runtime).execute(context, c.commandId, storage, tsa)).rejects.toThrow("WORM_REFUSED");
    for (const name of ["worm_command", "worm_attempt", "worm_synthetic_version"]) {
      expect((await withTenant(executor, testTenantContext(other), db => db.$client.query(`SELECT * FROM app.${name}`))).rows).toEqual([]);
      await expect(withTenant(executor, context, db => db.$client.query(`UPDATE app.${name} SET tenant_id=$1`, [other]))).rejects.toMatchObject({ code: "42501" });
    }
  });
  it("enforces RLS and denies direct fixture/receipt/result writes and deletes", async () => {
    for (const name of ["worm_command", "worm_attempt", "worm_synthetic_version"]) {
      const catalog = (await admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass", [`app.${name}`])).rows[0];
      expect(catalog).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
      expect((await withTenant(runtime, testTenantContext(other), db => db.$client.query(`SELECT * FROM app.${name}`))).rows).toEqual([]);
      await expect(withTenant(runtime, context, db => db.$client.query(`DELETE FROM app.${name}`))).rejects.toMatchObject({ code: "42501" });
    }
    await expect(withTenant(runtime, context, db => db.$client.query("UPDATE app.worm_command SET status='applied'"))).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(runtime, context, db => db.$client.query("INSERT INTO app.worm_synthetic_version VALUES($1,$2,$3)", [tenant, randomUUID(), job]))).rejects.toMatchObject({ code: "42501" });
    expect(() => repo.deleteOrExpire()).toThrow("D07_REQUIRED");
  });
});
