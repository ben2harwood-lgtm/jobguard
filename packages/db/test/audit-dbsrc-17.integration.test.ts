import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import type { PrivateVersionedStorage, StoredObject } from "@jobguard/storage";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { approveVariation, priceVariation, type VariationProposal } from "@jobguard/core";
import {
  ContractorRepository, WorkOrderRepository, VariationRepository, EvidenceService, ProofCommandService,
  PracticeActivationRepository, DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID, DEMO_ACCOUNT_ID,
  approvePricedVariation, insertPricedVariation, generateWorkOrderSample, migrate, prepareActivationFixtureV3,
  prepareWorkOrderDemo, verifiedTenantContextFromMembership, withTenant,
} from "../src/index.js";
import { WorkOrderApplication } from "../../../apps/api/src/contractor/work-order.application.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { FinalAccountCommandService } from "../src/final-account-repository.js";

// Each inserted site has the same transaction timestamp and descending UUIDs, reproducing the audit without random luck.
vi.mock("node:crypto", async original => {
  const actual = await original<typeof import("node:crypto")>();
  let next = 900000;
  return { ...actual, randomUUID: () => `17000000-0000-4000-8000-${String(next--).padStart(12, "0")}` };
});
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const context = testTenantContext(DEMO_TENANT_ID), oldEnvironment = process.env.JOBGUARD_ENV;
// A deterministic valid PNG and private versioned object fake; neither needs a server.
function fixturePng() {
  const crc = (bytes: Buffer) => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const name = Buffer.from(type), out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); name.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc(Buffer.concat([name, data])), 8 + data.length); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0, 20, 30, 40]))), chunk("IEND", Buffer.alloc(0))]);
}
class MemoryStorage implements PrivateVersionedStorage {
  versions = new Map<string, StoredObject>();
  put(key: string, versionId: string, bytes: Uint8Array) { this.versions.set(`${key}:${versionId}`, { key, versionId, bytes, byteLength: bytes.length, contentType: "image/png" }); }
  async createUploadUrl({ key }: { key: string }) { return `memory://put/${key}`; }
  async createDownloadUrl({ key, versionId }: { key: string; versionId: string }) { return `memory://get/${key}?version=${versionId}`; }
  async readExactVersion(key: string, versionId: string) { const found = this.versions.get(`${key}:${versionId}`); if (!found) throw new Error("not found"); return found; }
  async deleteExactVersion() {}
}
const objects = { png: fixturePng(), storage: new MemoryStorage() };
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "audit-dbsrc-17-")); const port = await freePort(58800, 400);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic" });
  await control.query("CREATE DATABASE jobguard_synthetic_demo"); await control.end();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional audit builder')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  // Disposable test-cluster login inherits only the existing runtime role; no production grants.
  await admin.query("CREATE ROLE audit_dbsrc_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO audit_dbsrc_login");
  runtime = new Pool({ host: "127.0.0.1", port, user: "audit_dbsrc_login", password: "synthetic", database: "jobguard_synthetic_demo", max: 8 });
  process.env.JOBGUARD_ENV = "synthetic_demo";
}, 180000);
afterAll(async () => {
  if (oldEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = oldEnvironment;
  await closeTestPools(runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true });
});
async function approvedExtra() {
  const jobId = await prepareActivationFixtureV3(admin, context, "Fictional audit job", 100000, runtime);
  await new PracticeActivationRepository(runtime).start(context, jobId, { commandId: randomUUID(), scenario: "no_charge" });
  const proposal: VariationProposal = { version: "variation-proposal.v1", id: randomUUID(), jobId, scopeItemId: randomUUID(), existingScopeItemId: null,
    lineageParentScopeItemId: null, captureKind: "text", captureText: "Fictional extra sockets", description: "Fictional extra sockets", suggestion: null };
  await new VariationRepository(runtime).logBuilderExtra(context, { version: "log-builder-extra.v1", proposal, actorMembershipId: DEMO_MEMBERSHIP_ID, price: null, deviceId: null, deviceCapturedAt: null });
  const revision = priceVariation({ id: randomUUID(), variationId: proposal.id, previous: null, proposal, description: proposal.description, contentHash: "a".repeat(64),
    confirmed: { quantity: "2", unit: "each", unitRatePence: 12500, direction: "addition", confirmedByMembershipId: DEMO_MEMBERSHIP_ID,
      rateProvenance: { kind: "human_entered", sourceRef: "fixture://audit", sourceHash: "b".repeat(64), rateVersion: "fixture-v1" } } });
  await withTenant(runtime, context, db => insertPricedVariation(db, DEMO_TENANT_ID, revision));
  const approval = approveVariation(revision, { id: randomUUID(), revisionId: revision.id, revision: 1, contentHash: revision.contentHash,
    signedDeltaPence: 25000, method: "builder_attestation", actorMembershipId: DEMO_MEMBERSHIP_ID, evidenceId: null, approvedAt: new Date() });
  await withTenant(runtime, context, db => approvePricedVariation(db, DEMO_TENANT_ID, proposal.id, approval));
  return { proposal, revision, approval, jobId };
}

describe("AUDIT-FIX-DBSRC-17 PostgreSQL regressions", () => {
  it("reject cannot revoke an approved variation", async () => {
    const { proposal, revision, jobId } = await approvedExtra(), accounts = new FinalAccountCommandService(runtime);
    const assemble = () => accounts.assemble(context, { version: "final-account.assemble.v1", commandId: randomUUID(), actorMembershipId: DEMO_MEMBERSHIP_ID, jobId });
    const before = await assemble(); expect(before.totals.net.pence).toBe(125000);
    const repo = new VariationRepository(runtime);
    await expect(repo.transact(context, db => repo.reject(db, DEMO_TENANT_ID, { id: randomUUID(), variationId: proposal.id, revisionId: revision.id, actorMembershipId: DEMO_MEMBERSHIP_ID }))).rejects.toThrow("EXACT_CURRENT_PRICED_REVISION_REQUIRED");
    await withTenant(runtime, context, async db => {
      expect((await db.$client.query("SELECT state FROM app.variation WHERE id=$1", [proposal.id])).rows).toEqual([{ state: "approved" }]);
      expect((await db.$client.query("SELECT id FROM app.variation_rejection WHERE variation_id=$1", [proposal.id])).rows).toEqual([]);
      expect((await db.$client.query("SELECT id FROM app.variation_approval WHERE variation_id=$1", [proposal.id])).rows).toHaveLength(1);
    });
    expect((await assemble()).totals.net).toEqual(before.totals.net);
  }, 30000);
  it("generated samples preserve sites across preparation", async () => {
    const owner = await new ContractorRepository(runtime).startPractice(randomUUID());
    const first = await prepareWorkOrderDemo(runtime, owner), starter = generateWorkOrderSample("starter_orders", first);
    const timestamps = (await admin.query("SELECT count(DISTINCT created_at)::int n FROM app.site_revision WHERE tenant_id=$1", [owner.tenantId])).rows[0];
    expect(timestamps.n).toBe(1);
    const orders = new WorkOrderRepository(runtime), commandId = randomUUID();
    const input = { commandId, name: "generated starter", kind: "generated" as const, csv: starter };
    expect((await orders.importCsv(owner, input)).counts).toMatchObject({ created: 5, rejected: 0 });
    const second = await prepareWorkOrderDemo(runtime, owner);
    expect(first.siteRevisionIds).toEqual(second.siteRevisionIds);
    expect(generateWorkOrderSample("starter_orders", second)).toBe(starter);
    expect((await orders.importCsv(owner, { ...input, csv: generateWorkOrderSample("starter_orders", second) })).replayed).toBe(true);
    const revised = await orders.importCsv(owner, { commandId: randomUUID(), name: "generated revised", kind: "generated", csv: generateWorkOrderSample("revised_orders", second) });
    expect(revised.counts).toMatchObject({ revised: 3, unchanged: 1, rejected: 0 });
  }, 30000);
  it("finance can import generated orders", async () => {
    const contractors = new ContractorRepository(runtime), owner = await contractors.startPractice(randomUUID());
    await prepareWorkOrderDemo(runtime, owner);
    const view = await contractors.query(owner, { version: "contractor-query.v1", tenantId: owner.tenantId, resource: "organisation" }), financeId = randomUUID();
    await contractors.command(owner, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: financeId, expectedRevision: view.revision,
      kind: "member.invite", role: "finance", email: "audit-finance@fictional.invalid", scope: { kind: "tenant", id: owner.tenantId }, clientId: null, contractId: null });
    const user = (await admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [owner.tenantId, financeId])).rows[0].identity_user_id;
    const sessionId = randomUUID();
    await admin.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id) VALUES($1,$2,$3,$4)", [sessionId, owner.tenantId, financeId, user]);
    const finance = await contractors.resolveSession(sessionId);
    await expect(contractors.query(finance, { version: "contractor-query.v1", tenantId: finance.tenantId, resource: "organisation" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const app = new WorkOrderApplication(runtime), request = { version: "work-order-import-request.v1", environment: "synthetic_demo", commandId: randomUUID(), source: { kind: "generated", sample: "starter_orders" } };
    expect((await app.importGenerated({ version: "contractor-principal.v1", sessionId }, request)).counts).toMatchObject({ created: 5, rejected: 0 });
    // Authorization is rechecked for reuse of prepared fixtures; a revoked finance session cannot import.
    await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [owner.tenantId, financeId]);
    await expect(app.importGenerated({ version: "contractor-principal.v1", sessionId }, { ...request, commandId: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }, 30000);
  it("approved new extra supports proof completion", async () => {
    const { proposal, approval, jobId } = await approvedExtra();
    const evidence = new EvidenceService(runtime, objects.storage), proof = new ProofCommandService(runtime, objects.storage);
    const upload = await evidence.beginUpload(context, { jobId, scopeItemId: proposal.scopeItemId, expectedSha256: createHash("sha256").update(objects.png).digest("hex"), contentType: "image/png", maximumBytes: 100, expiresAt: new Date("2099-01-01T00:00:00Z") });
    objects.storage.put(upload.objectKey, "v1", objects.png);
    await evidence.finalize(context, { uploadId: upload.id, objectVersionId: "v1", evidenceType: "electrical_certificate" });
    const command = { version: "proof.complete.v1", commandId: randomUUID(), actorMembershipId: DEMO_MEMBERSHIP_ID, jobId, scopeItemId: proposal.scopeItemId, stage: "extra-stage", evidenceId: upload.id, requiredEvidenceType: "electrical_certificate", decisionId: null };
    expect(await proof.complete(context, command)).toMatchObject({ state: "complete" });
    await withTenant(runtime, context, db => approvePricedVariation(db, DEMO_TENANT_ID, proposal.id, approval));
    await withTenant(runtime, context, async db => {
      expect((await db.$client.query("SELECT state FROM app.scope_identity WHERE id=$1", [proposal.scopeItemId])).rows).toEqual([{ state: "confirmed" }]);
      expect((await db.$client.query("SELECT stage,revision FROM app.scope_progress WHERE scope_item_id=$1", [proposal.scopeItemId])).rows).toEqual([{ stage: "complete", revision: 2 }]);
      expect((await db.$client.query("SELECT id FROM app.stage_completion WHERE scope_item_id=$1", [proposal.scopeItemId])).rows).toHaveLength(1);
    });
    expect(await proof.complete(context, command)).toMatchObject({ state: "complete" });
  }, 30000);
});
