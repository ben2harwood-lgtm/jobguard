import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import type { PrivateVersionedStorage, StoredObject } from "@jobguard/storage";
import {
  DiscrepancyRepository, EvidenceService, InboxRelevanceRepository, MaterialRepository, ProofCommandService, PurchaseOrderRepository, ReadinessRepository,
  SupplierDocumentRepository, SupplierMatchRepository, migrate, type VerifiedTenantContext,
} from "../src/index.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { closeTestPools } from "./pool-test-utils.js";
import { ObservedPool } from "./lock-observer.js";

// One table of the 17 watchdog_live_only commands, built from the real repositories over a real PostgreSQL 16 and the real runtime
// role. Several suites are driven by it (replay contract, lock order, legacy command ids), so a command added to or missing from
// the registry fails each of them, not just one.
export function createWatchdogHarness(label: string, portBase: number) {
const tenant = randomUUID(), member = randomUUID(), otherMember = randomUUID();
const ctx = { tenantId: tenant } as VerifiedTenantContext;
const RULE = "supplier-overcharge.v1", DAY = "2026-03-27T09:00:00.000Z", NEXT = "2026-03-30T08:00:00.000Z";
const CONFLICT = /IDEMPOTENCY_CONFLICT|COMMAND_CONFLICT/u;
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const norm = (value: unknown) => JSON.parse(JSON.stringify(value ?? null));
function validPng() {
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

let pg: EmbeddedPostgres, admin: Pool, runtime: Pool, observed: ObservedPool, dir: string;
const storage = new MemoryStorage();
let po: PurchaseOrderRepository, docs: SupplierDocumentRepository, match: SupplierMatchRepository, checks: DiscrepancyRepository, readiness: ReadinessRepository,
  inbox: InboxRelevanceRepository, evidence: EvidenceService, proof: ProofCommandService, materials: MaterialRepository;
let skuId = "";
const png = validPng(), pngHash = sha(png), memo = new Map<string, Record<string, any>>();
const st = (job: string) => { let found = memo.get(job); if (!found) { found = {}; memo.set(job, found); } return found; };
const live = async () => { const id = randomUUID(); await importWatchdogFixtureJob(admin, tenant, id); return id; };
const orderInput = (requirementId: string, expectedRevision: number, commandId?: string, quantity = "10") => ({ version: "purchase-order-draft.v1" as const, commandId, requirementId, quantity, unitPricePence: 2000, recipient: "orders@fictional-merchant.invalid", requiredDate: "2026-10-01", expectedRevision });

// Prerequisites, memoised per job. Each reaches the real state through the real repositories.
const pre = {
  async scope(job: string): Promise<string> {
    if (st(job).scope) return st(job).scope;
    const id = randomUUID();
    await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')", [id, tenant, job]);
    await admin.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id,stage)VALUES($1,$2,$3,'in_progress')", [tenant, job, id]);
    return st(job).scope = id;
  },
  async requirement(job: string): Promise<string> {
    if (st(job).requirement) return st(job).requirement;
    return st(job).requirement = (await materials.addRequirement(ctx, { jobId: job, scopeItemId: await pre.scope(job), skuId, quantity: "10", unit: "each", expectedRevision: 0 })).id;
  },
  async order(job: string) { if (!st(job).order) st(job).order = await po.revise(ctx, job, orderInput(await pre.requirement(job), 0)); return st(job).order; },
  async delivery(job: string) { await pre.order(job); if (!st(job).delivery) { await docs.intake(ctx, job, { version: "supplier-document-intake.v1", fixtureId: "materials-B-delivery", channel: "picker", expectedRevision: 0 }); st(job).delivery = true; } },
  async invoice(job: string) { await pre.delivery(job); if (!st(job).invoice) { await docs.intake(ctx, job, { version: "supplier-document-intake.v1", fixtureId: "materials-B-invoice", channel: "picker", expectedRevision: 1 }); st(job).invoice = (await docs.view(ctx, job)).facts[0].document_id; } return st(job).invoice as string; },
  async confirmed(job: string) { const documentId = await pre.invoice(job); if (!st(job).confirmed) { await confirm(job, documentId, randomUUID(), 0, 2500); st(job).confirmed = true; } return documentId; },
  async match(job: string) { await pre.confirmed(job); if (!st(job).match) { await match.create(ctx, job, { commandId: randomUUID(), expectedRevision: 0 }); st(job).match = (await match.view(ctx, job)).proposal; } return st(job).match; },
  async finding(job: string) { await pre.match(job); if (!st(job).finding) st(job).finding = (await checks.evaluate(ctx, job, { commandId: randomUUID(), ruleRevision: RULE })).finding.id; return st(job).finding as string; },
  async facts(job: string) {
    const documentId = await pre.confirmed(job);
    if (!st(job).facts) { await confirm(job, documentId, randomUUID(), 1, 2000); await confirm(job, documentId, randomUUID(), 2, 1800); st(job).facts = (await admin.query("SELECT id FROM app.supplier_fact_revision WHERE job_id=$1 ORDER BY revision", [job])).rows.map(r => r.id); }
    return st(job).facts as string[];
  },
  async plan(job: string) { if (!st(job).plan) st(job).plan = await readiness.record(ctx, job, { commandId: randomUUID(), scenarioNow: DAY }); return st(job).plan; },
  async inbox(job: string) { if (!st(job).inbox) { const seeded = await inbox.seed(ctx, job, randomUUID(), member); st(job).inbox = seeded.advisory.map((d: any) => d.id); } return st(job).inbox as string[]; },
  async upload(job: string) {
    if (!st(job).upload) {
      const scopeItemId = await pre.scope(job), upload = await evidence.beginUpload(ctx, { jobId: job, scopeItemId, expectedSha256: pngHash, contentType: "image/png", maximumBytes: 100, expiresAt: new Date("2099-01-01T00:00:00Z") });
      storage.put(upload.objectKey, "v1", png); st(job).upload = upload;
    }
    return st(job).upload as { id: string; objectKey: string };
  },
  async evidence(job: string) { const upload = await pre.upload(job); if (!st(job).evidence) st(job).evidence = await evidence.finalize(ctx, { uploadId: upload.id, objectVersionId: "v1", evidenceType: "electrical_certificate" }); return upload.id; },
};
const confirm = (job: string, documentId: string, commandId: string, expectedRevision: number, unitPricePence: number) => docs.confirm(ctx, job, { version: "supplier-fact-correction.v1", documentId, commandId, documentType: "invoice", quantity: "10", unitPricePence, netPence: 10 * unitPricePence, expectedRevision } as any);
const correction = (proposal: any, commandId: string, expectedRevision: number, quantity: string) => ({ version: "supplier-match-correction.v1" as const, commandId, proposalId: proposal.id, expectedRevision, orderVersionId: proposal.orderVersionId, receiptVersionIds: proposal.receiptVersionIds, billVersionId: proposal.billVersionId, allocations: [{ receiptVersionId: proposal.receiptVersionIds[0], quantity }] });
const placeCommand = (job: string, commandId: string, variant: string) => {
  const order = st(job).order;
  return { version: "command.v1" as const, commandId, authorizationId: `a${commandId.slice(1)}`, commandType: "purchase_order.simulate", semanticKey: `purchase-order:${order.draftId}`, actorMembershipId: member, subjectType: "purchase_order_revision", subjectRef: order.id,
    action: { actionType: "purchase_order.simulate", recipient: variant === "changed" ? "changed@fictional.invalid" : "orders@fictional-merchant.invalid", contentHash: order.authorityHash, aggregateRevision: order.revision, amountPence: order.orderNetPence, currency: "GBP", policyVersion: "synthetic-po.v1", expiresAt: new Date("2099-01-01T00:00:00.000Z") } };
};

interface Case {
  key: string; registry: string[];
  prepare(job: string): Promise<void>;
  run(job: string, id: string, variant: string): Promise<unknown>;
  later(job: string): Promise<void>;
  noop?: (job: string, id: string, variant: string) => Promise<unknown>;
  /** Further payload changes that must conflict (request-owned fields beyond the main one). */
  moreChanges?: string[];
  /** Exact retries whose server-generated fields differ; they must replay the first result unchanged. */
  retries?: string[];
}
const cases: Case[] = [
  { key: "purchase-order-repository.ts#revise", registry: ["/api/jobs/[id]/purchase-orders/revisions", "nest:/jobs/:id/purchase-orders/revisions"],
    prepare: async job => { await pre.requirement(job); },
    run: async (job, id, variant) => po.revise(ctx, job, orderInput(st(job).requirement, 0, id, variant === "changed" ? "11" : "10")),
    later: async job => { await po.revise(ctx, job, orderInput(st(job).requirement, 1, randomUUID(), "12")); } },
  { key: "purchase-order-repository.ts#place", registry: ["/api/jobs/[id]/purchase-orders/placement", "nest:/jobs/:id/purchase-orders/placement", "command:purchase_order.simulate"],
    prepare: async job => { await pre.order(job); },
    run: async (job, id, variant) => po.place(ctx, job, placeCommand(job, id, variant) as any),
    later: async job => { await po.revise(ctx, job, orderInput(st(job).requirement, 1, randomUUID(), "12")); },
    noop: async (job, id, variant) => po.place(ctx, job, placeCommand(job, id, variant) as any) },
  { key: "supplier-document-repository.ts#intake", registry: ["/api/jobs/[id]/supplier-documents/intake", "nest:/jobs/:id/supplier-documents/intake"],
    prepare: async job => { await pre.order(job); },
    run: async (job, id, variant) => docs.intake(ctx, job, { version: "supplier-document-intake.v1", commandId: id, fixtureId: variant === "changed" ? "materials-B-invoice" : "materials-B-delivery", channel: "picker", expectedRevision: 0 } as any),
    later: async job => { await docs.intake(ctx, job, { version: "supplier-document-intake.v1", commandId: randomUUID(), fixtureId: "materials-B-invoice", channel: "picker", expectedRevision: (await docs.view(ctx, job)).intakeRevision } as any); },
    noop: async (job, id, variant) => docs.intake(ctx, job, { version: "supplier-document-intake.v1", commandId: id, fixtureId: variant === "changed" ? "materials-B-invoice" : "materials-B-delivery", channel: "picker", expectedRevision: 1 } as any) },
  { key: "supplier-document-repository.ts#appendReceipt", registry: ["/api/jobs/[id]/supplier-documents/receipts", "nest:/jobs/:id/supplier-documents/receipts"],
    prepare: async job => { await pre.delivery(job); },
    run: async (job, id, variant) => docs.appendReceipt(ctx, job, { commandId: id, accepted: variant === "changed" ? "6" : "7", rejected: "1", expectedRevision: 1 } as any),
    later: async job => { await docs.appendReceipt(ctx, job, { commandId: randomUUID(), accepted: "5", rejected: "1", expectedRevision: 2 } as any); } },
  { key: "supplier-document-repository.ts#confirm", registry: ["/api/jobs/[id]/supplier-documents/facts/confirm", "nest:/jobs/:id/supplier-documents/facts/confirm"],
    prepare: async job => { await pre.invoice(job); },
    run: async (job, id, variant) => confirm(job, st(job).invoice, id, 0, variant === "changed" ? 2000 : 2500),
    later: async job => { await confirm(job, st(job).invoice, randomUUID(), 1, 1900); } },
  { key: "supplier-match-repository.ts#create", registry: ["/api/jobs/[id]/supplier-matches", "nest:/jobs/:id/supplier-matches"],
    prepare: async job => { await pre.confirmed(job); },
    run: async (job, id, variant) => match.create(ctx, job, { commandId: id, expectedRevision: variant === "changed" ? 99 : 0 }),
    later: async job => { const proposal = (await match.view(ctx, job)).proposal; await match.correct(ctx, job, correction(proposal, randomUUID(), 1, "6")); },
    noop: async (job, id, variant) => match.create(ctx, job, { commandId: id, expectedRevision: variant === "changed" ? 99 : 1 }) },
  { key: "supplier-match-repository.ts#correct", registry: ["/api/jobs/[id]/supplier-matches/corrections", "nest:/jobs/:id/supplier-matches/corrections"],
    prepare: async job => { await pre.match(job); },
    run: async (job, id, variant) => match.correct(ctx, job, correction(st(job).match, id, 1, variant === "changed" ? "7" : "8")),
    later: async job => { await match.correct(ctx, job, correction(st(job).match, randomUUID(), 2, "6")); } },
  { key: "discrepancy-repository.ts#evaluate", registry: ["/api/jobs/[id]/things-to-check/[action]", "nest:/jobs/:id/things-to-check/evaluate"],
    prepare: async job => { await pre.match(job); },
    run: async (job, id, variant) => checks.evaluate(ctx, job, { commandId: id, ruleRevision: variant === "changed" ? "supplier-overcharge.v2" : RULE }),
    later: async job => { const finding = (await checks.evaluate(ctx, job, { commandId: randomUUID(), ruleRevision: RULE })).finding.id; await checks.review(ctx, job, { commandId: randomUUID(), findingId: finding, expectedRevision: 0, outcome: "disputed", reason: "Later fictional dispute" }); },
    noop: async (job, id, variant) => checks.evaluate(ctx, job, { commandId: id, ruleRevision: variant === "changed" ? "supplier-overcharge.v2" : RULE }) },
  { key: "discrepancy-repository.ts#review", registry: ["/api/jobs/[id]/things-to-check/[action]", "nest:/jobs/:id/things-to-check/review"],
    prepare: async job => { await pre.finding(job); },
    run: async (job, id, variant) => checks.review(ctx, job, { commandId: id, findingId: st(job).finding, expectedRevision: 0, outcome: "disputed", reason: variant === "changed" ? "Other fictional reason" : "First fictional reason" }),
    later: async job => { await checks.review(ctx, job, { commandId: randomUUID(), findingId: st(job).finding, expectedRevision: 1, outcome: "dismissed", reason: "Second fictional reason" }); } },
  { key: "discrepancy-repository.ts#supersede", registry: ["/api/jobs/[id]/things-to-check/[action]", "nest:/jobs/:id/things-to-check/supersede-bill"],
    prepare: async job => { await pre.facts(job); },
    run: async (job, id, variant) => checks.supersede(ctx, job, { commandId: id, originalFactRevisionId: st(job).facts[0], replacementFactRevisionId: st(job).facts[variant === "changed" ? 2 : 1], expectedRevision: 0 }),
    later: async job => { await checks.supersede(ctx, job, { commandId: randomUUID(), originalFactRevisionId: st(job).facts[0], replacementFactRevisionId: st(job).facts[2], expectedRevision: 1 }); } },
  { key: "readiness-repository.ts#record", registry: ["/api/jobs/[id]/readiness/[action]", "nest:/jobs/:id/readiness/plan"],
    prepare: async () => {},
    run: async (job, id, variant) => readiness.record(ctx, job, { commandId: id, scenarioNow: DAY, ...(variant === "changed" ? { resolved: true } : {}) }),
    later: async job => { await readiness.record(ctx, job, { commandId: randomUUID(), scenarioNow: DAY, resolved: true }); } },
  { key: "readiness-repository.ts#advance", registry: ["/api/jobs/[id]/readiness/[action]", "nest:/jobs/:id/readiness/advance"],
    prepare: async job => { await pre.plan(job); },
    run: async (job, id, variant) => readiness.advance(ctx, job, { commandId: id, scenarioNow: variant === "changed" ? "2026-03-31T08:00:00.000Z" : NEXT }),
    later: async job => { await readiness.record(ctx, job, { commandId: randomUUID(), scenarioNow: DAY, resolved: true }); },
    noop: async (job, id, variant) => readiness.advance(ctx, job, { commandId: id, scenarioNow: variant === "changed" ? "2026-03-31T08:00:00.000Z" : NEXT }) },
  { key: "inbox-relevance-repository.ts#seed", registry: ["/api/jobs/[id]/relevance-inbox/[action]", "/api/jobs/[id]/relevance-inbox/[action]#seed", "nest:/jobs/:id/relevance-inbox/seed", "command:inbox.seed"],
    prepare: async () => {},
    run: async (job, id, variant) => inbox.seed(ctx, job, id, variant === "changed" ? otherMember : member),
    later: async job => { const ids = await pre.inbox(job); await inbox.dismiss(ctx, job, ids[0], { commandId: randomUUID() }, member); },
    noop: async (job, id, variant) => inbox.seed(ctx, job, id, variant === "changed" ? otherMember : member) },
  { key: "inbox-relevance-repository.ts#dismiss", registry: ["/api/jobs/[id]/relevance-inbox/decisions/[decisionId]", "nest:/jobs/:id/relevance-inbox/:decisionId/dismiss"],
    prepare: async job => { await pre.inbox(job); },
    run: async (job, id, variant) => inbox.dismiss(ctx, job, st(job).inbox[variant === "changed" ? 1 : 0], { commandId: id }, member),
    later: async job => { await inbox.dismiss(ctx, job, st(job).inbox[1], { commandId: randomUUID() }, member); } },
  { key: "evidence.ts#beginUpload", registry: ["/api/jobs/[id]/proof", "/api/jobs/[id]/proof#select_generated", "nest:/jobs/:id/proof"],
    prepare: async job => { await pre.scope(job); },
    // expiresAt is generated by the server on every call, so an exact retry carries a different one; the capture time is the client's.
    run: async (job, id, variant) => evidence.beginUpload(ctx, { id, jobId: job, scopeItemId: st(job).scope, expectedSha256: pngHash, contentType: "image/png", maximumBytes: variant === "changed" ? 101 : 100, retentionClass: "standard_evidence",
      deviceCapturedAt: variant === "changed:capture" ? new Date("2026-01-02T00:00:00Z") : new Date("2026-01-01T00:00:00Z"), expiresAt: new Date(variant === "retry" ? "2099-06-01T00:00:00Z" : "2099-01-01T00:00:00Z") }),
    moreChanges: ["changed:capture"], retries: ["retry"],
    later: async job => { await evidence.beginUpload(ctx, { id: randomUUID(), jobId: job, scopeItemId: st(job).scope, expectedSha256: pngHash, contentType: "image/png", maximumBytes: 100, retentionClass: "standard_evidence", expiresAt: new Date("2099-01-01T00:00:00Z") }); } },
  { key: "evidence.ts#finalize", registry: ["/api/jobs/[id]/proof", "/api/jobs/[id]/proof#finalize", "nest:/jobs/:id/proof"],
    prepare: async job => { await pre.upload(job); },
    run: async (job, id, variant) => evidence.finalize(ctx, { commandId: id, uploadId: st(job).upload.id, objectVersionId: "v1", evidenceType: variant === "changed" ? "site_photo" : "electrical_certificate" }),
    later: async job => { storage.put(st(job).upload.objectKey, "v2", new Uint8Array([9, 9, 9])); },
    noop: async (job, id, variant) => evidence.finalize(ctx, { commandId: id, uploadId: st(job).upload.id, objectVersionId: "v1", evidenceType: variant === "changed" ? "site_photo" : "electrical_certificate" }) },
  { key: "proof-repository.ts#complete", registry: ["/api/jobs/[id]/proof", "/api/jobs/[id]/proof#complete", "nest:/jobs/:id/proof", "command:proof.complete"],
    prepare: async job => { await pre.evidence(job); },
    run: async (job, id, variant) => proof.complete(ctx, { version: "proof.complete.v1", commandId: id, actorMembershipId: member, jobId: job, scopeItemId: st(job).scope, stage: variant === "changed" ? "other-stage" : "electrical-stage", evidenceId: st(job).upload.id, requiredEvidenceType: "electrical_certificate", decisionId: null }),
    later: async job => { await proof.invalidate(ctx, { version: "proof.invalidate.v1", commandId: randomUUID(), actorMembershipId: member, evidenceId: st(job).upload.id, reasonCode: "verification_invalid" }); } },
];
const caseKeys = cases.map(c => c.key);

async function boot() {
  dir = await mkdtemp(join(tmpdir(), `jg-${label}-`));
  const port = portBase + Math.floor(Math.random() * 400);
  pg = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: () => undefined });
  await pg.initialise(); await pg.start();
  admin = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password: "synthetic", max: 4 });
  await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1)", [tenant]);
  const user = randomUUID(), account = randomUUID();
  await admin.query("INSERT INTO identity.identity_user(id)VALUES($1)", [user]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'Fictional builder')", [account, tenant]);
  for (const id of [member, otherMember]) await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$3,$4,'owner')", [id, tenant, account, user]);
  await admin.query("CREATE ROLE replay_contract_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO replay_contract_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "replay_contract_login", password: "synthetic", max: 8 });
  observed = new ObservedPool(runtime, admin); const pool = observed.pool;
  po = new PurchaseOrderRepository(pool); docs = new SupplierDocumentRepository(pool); match = new SupplierMatchRepository(pool); checks = new DiscrepancyRepository(pool);
  readiness = new ReadinessRepository(pool); inbox = new InboxRelevanceRepository(pool); evidence = new EvidenceService(pool, storage); proof = new ProofCommandService(pool, storage); materials = new MaterialRepository(pool);
  skuId = (await materials.addRate(ctx, { merchantName: "Fictional supplier", sku: "MAT-B", description: "Synthetic item", pricePence: 2000, priceUnit: "each", taxBasis: "net", effectiveFrom: "2026-09-20", sourceLabel: "materials-B", expectedVersion: 0 })).skuId;
}
async function stop() { await closeTestPools(runtime, admin); await pg?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); }

// A probe job per case, prepared once, to try one command's id in another kind of command.
const probes = new Map<string, string>();
const probeJob = async (c: Case) => { let job = probes.get(c.key); if (!job) { job = await live(); await c.prepare(job); probes.set(c.key, job); } return job; };


  return {
    label, tenant, member, otherMember, ctx, RULE, DAY, NEXT, CONFLICT, cases, caseKeys, live, probeJob, norm, pre, st, confirm, correction, orderInput, placeCommand, png, pngHash, storage,
    get admin() { return admin; }, get runtime() { return runtime; }, get observed() { return observed; },
    get repos() { return { po, docs, match, checks, readiness, inbox, evidence, proof, materials }; },
    get skuId() { return skuId; }, boot, stop,
  };
}
