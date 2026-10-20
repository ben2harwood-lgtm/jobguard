// Written before 0207; PostgreSQL execution is CI-only, NOT RUN locally.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { recoveryCaseTermsHash } from "@jobguard/core";
import { EvidencePackRepository, RecoveryCaseTermsRepository, RecoveryMessageRepository, migrate, withTenant } from "../src/index.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const password = randomUUID();
const counted = ["recovery_case_terms_approval", "recovery_message", "recovery_message_event", "recovery_message_approval", "recovery_message_sink", "decision", "decision_resolution", "action_authorization", "action_outbox", "command_receipt", "audit_event"];
const counts = async () => Object.fromEntries(await Promise.all(counted.map(async table => [table, (await admin.query(`SELECT count(*)::int n FROM app.${table}`)).rows[0].n])));
const terms = (caseId: string) => ({ version: "recovery-case-terms-command.v1", action: "approve", commandId: randomUUID(), caseId, termsVersion: "synthetic_recovery_fee_terms.v1", feePolicyVersion: "reference_fee_policy_v3", eligibilityPolicyVersion: "reference_recovery_eligibility_policy_v3", termsHash: recoveryCaseTermsHash(caseId) });
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jg-pursuit-terms-")); const port = await freePort(62300, 100);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start(); admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password, database: "postgres" });
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query(`CREATE ROLE pursuit_login LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO pursuit_login`);
  runtime = new Pool({ host: "127.0.0.1", port, user: "pursuit_login", password, database: "postgres", max: 4 });
});
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });
it.each([null, "reference_fee_policy_v1"])("%s: NullPolicyWithheldPursuitRefused / V1PolicyWithheldPursuitRefused", async policy => {
  const f = await seedEvidencePackFixture(admin), ctx = testTenantContext(f.tenantId), actor = { membershipId: f.memberId, actorRef: `membership:${f.memberId}` };
  if (policy === null) { // Negative historical shape only, never a conversion or approval route.
    const db = await admin.connect(); try { await db.query("BEGIN"); await db.query("SET LOCAL session_replication_role=replica"); await db.query("UPDATE app.job SET fee_policy_version=NULL,baseline_quote_version_id=NULL,accepted_net_value_pence=NULL,recovery_cap_pence=NULL WHERE tenant_id=$1 AND id=$2", [f.tenantId, f.jobId]); await db.query("COMMIT"); } finally { db.release(); }
  }
  const packs = new EvidencePackRepository(runtime), repo = new RecoveryMessageRepository(runtime), pack = await packs.generate(ctx, f.customerCaseId, { commandId: randomUUID() }, actor.actorRef);
  await packs.approveAttachment(ctx, f.customerCaseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor.actorRef);
  const before = await counts(), ready = await repo.read(ctx, f.customerCaseId);
  const input = { version: "recovery-message-preview.v1", commandId: randomUUID(), expectedCaseRevision: ready.readiness.caseRevision, packId: pack.id };
  for (let attempt = 0; attempt < 2; attempt++) await expect(repo.preview(ctx, f.customerCaseId, input, actor)).rejects.toMatchObject({ code: "RECOVERY_TERMS_NOT_APPROVED" });
  await expect(new RecoveryCaseTermsRepository(runtime).approve(ctx, f.jobId, terms(f.customerCaseId), { membershipId: f.memberId, identityUserId: f.identityId })).rejects.toMatchObject({ code: "RECOVERY_TERMS_POLICY_MISMATCH" });
  const approved = async (tenant: string, job: string, id: string) => (await withTenant(runtime, ctx, db => db.$client.query("SELECT app.recovery_case_terms_approved($1,$2,$3) ok", [tenant, job, id]))).rows[0].ok;
  expect(await approved(f.tenantId, f.jobId, f.customerCaseId)).toBe(false);
  expect(await approved(f.otherTenantId, f.jobId, f.customerCaseId)).toBe(false);
  expect(await approved(f.tenantId, f.otherJobId, f.customerCaseId)).toBe(false);
  expect(await approved(f.tenantId, f.jobId, randomUUID())).toBe(false);
  expect((await runtime.query("SELECT app.recovery_case_terms_approved($1,$2,$3) ok", [f.tenantId, f.jobId, f.customerCaseId])).rows[0].ok).toBe(false);
  expect(await counts()).toEqual(before);
  // NonWithheldUnchanged: same tenant/job/policy, merchant pursuit still works.
  expect(await approved(f.tenantId, f.jobId, f.caseId)).toBe(true);
  const supplier = await packs.generate(ctx, f.caseId, { commandId: randomUUID() }, actor.actorRef);
  await packs.approveAttachment(ctx, f.caseId, supplier.id, { commandId: randomUUID(), expectedManifestHash: supplier.manifestHash, expectedContentHash: supplier.contentHash }, actor.actorRef);
  const merchant = await repo.read(ctx, f.caseId);
  expect((await repo.preview(ctx, f.caseId, { ...input, commandId: randomUUID(), expectedCaseRevision: merchant.readiness.caseRevision, packId: supplier.id }, actor)).latest!.status).toBe("previewed");
});

it("CaseConcurrency: new v1 pursuit waits for the existing case key, then refuses with complete rollback", async () => {
  const f = await seedEvidencePackFixture(admin), ctx = testTenantContext(f.tenantId), actor = { membershipId: f.memberId, actorRef: `membership:${f.memberId}` };
  const packs = new EvidencePackRepository(runtime), repo = new RecoveryMessageRepository(runtime), pack = await packs.generate(ctx, f.customerCaseId, { commandId: randomUUID() }, actor.actorRef);
  await packs.approveAttachment(ctx, f.customerCaseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor.actorRef);
  const before = await counts(), ready = await repo.read(ctx, f.customerCaseId), lock = await admin.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await lock.query("BEGIN"); const pid = (await lock.query("SELECT pg_backend_pid() pid")).rows[0].pid;
    await lock.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [f.tenantId, f.customerCaseId]);
    pending = repo.preview(ctx, f.customerCaseId, { version: "recovery-message-preview.v1", commandId: randomUUID(), expectedCaseRevision: ready.readiness.caseRevision, packId: pack.id }, actor).then(value => ({ value }), error => ({ error }));
    let waiting = false;
    for (let poll = 0; poll < 100; poll++) {
      waiting = (await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) waiting", [pid])).rows[0].waiting;
      if (waiting) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(waiting).toBe(true); expect(await counts()).toEqual(before);
    await lock.query("ROLLBACK");
    expect(await pending).toMatchObject({ error: { code: "RECOVERY_TERMS_NOT_APPROVED" } });
    expect(await counts()).toEqual(before);
  } finally { await lock.query("ROLLBACK"); lock.release(); await pending; }
});
