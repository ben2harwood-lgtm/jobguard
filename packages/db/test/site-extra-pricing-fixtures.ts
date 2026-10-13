// ENT-3c shared set-up. Everything is created through the merged commands (ContractorRepository, WorkOrderRepository, SorRepository); nothing is inserted into an
// authorisation, price-list or order table directly. Pence values are read from PostgreSQL as text. No stored time comes from the test machine's clock.
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { referenceApprovalRulesV1 } from "@jobguard/core";
import { MIGRATION_URLS, SorRepository, WorkOrderRepository, demoFile, demoRow, migrate, verifyAuditChain, type AuditEvent } from "../src/index.js";
import { cluster, type Cluster, type Fixture } from "./extra-fixtures.js";
import { siteFixture, command, ownerTx, type SiteFixture } from "./site-extra-fixtures.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

export { cluster, siteFixture, command, ownerTx };
export type { Cluster, Fixture, SiteFixture };
export const noteText = "Fictional ENT3C note canary";
export const sorInput = (jobId: string, fields: Record<string, unknown> = {}) => ({ commandId: randomUUID(), jobId, sorCode: "CLEAR-GUTTER", quantity: "1", note: noteText, ...fields });

/** The tables a refused or replayed command must not change ("Nothing written" in the order), counted for one tenant. */
export const writtenTables = ["command_receipt", "scope_identity", "scope_lineage", "variation", "extra_origin", "extra_event", "extra_sor_revision", "extra_pricing_basis", "variation_revision", "extra_duplicate_link", "extra_order_line_link"] as const;
export async function written(c: Cluster, tenantId: string) {
  const result: Record<string, number> = {};
  for (const table of writtenTables) result[table] = (await c.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [tenantId])).rows[0]!.n;
  result.raised = (await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='contractor.extra.raised'", [tenantId])).rows[0]!.n;
  result.auditOther = (await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type<>'contractor.extra.refused'", [tenantId])).rows[0]!.n;
  return result;
}
export async function chainHead(c: Cluster, tenantId: string) {
  const rows = (await c.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [tenantId])).rows;
  verifyAuditChain(rows.map(r => ({ id: r.id, version: r.version, tenantId: r.tenant_id, sequence: Number(r.sequence), actorRef: r.actor_ref, eventType: r.event_type, subjectType: r.subject_type, subjectRef: r.subject_ref, occurredAt: r.occurred_at, payload: r.payload, payloadHash: r.payload_hash, previousHash: r.previous_hash, eventHash: r.event_hash })) as AuditEvent[]);
  return rows.at(-1)?.event_hash as string | undefined;
}
/** Whole rows as database text, for "unchanged as database text" checks. */
export async function rowText(c: Cluster, tenantId: string, table: string) {
  return (await c.admin.query(`SELECT row_to_json(t)::text AS bytes FROM app.${table} t WHERE tenant_id=$1 ORDER BY row_to_json(t)::text COLLATE "C"`, [tenantId])).rows.map(r => r.bytes as string);
}
/** The stored revision row and its basis row for one extra, every column as the driver returns it (bigint as text). */
export async function stored(c: Cluster, tenantId: string, variationId: string) {
  const revision = (await c.admin.query("SELECT r.*,r.xmin::text AS xmin_text FROM app.extra_sor_revision r WHERE r.tenant_id=$1 AND r.variation_id=$2", [tenantId, variationId])).rows[0];
  const basis = (await c.admin.query("SELECT b.*,b.xmin::text AS xmin_text FROM app.extra_pricing_basis b WHERE b.tenant_id=$1 AND b.variation_id=$2", [tenantId, variationId])).rows[0];
  return { revision, basis };
}

// ---- orders, contracts, price lists ----
export type OrderLines = Array<[reference: string, code: string, quantity: string]>;
export type OrderFacts = { n: number; reference: string; jobId: string; orderId: string; revisionId: string; contractId: string; revision: number };
let sequence = 300;
const asLines = (lines: OrderLines) => lines.map(([clientLineReference, sorCode, quantity]) => ({ clientLineReference, sorCode, quantity }));
export async function currentOrder(c: Cluster, tenantId: string, orderId: string): Promise<{ jobId: string; revisionId: string; revision: number }> {
  const row = (await c.admin.query("SELECT w.job_id,k.revision_id,r.revision FROM app.work_order w JOIN app.work_order_current k ON(k.tenant_id,k.work_order_id)=(w.tenant_id,w.id) JOIN app.work_order_revision r ON(r.tenant_id,r.id)=(k.tenant_id,k.revision_id) WHERE w.tenant_id=$1 AND w.id=$2", [tenantId, orderId])).rows[0]!;
  return { jobId: row.job_id as string, revisionId: row.revision_id as string, revision: row.revision as number };
}
/** A new work-order job under the demo client (or another contract of it), assigned to the demo team and operative like the fixture's own job. */
export async function newOrder(c: Cluster, f: Fixture, lines: OrderLines, options: { contractId?: string; issuedOn?: string } = {}): Promise<OrderFacts> {
  const n = ++sequence, reference = `PRICE-${n}`, contractId = options.contractId ?? f.demo.contractId;
  const result = await new WorkOrderRepository(c.runtime).importCsv(f.p, { commandId: randomUUID(), name: "fictional-pricing.csv", kind: "csv",
    csv: demoFile([demoRow(f.demo, n, { workOrderReference: reference, contractId, lines: asLines(lines), ...(options.issuedOn ? { issuedOn: options.issuedOn } : {}) })]) });
  if (result.rows[0]?.outcome !== "created") throw new Error(`order import was not created: ${JSON.stringify(result.rows[0])}`);
  const orderId = result.rows[0]!.workOrderId!, current = await currentOrder(c, f.p.tenantId, orderId);
  return { n, reference, jobId: current.jobId, orderId, revisionId: current.revisionId, contractId, revision: current.revision };
}
/** A later revision of the same order through the merged import (the pinned contract version, so the same adjustment). */
export async function reviseOrder(c: Cluster, f: Fixture, order: OrderFacts, lines: OrderLines, overrides: Record<string, unknown> = {}): Promise<OrderFacts> {
  const result = await new WorkOrderRepository(c.runtime).importCsv(f.p, { commandId: randomUUID(), name: "fictional-pricing-revision.csv", kind: "csv",
    csv: demoFile([demoRow(f.demo, order.n, { workOrderReference: order.reference, contractId: order.contractId, expectedRevision: order.revision, lines: asLines(lines), ...overrides })]) });
  if (result.rows[0]?.outcome !== "revised") throw new Error(`order revision was not accepted: ${JSON.stringify(result.rows[0])}`);
  const current = await currentOrder(c, f.p.tenantId, order.orderId);
  return { ...order, revisionId: current.revisionId, revision: current.revision };
}
export async function lineIds(c: Cluster, tenantId: string, revisionId: string): Promise<Record<string, { scopeItemId: string; quantity: string; code: string }>> {
  const rows = (await c.admin.query("SELECT client_line_reference,scope_item_id,quantity,sor_code FROM app.work_order_line WHERE tenant_id=$1 AND revision_id=$2", [tenantId, revisionId])).rows;
  return Object.fromEntries(rows.map(r => [r.client_line_reference as string, { scopeItemId: r.scope_item_id as string, quantity: r.quantity as string, code: r.sor_code as string }]));
}
const contractDocument = (sorVersionIds: string[], numerator: string, denominator: string, reference: string) => ({ version: "client-contract.v1", reference, startsOn: "2026-01-01", endsOn: null, sorVersionIds, tenderedAdjustment: { numerator, denominator }, photoRule: "required", vatCode: "synthetic-unreviewed", exportedNotBilledAlertDays: 30 });
/** A new contract of the demo client (merged contract.revise), returned by its id. */
export async function newContract(c: Cluster, f: Fixture, sorVersionIds: string[], numerator: string, denominator: string): Promise<string> {
  const contractId = randomUUID();
  await command(c, f, { kind: "contract.revise", clientId: f.demo.clientId, contractId, document: contractDocument(sorVersionIds, numerator, denominator, `FICTIONAL-PRICING-${randomUUID().slice(0, 8)}`), rules: referenceApprovalRulesV1 });
  return contractId;
}
/** A new price list version (merged SoR import); a new schedule unless one is named. */
export async function newPriceList(c: Cluster, f: Fixture, items: Array<[code: string, unit: string, pence: number]>, effectiveFrom: string, scheduleId: string = randomUUID()): Promise<string> {
  const result = await new SorRepository(c.runtime).importVersion(f.p, { version: "sor-version-import.v1", environment: "synthetic_demo", commandId: randomUUID(), scheduleId, reference: `Fictional rates ${randomUUID().slice(0, 8)}`, effectiveFrom,
    items: items.map(([code, unit, pence]) => ({ code, description: `Item ${code}`, unit, rate: { pence, currency: "GBP" } })) });
  return result.versionId;
}
/** The job leaves live the way merged tests do it: as the table owner (ENT-3a's tests do the same). */
export async function leaveLive(c: Cluster, f: Fixture, jobId: string, status = "invoiced") {
  await ownerTx(c, f.p.tenantId, db => db.$client.query("UPDATE app.job SET status=$3 WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, jobId, status]));
}

/** The fourteen worked money rows of the order (M1 to M14). `fraction` is the exact value before rounding, for the receipt; the stored pence is checked against it by the tests. */
export type MoneyRow = { id: string; code: string; order: "carries" | "plain"; adjustment?: [string, string]; rate?: number; instructed: string | null; claimed: string; quantity: string; fraction: string; pence: string; note?: string; refusal?: "EXTRA_NOT_POSITIVE" | "MONEY_OUT_OF_RANGE" };
export const moneyRows: MoneyRow[] = [
  { id: "M1", code: "CLEAR-GUTTER", order: "plain", instructed: null, claimed: "1", quantity: "1", fraction: "337.75", pence: "338" },
  { id: "M2", code: "CLEAR-GUTTER", order: "plain", instructed: null, claimed: "1.625", quantity: "1.625", fraction: "548.84375", pence: "549" },
  { id: "M3", code: "CLEAR-GUTTER", order: "plain", instructed: null, claimed: "2", quantity: "2", fraction: "675.5 (tie, odd below)", pence: "676" },
  { id: "M4", code: "PAINT-ROOM", order: "plain", instructed: null, claimed: "0.5", quantity: "0.5", fraction: "12062.5 (tie, even below)", pence: "12062" },
  { id: "M5", code: "CLEAR-VOID", order: "plain", instructed: null, claimed: "1", quantity: "1", fraction: "17370", pence: "17370" },
  { id: "M6", code: "REPAIR-DOOR", order: "plain", instructed: null, claimed: "1", quantity: "1", fraction: "9650", pence: "9650", note: "the plan's own example" },
  { id: "M7", code: "REPAIR-DOOR", order: "carries", instructed: "1", claimed: "3", quantity: "2", fraction: "19300", pence: "19300" },
  { id: "M8", code: "FIT-LOCK", order: "carries", instructed: "2", claimed: "5", quantity: "3", fraction: "13027.5 (tie, odd below)", pence: "13028" },
  { id: "M9", code: "FIT-LOCK", order: "carries", instructed: "2", claimed: "3", quantity: "1", fraction: "4342.5 (tie, even below)", pence: "4342" },
  { id: "M10", code: "CLEAR-GUTTER", order: "carries", instructed: "4", claimed: "6", quantity: "2", fraction: "675.5 (tie, odd below)", pence: "676", note: "priced as its own line; the alternative, the whole claim minus the instructed price (2026p - 1351p), would be 675p" },
  { id: "M11", code: "CLEAR-GUTTER", order: "carries", instructed: "4", claimed: "5.625", quantity: "1.625", fraction: "548.84375", pence: "549" },
  { id: "M12a", code: "REPAIR-DOOR", order: "plain", adjustment: ["50", "1000"], instructed: null, claimed: "2", quantity: "2", fraction: "21000", pence: "21000" },
  { id: "M12b", code: "CLEAR-GUTTER", order: "plain", adjustment: ["0", "1"], instructed: null, claimed: "1", quantity: "1", fraction: "350", pence: "350" },
  { id: "M13a", code: "CLEAR-GUTTER", order: "plain", instructed: null, claimed: "0.001", quantity: "0.001", fraction: "0.33775", pence: "0", refusal: "EXTRA_NOT_POSITIVE" },
  { id: "M13b", code: "CLEAR-GUTTER", order: "plain", instructed: null, claimed: "0.002", quantity: "0.002", fraction: "0.6755", pence: "1" },
  { id: "M14a", code: "BIG-ITEM", order: "plain", rate: 1_000_000_000_000, instructed: null, claimed: "1.03", quantity: "1.03", fraction: "993950000000", pence: "993950000000" },
  { id: "M14b", code: "BIG-ITEM", order: "plain", rate: 1_000_000_000_000, instructed: null, claimed: "1.04", quantity: "1.04", fraction: "1003600000000", pence: "1003600000000", refusal: "MONEY_OUT_OF_RANGE" },
];

/** A cluster migrated only up to (not including) the named migration file, to prove an upgrade. Mirrors extra-fixtures.cluster(). */
export async function clusterBefore(stopAt: string) {
  const dir = await mkdtemp(join(tmpdir(), "jg-ent3c-")), port = await freePort(58800, 400);
  const postgres = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const login = ["syn", "thetic"].join(""), config = { host: "127.0.0.1", port, user: "postgres", password: login };
  const control = new Pool(config); await control.query("CREATE DATABASE jobguard_synthetic_demo"); await control.end();
  const admin = new Pool({ ...config, database: "jobguard_synthetic_demo" });
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  const names = MIGRATION_URLS.map(url => fileURLToPath(url).split("/").at(-1)!);
  for (const url of MIGRATION_URLS) {
    const name = fileURLToPath(url).split("/").at(-1)!;
    if (name >= stopAt) continue;
    const sql = await readFile(url, "utf8");
    await admin.query(name === "0095_job_parties.sql" ? sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);") : sql);
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
  }
  await installLegacySyntheticPartyFixtures(admin);
  await admin.query(`CREATE ROLE ent3c_login LOGIN PASSWORD '${login}' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS; GRANT jobguard_runtime TO ent3c_login`);
  const runtime = new Pool({ ...config, database: "jobguard_synthetic_demo", user: "ent3c_login", max: 8 });
  return { admin, runtime, config, names, async close() { await closeTestPools(runtime, admin); await postgres.stop(); await rm(dir, { recursive: true, force: true }); }, migrate: () => migrate(admin) } satisfies Cluster & { names: string[]; migrate: () => Promise<void> };
}

// ---- owner-level "hand raise": a transaction shaped like a real raise, built by direct inserts as the table owner, so tampered revision rows can be offered to the guards ----
import type { TenantTransaction } from "../src/index.js";
import { receipt, rawOrigin, finishRaw } from "./extra-fixtures.js";
export type RawExtra = { variationId: string; commandId: string; scopeId: string; originHash: string; jobId: string };
/** Receipt (processing), scope identity, variation carrying the schedule item (and the excess link), origin, logged event and the one raised audit event. */
export async function rawExtra(db: TenantTransaction, f: Fixture, o: { jobId: string; code: string; excessRevisionId?: string; excessScopeItemId?: string; audit?: boolean; savepoint?: boolean }): Promise<RawExtra> {
  const variationId = randomUUID(), scopeId = randomUUID(), tenant = f.p.tenantId;
  if (o.savepoint) await db.$client.query("SAVEPOINT raw_raise");
  const commandId = await receipt(db, tenant, o.jobId, variationId, f.p.membershipId);
  const version = (await db.$client.query("SELECT sor_version_id FROM app.work_order_revision r JOIN app.work_order w ON(w.tenant_id,w.id)=(r.tenant_id,r.work_order_id) JOIN app.work_order_current k ON(k.tenant_id,k.revision_id)=(r.tenant_id,r.id) WHERE w.tenant_id=$1 AND w.job_id=$2", [tenant, o.jobId])).rows[0]!.sor_version_id as string;
  await db.$client.query("INSERT INTO app.scope_identity(tenant_id,job_id,id) VALUES($1,$2,$3)", [tenant, o.jobId, scopeId]);
  if (o.excessScopeItemId) await db.$client.query("INSERT INTO app.scope_lineage(tenant_id,job_id,parent_scope_item_id,child_scope_item_id,kind) VALUES($1,$2,$3,$4,'variation')", [tenant, o.jobId, o.excessScopeItemId, scopeId]);
  await db.$client.query(`INSERT INTO app.variation(tenant_id,job_id,id,scope_item_id,lineage_parent_scope_item_id,capture_kind,capture_text,description,job_track,origin,sor_version_id,sor_code,excess_of_revision_id,excess_of_scope_item_id)
   VALUES($1,$2,$3,$4,$5,'text',$6,'Item by hand','contractor','site_user',$7,$8,$9,$5)`, [tenant, o.jobId, variationId, scopeId, o.excessScopeItemId ?? null, noteText, version, o.code, o.excessRevisionId ?? null]);
  const origin = await rawOrigin(db, { ...f, jobId: o.jobId }, variationId, commandId);
  if (o.audit !== false) await finishRaw(db, { ...f, jobId: o.jobId }, variationId, commandId, origin.origin_hash as string);
  if (o.savepoint) await db.$client.query("RELEASE SAVEPOINT raw_raise");
  return { variationId, commandId, scopeId, originHash: origin.origin_hash as string, jobId: o.jobId };
}
/** Every column of a CORRECT revision row for a raw extra (new item), derived from stored rows and the merged price function; `overrides` replace columns to tamper with. */
export async function revisionValues(db: TenantTransaction, f: Fixture, raw: RawExtra, shape: { claimed: string; quantity?: string; instructed?: string; excessScopeItemId?: string }, overrides: Record<string, unknown> = {}) {
  const tenant = f.p.tenantId;
  const o = (await db.$client.query("SELECT * FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [tenant, raw.variationId])).rows[0]!;
  const v = (await db.$client.query("SELECT * FROM app.variation WHERE tenant_id=$1 AND id=$2", [tenant, raw.variationId])).rows[0]!;
  const b = (await db.$client.query("SELECT * FROM app.work_order_revision WHERE tenant_id=$1 AND id=$2", [tenant, o.work_order_revision_id])).rows[0]!;
  const item = (await db.$client.query("SELECT * FROM app.sor_item WHERE tenant_id=$1 AND version_id=$2 AND code=$3", [tenant, v.sor_version_id, v.sor_code])).rows[0]!;
  const quantity = shape.quantity ?? shape.claimed;
  const net = (await db.$client.query("SELECT app.sor_line_net_pence($1,$2,$3,$4)::text AS net", [quantity, item.rate_pence, b.adjustment_numerator, b.adjustment_denominator])).rows[0]!.net as string;
  const values: Record<string, unknown> = {
    tenant_id: tenant, id: randomUUID(), job_id: raw.jobId, variation_id: raw.variationId, revision: 1, work_order_id: o.work_order_id, work_order_revision_id: o.work_order_revision_id, sor_version_id: v.sor_version_id, sor_code: v.sor_code,
    unit: item.unit, rate_pence: item.rate_pence, adjustment_numerator: b.adjustment_numerator, adjustment_denominator: b.adjustment_denominator, coverage: shape.excessScopeItemId ? "excess" : "new",
    excess_of_scope_item_id: shape.excessScopeItemId ?? null, instructed_quantity: shape.instructed ?? null, claimed_quantity: shape.claimed, quantity, net_pence: net,
    content_hash: "f".repeat(64), request_hash: "b".repeat(64), command_id: raw.commandId, raising_membership_id: f.p.membershipId, server_recorded_at: "2000-01-01T00:00:00Z",
  };
  return { ...values, ...overrides };
}
export async function insertRow(db: TenantTransaction, table: string, values: Record<string, unknown>) {
  const entries = Object.entries(values);
  return (await db.$client.query(`INSERT INTO app.${table}(${entries.map(([k]) => k).join(",")}) VALUES(${entries.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`, entries.map(([, v]) => v))).rows[0]!;
}
export const basisValues = (f: Fixture, raw: RawExtra, contentHash: string, overrides: Record<string, unknown> = {}) => ({
  tenant_id: f.p.tenantId, id: randomUUID(), job_id: raw.jobId, variation_id: raw.variationId, revision: 1, pricing_basis: "server_sor", revision_content_hash: contentHash, command_id: raw.commandId, actor_membership_id: f.p.membershipId, server_recorded_at: "2000-01-01T00:00:00Z", ...overrides,
});
import { extraSorRevisionHashV1 } from "@jobguard/core";
/** The TypeScript mirror of the stored hash over a stored revision row and its origin's hash ([C4]). */
export const hashOf = (r: Record<string, any>, originHash: string) => extraSorRevisionHashV1({
  tenantId: r.tenant_id, jobId: r.job_id, variationId: r.variation_id, revision: String(r.revision), originHash, workOrderId: r.work_order_id, workOrderRevisionId: r.work_order_revision_id, sorVersionId: r.sor_version_id,
  sorCode: r.sor_code, unit: r.unit, ratePence: String(r.rate_pence), adjustmentNumerator: String(r.adjustment_numerator), adjustmentDenominator: String(r.adjustment_denominator), coverage: r.coverage,
  excessOfScopeItemId: r.excess_of_scope_item_id, instructedQuantity: r.instructed_quantity, claimedQuantity: r.claimed_quantity, quantity: r.quantity, netPence: String(r.net_pence),
});
