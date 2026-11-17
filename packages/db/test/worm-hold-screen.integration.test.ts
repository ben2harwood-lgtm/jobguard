import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { beforeAll, afterAll, it, expect } from "vitest";
import { migrate } from "../src/migrate.js";
import { withTenant } from "../src/tenant-context.js";
import { verifyAuditChain, type AuditEvent } from "../src/audit.js";
import { WormCommandRepository } from "../src/index.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

const tenant = randomUUID(), other = randomUUID(), job = randomUUID(), evidence = randomUUID();
const actor = randomUUID(), second = randomUUID(), samePerson = randomUUID(), user = randomUUID();
const context = testTenantContext(tenant);
const sessionDigest = "a".repeat(64), secondDigest = "b".repeat(64);
const unregistered = randomUUID(), foreignJob = randomUUID(), foreignEvidence = randomUUID();
let pg: EmbeddedPostgres, admin: Pool, runtime: Pool, executor: Pool, dir: string, repo: WormCommandRepository, secondRepo: WormCommandRepository;
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
  const bootstrap = new Pool({ ...config, user: "postgres", password: "synthetic-only" });
  await bootstrap.query("CREATE DATABASE jobguard_synthetic_demo"); await bootstrap.end();
  config.database = "jobguard_synthetic_demo";
  admin = new Pool({ ...config, user: "postgres", password: "synthetic-only" });
  await migrate(admin);
  await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [tenant, other]);
  const account = randomUUID(), otherUser = randomUUID();
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1),($2)", [user, otherUser]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic fixture')", [account, tenant]);
  for (const [id, uid] of [[actor, user], [second, otherUser], [samePerson, user]]) {
    await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [id, tenant, account, uid]);
  }
  for (const [uid, digest, member] of [[user, sessionDigest, actor], [otherUser, secondDigest, second]]) {
    await admin.query("INSERT INTO identity.session(id,user_id,token_digest,csrf_token,expires_at,environment) VALUES($1,$2,$3,'synthetic-csrf',clock_timestamp()+interval '1 day','synthetic_demo')", [randomUUID(), uid, digest]);
    await admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [uid, tenant, member]);
    await admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`worm-${uid}@fictional.invalid`, uid]);
  }
  await importWatchdogFixtureJob(admin, tenant, job, "Synthetic retention");
  expect((await admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND id=$2", [tenant, job])).rows).toEqual([{ id: job }]);
  await importWatchdogFixtureJob(admin, other, foreignJob);
  for (const [fixtureEvidence, fixtureTenant, fixtureJob] of [[evidence, tenant, job], [unregistered, tenant, job], [foreignEvidence, other, foreignJob]] as const) {
    const fixtureContext = testTenantContext(fixtureTenant);
    const key = `synthetic/tenants/${fixtureTenant}/${fixtureEvidence}`;
    await withTenant(admin, fixtureContext, db => db.$client.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)
      VALUES($1,$2,$3,$4,$5,'application/json',100,'standard_evidence',now()+interval '1 day')`, [fixtureEvidence, fixtureTenant, fixtureJob, key, "a".repeat(64)]));
    await withTenant(admin, fixtureContext, db => db.$client.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
      VALUES($1,$2,$1,$3,'original','manifest',$4,'v1',$5,2,'application/json','standard_evidence',now(),now())`, [fixtureEvidence, fixtureTenant, fixtureJob, key, "a".repeat(64)]));
  }
  await admin.query("INSERT INTO app.worm_synthetic_version VALUES($1,$2,$3),($4,$5,$6)", [tenant, evidence, job, other, foreignEvidence, foreignJob]);
  await admin.query("CREATE ROLE worm_test_login LOGIN PASSWORD 'synthetic-runtime' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS");
  await admin.query("GRANT jobguard_runtime TO worm_test_login");
  runtime = new Pool({ ...config, user: "worm_test_login", password: "synthetic-runtime" });
  await admin.query("CREATE ROLE worm_executor_login LOGIN PASSWORD 'synthetic-executor' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS");
  await admin.query("GRANT jobguard_worm_executor TO worm_executor_login");
  executor = new Pool({ ...config, user: "worm_executor_login", password: "synthetic-executor" });
  repo = new WormCommandRepository(runtime, true, executor, undefined, sessionDigest);
  secondRepo = new WormCommandRepository(runtime, true, executor, undefined, secondDigest);
}, 60000);
afterAll(async () => { await closeTestPools(runtime, executor, admin); await pg?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); });

it("projects real requested/applied/released commands, races, permissions and identity separation", async () => {
  const list = () => repo.listHolds(context, actor, job);
  expect(await list()).toEqual([expect.objectContaining({ evidenceId: evidence, held: false, canApply: true, canRelease: false })]);
  expect(await repo.listHolds(context, actor, randomUUID())).toBeNull();
  expect(await repo.listHolds(context, actor, foreignJob)).toBeNull();
  for (const evidenceId of [unregistered, foreignEvidence]) {
    await expect(repo.submit(context, command({ evidenceId }))).rejects.toThrow("WORM_REFUSED");
  }
  await expect(repo.listHolds(testTenantContext(other), actor, job)).rejects.toThrow("WORM_REFUSED");
  await expect(repo.listHolds(context, randomUUID(), job)).rejects.toThrow("WORM_REFUSED");
  const c = command();
  const replay = await Promise.all([repo.submit(context, c), repo.submit(context, c)]);
  expect(replay.map(r => r.id)).toEqual([c.commandId, c.commandId]);
  expect((await admin.query("SELECT id FROM app.worm_command WHERE tenant_id=$1", [tenant])).rows).toHaveLength(1);
  await expect(repo.submit(context, { ...c, evidenceId: randomUUID() })).rejects.toThrow("WORM_REPLAY_CONFLICT");
  const projection = (await list())![0]!;
  expect(projection).toMatchObject({ commandId: c.commandId, status: "queued", held: false, canApply: false, canRelease: false });
  expect(JSON.stringify(projection)).not.toMatch(/object_key|object_version|identity_user|imprint/);
  await expect(repo.submit(context, command())).rejects.toThrow("WORM_REFUSED");
  await expect(repo.submit(context, command({ action: "release_hold", releaseOf: c.commandId, actorMembershipId: second }))).rejects.toThrow("WORM_REFUSED");
  expect((await repo.execute(context, c.commandId, storage, tsa)).status).toBe("applied");
  expect(held).toBe(true);
  await expect(repo.submit(context, command())).rejects.toThrow("WORM_REFUSED");
  expect((await list())![0]).toMatchObject({ held: true, canApply: false, canRelease: false });
  expect((await repo.listHolds(context, samePerson, job))![0]!.canRelease).toBe(false);
  for (const membership of [actor, samePerson]) {
    await expect(repo.submit(context, command({ action: "release_hold", releaseOf: c.commandId, actorMembershipId: membership }))).rejects.toThrow("WORM_REFUSED");
  }
  expect((await repo.listHolds(context, second, job))![0]!.canRelease).toBe(true);
  const release = command({ action: "release_hold", releaseOf: c.commandId, actorMembershipId: second });
  await secondRepo.submit(context, release);
  expect((await list())![0]).toMatchObject({ status: "queued", action: "release_hold", held: true, canApply: false, canRelease: false });
  await repo.execute(context, release.commandId, storage, tsa);
  expect(held).toBe(false);
  expect((await list())![0]).toMatchObject({ status: "applied", action: "release_hold", held: false, canApply: true, canRelease: false });
  // Owner fixtures change membership state; the runtime cannot forge authority.
  await admin.query("UPDATE app.membership SET role='read_only' WHERE id=$1", [second]);
  await expect(repo.listHolds(context, second, job)).rejects.toThrow("WORM_REFUSED");
  await expect(repo.submit(context, command({ actorMembershipId: second }))).rejects.toThrow("WORM_REFUSED");
  await admin.query("UPDATE app.membership SET role='owner',revoked_at=now() WHERE id=$1", [second]);
  await expect(repo.listHolds(context, second, job)).rejects.toThrow("WORM_REFUSED");
  await expect(repo.submit(context, command({ actorMembershipId: second }))).rejects.toThrow("WORM_REFUSED");
  await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE id=$1", [second]);
  await admin.query("INSERT INTO app.contractor_member(tenant_id,membership_id,email) VALUES($1,$2,'removed-owner@example.invalid')", [tenant, second]);
  await admin.query("INSERT INTO app.contractor_membership_revocation(tenant_id,id,membership_id) VALUES($1,$2,$3)", [tenant, randomUUID(), second]);
  await expect(repo.listHolds(context, second, job)).rejects.toThrow("WORM_REFUSED");
  await expect(repo.submit(context, command({ actorMembershipId: second }))).rejects.toThrow("WORM_REFUSED");
  await expect(repo.submit(context, command({ actorMembershipId: randomUUID() }))).rejects.toThrow("WORM_REFUSED");
  await expect(repo.submit(context, command({ evidenceId: randomUUID() }))).rejects.toThrow("WORM_REFUSED");
  const events = (await admin.query(`SELECT id,tenant_id AS "tenantId",sequence::int,version,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [tenant])).rows;
  expect(() => verifyAuditChain(events as AuditEvent[])).not.toThrow();
  const wormPayloads = events.filter(e => e.eventType.startsWith("worm.")).map(e => e.payload);
  expect(JSON.stringify(wormPayloads)).not.toMatch(/synthetic\/tenants|identity_user|email|object_key|object_version|Synthetic fixture/);
});
