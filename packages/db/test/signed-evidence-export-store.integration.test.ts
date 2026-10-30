import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { appendAuditBatch } from "../src/audit.js";
import { withTenant } from "../src/tenant-context.js";
import { SignedEvidenceExportStore, signedEvidenceBundleHash, retainEvidenceExportKey } from "../src/signed-evidence-export-store.js";
import { verifySignedEvidenceExport } from "../src/signed-evidence-export.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { storeFixture } from "./signed-evidence-export-store-fixture.js";
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, store: SignedEvidenceExportStore;

beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const databaseDir = await mkdtemp(join(tmpdir(), "jg-signed-store-")), port = await freePort(58500, 100);
  postgres = new EmbeddedPostgres({ databaseDir, port, user: "postgres", password: "synthetic", persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const connection = { host: "127.0.0.1", port, database: "postgres", password: "synthetic" };
  admin = new Pool({ ...connection, user: "postgres", max: 1 });
  const own = MIGRATION_URLS.findIndex(u => u.pathname.endsWith("0493_signed_evidence_export_store.sql"));
  expect(own).toBeGreaterThan(0);
  // Upgrade from every predecessor; real migrator then proves fresh successor registration and replay.
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, own)) {
    await admin.query(await readFile(url, "utf8"));
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  await migrate(admin); await migrate(admin);
  await admin.query("CREATE ROLE signed_store_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO signed_store_login");
  runtime = new Pool({ ...connection, user: "signed_store_login", max: 2 }); store = new SignedEvidenceExportStore(runtime);
}, 120_000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); });

async function provision(f = storeFixture()) {
  const user = randomUUID();
  // Admin-only synthetic setup. The exercised operations below use the real runtime role and triggers.
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [f.tenantId]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await withTenant(admin, testTenantContext(f.tenantId), async db => {
    await db.$client.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$1,'Fictional builder')", [f.tenantId]);
    await db.$client.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$2,$3,'owner')", [f.request.actorMembershipId, f.tenantId, user]);
    await db.$client.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Fictional export job')", [f.jobId, f.tenantId]);
    await db.$client.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,synthetic) VALUES($1,$2,$3,100,'GBP','identified',true)", [f.caseId, f.tenantId, f.jobId]);
  });
  await register(f); return f;
}
async function register(f: ReturnType<typeof storeFixture>) {
  for (const key of f.signer.verificationKeys()) await retainEvidenceExportKey(admin, testTenantContext(f.tenantId), key);
}
async function approve(f: ReturnType<typeof storeFixture>, recipient = f.request.recipient, hash = signedEvidenceBundleHash(f.bundle)) {
  const decision = randomUUID(), resolution = randomUUID();
  await withTenant(admin, testTenantContext(f.tenantId), async db => {
    await db.$client.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'recovery_case',$3,'evidence_export.store')", [decision, f.tenantId, f.caseId]);
    await db.$client.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution, f.tenantId, decision, f.request.actorMembershipId]);
    await db.$client.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at)
      VALUES($1,$2,$3,$4,$5,'evidence_export.store',$6,$7,0,'signed-evidence-export-store.v1',clock_timestamp()+interval '1 hour')`,
    [f.request.authorizationId, f.tenantId, decision, resolution, f.request.actorMembershipId, recipient, hash]);
  });
}
const count = async (tenant: string) => (await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='evidence_export.stored'", [tenant])).rows[0].n;

it("persists exact bytes and public key, concurrent replay audits once, conflicting replay fails", async () => {
  const f = await provision(); await approve(f);
  const results = await Promise.all([store.persist(testTenantContext(f.tenantId), f.request), store.persist(testTenantContext(f.tenantId), f.request)]);
  expect(results.map(r => r.reused).sort()).toEqual([false, true]); expect(await count(f.tenantId)).toBe(1);
  await expect(store.persist(testTenantContext(f.tenantId), { ...f.request, recipient: "other@example.invalid" })).rejects.toMatchObject({ code: "SIGNED_EXPORT_CONFLICT" });
  const row = (await admin.query("SELECT bundle_text,recipient FROM app.signed_evidence_export WHERE tenant_id=$1", [f.tenantId])).rows[0];
  expect(JSON.parse(row.bundle_text)).toEqual(f.bundle); expect(row.recipient).toBe(f.request.recipient);
});
it.each(["missing approval", "wrong recipient", "wrong bytes", "revoked", "expired", "rejected", "revoked member"])("refuses %s and rolls back audit and export", async attack => {
  const f = await provision();
  if (attack !== "missing approval") await approve(f, attack === "wrong recipient" ? "other@example.invalid" : f.request.recipient, attack === "wrong bytes" ? "0".repeat(64) : undefined);
  if (attack === "revoked") await admin.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1", [f.tenantId]);
  if (attack === "revoked member") await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1", [f.tenantId]);
  if (attack === "expired" || attack === "rejected") {
    // Revocation guard intentionally forbids expiry rewrites. A historical approval is created by fixture replication only.
    await admin.query("SET session_replication_role=replica");
    try { await admin.query(attack === "expired" ? "UPDATE app.action_authorization SET expires_at='2026-01-01' WHERE tenant_id=$1" : "UPDATE app.decision_resolution SET resolution='rejected' WHERE tenant_id=$1", [f.tenantId]); }
    finally { await admin.query("SET session_replication_role=origin"); }
  }
  await expect(store.persist(testTenantContext(f.tenantId), f.request)).rejects.toThrow();
  expect(await count(f.tenantId)).toBe(0);
  expect((await admin.query("SELECT id FROM app.signed_evidence_export WHERE tenant_id=$1", [f.tenantId])).rows).toEqual([]);
});
it("refuses a foreign tenant, missing/altered/out-of-scope files and unknown keys", async () => {
  const f = await provision(); await approve(f);
  await expect(store.persist(testTenantContext(randomUUID()), f.request)).rejects.toMatchObject({ code: "SIGNED_EXPORT_FORBIDDEN" });
  const pack = JSON.parse(f.bundle.evidenceText);
  for (const evidenceText of ["", JSON.stringify({ ...pack, sources: [] }), f.bundle.evidenceText.replace("Fictional builder", "Altered builder")])
    await expect(store.persist(testTenantContext(f.tenantId), { ...f.request, bundle: { ...f.bundle, evidenceText } })).rejects.toThrow();
  await expect(store.persist(testTenantContext(f.tenantId), { ...f.request, bundle: { ...f.bundle, payload: { ...f.bundle.payload, caseId: randomUUID() } } })).rejects.toThrow();
  const other = storeFixture(f.tenantId, f.jobId, f.caseId);
  await expect(retainEvidenceExportKey(admin, testTenantContext(f.tenantId), other.signer.verificationKeys()[0])).rejects.toMatchObject({ code: "SIGNED_EXPORT_CONFLICT" });
  await expect(store.persist(testTenantContext(f.tenantId), other.request)).rejects.toMatchObject({ code: "SIGNED_EXPORT_INVALID" });
  expect(await count(f.tenantId)).toBe(0);
});
it("rotation retains old bytes and independent verification material across a new store instance", async () => {
  const f = await provision(); await approve(f); await store.persist(testTenantContext(f.tenantId), f.request);
  f.signer.rotate("v2", "2026-10-29T08:00:00.000Z", "2027-01-01T00:00:00.000Z");
  const next = storeFixture(f.tenantId, f.jobId, f.caseId, f.signer); next.request.actorMembershipId = f.request.actorMembershipId;
  await register(next); await approve(next); await new SignedEvidenceExportStore(runtime).persist(testTenantContext(f.tenantId), next.request);
  const rows = (await admin.query("SELECT bundle_text FROM app.signed_evidence_export WHERE tenant_id=$1", [f.tenantId])).rows;
  const keys = (await admin.query("SELECT record FROM app.evidence_export_signer_key WHERE tenant_id=$1", [f.tenantId])).rows.map(r => r.record);
  expect(rows).toHaveLength(2); expect(keys).toHaveLength(2);
  expect(rows.some(r => r.bundle_text === JSON.stringify(f.bundle))).toBe(true);
  for (const row of rows) { const file = JSON.parse(row.bundle_text); expect(verifySignedEvidenceExport(file, {
    version: "evidence-verification-context.v1", tenantId: f.tenantId, jobId: f.jobId, caseId: f.caseId,
    exportId: file.payload.exportId, checkedAt: "2026-10-30T09:00:00.000Z", trustedKeys: keys,
  }).signerTrusted).toBe(true); }
});
it("actual catalogs and RLS deny foreign reads, key writes, updates, deletes and truncation", async () => {
  const f = await provision(); await approve(f); await store.persist(testTenantContext(f.tenantId), f.request);
  const rows = (await admin.query(`SELECT relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class
    WHERE oid IN ('app.evidence_export_signer_key'::regclass,'app.signed_evidence_export'::regclass) ORDER BY relname`)).rows;
  expect(rows).toEqual(["evidence_export_signer_key", "signed_evidence_export"].map(relname => ({ relname, relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration" })));
  for (const table of ["signed_evidence_export", "evidence_export_signer_key"]) {
    expect((await runtime.query(`SELECT * FROM app.${table}`)).rows).toEqual([]);
    expect((await withTenant(runtime, testTenantContext(randomUUID()), db => db.$client.query(`SELECT * FROM app.${table}`))).rows).toEqual([]);
    for (const sql of [`UPDATE app.${table} SET tenant_id=tenant_id`, `DELETE FROM app.${table}`, `TRUNCATE app.${table}`])
      await expect(withTenant(runtime, testTenantContext(f.tenantId), db => db.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
    await expect(admin.query(`UPDATE app.${table} SET tenant_id=tenant_id WHERE tenant_id=$1`, [f.tenantId])).rejects.toThrow("audit");
  }
  await expect(runtime.query("INSERT INTO app.evidence_export_signer_key DEFAULT VALUES")).rejects.toMatchObject({ code: "42501" });
});

it("direct insertion cannot substitute an unrelated audit event", async () => {
  const f = await provision(); await approve(f);
  const eventId = randomUUID(), p = f.bundle.payload;
  await withTenant(admin, testTenantContext(f.tenantId), db => appendAuditBatch(db, [{
    id: eventId, version: "audit.v1", actorRef: `membership:${f.request.actorMembershipId}`,
    eventType: "fixture.recorded", subjectType: "audit-export", subjectRef: p.exportId, payload: {},
  }]));
  await expect(withTenant(runtime, testTenantContext(f.tenantId), db => db.$client.query(`INSERT INTO app.signed_evidence_export(
    tenant_id,id,job_id,case_id,actor_membership_id,authorization_id,recipient,signer_id,key_version,signer_fingerprint,bundle_text,bundle_hash,audit_event_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [f.tenantId,p.exportId,f.jobId,f.caseId,
    f.request.actorMembershipId,f.request.authorizationId,f.request.recipient,p.signerId,p.keyVersion,p.signerFingerprint,
    JSON.stringify(f.bundle),signedEvidenceBundleHash(f.bundle),eventId]))).rejects.toThrow("SIGNED_EXPORT_AUDIT_REQUIRED");
  expect(await count(f.tenantId)).toBe(0);
  expect((await admin.query("SELECT id FROM app.signed_evidence_export WHERE tenant_id=$1", [f.tenantId])).rows).toEqual([]);
});
it("a valid signature cannot create a cross-job case reference", async () => {
  const f = await provision(), other = storeFixture(f.tenantId, randomUUID(), f.caseId, f.signer);
  other.request.actorMembershipId = f.request.actorMembershipId;
  await approve(other);
  await expect(store.persist(testTenantContext(f.tenantId), other.request)).rejects.toMatchObject({ code: "23503" });
  expect(await count(f.tenantId)).toBe(0);
});
