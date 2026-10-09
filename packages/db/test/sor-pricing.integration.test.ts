import { randomUUID } from "node:crypto";
import { writeSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { priceSorLine, referenceApprovalRulesV1, workOrderAuditPayloadV1, workOrderBatchAuditPayloadV1 } from "@jobguard/core";
import {
  ContractorPartyRepository, ContractorRepository, MIGRATION_URLS, SorRepository, WorkOrderRepository, appendAuditBatch, demoFile, demoRow, migrate, prepareWorkOrderDemo, verifiedTenantContextFromMembership, withTenant,
  type AuditEventInput, type AuthenticatedMembership, type WorkOrderDemo,
} from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string, contractors: ContractorRepository, parties: ContractorPartyRepository, orders: WorkOrderRepository, rates: SorRepository;
const ctx = (p: AuthenticatedMembership) => verifiedTenantContextFromMembership(p);
const view = (p: AuthenticatedMembership) => contractors.query(p, { version: "contractor-query.v1", tenantId: p.tenantId, resource: "organisation" });
const command = async (p: AuthenticatedMembership, fields: Record<string, unknown>) => contractors.command(p, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: (await view(p)).revision, ...fields });
async function org() { const p = await contractors.startPractice(randomUUID()); const demo = await prepareWorkOrderDemo(runtime, p); return { p, demo }; }
const importOf = (p: AuthenticatedMembership, csv: string, name = "pricing.csv") => orders.importCsv(p, { commandId: randomUUID(), name, kind: "csv", csv });
const sorBody = (scheduleId: string, effectiveFrom: string, items: Array<[string, string, number]>, reference = `Fictional rates ${effectiveFrom}`) => ({ version: "sor-version-import.v1", environment: "synthetic_demo", commandId: randomUUID(), scheduleId, reference, effectiveFrom, items: items.map(([code, unit, pence]) => ({ code, description: `Item ${code}`, unit, rate: { pence, currency: "GBP" } })) });
const contractDocument = (sorVersionIds: string[], numerator: string, denominator: string, reference = "FICTIONAL-PRICING") => ({ version: "client-contract.v1", reference, startsOn: "2026-01-01", endsOn: null, sorVersionIds, tenderedAdjustment: { numerator, denominator }, photoRule: "required", vatCode: "synthetic-unreviewed", exportedNotBilledAlertDays: 30 });
async function contract(p: AuthenticatedMembership, demo: WorkOrderDemo, sorVersionIds: string[], numerator: string, denominator: string, contractId = randomUUID()) {
  await command(p, { kind: "contract.revise", clientId: demo.clientId, contractId, document: contractDocument(sorVersionIds, numerator, denominator), rules: referenceApprovalRulesV1 });
  return contractId;
}
const line = (sorCode: string, quantity: string, ref: string | null = "L1") => ({ clientLineReference: ref, sorCode, quantity });
const orderRow = (demo: WorkOrderDemo, contractId: string, reference: string, lines: unknown[], overrides: Record<string, unknown> = {}) => demoRow(demo, 1, { contractId, workOrderReference: reference, lines, ...overrides });
const lineNets = async (workOrderId: string, revision = 1) => (await admin.query("SELECT l.sor_code,l.quantity,l.rate_pence::int rate,l.net_pence::int net,l.sor_version_id FROM app.work_order_line l JOIN app.work_order_revision r ON r.id=l.revision_id WHERE r.work_order_id=$1 AND r.revision=$2 ORDER BY l.position", [workOrderId, revision])).rows;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jg-ent2-sor-")); const port = await freePort(59200, 300);
  postgres = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" }); await control.query("CREATE DATABASE jobguard_synthetic_demo"); await control.end();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  const own = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("/0110_work_orders.sql")); expect(own).toBeGreaterThan(0);
  for (const url of MIGRATION_URLS.slice(0, own)) { await admin.query(await readFile(url, "utf8")); await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]); }
  await migrate(admin);
  await admin.query("CREATE ROLE ent2_sor_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO ent2_sor_login");
  runtime = new Pool({ host: "127.0.0.1", port, user: "ent2_sor_login", password: "synthetic", database: "jobguard_synthetic_demo", max: 6 });
  contractors = new ContractorRepository(runtime); parties = new ContractorPartyRepository(runtime); orders = new WorkOrderRepository(runtime); rates = new SorRepository(runtime);
}, 180000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); });

describe("ENT-2 DW5 exact pricing", () => {
  it("prices £100.00 at -35/1000, quantity 1, as £96.50 through the whole import", async () => {
    const { p, demo } = await org();
    const result = await importOf(p, demoFile([orderRow(demo, demo.contractId, "PRICE-0001", [line("REPAIR-DOOR", "1")])]));
    expect(result.rows[0]).toMatchObject({ outcome: "created" });
    expect(await lineNets(result.rows[0]!.workOrderId!)).toEqual([expect.objectContaining({ sor_code: "REPAIR-DOOR", rate: 10000, net: 9650 })]);
  });
  it("the database price equals the core price for zero, positive and negative adjustments, fractional quantities and every half-even tie", async () => {
    const adjustments: Array<[string, string]> = [["0", "1"], ["-35", "1000"], ["35", "1000"], ["1", "2"], ["-1", "3"], ["-1000", "1000"], ["999999", "7"]];
    const rateList = [0, 1, 2, 3, 5, 7, 99, 100, 1234, 10000, 999999];
    const quantities = ["0", "0.000001", "0.5", "1", "1.5", "2.5", "0.125", "3.333333", "12", "100000.999999"];
    let compared = 0, overflow = 0;
    for (const [numerator, denominator] of adjustments) for (const rate of rateList) for (const quantity of quantities) {
      const expected = (() => { try { return priceSorLine({ version: "sor-line-pricing.v1", quantity, rate: { pence: rate, currency: "GBP" }, adjustment: { numerator, denominator } }).pence; } catch (error) { return (error as Error).message; } })();
      const actual = await admin.query("SELECT app.sor_line_net_pence($1,$2,$3,$4) net", [quantity, rate, numerator, denominator]).then(r => Number(r.rows[0].net), (error: Error) => error.message);
      if (actual !== expected) throw new Error(`price mismatch for ${quantity} x ${rate}p at ${numerator}/${denominator}: sql ${actual}, core ${expected}`);
      compared++; if (typeof expected === "string") overflow++;
    }
    expect(compared).toBe(adjustments.length * rateList.length * quantities.length); expect(overflow).toBeGreaterThan(0); expect(overflow).toBeLessThan(compared);
    // Explicit ties: 0.5p -> 0, 1.5p -> 2, 2.5p -> 2, 3.5p -> 4 (half-even), with no adjustment.
    for (const [rate, quantity, net] of [[1, "0.5", 0], [3, "0.5", 2], [5, "0.5", 2], [7, "0.5", 4]] as const) expect(Number((await admin.query("SELECT app.sor_line_net_pence($1,$2,0,1) net", [quantity, rate])).rows[0].net)).toBe(net);
    await expect(admin.query("SELECT app.sor_line_net_pence('1',100,-1001,1000)")).rejects.toMatchObject({ message: "NEGATIVE_MULTIPLIER" });
    await expect(admin.query("SELECT app.sor_line_net_pence('999999999999',1000000,0,1)")).rejects.toMatchObject({ message: "MONEY_OUT_OF_RANGE" });
    await expect(admin.query("SELECT app.sor_line_net_pence('1.1234567',100,0,1)")).rejects.toMatchObject({ message: "INVALID_QUANTITY" });
  }, 120000);
  it("imports tie, zero, positive, fractional, overflow and negative-multiplier orders against their own contracts, with typed errors for the last two", async () => {
    const { p, demo } = await org(); const schedule = randomUUID();
    const v = await rates.importVersion(p, sorBody(schedule, "2026-02-01", [["TIE-1", "each", 1], ["TIE-3", "each", 3], ["TIE-5", "each", 5], ["ONE", "each", 10000], ["BIG", "each", 1000000]]));
    const zero = await contract(p, demo, [v.versionId], "0", "1"), plus = await contract(p, demo, [v.versionId], "35", "1000"), negative = await contract(p, demo, [v.versionId], "-1001", "1000");
    const result = await importOf(p, demoFile([
      orderRow(demo, zero, "TIE-A", [line("TIE-1", "0.5", "A"), line("TIE-3", "0.5", "B"), line("TIE-5", "0.5", "C"), line("ONE", "0.125", "D")]),
      orderRow(demo, plus, "PLUS-A", [line("ONE", "1", "A"), line("ONE", "2.5", "B")]),
      orderRow(demo, zero, "ZERO-A", [line("ONE", "1", "A"), line("ONE", "0", "B")]),
      orderRow(demo, zero, "OVER-A", [line("BIG", "999999999999", "A")]),
      orderRow(demo, negative, "NEG-A", [line("ONE", "1", "A")]),
    ]));
    expect(result.rows.map(r => r.errorCode)).toEqual([null, null, null, "MONEY_OUT_OF_RANGE", "NEGATIVE_MULTIPLIER"]);
    expect((await lineNets(result.rows[0]!.workOrderId!)).map(l => l.net)).toEqual([0, 2, 2, 1250]);
    expect((await lineNets(result.rows[1]!.workOrderId!)).map(l => l.net)).toEqual([10350, 25875]);
    expect((await lineNets(result.rows[2]!.workOrderId!)).map(l => l.net)).toEqual([10000, 0]);
    expect((await admin.query("SELECT count(*)::int n FROM app.work_order WHERE tenant_id=$1 AND reference IN('OVER-A','NEG-A')", [p.tenantId])).rows[0].n).toBe(0);
  });
  it("uses the SoR version in force on the issue date, listed by the order's contract; an unlisted newer version is never used", async () => {
    const { p, demo } = await org();
    const v1 = demo.sorVersionId, v2 = (await rates.importVersion(p, sorBody(demo.scheduleId, "2026-10-01", [["REPAIR-DOOR", "each", 20000]]))).versionId, v3 = (await rates.importVersion(p, sorBody(demo.scheduleId, "2026-10-05", [["REPAIR-DOOR", "each", 30000]]))).versionId;
    const c = await contract(p, demo, [v1, v2], "0", "1");
    const at = (issuedOn: string, reference: string) => orderRow(demo, c, reference, [line("REPAIR-DOOR", "1")], { issuedOn, dueOn: null });
    const result = await importOf(p, demoFile([at("2026-09-30", "ISSUE-1"), at("2026-10-01", "ISSUE-2"), at("2026-10-06", "ISSUE-3"), at("2025-12-31", "ISSUE-4")]));
    expect(result.rows.map(r => r.errorCode)).toEqual([null, null, null, "SOR_VERSION_NOT_FOUND"]);
    expect((await lineNets(result.rows[0]!.workOrderId!))[0]).toMatchObject({ net: 10000, sor_version_id: v1 });
    expect((await lineNets(result.rows[1]!.workOrderId!))[0]).toMatchObject({ net: 20000, sor_version_id: v2 });
    expect((await lineNets(result.rows[2]!.workOrderId!))[0]).toMatchObject({ net: 20000, sor_version_id: v2 });
    expect(v3).toBeTruthy();
    // Two listed versions that took effect on the same day are ambiguous, never guessed.
    const other = (await rates.importVersion(p, sorBody(randomUUID(), "2026-10-01", [["REPAIR-DOOR", "each", 25000]]))).versionId;
    const ambiguous = await contract(p, demo, [v1, v2, other], "0", "1");
    expect((await importOf(p, demoFile([orderRow(demo, ambiguous, "AMBIG-1", [line("REPAIR-DOOR", "1")], { issuedOn: "2026-10-02" })]))).rows[0]).toMatchObject({ outcome: "rejected", errorCode: "AMBIGUOUS_SOR_VERSION" });
    // A contract that lists no version cannot price a line.
    const none = await contract(p, demo, [], "0", "1");
    expect((await importOf(p, demoFile([orderRow(demo, none, "NONE-1", [line("REPAIR-DOOR", "1")])]))).rows[0]).toMatchObject({ outcome: "rejected", errorCode: "SOR_VERSION_NOT_FOUND" });
  });
  it("never reprices a stored revision when a later SoR version is imported or a later contract version lists it; new orders do use it", async () => {
    const { p, demo } = await org();
    const c = demo.contractId;
    const first = await importOf(p, demoFile([orderRow(demo, c, "KEEP-1", [line("REPAIR-DOOR", "2"), line("PAINT-ROOM", "1", "L2")], { issuedOn: "2026-10-10" })]));
    const orderId = first.rows[0]!.workOrderId!; const before = await lineNets(orderId);
    expect(before.map(l => l.net)).toEqual([19300, 24125]);
    const snapshot = (await admin.query("SELECT l.id,l.net_pence,l.rate_pence,l.sor_version_id FROM app.work_order_line l WHERE l.work_order_id=$1 ORDER BY l.id", [orderId])).rows;
    const v2 = (await rates.importVersion(p, sorBody(demo.scheduleId, "2026-10-02", [["REPAIR-DOOR", "each", 99999], ["PAINT-ROOM", "room", 88888]]))).versionId;
    await command(p, { kind: "contract.revise", clientId: demo.clientId, contractId: c, document: contractDocument([demo.sorVersionId, v2], "-35", "1000"), rules: referenceApprovalRulesV1 });
    expect((await admin.query("SELECT l.id,l.net_pence,l.rate_pence,l.sor_version_id FROM app.work_order_line l WHERE l.work_order_id=$1 ORDER BY l.id", [orderId])).rows).toEqual(snapshot);
    // The same row again is a recorded no-op; a revision of the order stays on its pinned contract version, so it is priced as before.
    expect((await importOf(p, demoFile([orderRow(demo, c, "KEEP-1", [line("REPAIR-DOOR", "2"), line("PAINT-ROOM", "1", "L2")], { issuedOn: "2026-10-10" }), orderRow(demo, c, "KEEP-0", [line("PAINT-ROOM", "1")], { issuedOn: "2026-10-10" })]), "again.csv")).rows[0]).toMatchObject({ outcome: "unchanged" });
    const revised = await importOf(p, demoFile([orderRow(demo, c, "KEEP-1", [line("REPAIR-DOOR", "2"), line("PAINT-ROOM", "1", "L2")], { issuedOn: "2026-10-10", priority: "emergency", expectedRevision: 1 })]), "revise.csv");
    expect(revised.rows[0]).toMatchObject({ outcome: "revised" });
    expect((await lineNets(orderId, 2)).map(l => [l.net, l.sor_version_id])).toEqual(before.map(l => [l.net, l.sor_version_id]));
    // A new order under the revised contract version uses the later version.
    const fresh = await importOf(p, demoFile([orderRow(demo, c, "KEEP-2", [line("REPAIR-DOOR", "1")], { issuedOn: "2026-10-10" })]), "fresh.csv");
    expect((await lineNets(fresh.rows[0]!.workOrderId!))[0]).toMatchObject({ net: 96499, sor_version_id: v2 });
  });
  it("is enforced in the database: a forged net, rate, version, adjustment or origin is refused even if the application is bypassed", async () => {
    const { p, demo } = await org(); const created = await importOf(p, demoFile([orderRow(demo, demo.contractId, "DB-1", [line("REPAIR-DOOR", "1")])]));
    const [existing] = (await admin.query("SELECT * FROM app.work_order_line WHERE work_order_id=$1 AND position=0", [created.rows[0]!.workOrderId])).rows;
    const insert = (net: number, rate = existing.rate_pence) => withTenant(admin, testTenantContext(p.tenantId), async db => {
      const scope = randomUUID();
      await db.$client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope, p.tenantId, existing.job_id]);
      return db.$client.query("INSERT INTO app.work_order_line(tenant_id,id,work_order_id,revision_id,job_id,position,scope_item_id,sor_version_id,sor_code,unit,rate_pence,quantity,net_pence,origin) VALUES($1,$2,$3,$4,$5,7,$6,$7,$8,$9,$10,'1',$11,'client_instruction')",
        [p.tenantId, randomUUID(), existing.work_order_id, existing.revision_id, existing.job_id, scope, existing.sor_version_id, existing.sor_code, existing.unit, rate, net]);
    });
    await expect(insert(9651)).rejects.toMatchObject({ code: "23514", message: "line net is not the exact half-even price" });
    await expect(insert(1, 1)).rejects.toMatchObject({ code: "23503" });
    // The commit routine re-derives the version in force and the contract's adjustment from the database.
    const raw = (mutate: (payload: Record<string, any>) => void, audit: "none" | "batch" | "full" = "full") => withTenant(runtime, ctx(p), async db => {
      const jobId = randomUUID(), workOrderId = randomUUID(), bindCommandId = randomUUID();
      await db.$client.query("SELECT app.work_order_begin($1,$2,'Fictional raw')", [p.membershipId, jobId]);
      const bound = await parties.bindInTransaction(db, p, { version: "contractor-party-import.v1", environment: "synthetic_demo", commandId: bindCommandId, jobId, workOrderId, expectedJobRevision: 0, clientId: demo.clientId, contractId: demo.contractId, siteRevisionId: demo.siteRevisionIds[0], resident: { kind: "none", reason: "void_property" } });
      // CH-3b's own audit requirement is always satisfied here, so what passes or fails below is ENT-2's.
      await parties.audit(db, p, "bound", jobId, bindCommandId, bound.id);
      const payload: Record<string, any> = { version: "work-order-commit.v1", kind: "create", batchId: randomUUID(), rowNumber: 2, jobId, workOrderId, revisionId: randomUUID(), reference: `RAW-${randomUUID()}`, expectedRevision: 0, status: "ordered", issuedOn: "2026-10-08", dueOn: null, priority: "routine",
        contentHash: "a".repeat(64), diff: {}, sorVersionId: demo.sorVersionId, adjustment: demo.adjustment, team: { teamId: null, membershipIds: [] },
        lines: [{ id: randomUUID(), scopeItemId: randomUUID(), position: 0, clientLineReference: "L1", sorVersionId: demo.sorVersionId, sorCode: "REPAIR-DOOR", unit: "each", quantity: "1", ratePence: 10000, netPence: 9650, origin: "client_instruction" }] };
      mutate(payload);
      await db.$client.query("SELECT app.work_order_commit($1,$2::jsonb)", [p.membershipId, JSON.stringify(payload)]);
      const sourceSha256 = "d".repeat(64), commandId = randomUUID();
      await db.$client.query("SELECT app.import_batch_record($1,$2::jsonb)", [p.membershipId, JSON.stringify({ version: "import-batch-record.v1", batchId: payload.batchId, commandId, sourceSha256, sourceName: "raw", sourceKind: "csv", rows: [{ rowNumber: 2, outcome: "created", errorCode: null, reference: "RAW-1", workOrderId, revisionId: payload.revisionId }] })]);
      const events: AuditEventInput[] = [];
      if (audit !== "none") events.push({ id: payload.batchId, version: "audit.v1", actorRef: `membership:${p.membershipId}`, eventType: "contractor.work_order_import.recorded", subjectType: "work-order-import", subjectRef: payload.batchId, payload: workOrderBatchAuditPayloadV1.parse({ references: { commandId, batchId: payload.batchId, environment: "synthetic_demo" }, hashes: { document: sourceSha256 }, classifications: { action: "operational" } }) });
      if (audit === "full") events.push({ id: payload.revisionId, version: "audit.v1", actorRef: `membership:${p.membershipId}`, eventType: "contractor.work_order.created", subjectType: "work-order", subjectRef: workOrderId, payload: workOrderAuditPayloadV1.parse({ references: { commandId, workOrderId, revisionId: payload.revisionId, environment: "synthetic_demo" }, hashes: { document: payload.contentHash }, classifications: { action: "operational" } }) });
      if (events.length) await appendAuditBatch(db, events);
    });
    // The control: with its batch and both audit events, the raw routine path commits. Remove or alter only an audit event and the commit fails.
    await expect(raw(() => undefined, "full")).resolves.toBeUndefined();
    await expect(raw(() => undefined, "none")).rejects.toMatchObject({ message: "WORK_ORDER_AUDIT_REQUIRED" });
    await expect(raw(() => undefined, "batch")).rejects.toMatchObject({ message: "WORK_ORDER_AUDIT_REQUIRED" });
    await expect(raw(payload => { payload.lines[0].netPence = 9651; })).rejects.toMatchObject({ code: "23514" });
    await expect(raw(payload => { payload.adjustment = { numerator: "0", denominator: "1" }; })).rejects.toMatchObject({ message: "INVALID_ADJUSTMENT" });
    await expect(raw(payload => { payload.sorVersionId = randomUUID(); payload.lines[0].sorVersionId = payload.sorVersionId; })).rejects.toMatchObject({ message: "SOR_VERSION_NOT_FOUND" });
    await expect(raw(payload => { payload.lines[0].origin = "office_entry"; })).rejects.toMatchObject({ code: "23514" });
    await expect(raw(payload => { payload.status = "ordered"; payload.lines = []; })).rejects.toMatchObject({ message: "SOR_VERSION_NOT_FOUND" });
  });
});

describe("ENT-2 SoR version import", () => {
  it("stores immutable versions and items, replays the same command, conflicts on a changed payload, and refuses a second version for the same effective date", async () => {
    const { p, demo } = await org(); const schedule = randomUUID();
    const body = sorBody(schedule, "2026-03-01", [["A-1", "each", 100], ["B-2", "metre", 250]]);
    const first = await rates.importVersion(p, body);
    expect(first).toMatchObject({ itemCount: 2, effectiveFrom: "2026-03-01", replayed: false, realExternalActions: 0 });
    expect(await rates.importVersion(p, body)).toMatchObject({ versionId: first.versionId, replayed: true });
    await expect(rates.importVersion(p, { ...body, reference: "A changed reference" })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    await expect(rates.importVersion(p, { ...sorBody(schedule, "2026-03-01", [["A-1", "each", 101]]), commandId: randomUUID() })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    expect((await rates.list(p)).versions.filter(v => v.scheduleId === schedule).map(v => [v.effectiveFrom, v.itemCount])).toEqual([["2026-03-01", 2]]);
    for (const sql of ["UPDATE app.sor_item SET rate_pence=1", "DELETE FROM app.sor_item", "UPDATE app.sor_version SET effective_from='2020-01-01'", "DELETE FROM app.sor_version", "UPDATE app.schedule_of_rates SET reference='x'"]) {
      await expect(withTenant(runtime, ctx(p), db => db.$client.query(sql)), sql).rejects.toMatchObject({ code: "42501" });
      await expect(withTenant(admin, testTenantContext(p.tenantId), db => db.$client.query(sql)), `owner ${sql}`).rejects.toMatchObject({ code: "55000" });
    }
    expect(demo.sorVersionId).toBeTruthy();
  });
  it("validates strictly: forged fields, duplicate codes, negative or oversized rates, empty and oversized lists, production environment", async () => {
    const { p } = await org(); const base = sorBody(randomUUID(), "2026-04-01", [["A-1", "each", 100]]);
    for (const bad of [{ ...base, tenantId: randomUUID() }, { ...base, environment: "production" }, { ...base, items: [] }, { ...base, items: [base.items[0], base.items[0]] }, { ...base, items: [{ ...base.items[0], rate: { pence: -1, currency: "GBP" } }] },
      { ...base, items: [{ ...base.items[0], rate: { pence: 1000000000001, currency: "GBP" } }] }, { ...base, items: Array.from({ length: 10001 }, (_, i) => ({ ...base.items[0], code: `X-${i}` })) }, { ...base, effectiveFrom: "2026-02-30" }]) {
      await expect(rates.importVersion(p, bad)).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    }
    expect((await admin.query("SELECT count(*)::int n FROM app.sor_version WHERE tenant_id=$1 AND effective_from='2026-04-01'", [p.tenantId])).rows[0].n).toBe(0);
  });
  it("imports the largest permitted price list (10,000 items) and cannot commit a version without its audit event", async () => {
    const { p } = await org(); const items = Array.from({ length: 10000 }, (_, i): [string, string, number] => [`BULK-${i}`, "each", i + 1]);
    const started = performance.now(); const result = await rates.importVersion(p, sorBody(randomUUID(), "2026-05-01", items));
    writeSync(2, `\nENT-2 SoR import of ${items.length} items took ${Math.round(performance.now() - started)} ms\n`);
    expect(result.itemCount).toBe(10000);
    await expect(withTenant(runtime, ctx(p), db => db.$client.query("SELECT app.import_sor_version($1,$2::jsonb)", [p.membershipId, JSON.stringify({ version: "sor-version-record.v1", environment: "synthetic_demo", commandId: randomUUID(), versionId: randomUUID(), scheduleId: randomUUID(), scheduleReference: "Unaudited", reference: "Unaudited", effectiveFrom: "2026-06-01", contentHash: "b".repeat(64), requestHash: "c".repeat(64), items: [{ code: "U", description: "u", unit: "each", ratePence: 1, standardMinutes: null }] })]))).rejects.toMatchObject({ message: "WORK_ORDER_AUDIT_REQUIRED" });
  }, 120000);
});
