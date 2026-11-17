import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { runJobChecks } from "@jobguard/core";
import { authenticatePracticeSession, DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID,
  issuePracticeSession, migrate, persistFindings, withTenant } from "../src/index.js";
import { DecisionsApplication } from "../../../apps/api/src/decisions/decisions.application.js";
import { JobPartiesApplication } from "../../../apps/api/src/job-parties.application.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  directory = await mkdtemp(join(tmpdir(), "jobguard-decision-adoption-"));
  const port = await freePort(58000, 300);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase("jobguard_synthetic_demo");
  const connection = { host: "127.0.0.1", port, database: "jobguard_synthetic_demo" };
  admin = new Pool({ ...connection, user: "postgres", password: "synthetic" });
  await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  const account = randomUUID();
  await admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional inbox account')", [DEMO_TENANT_ID, account]);
  await admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",
    [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, account, DEMO_IDENTITY_USER_ID]);
  // Test login only; retain all migrated runtime privileges and RLS restrictions.
  await admin.query("ALTER ROLE jobguard_runtime LOGIN PASSWORD 'synthetic'");
  runtime = new Pool({ ...connection, user: "jobguard_runtime", password: "synthetic" });
}, 60000);
afterAll(async () => {
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it("lists adopted-job findings for the source owner", async () => {
  const token = await issuePracticeSession(runtime), strangerToken = await issuePracticeSession(runtime);
  const principal = { sessionId: token }, parties = new JobPartiesApplication(runtime);
  const source = (await parties.list(principal)).jobs.find(job => job.status === "live")!;
  const binding = (await parties.view(principal, source.id)).current!.bindingId;
  const adopted = await parties.adopt(principal, source.id, {
    version: "job-parties-import.v1", commandId: randomUUID(), expectedBindingId: binding,
  });
  expect((await admin.query("SELECT practice_session_digest FROM app.job WHERE tenant_id=$1 AND id=$2",
    [DEMO_TENANT_ID, adopted.jobId])).rows).toEqual([{ practice_session_digest: null }]);
  const owner = await authenticatePracticeSession(runtime, token);
  const findings = runJobChecks({ version: "job-fact-snapshot.v1", tenantId: DEMO_TENANT_ID,
    jobId: adopted.jobId, revision: 0, unresolvedQuestions: [], scopes: [{ scopeItemId: randomUUID(),
      proofRule: "electrical", verifiedProofTypes: ["completion_photo"], materialsIncluded: false, valuePence: 10000 }] });
  expect(findings).toHaveLength(1);
  expect(await withTenant(runtime, owner.context, db => persistFindings(db, DEMO_TENANT_ID, 0, findings)))
    .toEqual({ created: 1, replayed: 0 });
  const app = new DecisionsApplication(runtime, token);
  for (const query of [{ tenantId: DEMO_TENANT_ID, jobId: adopted.jobId }, { tenantId: DEMO_TENANT_ID }]) {
    const inbox = await app.list(query);
    expect(inbox.decisions).toHaveLength(1);
    expect(inbox.decisions[0]).toMatchObject({ jobId: adopted.jobId, fingerprint: findings[0]!.fingerprint,
      classification: "mandatory", resolution: "open", authorizedAction: false });
    expect(inbox.counts.mandatory).toBe(1);
  }
  const stranger = new DecisionsApplication(runtime, strangerToken);
  await expect(stranger.list({ tenantId: DEMO_TENANT_ID, jobId: adopted.jobId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const otherInbox = await stranger.list({ tenantId: DEMO_TENANT_ID });
  expect(otherInbox.decisions).toEqual([]);
  expect(otherInbox.counts.mandatory).toBe(0);
});
