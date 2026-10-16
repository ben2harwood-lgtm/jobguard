import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DiscrepancyRepository, MaterialRepository, migrate, PurchaseOrderRepository,
  SupplierDocumentRepository, SupplierMatchRepository, withTenant } from "../src/index.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

// Dispatcher/CI only: this sandbox cannot bind localhost or start PostgreSQL.
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jg-serious-b6-"));
  const port = await freePort(56600, 300);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic" });
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query("CREATE ROLE serious_b6_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO serious_b6_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "serious_b6_login", password: "synthetic" });
}, 60000);
afterAll(async () => {
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const tenant = randomUUID(), job = randomUUID(), scope = randomUUID(), context = testTenantContext(tenant);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await importWatchdogFixtureJob(admin, tenant, job);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope, tenant, job]);
  const materials = new MaterialRepository(runtime), rate = await materials.addRate(context, {
    merchantName: "Fictional supplier", sku: "MAT-B", description: "Synthetic item", pricePence: 2000,
    priceUnit: "each", taxBasis: "net", effectiveFrom: "2026-09-20", sourceLabel: "materials-B", expectedVersion: 0,
  });
  const requirement = await materials.addRequirement(context, { jobId: job, scopeItemId: scope,
    skuId: rate.skuId, quantity: "10", unit: "each", expectedRevision: 0 });
  await new PurchaseOrderRepository(runtime).revise(context, job, { version: "purchase-order-draft.v1",
    requirementId: requirement.id, quantity: "10", unitPricePence: 2000,
    recipient: "orders@fictional-merchant.invalid", requiredDate: "2026-10-01", expectedRevision: 0 });
  const docs = new SupplierDocumentRepository(runtime), matches = new SupplierMatchRepository(runtime);
  const original = await docs.intake(context, job, { version: "supplier-document-intake.v1", commandId: randomUUID(),
    fixtureId: "materials-B-delivery", channel: "picker", expectedRevision: 0 });
  const invoice = await docs.intake(context, job, { version: "supplier-document-intake.v1", commandId: randomUUID(),
    fixtureId: "materials-B-invoice", channel: "picker", expectedRevision: 1 });
  await docs.confirm(context, job, { version: "supplier-fact-correction.v1", documentId: invoice.documentId,
    commandId: randomUUID(), documentType: "invoice", quantity: "10", unitPricePence: 2500, netPence: 25000, expectedRevision: 0 });
  return { tenant, job, context, docs, matches, original, discrepancies: new DiscrepancyRepository(runtime) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function receipts(f: Fixture) {
  return (await admin.query("SELECT * FROM app.goods_receipt WHERE tenant_id=$1 AND job_id=$2 ORDER BY revision", [f.tenant, f.job])).rows;
}
async function allocations(f: Fixture) {
  return (await admin.query("SELECT quantity_decimal::text quantity FROM app.supplier_match_allocation WHERE tenant_id=$1 AND job_id=$2 ORDER BY quantity_decimal", [f.tenant, f.job])).rows;
}
async function findingIntegrity(f: Fixture) {
  const rows = await admin.query(`SELECT
    (SELECT count(*)::int FROM app.discrepancy_finding_revision WHERE tenant_id=$1 AND job_id=$2) findings,
    (SELECT count(*)::int FROM app.audit_event e WHERE e.tenant_id=$1 AND e.subject_ref=$2::text
      AND e.event_type='discrepancy.evaluated' AND NOT EXISTS(SELECT 1 FROM app.discrepancy_finding_revision f
        WHERE f.tenant_id=e.tenant_id AND f.id::text=e.payload->'references'->>'findingId')) dangling`, [f.tenant, f.job]);
  return rows.rows[0];
}

describe("SERIOUS-B6 real PostgreSQL regressions (dispatcher/CI)", () => {
  it.each([false, true])("S19: entirely rejected receipts retain evidence and only positive allocations (later=%s)", async later => {
    const f = await fixture();
    if (later) {
      // Independent synthetic delivery fixture: production S18 remains STOPPED.
      // Use existing tables so S19 is also tested with a positive and a rejected delivery.
      const previous = (await receipts(f))[0], documentId = randomUUID();
      await withTenant(runtime, f.context, async db => {
        await db.$client.query(`INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,content_hash,status)
          VALUES($1,$2,$3,'fictional-merchant','delivery',$4,'ready')`, [documentId, f.tenant, f.job, "b".repeat(64)]);
        await db.$client.query(`INSERT INTO app.supplier_document_version(id,tenant_id,job_id,document_id,version,media_type,byte_length,content_hash,page_count)
          VALUES($1,$2,$3,$4,1,'text/plain',1,$5,1)`, [randomUUID(), f.tenant, f.job, documentId, "b".repeat(64)]);
        await db.$client.query(`INSERT INTO app.goods_receipt(id,tenant_id,job_id,order_draft_id,document_id,revision,
          ordered_quantity,delivered_quantity,accepted_quantity,rejected_quantity,missing_quantity,unit)
          VALUES($1,$2,$3,$4,$5,2,10,2,0,2,10,'each')`, [randomUUID(), f.tenant, f.job, previous.order_draft_id, documentId]);
      });
    } else {
      await f.docs.appendReceipt(f.context, f.job, { commandId: randomUUID(), accepted: "0", rejected: "2", expectedRevision: 1 });
    }
    const input = { commandId: randomUUID(), expectedRevision: 0 };
    const result = await f.matches.create(f.context, f.job, input);
    expect(result.proposal).toMatchObject({ state: "matched", received: later ? "8 each" : "0 each" });
    expect(result.proposal.receiptVersionIds).toContain((await receipts(f))[1].id);
    expect(await allocations(f)).toEqual(later ? [{ quantity: "8.000000" }] : []);
    await expect(f.matches.create(f.context, f.job, input)).resolves.toEqual(result);
    const evaluated = await f.discrepancies.evaluate(f.context, f.job, { commandId: randomUUID(), ruleRevision: "supplier-overcharge.v1" });
    expect(evaluated.finding).toMatchObject({ state: "actionable", totalPence: later ? 9000 : 25000 });
  });
  it("S20: concurrent unchanged evaluations keep one durable finding, two results and no dangling audit references", async () => {
    const f = await fixture();
    await f.matches.create(f.context, f.job, { commandId: randomUUID(), expectedRevision: 0 });
    const commands = [1, 2].map(() => ({ commandId: randomUUID(), ruleRevision: "supplier-overcharge.v1" }));
    const [first, second] = await Promise.all(commands.map(input => f.discrepancies.evaluate(f.context, f.job, input)));
    expect(first).toEqual(second);
    expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2::text AND event_type='discrepancy.evaluated'", [f.tenant, f.job])).rows[0].n).toBe(2);
    expect(await findingIntegrity(f)).toEqual({ findings: 1, dangling: 0 });
    expect((await admin.query("SELECT count(*)::int n FROM app.watchdog_command_result WHERE tenant_id=$1 AND command_id=ANY($2::uuid[])",
      [f.tenant, commands.map(c => c.commandId)])).rows[0].n).toBe(2);
    await f.discrepancies.review(f.context, f.job, { commandId: randomUUID(), findingId: first.finding.id,
      expectedRevision: 0, outcome: "dismissed", reason: "Synthetic review" });
    await expect(f.discrepancies.evaluate(f.context, f.job, commands[1]!)).resolves.toEqual(second);
    await expect(f.discrepancies.evaluate(f.context, f.job, { ...commands[1]!, ruleRevision: "changed-rule" })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await findingIntegrity(f)).toEqual({ findings: 1, dangling: 0 });
  });
  it("S20: failure inserting a finding rolls its audit and command identity back", async () => {
    const f = await fixture();
    await f.matches.create(f.context, f.job, { commandId: randomUUID(), expectedRevision: 0 });
    await admin.query(`CREATE FUNCTION app.serious_b6_fail_finding() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.rule_revision='serious-b6-rollback.v1' THEN RAISE EXCEPTION 'synthetic insert failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER serious_b6_fail BEFORE INSERT ON app.discrepancy_finding_revision FOR EACH ROW EXECUTE FUNCTION app.serious_b6_fail_finding()`);
    const command = { commandId: randomUUID(), ruleRevision: "serious-b6-rollback.v1" };
    const audits = (await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [f.tenant])).rows[0].n;
    await expect(f.discrepancies.evaluate(f.context, f.job, command)).rejects.toThrow("synthetic insert failure");
    expect(await findingIntegrity(f)).toEqual({ findings: 0, dangling: 0 });
    expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [f.tenant])).rows[0].n).toBe(audits);
    expect((await admin.query("SELECT count(*)::int n FROM app.watchdog_command_identity WHERE tenant_id=$1 AND command_id=$2", [f.tenant, command.commandId])).rows[0].n).toBe(0);
    await admin.query("DROP TRIGGER serious_b6_fail ON app.discrepancy_finding_revision; DROP FUNCTION app.serious_b6_fail_finding()");
    await expect(f.discrepancies.evaluate(f.context, f.job, command)).resolves.toBeDefined();
    expect(await findingIntegrity(f)).toEqual({ findings: 1, dangling: 0 });
  });
});
