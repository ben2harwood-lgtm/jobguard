import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
import { EvidencePackApplication } from "../../../apps/api/src/evidence-pack.application.js";
import { RecoveryCaseApplication } from "../../../apps/api/src/recovery-case.application.js";

let postgres: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool, directory: string;
let fixture: Awaited<ReturnType<typeof seedEvidencePackFixture>>;
const oldEnvironment = process.env.JOBGUARD_ENV;
let upgradeProof: Awaited<ReturnType<typeof proofBefore>>;
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  directory = await mkdtemp(join(tmpdir(), "jg-serious-b7-"));
  const port = await freePort(59000, 200);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password: "synthetic" });
  // An actual previous schema, with populated pack sources, before applying 0166.
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS) {
    const name = url.pathname.split("/").at(-1)!;
    if (name.startsWith("0166_")) break;
    const sql = await readFile(url, "utf8");
    await admin.query(name === "0095_job_parties.sql" ? sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','synthetic_demo',true);") : sql);
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
  }
  await installLegacySyntheticPartyFixtures(admin);
  fixture = await seedEvidencePackFixture(admin, { practice: true });
  upgradeProof = await proofBefore(admin, ["control_plane.practice_session", "app.membership", "app.job", "app.recovery_case", "app.recovery_claim_revision"]);
  const migration = MIGRATION_URLS.find(url => url.pathname.endsWith("/0185_evidence_pack_authority.sql"));
  expect(migration).toBeDefined();
  // The normal non-superuser migration owner must be able to apply this migration.
  const client = await admin.connect();
  try { await client.query("SET ROLE jobguard_migration"); await client.query(await readFile(migration!, "utf8")); }
  finally { await client.query("ROLLBACK"); await client.query("RESET ROLE"); client.release(); }
  // The runner also sees the already-applied expand-compatible definition safely.
  await migrate(admin);
  await admin.query("CREATE ROLE serious_b7_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO serious_b7_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "serious_b7_login", password: "synthetic" });
}, 120_000);
afterAll(async () => {
  if (oldEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = oldEnvironment;
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function waitForWaiter(holder: PoolClient) {
  const pid = (await holder.query("SELECT pg_backend_pid() pid")).rows[0].pid;
  for (let attempt = 0; attempt < 200; attempt++) {
    const waiting = await admin.query("SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))", [pid]);
    if (waiting.rowCount) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("Expected PostgreSQL lock waiter was not observed");
}

describe("SERIOUS-B7 PostgreSQL authority and sources", () => {
  it("S21 upgrades the previous supported schema without changing stored business/identity rows or exposing new authority", async () => {
    expect(await proofDifferences(admin, upgradeProof)).toEqual({ rows: [], types: [] });
    const facts = (await admin.query(`SELECT p.prosecdef,pg_get_userbyid(p.proowner) owner,p.proconfig,
      has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,
      has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure,
      EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public
      FROM pg_proc p WHERE p.oid='app.authenticate_practice_session(text,uuid)'::regprocedure`)).rows[0];
    expect(facts).toEqual({ prosecdef: true, owner: "jobguard_migration", proconfig: ["search_path=pg_catalog"], runtime: true, infrastructure: false, public: false });
    await expect(runtime.query("SELECT * FROM control_plane.practice_session")).rejects.toMatchObject({ code: "42501" });
  });

  it("S21 still records and replays an active owner's exact attachment approval once", async () => {
    const app = new EvidencePackApplication(runtime), session = fixture.sessionToken!;
    const pack = (await app.generate(session, fixture.caseId, { version: "evidence-pack-command.v1", commandId: randomUUID() })).packs.at(-1)!;
    const command = { version: "evidence-pack-attachment-approval.v1", commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash };
    for (let attempt = 0; attempt < 2; attempt++) {
      const approved = await app.approveAttachment(session, fixture.caseId, pack.id, command);
      expect(approved.packs.find(value => value.id === pack.id)).toMatchObject({ attachmentApprovalRecorded: true, attachmentApprovalValid: true });
    }
    expect((await admin.query("SELECT actor_ref FROM app.evidence_pack_attachment_approval WHERE tenant_id=$1 AND command_id=$2", [fixture.tenantId, command.commandId])).rows).toEqual([{ actor_ref: `membership:${fixture.memberId}` }]);
    expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='evidence_pack.attachment_approved'", [fixture.tenantId, pack.id])).rows).toEqual([{ n: 1 }]);
  });

  it.each(["session", "membership", "permission", "membership_expiry", "session_expiry"] as const)("S21 refuses %s revocation/change committed while attachment approval waits for its case lock", async kind => {
    const app = new EvidencePackApplication(runtime), session = fixture.sessionToken!;
    const pack = (await app.generate(session, fixture.caseId, { version: "evidence-pack-command.v1", commandId: randomUUID() })).packs.at(-1)!;
    expect(pack.omissions).toEqual([]);
    const command = { version: "evidence-pack-attachment-approval.v1", commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash };
    const before = (await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='evidence_pack.attachment_approved'", [fixture.tenantId])).rows;
    const holder = await admin.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [fixture.tenantId, fixture.caseId]);
      pending = app.approveAttachment(session, fixture.caseId, pack.id, command).then(value => ({ value }), error => ({ error }));
      await waitForWaiter(holder);
      if (kind === "session") await admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [fixture.sessionDigest]);
      else if (kind === "membership") await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [fixture.tenantId, fixture.memberId]);
      else if (kind === "permission") await admin.query("UPDATE app.membership SET role='viewer' WHERE tenant_id=$1 AND id=$2", [fixture.tenantId, fixture.memberId]);
      else if (kind === "session_expiry") await admin.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1", [fixture.sessionDigest]);
      else await admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [fixture.tenantId, fixture.memberId]);
      await holder.query("COMMIT");
      expect(await pending).toMatchObject({ error: { message: "UNAUTHENTICATED" } });
      expect((await admin.query("SELECT command_id FROM app.evidence_pack_attachment_approval WHERE tenant_id=$1 AND command_id=$2", [fixture.tenantId, command.commandId])).rows).toEqual([]);
      expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='evidence_pack.attachment_approved'", [fixture.tenantId])).rows).toEqual(before);
    } finally {
      await holder.query("ROLLBACK"); holder.release();
      await pending;
      await admin.query("UPDATE control_plane.practice_session SET revoked_at=NULL,expires_at=created_at+interval '7 days' WHERE token_digest=$1", [fixture.sessionDigest]);
      await admin.query("UPDATE app.membership SET revoked_at=NULL,expires_at=NULL,role='owner' WHERE tenant_id=$1 AND id=$2", [fixture.tenantId, fixture.memberId]);
    }
  });

  it.each(["control_plane.practice_session", "app.membership"])("S21 holds %s against revocation until the approving transaction ends", async table => {
    const holder = await runtime.connect(), revoker = await admin.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT set_config('app.tenant_id',$1,true)", [fixture.tenantId]);
      await holder.query("SELECT set_config('app.evidence_pack_approval_fence','on',true)");
      expect((await holder.query("SELECT * FROM app.authenticate_practice_session($1,$2)", [fixture.sessionDigest, fixture.tenantId])).rowCount).toBe(1);
      pending = revoker.query(table.startsWith("control_plane") ? "UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1" : "UPDATE app.membership SET revoked_at=clock_timestamp() WHERE id=$1", [table.startsWith("control_plane") ? fixture.sessionDigest : fixture.memberId]);
      await waitForWaiter(holder);
      await holder.query("COMMIT"); await pending;
    } finally {
      await holder.query("ROLLBACK"); holder.release(); await pending; revoker.release();
      await admin.query("UPDATE control_plane.practice_session SET revoked_at=NULL WHERE token_digest=$1", [fixture.sessionDigest]);
      await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE id=$1", [fixture.memberId]);
    }
  });

  it.each(["merchant_overcharge", "duplicate_supplier_payment", "prevention"] as const)("S22 opens and packs supported supplier case %s through the real applications", async caseType => {
    const opened = await new RecoveryCaseApplication(runtime, fixture.sessionToken!).command(fixture.jobId, {
      version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), caseType, claimedNetPence: 32000,
      counterparty: "Fictional supplier", book: "supplier_cost", sourceType: "supplier_documents",
      sourceRefs: [fixture.rateId, fixture.supplierInvoiceId, fixture.supplierDeliveryId], expectedRevision: 0,
    });
    const id = opened.cases.at(-1)!.id;
    const pack = (await new EvidencePackApplication(runtime).generate(fixture.sessionToken!, id, { version: "evidence-pack-command.v1", commandId: randomUUID() })).packs.at(-1)!;
    expect(pack.sources.map(source => source.sourceId)).toEqual(expect.arrayContaining([`material_rate_revision:${fixture.rateId}`, `supplier_document_version:${fixture.supplierInvoiceVersionId}`, `supplier_document_version:${fixture.supplierDeliveryVersionId}`]));
    expect(pack.sources.some(source => source.kind === "invoice")).toBe(false);
    expect(pack.omissions).toEqual([]);
  });
});
