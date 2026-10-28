import { seedActiveContractorAgreement } from "./contractor-agreement-test-fixture.js";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { ContractorRepository, WorkOrderRepository, prepareWorkOrderDemo, demoRow, demoFile, MIGRATION_URLS, migrate, withTenant, appendAuditBatch, derivedUuid, sha256Hex, type TenantTransaction, type AuthenticatedMembership, type WorkOrderDemo } from "../src/index.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { freePort, closeTestPools, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
export const newTables = ["extra_event", "extra_duplicate_link", "extra_order_line_link"];
export const newOriginColumns = ["command_type", "raising_grant_id", "raiser_assigned", "work_order_id", "work_order_revision_id", "site_visit_id", "evidence_id", "resident_confirmation_evidence_id", "client_capture_id", "origin_hash"];
export const noteCanary = "Fictional note ENT4B-canary";
export const descriptionCanary = "Fictional description ENT4B-canary";
export async function cluster(beforeOwn = false) {
 const dir = await mkdtemp(join(tmpdir(), "jg-ent4b-")), port = await freePort(58800, 400);
 const postgres = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
 await postgres.initialise(); await postgres.start();
 const config = { host: "127.0.0.1", port, user: "postgres", password: "synthetic" };
 const control = new Pool(config); await control.query("CREATE DATABASE jobguard_synthetic_demo"); await control.end();
 const admin = new Pool({ ...config, database: "jobguard_synthetic_demo" });
 if (beforeOwn) {
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.filter(u => u.pathname.split("/").at(-1)! < "0122_extra_origin_persistence.sql")) {
   if (url.pathname.endsWith("0053_shared_money_origin.sql")) {
    // Actual pre-SH-1 input, so SH-1 itself produces the backfilled origin.
    const tenant = randomUUID(), user = randomUUID(), account = randomUUID(), member = randomUUID(), job = randomUUID(), scope = randomUUID();
    await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
    await admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional upgrade builder')", [tenant, account]);
    await admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [tenant, member, account, user]);
    await admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional upgrade legacy job','live')", [tenant, job]);
    await admin.query("INSERT INTO app.scope_identity(tenant_id,job_id,id) VALUES($1,$2,$3)", [tenant, job, scope]);
    await admin.query("INSERT INTO app.variation(tenant_id,id,job_id,scope_item_id,capture_kind,capture_text,description) VALUES($1,$2,$3,$4,'text','Fictional pre-SH-1 capture','Fictional pre-SH-1 extra')", [tenant, randomUUID(), job, scope]);
   }
   await admin.query(await readFile(url, "utf8")); await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]); }
 } else await migrate(admin);
 await installLegacySyntheticPartyFixtures(admin);
 await admin.query("CREATE ROLE ent4b_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS; GRANT jobguard_runtime TO ent4b_login");
 const runtime = new Pool({ ...config, database: "jobguard_synthetic_demo", user: "ent4b_login", max: 8 });
 return { admin, runtime, config, async close() { await closeTestPools(runtime, admin); await postgres.stop(); await rm(dir, { recursive: true, force: true }); } };
}
export type Cluster = Awaited<ReturnType<typeof cluster>>;
export async function fixture(c: Cluster, n = 1) {
 const p = await new ContractorRepository(c.runtime).startPractice(randomUUID());
 await seedActiveContractorAgreement(c.admin, p.tenantId);
 const demo = await prepareWorkOrderDemo(c.runtime, p, { siteCount: 3 });
 await new WorkOrderRepository(c.runtime).importCsv(p, { commandId: randomUUID(), name: "fictional.csv", kind: "csv", csv: demoFile([demoRow(demo, n)]) });
 const row = (await c.admin.query("SELECT w.id order_id,w.job_id,c.revision_id FROM app.work_order w JOIN app.work_order_current c ON (c.tenant_id,c.work_order_id)=(w.tenant_id,w.id) WHERE w.tenant_id=$1", [p.tenantId])).rows[0];
 const grant = (await c.admin.query("SELECT id FROM app.role_grant WHERE tenant_id=$1 AND membership_id=$2 AND scope_kind='tenant'", [p.tenantId, p.membershipId])).rows[0];
 const ctx = testTenantContext(p.tenantId);
 return { p, demo, ctx, jobId: row.job_id as string, orderId: row.order_id as string, revisionId: row.revision_id as string, grantId: grant.id as string };
}
export type Fixture = Awaited<ReturnType<typeof fixture>>;
export const raise = <T extends Record<string, unknown> = Record<string, never>>(f: Fixture, fields: T = {} as T) => ({ version: "raise-extra.v1", commandId: randomUUID(), commandType: "LogSiteExtra", jobId: f.jobId, actorMembershipId: f.p.membershipId, grantId: f.grantId, note: noteCanary, description: descriptionCanary, ...fields });
export async function ownerTx<T>(c: Cluster, tenantId: string, work: (db: TenantTransaction) => Promise<T>) {
 return withTenant(c.admin, testTenantContext(tenantId), async db => { await db.$client.query("SET LOCAL ROLE jobguard_migration"); return work(db); });
}
export async function receipt(db: TenantTransaction, tenantId: string, jobId: string, variationId: string, actor: string, type = "LogSiteExtra", commandId = randomUUID(), fields: { status?: string; semanticKey?: string } = {}) {
 await db.$client.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at) VALUES($1,$2,$3,$4,$5,$6::text,$7,CASE WHEN $6::text='succeeded' THEN '{}'::jsonb ELSE NULL END,CASE WHEN $6::text='succeeded' THEN clock_timestamp() ELSE NULL END)", [tenantId, commandId, type, fields.semanticKey ?? `extra-origin:${jobId}:${variationId}`, "a".repeat(64), fields.status ?? "processing", actor]); return commandId;
}
export async function rawVariation(db: TenantTransaction, tenant: string, job: string, variation = randomUUID(), kind = "site_user", track = "contractor") {
 const scope = randomUUID();
 await db.$client.query("INSERT INTO app.scope_identity(tenant_id,job_id,id) VALUES($1,$2,$3)", [tenant, job, scope]);
 await db.$client.query("INSERT INTO app.variation(tenant_id,job_id,id,scope_item_id,capture_kind,capture_text,description,job_track,origin) VALUES($1,$2,$3,$4,'text',$5,$6,$7,$8)", [tenant, job, variation, scope, noteCanary, descriptionCanary, track, kind]); return variation;
}
export async function rawOrigin(db: TenantTransaction, f: Fixture, variationId: string, commandId: string, fields: Record<string, unknown> = {}) {
 const values = { tenant_id: f.p.tenantId, job_id: f.jobId, variation_id: variationId, job_track: "contractor", kind: "site_user", command_id: commandId, raising_membership_id: f.p.membershipId, raising_role: "owner", provenance: "command", source_capture_kind: "text", source_capture_hash: "a".repeat(64), raising_grant_id: f.grantId, ...fields };
 const entries = Object.entries(values).filter(([, value]) => value !== undefined);
 return (await db.$client.query(`INSERT INTO app.extra_origin(${entries.map(([k]) => k).join(",")}) VALUES(${entries.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *,to_char(server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') server_text`, entries.map(([, v]) => v))).rows[0];
}
export async function finishRaw(db: TenantTransaction, f: Fixture, variationId: string, commandId: string, originHash: string) {
 await db.$client.query("INSERT INTO app.extra_event(tenant_id,id,job_id,variation_id,kind,command_id,actor_membership_id) VALUES($1,$2,$3,$4,'logged',$5,$6)", [f.p.tenantId, randomUUID(), f.jobId, variationId, commandId, f.p.membershipId]);
 await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${f.p.membershipId}`, eventType: "contractor.extra.raised", subjectType: "extra", subjectRef: variationId, payload: { references: { command: commandId, job: f.jobId, extra: variationId, environment: "synthetic_demo" }, hashes: { origin: originHash } } }]);
}
export async function laterRevision(c: Cluster, f: Fixture, revision = 2) {
 await new WorkOrderRepository(c.runtime).importCsv(f.p, { commandId: randomUUID(), name: "fictional-revision.csv", kind: "csv", csv: demoFile([demoRow(f.demo, 1, { expectedRevision: revision - 1, lines: [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: String(revision) }, { clientLineReference: "EXTRA", sorCode: "FIT-LOCK", quantity: "1" }] })]) });
 return (await c.admin.query("SELECT l.* FROM app.work_order_line l JOIN app.work_order_current c ON(c.tenant_id,c.revision_id)=(l.tenant_id,l.revision_id) WHERE l.tenant_id=$1 AND l.work_order_id=$2 AND l.client_line_reference='EXTRA'", [f.p.tenantId, f.orderId])).rows[0];
}
export async function visitAndEvidence(c: Cluster, f: Fixture) {
 const visitId = randomUUID(), evidenceId = randomUUID(), uploadId = randomUUID();
 await ownerTx(c, f.p.tenantId, async db => {
  await db.$client.query("INSERT INTO app.site_visit(tenant_id,id,job_id,work_order_id,membership_id) VALUES($1,$2,$3,$4,$5)", [f.p.tenantId, visitId, f.jobId, f.orderId, f.p.membershipId]);
  await db.$client.query("INSERT INTO app.evidence_upload(tenant_id,id,job_id,object_key,expected_sha256,maximum_bytes,expected_content_type,state,retention_class,expires_at) VALUES($1,$2,$3,$4,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',100,'image/png','pending','standard_evidence','2099-01-01T00:00:00Z')", [f.p.tenantId, uploadId, f.jobId, `fictional/${uploadId}`]);
  await db.$client.query("INSERT INTO app.evidence_object(tenant_id,id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,'original','site_photo',$5,'fictional-v1',$6,1,'image/png','standard_evidence',clock_timestamp(),clock_timestamp())", [f.p.tenantId, evidenceId, uploadId, f.jobId, `fictional/${uploadId}`, sha256Hex("fictional PNG")]);
 }); return { visitId, evidenceId };
}
export function originHashInput(r: Record<string, any>) {
 return { tenantId: r.tenant_id, jobId: r.job_id, variationId: r.variation_id, jobTrack: r.job_track, kind: r.kind, provenance: r.provenance, commandId: r.command_id, commandType: r.command_type, raisingMembershipId: r.raising_membership_id, raisingRole: r.raising_role, raisingGrantId: r.raising_grant_id, raiserAssigned: r.raiser_assigned, serverRecordedAt: r.server_text, deviceId: r.device_id, deviceCapturedAt: r.device_text, clientCaptureId: r.client_capture_id, workOrderId: r.work_order_id, workOrderRevisionId: r.work_order_revision_id, siteVisitId: r.site_visit_id, evidenceId: r.evidence_id, evidenceHash: r.evidence_hash, residentConfirmationEvidenceId: r.resident_confirmation_evidence_id, sourceCaptureKind: r.source_capture_kind, sourceCaptureHash: r.source_capture_hash };
}
export const originSql = `SELECT *,to_char(server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') server_text,to_char(device_captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') device_text FROM app.extra_origin`;
export const extraIdFor = (tenant: string, job: string, capture: string) => derivedUuid(`extra:${tenant}:${job}:${capture}`);
export const linkInput = (f: Fixture, duplicateId: string, canonicalId: string) => ({ version: "extra-duplicate-link.v1", commandId: randomUUID(), jobId: f.jobId, actorMembershipId: f.p.membershipId, duplicateId, canonicalId });
export const orderInput = (f: Fixture, variationId: string, line: Record<string, any>) => ({ version: "extra-order-line-link.v1", commandId: randomUUID(), jobId: f.jobId, actorMembershipId: f.p.membershipId, variationId, workOrderId: line.work_order_id, revisionId: line.revision_id, scopeItemId: line.scope_item_id });
