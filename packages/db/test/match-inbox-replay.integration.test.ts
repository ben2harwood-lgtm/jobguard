import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InboxRelevanceRepository, MaterialRepository, migrate, withTenant, PurchaseOrderRepository, SupplierDocumentRepository, SupplierMatchRepository, type VerifiedTenantContext } from "../src/index.js";
import { appendAuditBatch } from "../src/audit.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { closeTestPools } from "./pool-test-utils.js";

// Supplier-match create and correction, and inbox dismissal: a replay returns what the command first returned, a
// successful no-op keeps its command identity, and the id is bound to its job and payload.
const tenant = randomUUID(), job = randomUUID(), otherJob = randomUUID(), scope = randomUUID(), member = randomUUID();
const ctx = { tenantId: tenant } as VerifiedTenantContext;
let pg: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string, match: SupplierMatchRepository, inbox: InboxRelevanceRepository;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const count = async (table: string, jobId: string) => Number((await admin.query(`SELECT count(*) n FROM app.${table} WHERE job_id=$1`, [jobId])).rows[0].n);
const stored = async (commandId: string) => Number((await admin.query("SELECT count(*) n FROM app.watchdog_command_result WHERE command_id=$1", [commandId])).rows[0].n);
// A real audit event for a fixture row written "by the earlier code", so its place in the audit chain is genuine.
const legacyAudit = async (jobId: string, eventType = "fixture.legacy_command") => (await withTenant(runtime, ctx, db => appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: "member:synthetic-builder", eventType, subjectType: "job", subjectRef: jobId, payload: { references: { jobId }, hashes: { payloadHash: "a".repeat(64) }, classifications: { action: "operational" } } }])))[0]!.id;
// Direct fixture inserts pass the same BEFORE INSERT live guard as the runtime role, so they carry the tenant context.
async function asTenant(sql: string, params: unknown[]) {
  const client = await admin.connect();
  try { await client.query("SELECT set_config('app.tenant_id',$1,false)", [tenant]); return await client.query(sql, params); }
  finally { await client.query("RESET app.tenant_id"); client.release(); }
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jg-match-inbox-replay-"));
  const port = 60400 + Math.floor(Math.random() * 99);
  pg = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: () => undefined });
  await pg.initialise(); await pg.start();
  admin = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password: "synthetic" });
  await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1)", [tenant]);
  const user = randomUUID(), account = randomUUID();
  await admin.query("INSERT INTO identity.identity_user(id)VALUES($1)", [user]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'Fictional builder')", [account, tenant]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$3,$4,'owner')", [member, tenant, account, user]);
  await importWatchdogFixtureJob(admin, tenant, job); await importWatchdogFixtureJob(admin, tenant, otherJob);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')", [scope, tenant, job]);
  await admin.query("CREATE ROLE match_inbox_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO match_inbox_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "match_inbox_login", password: "synthetic" });
  const materials = new MaterialRepository(runtime);
  const rate = await materials.addRate(ctx, { merchantName: "Fictional supplier", sku: "MAT-B", description: "Synthetic item", pricePence: 2000, priceUnit: "each", taxBasis: "net", effectiveFrom: "2026-09-20", sourceLabel: "materials-B", expectedVersion: 0 });
  const requirement = await materials.addRequirement(ctx, { jobId: job, scopeItemId: scope, skuId: rate.skuId, quantity: "10", unit: "each", expectedRevision: 0 });
  await new PurchaseOrderRepository(runtime).revise(ctx, job, { version: "purchase-order-draft.v1", requirementId: requirement.id, quantity: "10", unitPricePence: 2000, recipient: "orders@fictional-merchant.invalid", requiredDate: "2026-10-01", expectedRevision: 0 });
  const docs = new SupplierDocumentRepository(runtime);
  await docs.intake(ctx, job, { version: "supplier-document-intake.v1", fixtureId: "materials-B-delivery", channel: "picker", expectedRevision: 0 });
  await docs.intake(ctx, job, { version: "supplier-document-intake.v1", fixtureId: "materials-B-invoice", channel: "picker", expectedRevision: 1 });
  await docs.confirm(ctx, job, { version: "supplier-fact-correction.v1", documentId: (await docs.view(ctx, job)).facts[0].document_id, commandId: randomUUID(), documentType: "invoice", quantity: "10", unitPricePence: 2500, netPence: 25000, expectedRevision: 0 });
  match = new SupplierMatchRepository(runtime); inbox = new InboxRelevanceRepository(runtime);
}, 90000);
afterAll(async () => { await closeTestPools(runtime, admin); await pg?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); });

describe("supplier match: a replay returns the command's first result", () => {
  let proposal: any;
  const correction = (commandId: string, expectedRevision: number, quantity: string) => ({
    version: "supplier-match-correction.v1" as const, commandId, proposalId: proposal.id, expectedRevision, orderVersionId: proposal.orderVersionId,
    receiptVersionIds: proposal.receiptVersionIds, billVersionId: proposal.billVersionId, allocations: [{ receiptVersionId: proposal.receiptVersionIds[0], quantity }],
  });
  it("create: a successful no-op keeps its command identity (changed payload, another job, parallel duplicates, later change)", async () => {
    const first = { commandId: randomUUID(), expectedRevision: 0 }, noop = { commandId: randomUUID(), expectedRevision: 1 };
    const created = await match.create(ctx, job, first), repeated = await match.create(ctx, job, noop);
    proposal = created.proposal;
    expect(created).toMatchObject({ revision: 1, proposal: { state: "matched" } }); expect(repeated).toEqual(created);
    expect(await stored(first.commandId)).toBe(1); expect(await stored(noop.commandId)).toBe(1);
    const changed = await match.correct(ctx, job, correction(randomUUID(), 1, "8"));
    expect(changed.revision).toBe(2);
    expect(await match.create(ctx, job, noop)).toEqual(repeated);
    expect(await match.create(ctx, job, first)).toEqual(created);
    await expect(match.create(ctx, job, { ...noop, expectedRevision: 99 })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(match.create(ctx, otherJob, noop)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await count("supplier_match_proposal", otherJob)).toBe(0);
    const parallel = { commandId: randomUUID(), expectedRevision: 2 }, results = await Promise.all([1, 2, 3, 4].map(() => match.create(ctx, job, parallel)));
    for (const result of results) expect(result).toEqual(results[0]);
    expect(await stored(parallel.commandId)).toBe(1);
  });
  it("correct: replays the view it first returned after later corrections; changed payload and another job conflict", async () => {
    const start = (await match.view(ctx, job)).revision;
    const one = correction(randomUUID(), start, "8"), two = correction(randomUUID(), start + 1, "6");
    const first = await match.correct(ctx, job, one), second = await match.correct(ctx, job, two);
    expect([first.revision, second.revision]).toEqual([start + 1, start + 2]); expect(first.history).toHaveLength(start + 1);
    const rows = await count("supplier_match_revision", job);
    expect(await match.correct(ctx, job, one)).toEqual(first);
    expect(await match.correct(ctx, job, two)).toEqual(second);
    await expect(match.correct(ctx, job, { ...one, allocations: [{ receiptVersionId: proposal.receiptVersionIds[0], quantity: "7" }] })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(match.correct(ctx, otherJob, one)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await count("supplier_match_revision", job)).toBe(rows); expect(await count("supplier_match_revision", otherJob)).toBe(0);
    expect(await stored(one.commandId)).toBe(1);
  });
  it("still replays a revision written before command results existed, as it first returned, on its own job only", async () => {
    const start = (await match.view(ctx, job)).revision, input = correction(randomUUID(), start, "5");
    // Fixture: the revision row exactly as the earlier code wrote it (request hash over the input, citing a "corrected" audit
    // event, the only kind a correction revision may cite), with no command-result row.
    await asTenant("INSERT INTO app.supplier_match_revision(id,tenant_id,job_id,proposal_id,command_id,revision,order_revision_id,receipt_version_ids,bill_revision_id,actor_ref,subject_ref,payload_hash,audit_event_id)SELECT $1,tenant_id,job_id,proposal_id,$2,$3,order_revision_id,receipt_version_ids,bill_revision_id,actor_ref,subject_ref,$4,$7 FROM app.supplier_match_revision WHERE tenant_id=$5 AND proposal_id=$6 ORDER BY revision DESC LIMIT 1", [randomUUID(), input.commandId, start + 1, hash(input), tenant, proposal.id, await legacyAudit(job, "supplier_match.corrected")]);
    const later = await match.correct(ctx, job, correction(randomUUID(), start + 1, "4"));
    expect(later.revision).toBe(start + 2);
    const replayed = await match.correct(ctx, job, input);
    expect(replayed.revision).toBe(start + 1); expect(replayed.history).toHaveLength(start + 1);
    expect(replayed.history.map((row: any) => row.revision)).toEqual(Array.from({ length: start + 1 }, (_, i) => i + 1));
    await expect(match.correct(ctx, job, { ...input, allocations: [{ receiptVersionId: proposal.receiptVersionIds[0], quantity: "4" }] })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(match.correct(ctx, otherJob, input)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await stored(input.commandId)).toBe(0);
  });
});

describe("inbox dismissal: a replay returns the command's first result", () => {
  let decisions: any[] = [];
  it("dismiss: replays the count it first returned after later dismissals; changed payload and another job conflict", async () => {
    const seeded = await inbox.seed(ctx, job, randomUUID(), member);
    decisions = [...seeded.mandatory, ...seeded.advisory];
    expect(seeded.advisory).toHaveLength(2);
    const [a, b] = seeded.advisory, one = { commandId: randomUUID() }, two = { commandId: randomUUID() };
    const first = await inbox.dismiss(ctx, job, a.id, one, member), second = await inbox.dismiss(ctx, job, b.id, two, member);
    expect([first.advisory.length, second.advisory.length]).toEqual([1, 0]);
    const rows = await count("inbox_outcome_event", job);
    expect(await inbox.dismiss(ctx, job, a.id, one, member)).toEqual(first);
    expect(await inbox.dismiss(ctx, job, b.id, two, member)).toEqual(second);
    await expect(inbox.dismiss(ctx, job, b.id, one, member)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(inbox.dismiss(ctx, otherJob, a.id, one, member)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await count("inbox_outcome_event", job)).toBe(rows); expect(await count("inbox_outcome_event", otherJob)).toBe(0);
    expect(await stored(one.commandId)).toBe(1);
  });
  it("still replays an outcome written before command results existed, as it first returned, on its own job only", async () => {
    const mandatory = decisions.filter(d => d.lane === "mandatory"), decision = mandatory[0], other = mandatory[1], input = { commandId: randomUUID() };
    // Fixture: the outcome row exactly as the earlier code wrote it (request hash over job, decision and input), with no command-result row.
    await asTenant("INSERT INTO app.inbox_outcome_event(id,tenant_id,job_id,decision_id,decision_revision,command_id,event_kind,rule_id,rule_revision,finding_revision,scenario_clock_version,scenario_at,actor_ref,subject_ref,payload_hash,audit_event_id,created_at)SELECT $1,tenant_id,job_id,id,1,$2,'dismissed',rule_id,rule_revision,finding_revision,'scenario-clock.v1','2026-04-08T10:05:00.000Z','member:synthetic-builder',job_id,$3,$6,'2026-04-08T10:05:00.000Z' FROM app.inbox_decision_revision WHERE tenant_id=$4 AND id=$5", [randomUUID(), input.commandId, hash({ jobId: job, decisionId: decision.id, ...input }), tenant, decision.id, await legacyAudit(job)]);
    await inbox.dismiss(ctx, job, other.id, { commandId: randomUUID() }, member);
    const replayed = await inbox.dismiss(ctx, job, decision.id, input, member);
    // As first returned: this decision is gone, the other one (dismissed afterwards) was still open.
    expect(replayed.mandatory.map((d: any) => d.id)).toEqual([other.id]);
    await expect(inbox.dismiss(ctx, job, other.id, input, member)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(inbox.dismiss(ctx, otherJob, decision.id, input, member)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await stored(input.commandId)).toBe(0);
  });
});
