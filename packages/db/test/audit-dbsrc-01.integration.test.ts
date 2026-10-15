import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { runJobChecks, type JobFactSnapshot } from "@jobguard/core";
import { UserCommandDispatcher, migrate, persistFindings, withTenant } from "../src/index.js";
import { verifiedTenantContextFromMembership } from "../src/tenant-context.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool, dir: string | undefined;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jobguard-audit-dbsrc-01-"));
  const port = await freePort(57000, 500);
  postgres = new EmbeddedPostgres({
    databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false,
    createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined,
  });
  await postgres.initialise();
  await postgres.start();
  const connection = { host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" };
  admin = new Pool(connection);
  await migrate(admin);
  await installLegacySyntheticPartyFixtures(admin);
  // No new grants: each test connection executes as the existing restricted runtime role.
  // Its login is privileged test infrastructure, so this is not a role-escalation proof.
  runtime = new Pool({ ...connection, options: "-c role=jobguard_runtime" });
}, 60_000);
afterAll(async () => {
  await closeTestPools(runtime, admin);
  await postgres?.stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function fixture() {
  const tenantId = randomUUID(), accountId = randomUUID(), userId = randomUUID(), memberId = randomUUID(), jobId = randomUUID();
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [userId]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic')", [accountId, tenantId]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role,expires_at) VALUES($1,$2,$3,$4,'owner',clock_timestamp()+interval '1 hour')", [memberId, tenantId, accountId, userId]);
  await admin.query("INSERT INTO app.job(id,tenant_id,title,status,revision) VALUES($1,$2,'Synthetic expiry regression','live',12)", [jobId, tenantId]);
  const active = (await admin.query("SELECT identity_user_id,tenant_id,id FROM app.membership WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp()", [tenantId, memberId])).rows[0];
  expect(active).toBeDefined();
  const context = verifiedTenantContextFromMembership({
    identityUserId: active.identity_user_id, tenantId: active.tenant_id, membershipId: active.id,
  } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
  const snapshot: JobFactSnapshot = {
    version: "job-fact-snapshot.v1", tenantId, jobId, revision: 12,
    unresolvedQuestions: [{ id: "price", text: "Confirm synthetic price", commercialBlocker: true }], scopes: [],
  };
  await withTenant(runtime, context, async db => {
    expect((await db.$client.query("SELECT current_user AS role")).rows[0].role).toBe("jobguard_runtime");
    await persistFindings(db, tenantId, 12, runJobChecks(snapshot));
  });
  const finding = (await admin.query("SELECT decision_id,fingerprint FROM app.job_finding WHERE tenant_id=$1 AND job_id=$2 ORDER BY fingerprint LIMIT 1", [tenantId, jobId])).rows[0];
  expect(finding).toBeDefined();
  const command = {
    version: "decision-resolution-command.v1", commandId: randomUUID(),
    semanticKey: `audit-dbsrc-01:${jobId}`, actorMembershipId: memberId,
    decisionId: finding.decision_id, findingFingerprint: finding.fingerprint,
    resolution: "dismissed" as "dismissed" | "rejected", expectedSnapshotRevision: 12,
  };
  const state = async () => (await admin.query(`SELECT
    (SELECT count(*)::int FROM app.decision_resolution WHERE tenant_id=$1) AS resolutions,
    (SELECT count(*)::int FROM app.command_receipt WHERE tenant_id=$1) AS receipts,
    (SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1) AS audits,
    (SELECT count(*)::int FROM app.action_authorization WHERE tenant_id=$1) AS authorizations`, [tenantId])).rows[0];
  return { tenantId, memberId, context, command, state };
}

it.each(["dismissed", "rejected"] as const)("dismissDecision refuses membership that expired after authentication (%s)", async resolution => {
  const f = await fixture();
  f.command.resolution = resolution;
  const before = await f.state();
  expect(before).toEqual({ resolutions: 0, receipts: 0, audits: 0, authorizations: 0 });
  await admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [f.tenantId, f.memberId]);
  await expect(new UserCommandDispatcher(runtime).dismissDecision(f.context, f.command)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await f.state()).toEqual(before);
});

it.each(["dismissed", "rejected"] as const)("dismissDecision permits unexpired and non-expiring owners (%s)", async resolution => {
  for (const nonExpiring of [false, true]) {
    const f = await fixture();
    f.command.resolution = resolution;
    if (nonExpiring) await admin.query("UPDATE app.membership SET expires_at=NULL WHERE tenant_id=$1 AND id=$2", [f.tenantId, f.memberId]);
    await expect(new UserCommandDispatcher(runtime).dismissDecision(f.context, f.command)).resolves.toEqual({ decisionId: f.command.decisionId, resolution, authorizedAction: false });
    expect(await f.state()).toEqual({ resolutions: 1, receipts: 1, audits: 1, authorizations: 0 });
  }
});
