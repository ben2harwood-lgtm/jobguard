import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID,
  DEMO_EMPTY_TENANT_ID, DEMO_EMPTY_ACCOUNT_ID, DEMO_EMPTY_MEMBERSHIP_ID,
  migrate, readSyntheticDemo, readSyntheticDemoJob, withTenant, type VerifiedTenantContext,
} from "../src/index.js";
import { closeTestPools } from "./pool-test-utils.js";

const capturedJob = randomUUID(), ordinaryJob = randomUUID(), foreignJob = randomUUID();
const foreignTenant = randomUUID(), otherIdentity = randomUUID();
const confirmedScope = randomUUID(), secondScope = randomUUID(), retiredScope = randomUUID();
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jobguard-workspace-read-"));
  const port = 59800 + Math.floor(Math.random() * 100);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password: "synthetic" });
  await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2),($3)", [DEMO_TENANT_ID, DEMO_EMPTY_TENANT_ID, foreignTenant]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1),($2)", [DEMO_IDENTITY_USER_ID, otherIdentity]);
  for (const [tenant, account, member] of [[DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_MEMBERSHIP_ID], [DEMO_EMPTY_TENANT_ID, DEMO_EMPTY_ACCOUNT_ID, DEMO_EMPTY_MEMBERSHIP_ID]]) {
    await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional builder')", [account, tenant]);
    await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member, tenant, account, DEMO_IDENTITY_USER_ID]);
  }
  await admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$4,'Captured fictional job','live'),($2,$4,'Home-list fixture','draft'),($3,$5,'Foreign fictional job','draft')", [capturedJob, ordinaryJob, foreignJob, DEMO_TENANT_ID, foreignTenant]);
  // A tracked synthetic source/proposal makes the job a capture, deliberately hidden from the home fixture list.
  const source = randomUUID(), sourceText = "Fictional work only", digest = createHash("sha256").update(sourceText).digest("hex");
  await admin.query("INSERT INTO app.capture_source(id,tenant_id,kind,content_bytes,content_text,sha256) VALUES($1,$2,'text',$3,$4,$5)", [source, DEMO_TENANT_ID, Buffer.from(sourceText), sourceText, digest]);
  await admin.query("INSERT INTO app.job_record_proposal(id,tenant_id,capture_id,job_id,source_id,source_version,source_sha256,prompt_version,schema_version,model,proposal) VALUES($1,$2,$3,$4,$5,1,$6,'workspace-read-fixture.v1','job_record_proposal_v1','synthetic-fixture','{}')", [randomUUID(), DEMO_TENANT_ID, randomUUID(), capturedJob, source, digest]);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state,created_at) VALUES($1,$4,$5,'retired','2026-01-01'),($2,$4,$5,'confirmed','2026-01-02'),($3,$4,$5,'confirmed','2026-01-03')", [retiredScope, confirmedScope, secondScope, DEMO_TENANT_ID, capturedJob]);
  await admin.query("CREATE ROLE workspace_read_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO workspace_read_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "workspace_read_login", password: "synthetic", max: 1 });
}, 60_000);
beforeEach(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  await admin.query("UPDATE app.membership SET revoked_at=NULL,expires_at=NULL,identity_user_id=$1 WHERE tenant_id=$2 AND id=$3", [DEMO_IDENTITY_USER_ID, DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID]);
  await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2", [DEMO_EMPTY_TENANT_ID, DEMO_EMPTY_MEMBERSHIP_ID]);
});
afterAll(async () => { vi.unstubAllEnvs(); await closeTestPools(runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

describe("authoritative saved workspace lookup", () => {
  it("reads a captured job directly without broadening the filtered home list", async () => {
    expect((await readSyntheticDemo(runtime)).jobs.map(job => job.id)).toEqual([ordinaryJob]);
    await expect(readSyntheticDemoJob(runtime, capturedJob)).resolves.toMatchObject({
      tenant: { id: DEMO_TENANT_ID }, job: { id: capturedJob, title: "Captured fictional job", status: "live", scopeIdentityIds: [confirmedScope, secondScope] },
    });
  });
  it("returns an empty confirmed scope set for an unconfirmed job", async () => {
    await expect(readSyntheticDemoJob(runtime, ordinaryJob)).resolves.toMatchObject({ job: { id: ordinaryJob, scopeIdentityIds: [] } });
  });
  it("treats a foreign job exactly like a missing job under the runtime role", async () => {
    for (const id of [foreignJob, randomUUID()]) await expect(readSyntheticDemoJob(runtime, id)).rejects.toMatchObject({ code: "JOB_NOT_FOUND" });
    expect((await runtime.query("SELECT id FROM app.job")).rows).toEqual([]);
  });
  it.each(["revoked", "expired", "different identity"])("rechecks %s membership instead of trusting a prior page load", async change => {
    if (change === "revoked") await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID]);
    if (change === "expired") await admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID]);
    if (change === "different identity") await admin.query("UPDATE app.membership SET identity_user_id=$3 WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, otherIdentity]);
    await expect(readSyntheticDemoJob(runtime, capturedJob)).rejects.toMatchObject({ code: "MEMBERSHIP_FORBIDDEN" });
  });
  it("does not require membership in an unrelated empty demo workspace", async () => {
    await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [DEMO_EMPTY_TENANT_ID, DEMO_EMPTY_MEMBERSHIP_ID]);
    await expect(readSyntheticDemoJob(runtime, capturedJob)).resolves.toMatchObject({ job: { id: capturedJob } });
  });
  it.each(["production", "pilot_no_charge", "provider_sandbox"])("refuses %s before reading any fixture", async mode => {
    vi.stubEnv("JOBGUARD_ENV", mode);
    await expect(readSyntheticDemoJob(runtime, ordinaryJob)).rejects.toMatchObject({ code: "MEMBERSHIP_FORBIDDEN" });
  });
  it("is read-only, preserves revision, and does not leak pooled tenant context", async () => {
    const before = await admin.query("SELECT revision,updated_at FROM app.job WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, ordinaryJob]);
    await readSyntheticDemoJob(runtime, ordinaryJob); await readSyntheticDemoJob(runtime, ordinaryJob);
    expect((await admin.query("SELECT revision,updated_at FROM app.job WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, ordinaryJob])).rows).toEqual(before.rows);
    expect((await runtime.query("SELECT id FROM app.scope_identity")).rows).toEqual([]);
    await expect(withTenant(runtime, { tenantId: DEMO_TENANT_ID } as VerifiedTenantContext, db => db.$client.query("UPDATE app.job SET title='Forbidden' WHERE id=$1", [ordinaryJob]))).rejects.toMatchObject({ code: "42501" });
  });
});
