import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evaluateBillDiscrepancy } from "@jobguard/core";
import { DiscrepancyRepository, MaterialRepository, migrate, withTenant, PurchaseOrderRepository, SupplierDocumentRepository, SupplierMatchRepository, type VerifiedTenantContext } from "../src/index.js";
import { appendAuditBatch } from "../src/audit.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { closeTestPools } from "./pool-test-utils.js";

// Things to check: a replay of evaluate, review or bill supersession returns what that command first returned,
// not the job's current findings, outcomes or bill reduction, and the command id is bound to its job and payload.
const tenant = randomUUID(), job = randomUUID(), otherJob = randomUUID(), scope = randomUUID();
const ctx = { tenantId: tenant } as VerifiedTenantContext;
const RULE = "supplier-overcharge.v1";
let pg: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string, repo: DiscrepancyRepository, matches: SupplierMatchRepository;
let originalFactId = "", replacementFactId = "", secondReplacementFactId = "";
// Direct fixture inserts pass the same BEFORE INSERT live guard as the runtime role, so they carry the tenant context.
async function asTenant(sql: string, params: unknown[]) {
  const client = await admin.connect();
  try { await client.query("SELECT set_config('app.tenant_id',$1,false)", [tenant]); return await client.query(sql, params); }
  finally { await client.query("RESET app.tenant_id"); client.release(); }
}
// A real audit event for a fixture row written "by the earlier code", so its place in the audit chain is genuine.
const legacyAudit = async () => (await withTenant(runtime, ctx, db => appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: "member:synthetic-builder", eventType: "fixture.legacy_command", subjectType: "job", subjectRef: job, payload: { references: { jobId: job }, hashes: { payloadHash: "a".repeat(64) }, classifications: { action: "operational" } } }])))[0]!.id;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const count = async (table: string, jobId: string) => Number((await admin.query(`SELECT count(*) n FROM app.${table} WHERE job_id=$1`, [jobId])).rows[0].n);
const stored = async (commandId: string) => Number((await admin.query("SELECT count(*) n FROM app.watchdog_command_result WHERE command_id=$1", [commandId])).rows[0].n);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jg-things-replay-"));
  const port = 60900 + Math.floor(Math.random() * 90);
  pg = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await pg.initialise(); await pg.start();
  admin = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password: "synthetic" });
  await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1)", [tenant]);
  await importWatchdogFixtureJob(admin, tenant, job); await importWatchdogFixtureJob(admin, tenant, otherJob);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')", [scope, tenant, job]);
  await admin.query("CREATE ROLE things_replay_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO things_replay_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "things_replay_login", password: "synthetic" });
  const materials = new MaterialRepository(runtime);
  const rate = await materials.addRate(ctx, { merchantName: "Fictional supplier", sku: "MAT-B", description: "Synthetic item", pricePence: 2000, priceUnit: "each", taxBasis: "net", effectiveFrom: "2026-09-20", sourceLabel: "materials-B", expectedVersion: 0 });
  const requirement = await materials.addRequirement(ctx, { jobId: job, scopeItemId: scope, skuId: rate.skuId, quantity: "10", unit: "each", expectedRevision: 0 });
  await new PurchaseOrderRepository(runtime).revise(ctx, job, { version: "purchase-order-draft.v1", requirementId: requirement.id, quantity: "10", unitPricePence: 2000, recipient: "orders@fictional-merchant.invalid", requiredDate: "2026-10-01", expectedRevision: 0 });
  const docs = new SupplierDocumentRepository(runtime);
  await docs.intake(ctx, job, { version: "supplier-document-intake.v1", fixtureId: "materials-B-delivery", channel: "picker", expectedRevision: 0 });
  await docs.intake(ctx, job, { version: "supplier-document-intake.v1", fixtureId: "materials-B-invoice", channel: "picker", expectedRevision: 1 });
  const documentId = (await docs.view(ctx, job)).facts[0].document_id;
  const confirm = (expectedRevision: number, unitPricePence: number) => docs.confirm(ctx, job, { version: "supplier-fact-correction.v1", documentId, commandId: randomUUID(), documentType: "invoice", quantity: "10", unitPricePence, netPence: 10 * unitPricePence, expectedRevision });
  await confirm(0, 2500);
  const match = matches = new SupplierMatchRepository(runtime);
  await match.create(ctx, job, { commandId: randomUUID(), expectedRevision: 0 });
  await confirm(1, 2000); await confirm(2, 1800);
  [originalFactId, replacementFactId, secondReplacementFactId] = (await admin.query("SELECT id FROM app.supplier_fact_revision WHERE document_id=$1 ORDER BY revision", [documentId])).rows.map(row => row.id);
  repo = new DiscrepancyRepository(runtime);
}, 90000);
afterAll(async () => { await closeTestPools(runtime, admin); await pg?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); });

describe("things to check: a replay returns the command's first result", () => {
  it("evaluate: replays its own finding even after reviews, a no-op evaluate keeps its identity, and the id is bound to job and payload", async () => {
    const first = { commandId: randomUUID(), ruleRevision: RULE }, noop = { commandId: randomUUID(), ruleRevision: RULE };
    const created = await repo.evaluate(ctx, job, first), repeated = await repo.evaluate(ctx, job, noop);
    expect(created.finding).toMatchObject({ revision: 1, state: "actionable", outcome: null }); expect(repeated).toEqual(created);
    await repo.review(ctx, job, { commandId: randomUUID(), findingId: created.finding!.id, expectedRevision: 0, outcome: "disputed", reason: "Fictional dispute" });
    const findings = await count("discrepancy_finding_revision", job);
    expect(await repo.evaluate(ctx, job, first)).toEqual(created);
    expect(await repo.evaluate(ctx, job, noop)).toEqual(repeated);
    await expect(repo.evaluate(ctx, job, { ...noop, ruleRevision: "supplier-overcharge.v2" })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(repo.evaluate(ctx, otherJob, noop)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await count("discrepancy_finding_revision", job)).toBe(findings); expect(await count("discrepancy_finding_revision", otherJob)).toBe(0);
    expect(await stored(first.commandId)).toBe(1); expect(await stored(noop.commandId)).toBe(1);
  });
  it("review: replays the outcome it first returned after later outcomes; changed payload and another job conflict", async () => {
    const finding = (await repo.evaluate(ctx, job, { commandId: randomUUID(), ruleRevision: RULE })).finding!;
    const existing = Number((await admin.query("SELECT count(*) n FROM app.discrepancy_review_outcome WHERE finding_id=$1", [finding.id])).rows[0].n);
    const one = { commandId: randomUUID(), findingId: finding.id, expectedRevision: existing, outcome: "disputed" as const, reason: "First fictional reason" };
    const two = { commandId: randomUUID(), findingId: finding.id, expectedRevision: existing + 1, outcome: "dismissed" as const, reason: "Second fictional reason" };
    const first = await repo.review(ctx, job, one), second = await repo.review(ctx, job, two);
    expect(first.finding?.outcome).toMatchObject({ revision: existing + 1, outcome: "disputed" }); expect(second.finding?.outcome).toMatchObject({ revision: existing + 2, outcome: "dismissed" });
    const rows = await count("discrepancy_review_outcome", job);
    expect(await repo.review(ctx, job, one)).toEqual(first);
    expect(await repo.review(ctx, job, two)).toEqual(second);
    await expect(repo.review(ctx, job, { ...one, reason: "Changed fictional reason" })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(repo.review(ctx, otherJob, one)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await count("discrepancy_review_outcome", job)).toBe(rows); expect(await count("discrepancy_review_outcome", otherJob)).toBe(0);
  });
  it("supersede: replays the reduction it first returned after a later supersession; changed payload and another job conflict", async () => {
    const one = { commandId: randomUUID(), originalFactRevisionId: originalFactId, replacementFactRevisionId: replacementFactId, expectedRevision: 0 };
    const two = { commandId: randomUUID(), originalFactRevisionId: originalFactId, replacementFactRevisionId: secondReplacementFactId, expectedRevision: 1 };
    const first = await repo.supersede(ctx, job, one), second = await repo.supersede(ctx, job, two);
    expect([first.confirmedBillReductionPence, second.confirmedBillReductionPence]).toEqual([5000, 7000]);
    const rows = await count("supplier_bill_supersession", job);
    expect(await repo.supersede(ctx, job, one)).toEqual(first);
    expect(await repo.supersede(ctx, job, two)).toEqual(second);
    await expect(repo.supersede(ctx, job, { ...one, replacementFactRevisionId: secondReplacementFactId })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(repo.supersede(ctx, otherJob, one)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await count("supplier_bill_supersession", job)).toBe(rows);
  });
  it("still replays rows written before command results existed, as they first returned, on their own job only", async () => {
    const finding = (await repo.evaluate(ctx, job, { commandId: randomUUID(), ruleRevision: RULE })).finding!;
    const n = Number((await admin.query("SELECT count(*) n FROM app.discrepancy_review_outcome WHERE finding_id=$1", [finding.id])).rows[0].n);
    const input = { commandId: randomUUID(), findingId: finding.id, expectedRevision: n, outcome: "dismissed" as const, reason: "Earlier fictional reason" };
    // Fixture: the outcome row exactly as the earlier code wrote it (request hash over the input), with no command-result row.
    await asTenant("INSERT INTO app.discrepancy_review_outcome(id,tenant_id,job_id,finding_id,command_id,revision,outcome,reason,actor_ref,subject_ref,payload_hash,audit_event_id)VALUES($1,$2,$3,$4,$5,$6,'dismissed',$7,'member:synthetic-builder',$4,$8,$9)", [randomUUID(), tenant, job, finding.id, input.commandId, n + 1, input.reason, hash(input), await legacyAudit()]);
    await repo.review(ctx, job, { commandId: randomUUID(), findingId: finding.id, expectedRevision: n + 1, outcome: "disputed", reason: "Later fictional reason" });
    const replayed = await repo.review(ctx, job, input);
    expect(replayed.finding?.outcome).toMatchObject({ revision: n + 1, outcome: "dismissed" });
    await expect(repo.review(ctx, job, { ...input, reason: "Changed" })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(repo.review(ctx, otherJob, input)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await stored(input.commandId)).toBe(0);
  });
  it("still replays an evaluation written before command results existed after its sources have moved on", async () => {
    const ruleRevision = "supplier-overcharge.legacy", input = { commandId: randomUUID(), ruleRevision };
    const latest = (await admin.query("SELECT * FROM app.discrepancy_finding_revision WHERE job_id=$1 ORDER BY revision DESC LIMIT 1", [job])).rows[0];
    // The evaluation as the earlier code made it: 10 ordered at 2000, 8 accepted, 10 billed at 2500, request hash over input plus result.
    const original = evaluateBillDiscrepancy({ version: "discrepancy-input.v1", ruleRevision, sourceDocumentId: latest.source_document_id, sourceVersionId: latest.source_version_id, matchRevisionId: latest.match_revision_id, confirmed: true, matched: true, orderedQuantity: 10, acceptedQuantity: 8, billedQuantity: 10, orderedUnitPricePence: 2000, billedUnitPricePence: 2500 });
    await asTenant("INSERT INTO app.discrepancy_finding_revision(id,tenant_id,job_id,command_id,revision,rule_revision,source_document_id,source_version_id,match_revision_id,state,price_pence,quantity_pence,total_pence,supersedes_id,actor_ref,subject_ref,payload_hash,audit_event_id) SELECT $1,tenant_id,job_id,$2,revision+1,$3,source_document_id,source_version_id,match_revision_id,$4,$5,$6,$7,id,'system:discrepancy-rule',job_id,$8,$9 FROM app.discrepancy_finding_revision WHERE tenant_id=$10 AND id=$11",
      [randomUUID(), input.commandId, ruleRevision, original.kind, original.pricePence, original.quantityPence, original.totalPence, hash({ ...input, ...original }), await legacyAudit(), tenant, latest.id]);
    // The sources move on: a newer match revision allocates less, so evaluating today gives a different result.
    const proposal = (await matches.view(ctx, job)).proposal;
    await matches.correct(ctx, job, { version: "supplier-match-correction.v1", commandId: randomUUID(), proposalId: proposal.id, expectedRevision: (await matches.view(ctx, job)).revision, orderVersionId: proposal.orderVersionId, receiptVersionIds: proposal.receiptVersionIds, billVersionId: proposal.billVersionId, allocations: [{ receiptVersionId: proposal.receiptVersionIds[0], quantity: "6" }] });
    const replayed = await repo.evaluate(ctx, job, input);
    expect(replayed.finding).toMatchObject({ revision: latest.revision + 1, ruleRevision, totalPence: original.totalPence });
    await expect(repo.evaluate(ctx, job, { ...input, ruleRevision: "supplier-overcharge.other" })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(repo.evaluate(ctx, otherJob, input)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await stored(input.commandId)).toBe(0);
  });
});

// Holds every transaction that sends a statement matching `pattern` at that statement until `gate` opens; `reached` fires when one arrives.
function pausedBefore(pool: Pool, pattern: RegExp, gate: Promise<void>, reached: () => void): Pool {
  return new Proxy(pool, { get(target, property) {
    if (property === "connect") return async () => { const client = await target.connect(); return new Proxy(client, { get(inner, name) {
      if (name === "query") return async (...args: unknown[]) => { const text = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string })?.text ?? ""; if (pattern.test(text)) { reached(); await gate; } return (inner.query as (...a: unknown[]) => unknown)(...args); };
      const value = Reflect.get(inner, name, inner); return typeof value === "function" ? value.bind(inner) : value; } }); };
    const value = Reflect.get(target, property, target); return typeof value === "function" ? value.bind(target) : value; } }) as Pool;
}
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
const forgetBookkeeping = async (commandId: string) => { await admin.query("DELETE FROM app.watchdog_command_result WHERE command_id=$1", [commandId]); await admin.query("DELETE FROM app.watchdog_command_identity WHERE command_id=$1", [commandId]); };

describe("a legacy evaluation replays as the response it first returned, whatever transactions overlapped it", () => {
  it("leaves out a confirmation whose transaction began before the evaluation but committed after it", async () => {
    const documentId = (await admin.query("SELECT document_id FROM app.supplier_fact_revision WHERE id=$1", [originalFactId])).rows[0].document_id as string;
    const revisions = Number((await admin.query("SELECT count(*) n FROM app.supplier_fact_revision WHERE document_id=$1", [documentId])).rows[0].n);
    const gate = deferred(), arrived = deferred();
    const confirming = new SupplierDocumentRepository(pausedBefore(runtime, /INSERT INTO app\.supplier_fact_revision/u, gate.promise, arrived.resolve));
    // The confirmation's transaction begins (its created_at is its start time) and stops just before it writes its fact.
    const lateCommand = randomUUID();
    const late = confirming.confirm(ctx, job, { version: "supplier-fact-correction.v1", documentId, commandId: lateCommand, documentType: "invoice", quantity: "10", unitPricePence: 1700, netPence: 17000, expectedRevision: revisions });
    await arrived.promise;
    await new Promise(resolve => setTimeout(resolve, 30));
    // The evaluation begins later and commits first, so its response cannot contain the late fact.
    const input = { commandId: randomUUID(), ruleRevision: "supplier-overcharge.overlap" };
    const first = await repo.evaluate(ctx, job, input);
    gate.resolve(); await late;
    const lateFact = (await admin.query("SELECT id,created_at FROM app.supplier_fact_revision WHERE command_id=$1", [lateCommand])).rows[0];
    const evaluated = (await admin.query("SELECT created_at FROM app.discrepancy_finding_revision WHERE command_id=$1", [input.commandId])).rows[0];
    expect(lateFact.created_at.getTime(), "the confirmation began first, so its created_at is earlier than the evaluation's").toBeLessThan(evaluated.created_at.getTime());
    expect(first.factCandidates.map((fact: { id: string }) => fact.id)).not.toContain(lateFact.id);
    // As written by the earlier code: no stored result and no identity row.
    await forgetBookkeeping(input.commandId);
    const replayed = await repo.evaluate(ctx, job, input);
    expect(replayed.factCandidates.map((fact: { id: string }) => fact.id), "the replay must not include a fact the original response could not see").not.toContain(lateFact.id);
    expect(replayed).toEqual(first);
    // The confirmation that overlapped it is, of course, visible to everything that starts after it.
    expect((await repo.view(ctx, job)).factCandidates.map((fact: { id: string }) => fact.id)).toContain(lateFact.id);
  });
});
