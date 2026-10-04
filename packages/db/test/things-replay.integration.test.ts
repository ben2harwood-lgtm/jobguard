import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DiscrepancyRepository, MaterialRepository, migrate, PurchaseOrderRepository, SupplierDocumentRepository, SupplierMatchRepository, type VerifiedTenantContext } from "../src/index.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { closeTestPools } from "./pool-test-utils.js";

// Things to check: a replay of evaluate, review or bill supersession returns what that command first returned,
// not the job's current findings, outcomes or bill reduction, and the command id is bound to its job and payload.
const tenant = randomUUID(), job = randomUUID(), otherJob = randomUUID(), scope = randomUUID();
const ctx = { tenantId: tenant } as VerifiedTenantContext;
const RULE = "supplier-overcharge.v1";
let pg: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string, repo: DiscrepancyRepository;
let originalFactId = "", replacementFactId = "", secondReplacementFactId = "";
// Direct fixture inserts pass the same BEFORE INSERT live guard as the runtime role, so they carry the tenant context.
async function asTenant(sql: string, params: unknown[]) {
  const client = await admin.connect();
  try { await client.query("SELECT set_config('app.tenant_id',$1,false)", [tenant]); return await client.query(sql, params); }
  finally { await client.query("RESET app.tenant_id"); client.release(); }
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const count = async (table: string, jobId: string) => Number((await admin.query(`SELECT count(*) n FROM app.${table} WHERE job_id=$1`, [jobId])).rows[0].n);
const stored = async (commandId: string) => Number((await admin.query("SELECT count(*) n FROM app.watchdog_command_result WHERE command_id=$1", [commandId])).rows[0].n);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jg-things-replay-"));
  const port = 60900 + Math.floor(Math.random() * 90);
  pg = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: () => undefined });
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
  const match = new SupplierMatchRepository(runtime);
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
  it("still replays rows written before command results existed, on their own job only", async () => {
    const finding = (await repo.evaluate(ctx, job, { commandId: randomUUID(), ruleRevision: RULE })).finding!;
    const audit = (await admin.query("SELECT audit_event_id FROM app.discrepancy_finding_revision WHERE id=$1", [finding.id])).rows[0].audit_event_id;
    const n = Number((await admin.query("SELECT count(*) n FROM app.discrepancy_review_outcome WHERE finding_id=$1", [finding.id])).rows[0].n);
    const input = { commandId: randomUUID(), findingId: finding.id, expectedRevision: n, outcome: "dismissed" as const, reason: "Earlier fictional reason" };
    // Fixture: the outcome row exactly as the earlier code wrote it (request hash over the input), with no command-result row.
    await asTenant("INSERT INTO app.discrepancy_review_outcome(id,tenant_id,job_id,finding_id,command_id,revision,outcome,reason,actor_ref,subject_ref,payload_hash,audit_event_id)VALUES($1,$2,$3,$4,$5,$6,'dismissed',$7,'member:synthetic-builder',$4,$8,$9)", [randomUUID(), tenant, job, finding.id, input.commandId, n + 1, input.reason, hash(input), audit]);
    const replayed = await repo.review(ctx, job, input);
    expect(replayed.finding?.outcome).toMatchObject({ revision: n + 1, outcome: "dismissed" });
    await expect(repo.review(ctx, job, { ...input, reason: "Changed" })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(repo.review(ctx, otherJob, input)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await stored(input.commandId)).toBe(0);
  });
});
