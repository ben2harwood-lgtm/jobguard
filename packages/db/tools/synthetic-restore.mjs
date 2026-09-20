/**
 * Disposable synthetic cold-backup rehearsal. Never accepts a database URL or an
 * existing data directory. These are test fixtures, not live operational tools.
 * See docs/operations/synthetic-restore-rehearsal.md for the measured boundary.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdtemp, chmod, chown, cp, lstat, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { deflateSync } from "node:zlib";
import { Pool } from "pg";
import EmbeddedPostgres from "embedded-postgres";
import { createSyntheticInvoicePdf, money } from "@jobguard/core";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const canonical = value => JSON.stringify(value);
const requiredMode = mode => { if (mode !== "synthetic_demo") throw new Error("SYNTHETIC_REHEARSAL_ONLY"); };
async function vacantPort() {
  const server = createServer();
  await new Promise((ok, no) => { server.once("error", no); server.listen(0, "127.0.0.1", ok); });
  const port = server.address().port;
  await new Promise((ok, no) => server.close(error => error ? no(error) : ok()));
  return port;
}
async function exists(path) { try { await lstat(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
async function treeManifest(directory) {
  const files = [];
  async function visit(relative = "") {
    for (const name of (await readdir(join(directory, relative))).sort()) {
      const path = relative ? `${relative}/${name}` : name, info = await lstat(join(directory, path));
      // This fixture has no external tablespaces/WAL links. Never silently follow them.
      if (info.isSymbolicLink()) throw new Error("EXTERNAL_OR_SYMBOLIC_BACKUP_PATH_REFUSED");
      if (info.isDirectory()) await visit(path);
      else if (info.isFile()) files.push({ path, bytes: info.size, sha256: digest(await readFile(join(directory, path))) });
      else throw new Error("UNSUPPORTED_BACKUP_FILE");
    }
  }
  await visit();
  return files;
}
async function verifyTree(directory, manifest) {
  if (canonical(await treeManifest(directory)) !== canonical(manifest)) throw new Error("BACKUP_MANIFEST_MISMATCH");
}
async function preserveOwnership(source, target) {
  const info = await lstat(source);
  if (process.getuid?.() === 0) await chown(target, info.uid, info.gid);
  await chmod(target, info.mode & 0o777);
  if (info.isDirectory()) for (const name of await readdir(source)) await preserveOwnership(join(source, name), join(target, name));
}
async function copyStoppedCluster(source, target) {
  if (await exists(join(source, "postmaster.pid"))) throw new Error("RUNNING_CLUSTER_BACKUP_REFUSED");
  if ((await readFile(join(source, "PG_VERSION"), "utf8")).trim() !== "16") throw new Error("UNSUPPORTED_BACKUP_VERSION");
  if (await exists(target)) throw new Error("RESTORE_TARGET_MUST_BE_NEW");
  const manifest = await treeManifest(source);
  await cp(source, target, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
  await preserveOwnership(source, target);
  await verifyTree(target, manifest);
  return manifest;
}
function practicePng() {
  const crc = bytes => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
  const chunk = (name, bytes) => { const type = Buffer.from(name), result = Buffer.alloc(bytes.length + 12); result.writeUInt32BE(bytes.length); type.copy(result, 4); bytes.copy(result, 8); result.writeUInt32BE(crc(Buffer.concat([type, bytes])), bytes.length + 8); return result; };
  const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0, 20, 30, 40]))), chunk("IEND", Buffer.alloc(0))]);
}

/** The API parameter is the real db package: source in Vitest, compiled package in the CLI. */
export async function runSyntheticRestoreRehearsal(options = {}, api) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(key => key !== "environment")) throw new Error("REHEARSAL_OPTIONS_REFUSED");
  const environment = Object.hasOwn(options, "environment") ? options.environment : "synthetic_demo";
  requiredMode(environment);
  if (!api?.migrate || !api?.EvidenceService || !api?.verifyAuditChain) throw new Error("DATABASE_IMPLEMENTATION_REQUIRED");
  const started = performance.now(), checks = [], timings = {}, root = await mkdtemp(join(tmpdir(), "jobguard-restore-rehearsal-"));
  // The PostgreSQL OS principal needs traverse permission; cluster directories stay 0700.
  await chmod(root, 0o711);
  const sourcePath = join(root, "source"), backupPath = join(root, "backup"), restoredPath = join(root, "restored");
  const sourcePort = await vacantPort(), password = randomUUID();
  let restoredPort = await vacantPort(); while (restoredPort === sourcePort) restoredPort = await vacantPort();
  const clusterOptions = { user: "postgres", password, persistent: true, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], postgresFlags: ["-c", "listen_addresses=127.0.0.1"], onLog: () => undefined, onError: () => undefined };
  const source = new EmbeddedPostgres({ ...clusterOptions, databaseDir: sourcePath, port: sourcePort });
  const restored = new EmbeddedPostgres({ ...clusterOptions, databaseDir: restoredPath, port: restoredPort });
  const pools = new Set();
  const pool = (port, user = "postgres") => { const p = new Pool({ host: "127.0.0.1", port, user, password, database: "postgres", max: 4 }); pools.add(p); return p; };
  const closePools = async () => { await Promise.all([...pools].map(p => p.end())); pools.clear(); await new Promise(ok => setTimeout(ok, 25)); };
  const pass = (id, detail) => checks.push({ id, status: "PASS", detail });
  const ids = Object.fromEntries(["tenant", "otherTenant", "identity", "account", "member", "job", "otherJob", "scope", "quote", "draft", "revision"].map(name => [name, randomUUID()]));
  const context = api.verifiedTenantContextFromMembership({ tenantId: ids.tenant, membershipId: ids.member, identityUserId: ids.identity });
  const otherContext = api.verifiedTenantContextFromMembership({ tenantId: ids.otherTenant, membershipId: randomUUID(), identityUserId: ids.identity });
  const fixtureHash = digest("fictional-source-only");
  let exportReceipt;
  try {
    await source.initialise(); await source.start();
    let admin = pool(sourcePort);
    const postgresVersion = (await admin.query("SHOW server_version")).rows[0].server_version;
    assert.match(postgresVersion, /^16\./);
    await api.migrate(admin);
    const migrationNames = (await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name);
    await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [ids.tenant, ids.otherTenant]);
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [ids.identity]);
    await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional restore builder')", [ids.account, ids.tenant]);
    await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [ids.member, ids.tenant, ids.account, ids.identity]);
    await admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional restore job','live'),($3,$4,'Other tenant fictional job','draft')", [ids.job, ids.tenant, ids.otherJob, ids.otherTenant]);
    await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [ids.scope, ids.tenant, ids.job]);
    await admin.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id,stage) VALUES($1,$2,$3,'in_progress')", [ids.tenant, ids.job, ids.scope]);
    await admin.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,10000,'accepted')", [ids.quote, ids.tenant, ids.job, fixtureHash]);
    await admin.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [ids.draft, ids.tenant, ids.job]);
    await admin.query("INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings) VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',10000,2000,12000,false,'[]')", [ids.revision, ids.tenant, ids.job, ids.draft, fixtureHash, ids.quote]);
    await admin.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=1 WHERE tenant_id=$2 AND id=$3", [ids.revision, ids.tenant, ids.draft]);
    // Generated login exists only inside these disposable clusters. No deployment secrets are read.
    await admin.query(`CREATE ROLE rehearsal_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO rehearsal_runtime`);
    let runtime = pool(sourcePort, "rehearsal_runtime");
    class DatabaseSyntheticStorage {
      constructor(connection) { this.connection = connection; }
      async createUploadUrl({ key }) { return `synthetic.invalid/${encodeURIComponent(key)}`; }
      async createDownloadUrl({ key, versionId }) { return `synthetic.invalid/${encodeURIComponent(key)}?version=${encodeURIComponent(versionId)}`; }
      async readExactVersion(key, versionId) {
        const row = await api.withTenant(this.connection, context, async db => (await db.$client.query("SELECT bytes,content_type FROM app.synthetic_evidence_original WHERE tenant_id=$1 AND object_key=$2 AND object_version_id=$3", [ids.tenant, key, versionId])).rows[0]);
        if (!row) throw new Error("MISSING_SYNTHETIC_ORIGINAL");
        return { key, versionId, bytes: row.bytes, byteLength: row.bytes.length, contentType: row.content_type };
      }
      async deleteExactVersion() { throw new Error("RETAINED_SYNTHETIC_ORIGINAL"); }
    }
    let storage = new DatabaseSyntheticStorage(runtime);
    const bytes = practicePng();
    const evidenceService = new api.EvidenceService(runtime, storage);
    const upload = await evidenceService.beginUpload(context, { jobId: ids.job, scopeItemId: ids.scope, expectedSha256: digest(bytes), contentType: "image/png", maximumBytes: bytes.length, retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + 60_000) });
    const objectVersion = "rehearsal-original-v1";
    await api.withTenant(runtime, context, db => db.$client.query("INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes) VALUES($1,$2,$3,$4,$5,$6,'synthetic_demo','image/png',$7)", [ids.tenant, upload.id, ids.job, ids.scope, upload.objectKey, objectVersion, bytes]));
    await evidenceService.finalize(context, { uploadId: upload.id, objectVersionId: objectVersion, evidenceType: "completion_photo" });
    await new api.ProofCommandService(runtime, storage).complete(context, { version: "proof.complete.v1", commandId: randomUUID(), actorMembershipId: ids.member, jobId: ids.job, scopeItemId: ids.scope, stage: "completion", evidenceId: upload.id, requiredEvidenceType: "completion_photo", decisionId: null });
    const billing = new api.CustomerBillingCommandService(runtime);
    const invoicePdfHash = digest(createSyntheticInvoicePdf({ invoiceNumber: "SYN-2026-000001", issuerName: "Fictional restore builder", total: money(12000), sourceRevisionId: ids.revision, evidenceVersionIds: [] }));
    const issued = await billing.issue(context, {
      version: "customer-invoice.issue.v1", finalAccountRevisionId: ids.revision, issuedOn: "2026-09-20",
      issuer: { legalName: "Fictional restore builder", address: "Synthetic test address only", vatNumber: null },
      command: { version: "command.v1", commandId: randomUUID(), commandType: "customer_invoice.issue", semanticKey: `invoice:${ids.revision}`, actorMembershipId: ids.member, subjectType: "job", subjectRef: ids.job, authorizationId: randomUUID(), action: { actionType: "final_account.issue", recipient: null, contentHash: invoicePdfHash, aggregateRevision: 1, amountPence: 12000, currency: "GBP", policyVersion: "candidate_m1_standard_v1", expiresAt: new Date("2099-01-01T00:00:00Z") } },
    });
    const paymentCommand = { version: "customer-payment.record.v1", commandId: randomUUID(), actorMembershipId: ids.member, jobId: ids.job, invoiceId: issued.invoiceId, paidOn: "2026-09-20", amountPence: 5000, currency: "GBP", method: "bank_transfer", reference: "synthetic-restore-part-payment", builderAttestsReceived: true };
    const payment = await billing.recordPayment(context, paymentCommand);
    const sourceBalance = await billing.balance(context, issued.invoiceId);
    assert.equal(sourceBalance.balance.pence, 7000);
    const content = "Fictional approved practice message — never sent";
    const actionIds = [];
    for (const state of ["pending", "outcome_unknown", "succeeded"]) {
      const decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID(), actionId = randomUUID();
      await admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'send_quote')", [decision, ids.tenant, ids.job]);
      await admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution, ids.tenant, decision, ids.member]);
      await admin.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'send_quote','customer@example.invalid',$6,1,'synthetic-rehearsal.v1','2099-01-01')", [authorization, ids.tenant, decision, resolution, ids.member, digest(content)]);
      await api.withTenant(runtime, context, db => api.appendOutboundAction(db, ids.tenant, { version: "outbound-action.v1", id: actionId, authorizationId: authorization, adapter: "fake_restore", providerEffectKey: `restore:${state}:${actionId}`, actionType: "send_quote", recipient: "customer@example.invalid", contentHash: digest(content), immutableContent: content, aggregateRevision: 1, amountPence: null, currency: null, policyVersion: "synthetic-rehearsal.v1", authorizationExpiresAt: new Date("2099-01-01T00:00:00Z") }));
      if (state !== "pending") {
        const adapter = { name: "fake_restore", supportsProviderDeduplication: false, deliver: async () => state === "succeeded" ? { kind: "succeeded", providerReference: "synthetic-pre-backup" } : { kind: "outcome_unknown", code: "synthetic-timeout" }, reconcile: async () => "unknown" };
        await new api.ActionExecutor(runtime, new Map([["fake_restore", adapter]]), { emit() {} }).execute(context, actionId);
      }
      actionIds.push(actionId);
    }
    // The snapshot covers every row, including money/audit/control metadata, not only the examples above.
    const tables = (await admin.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('app','audit_control','identity','control_plane','infrastructure','public') AND tablename NOT LIKE 'pg_%' ORDER BY schemaname,tablename")).rows;
    const quote = identifier => '"' + identifier.replaceAll('"', '""') + '"';
    async function rowSnapshot(connection) {
      const rows = [];
      for (const { schemaname, tablename } of tables) {
        const data = (await connection.query(`SELECT row_to_json(t)::text AS value FROM ${quote(schemaname)}.${quote(tablename)} t ORDER BY row_to_json(t)::text`)).rows.map(row => row.value);
        rows.push({ table: `${schemaname}.${tablename}`, count: data.length, sha256: digest(canonical(data)) });
      }
      return rows;
    }
    const checkpoints = await api.exportAuditCheckpoints(admin), checkpoint = checkpoints.find(c => c.tenantId === ids.tenant);
    assert.ok(checkpoint);
    const auditRows = connection => api.withTenant(connection, context, async db => (await db.$client.query(`SELECT id,version,tenant_id AS "tenantId",sequence::int,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash" FROM app.audit_event ORDER BY sequence`)).rows);
    api.verifyAuditChain(await auditRows(runtime), checkpoint);
    const before = await rowSnapshot(admin);
    await assert.rejects(copyStoppedCluster(sourcePath, join(root, "invalid-live-copy")), /RUNNING_CLUSTER_BACKUP_REFUSED/);
    pass("running-cluster-refused", "A live data-directory copy is rejected; no partial hot backup is treated as usable.");
    await closePools(); await source.stop();
    const backupStart = performance.now(), manifest = await copyStoppedCluster(sourcePath, backupPath);
    timings.backupMilliseconds = Math.round(performance.now() - backupStart);
    const manifestHash = digest(canonical(manifest));
    assert.ok(manifest.some(file => file.path.startsWith("pg_wal/")));
    pass("cold-cluster-backup", "Cleanly stopped whole-cluster copy includes WAL, roles, schema and all table files.");
    // Negative control damages only this disposable copy; the original fixture remains intact.
    const configPath = join(backupPath, "postgresql.auto.conf"), originalConfig = await readFile(configPath);
    await writeFile(configPath, Buffer.concat([originalConfig, Buffer.from("\n# deliberate synthetic corruption\n")]));
    await assert.rejects(verifyTree(backupPath, manifest), /BACKUP_MANIFEST_MISMATCH/);
    await writeFile(configPath, originalConfig); await verifyTree(backupPath, manifest);
    pass("corrupt-backup-refused", "A modified backup fails SHA-256 verification before any restore starts.");
    await rename(sourcePath, join(root, "original-offline"));
    const restoreStart = performance.now();
    await copyStoppedCluster(backupPath, restoredPath); await verifyTree(restoredPath, manifest);
    await restored.start(); timings.restoreStartMilliseconds = Math.round(performance.now() - restoreStart);
    admin = pool(restoredPort); runtime = pool(restoredPort, "rehearsal_runtime"); storage = new DatabaseSyntheticStorage(runtime);
    assert.equal((await admin.query("SHOW server_version")).rows[0].server_version, postgresVersion);
    assert.deepEqual(await rowSnapshot(admin), before);
    pass("all-rows-restored", `${before.length} application/control tables match their pre-backup row counts and hashes.`);
    const restoredBilling = new api.CustomerBillingCommandService(runtime);
    assert.deepEqual(await restoredBilling.balance(context, issued.invoiceId), sourceBalance);
    // A committed manual receipt must not be duplicated by a restored command retry.
    assert.deepEqual(await restoredBilling.recordPayment(context, paymentCommand), payment);
    assert.deepEqual(await restoredBilling.balance(context, issued.invoiceId), sourceBalance);
    const invoiceRow = await api.withTenant(runtime, context, async db => (await db.$client.query("SELECT pdf_bytes,pdf_sha256,total_pence,synthetic FROM app.customer_invoice WHERE id=$1", [issued.invoiceId])).rows[0]);
    assert.equal(digest(invoiceRow.pdf_bytes), invoiceRow.pdf_sha256.trim()); assert.equal(invoiceRow.pdf_sha256.trim(), invoicePdfHash);
    assert.equal(Number(invoiceRow.total_pence), 12000); assert.equal(invoiceRow.synthetic, true);
    const receiptRow = await api.withTenant(runtime, context, async db => (await db.$client.query("SELECT qualifying_recovery_proof,platform_fee_settlement FROM app.customer_payment WHERE id=$1", [payment.paymentId])).rows[0]);
    assert.deepEqual(receiptRow, { qualifying_recovery_proof: false, platform_fee_settlement: false });
    pass("invoice-and-manual-receipt-restored", "The immutable £120 invoice bytes/hash and £50 manual receipt survive restore; replay leaves £70 outstanding and never creates recovery eligibility or platform settlement.");
    const restoredObject = await storage.readExactVersion(upload.objectKey, objectVersion);
    assert.equal(digest(restoredObject.bytes), digest(bytes)); assert.equal(restoredObject.versionId, objectVersion);
    await new api.EvidenceService(runtime, storage).authorizedDownloadUrl(context, { evidenceId: upload.id, jobId: ids.job, scopeItemId: ids.scope });
    await assert.rejects(new api.EvidenceService(runtime, storage).authorizedDownloadUrl(otherContext, { evidenceId: upload.id, jobId: ids.job, scopeItemId: ids.scope }), /EVIDENCE_NOT_AUTHORIZED/);
    pass("evidence-versions-restored", "The retained DB-backed synthetic original has the same key, version, bytes and SHA-256; another tenant cannot download it.");
    assert.equal(await new api.EvidenceService(runtime, storage).cleanupExpiredOrphans(context, new Date("2100-01-01T00:00:00Z")), 0);
    assert.equal(digest((await storage.readExactVersion(upload.objectKey, objectVersion)).bytes), digest(bytes));
    pass("retained-evidence-preserved", "Expired-orphan cleanup does not select or remove the finalized retained original, even with a future test clock.");
    const restoredAudit = await auditRows(runtime); api.verifyAuditChain(restoredAudit, checkpoint);
    assert.throws(() => api.verifyAuditChain(restoredAudit.map((event, i) => i === 0 ? { ...event, payload: { references: { changed: "fixture" } } } : event), checkpoint), /Invalid audit chain/);
    pass("audit-checkpoint-restored", "The restored audit chain matches the checkpoint recorded outside the copied cluster; altered payloads fail verification. The checkpoint is a local fixture, not an external signed attestation.");
    const role = (await runtime.query("SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user")).rows[0];
    assert.deepEqual(role, { rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false });
    assert.deepEqual((await runtime.query("SELECT id FROM app.job")).rows, []);
    const visible = await api.withTenant(runtime, context, async db => (await db.$client.query("SELECT id FROM app.job ORDER BY id")).rows);
    assert.deepEqual(visible, [{ id: ids.job }]);
    await assert.rejects(api.withTenant(runtime, context, db => db.$client.query("UPDATE app.job SET title='forbidden' WHERE id=$1", [ids.job])), error => error.code === "42501");
    const isolation = (await admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid='app.synthetic_evidence_original'::regclass")).rows[0];
    assert.deepEqual(isolation, { relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration" });
    pass("restored-role-and-tenant-isolation", "Runtime remains non-superuser/non-BYPASSRLS, sees no unscoped rows, cannot update jobs, and retains forced evidence RLS.");
    // This export is the documented fixture slice, not a general privacy/legal export service.
    const exported = await api.withTenant(runtime, context, async db => ({ version: "synthetic-job-export.v1", environment, jobs: (await db.$client.query("SELECT id,title,status FROM app.job ORDER BY id")).rows, evidence: (await db.$client.query("SELECT id,object_version_id,sha256 FROM app.evidence_object ORDER BY id")).rows }));
    assert.equal(exported.jobs.length, 1); assert.equal(exported.evidence.length, 1);
    assert.ok(!canonical(exported).includes(ids.otherJob));
    exportReceipt = { format: exported.version, sha256: digest(canonical(exported)), jobCount: exported.jobs.length, evidenceCount: exported.evidence.length };
    pass("tenant-scoped-export-slice", "The fixture export contains only the selected tenant's job and evidence references; no credentials or other-tenant job are exported.");
    const queue = () => api.withTenant(runtime, context, async db => (await db.$client.query("SELECT id,status FROM app.action_outbox ORDER BY id")).rows);
    const queueBefore = await queue(); let allowRehearsalExecution = false, fakeDeliveries = 0;
    const adapter = { name: "fake_restore", supportsProviderDeduplication: false, deliver: async () => { fakeDeliveries++; return { kind: "succeeded", providerReference: "synthetic-after-restore" }; }, reconcile: async () => "unknown" };
    const executor = new api.ActionExecutor(runtime, new Map([["fake_restore", adapter]]), { emit() {} });
    const executeRestored = async id => { if (!allowRehearsalExecution) throw new Error("RESTORE_NOT_VERIFIED"); await executor.execute(context, id); };
    await assert.rejects(executeRestored(actionIds[0]), /RESTORE_NOT_VERIFIED/);
    assert.equal(fakeDeliveries, 0); assert.deepEqual(await queue(), queueBefore);
    pass("restore-harness-starts-paused", "The rehearsal wrapper refuses dispatch and leaves restored pending work unchanged until its verification finishes. This is not a global application kill switch.");
    allowRehearsalExecution = true;
    await Promise.all([executeRestored(actionIds[0]), executeRestored(actionIds[0])]); await executeRestored(actionIds[0]);
    await executeRestored(actionIds[1]); await executeRestored(actionIds[2]); assert.equal(fakeDeliveries, 1);
    await assert.rejects(api.operateOutbox(runtime, context, actionIds[1], "retry"), /UNSAFE_OUTBOX_COMMAND/);
    assert.equal(await api.reconcileOutbox(runtime, context, actionIds[1], adapter), "unknown");
    await executeRestored(actionIds[1]); assert.equal(fakeDeliveries, 1);
    pass("pending-replay-and-unknown-outcome", "Concurrent/repeated dispatch produces one fake effect for the pending action; completed work is not resent and unknown work stays held without a blind retry.");
    timings.totalMilliseconds = Math.round(performance.now() - started);
    return {
      schema: "jobguard-synthetic-restore-receipt.v1", recordedAt: new Date().toISOString(), environment,
      result: "PASS", implementation: "whole-cluster-cold-filesystem-copy", nodeVersion: process.version, postgresVersion,
      migrationNames, tableCount: before.length, totalRows: before.reduce((n, item) => n + item.count, 0),
      backup: { manifestSha256: manifestHash, fileCount: manifest.length, byteCount: manifest.reduce((n, file) => n + file.bytes, 0), verifiedBeforeStart: true },
      checkpoint: { sequence: checkpoint.sequence, eventHash: checkpoint.eventHash }, exportReceipt,
      financialFixture: { invoiceGrossPence: 12000, manualReceiptPence: 5000, outstandingPence: 7000, invoicePdfSha256: invoicePdfHash, qualifyingRecoveryProof: false, platformFeeSettlement: false },
      fakeDeliveryCallsAfterRestore: fakeDeliveries, liveProviderCalls: 0, timings, checks,
      notRun: [
        "Hosted deployment backup/restore, replication and point-in-time recovery",
        "MinIO/S3/object-version restore; this run restores the current DB-backed synthetic storage path",
        "Application-wide outbound kill switch and independently authorized unpause",
        "Full privacy export/deletion/retention/legal-hold workflow",
        "Physical-device/offline, independent Claude verdict and founder release acceptance",
      ],
      releaseDecision: "NOT_AUTHORIZED", productionRpoRto: "NOT_ESTABLISHED", realDataUsed: false,
    };
  } finally {
    await closePools(); await source.stop(); await restored.stop();
    // Only this function's generated disposable fixture tree is removed.
    await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 2) throw new Error("Usage: node packages/db/tools/synthetic-restore.mjs (no database/path arguments accepted)");
    const api = await import("../dist/index.js");
    const receipt = await runSyntheticRestoreRehearsal({ environment: process.env.JOBGUARD_ENV ?? "synthetic_demo" }, api);
    console.log(JSON.stringify(receipt, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ schema: "jobguard-synthetic-restore-receipt.v1", result: "FAIL", error: String(error?.message ?? error), releaseDecision: "NOT_AUTHORIZED" }));
    process.exitCode = 1;
  }
}
