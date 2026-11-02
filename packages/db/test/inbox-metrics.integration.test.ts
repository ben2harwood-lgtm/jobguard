import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InboxMetricsRepository } from "../src/inbox-metrics-repository.js";
import { migrate } from "../src/migrate.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { startLp0Database, RUNTIME_TEST_PASSWORD, type Lp0Database } from "./lp-0-catalog.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

let db: Lp0Database, runtime: Pool;
const tenant = randomUUID(), other = randomUUID(), job = randomUUID(), otherJob = randomUUID();
const context = testTenantContext(tenant), foreign = testTenantContext(other);
const connect = () => new Pool({ host: "127.0.0.1", port: db.port, database: db.databaseName,
  user: "jobguard_runtime", password: RUNTIME_TEST_PASSWORD, max: 2 });
const finding = () => ({ tenantId: tenant, jobId: job, ruleId: "proof", ruleVersion: "v1",
  eventId: randomUUID(), commandId: randomUUID(), kind: "finding", findingId: randomUUID(), occurredAt: "2026-01-01T00:00:00Z" });
const envelope = (event: unknown, receiptId = randomUUID()) => ({ version: "inbox-metric-record.v1",
  environment: "synthetic_demo", jobId: job, receiptId, event });
const readScope = { version: "inbox-metrics.v1", environment: "synthetic_demo", jobId: job, asOf: "2026-01-02T00:00:00Z" };
const repo = () => new InboxMetricsRepository(runtime);
const read = () => repo().read(context, readScope);

beforeAll(async () => {
  db = await startLp0Database(59700);
  await installLegacySyntheticPartyFixtures(db.admin);
  await db.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [tenant, other]);
  await importWatchdogFixtureJob(db.admin, tenant, job);
  await importWatchdogFixtureJob(db.admin, tenant, otherJob);
  await db.bootstrapRuntimeLogin(); runtime = connect();
}, 120000);
afterAll(async () => { await runtime?.end(); await db?.stop(); });

describe("M2-7 durable synthetic metrics (real PostgreSQL)", () => {
  it("dedupes concurrent deliveries and command/event replays across fresh connections", async () => {
    const event = finding(), input = envelope(event);
    const results = await Promise.all([repo().record(context, input), repo().record(context, input)]);
    expect(results.map(r => r.replay).sort()).toEqual([false, true]);
    expect(await repo().record(context, envelope(event))).toMatchObject({ status: "accepted", replay: true });
    await runtime.end(); runtime = connect();
    expect(await read()).toMatchObject({ ingestion: { accepted: 1, rejected: 0 }, byRule: [{ findings: 1 }] });
    const before = await read(); await migrate(db.admin); expect(await read()).toEqual(before);
  });
  it("stores conversions, coalescing, dismissal latency and reversals by rule/version", async () => {
    const first = finding(), second = finding();
    await repo().record(context, envelope(first)); await repo().record(context, envelope(second));
    const decisionId = randomUUID();
    const decision = { ...first, eventId: randomUUID(), commandId: randomUUID(), kind: "decision",
      findingIds: [first.findingId, second.findingId], decisionId };
    delete (decision as Partial<typeof first>).findingId;
    expect(await repo().record(context, envelope(decision))).toMatchObject({ status: "accepted" });
    const resolution = { ...decision, eventId: randomUUID(), commandId: randomUUID(), kind: "resolution",
      resolution: "dismissed", reason: "duplicate", occurredAt: "2026-01-01T00:01:00Z" };
    delete (resolution as Partial<typeof decision>).findingIds;
    await repo().record(context, envelope(resolution));
    for (const [outcome, occurredAt] of [["useful", "2026-01-01T00:02:00Z"], ["reversed", "2026-01-01T00:03:00Z"]]) {
      await repo().record(context, envelope({ tenantId: tenant, jobId: job, ruleId: "proof", ruleVersion: "v1",
        eventId: randomUUID(), commandId: randomUUID(), decisionId, kind: "later_outcome", outcome, occurredAt }));
    }
    expect((await read()).byRule[0]).toMatchObject({ decisions: 1, convertedFindings: 2, coalescedCount: 1,
      dismissed: 1, reasons: { duplicate: 1 }, meanTimeToDecisionMs: 60000, laterOutcomes: { useful: 0, reversed: 1 } });
    expect((await repo().read(context, { ...readScope, asOf: "2026-01-01T00:02:30Z" })).byRule[0]?.laterOutcomes.useful).toBe(1);
  });
  it("counts malformed bodies, reference errors and identity conflicts as rejections without retaining content", async () => {
    const baseline = (await read()).ingestion;
    const valid = finding(); await repo().record(context, envelope(valid));
    const malformed = envelope({ ...finding(), message: "private@example.invalid", kind: "resolution" });
    const cases = [malformed, envelope({ ...finding(), tenantId: other }), envelope({ ...finding(), jobId: otherJob }),
      envelope({ ...valid, ruleVersion: "v2" }), envelope({ ...valid, eventId: randomUUID() }),
      envelope({ ...valid, commandId: randomUUID() }), envelope({ tenantId: tenant, jobId: job, ruleId: "proof", ruleVersion: "v1",
        eventId: randomUUID(), commandId: randomUUID(), kind: "resolution", decisionId: randomUUID(),
        resolution: "confirmed", reason: "useful", occurredAt: "2026-01-01T00:00:00Z" })];
    for (const input of cases) expect(await repo().record(context, input)).toMatchObject({ status: "rejected", replay: false });
    expect(await repo().record(context, malformed)).toMatchObject({ status: "rejected", replay: true });
    expect((await read()).ingestion).toEqual({ accepted: baseline.accepted + 1, rejected: baseline.rejected + cases.length });
    const rows = (await db.admin.query("SELECT event,event_id,command_id FROM app.inbox_metric_receipt WHERE rejection IS NOT NULL")).rows;
    expect(rows).toHaveLength(cases.length);
    expect(rows.every(r => r.event === null && r.event_id === null && r.command_id === null)).toBe(true);
    await expect(repo().record(context, { ...malformed, event: {} })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it("isolates tenant/job reads, fails closed without context, and denies mutation and forged tenant inserts", async () => {
    expect(await repo().read(foreign, readScope)).toMatchObject({ byRule: [], ingestion: { accepted: 0, rejected: 0 } });
    expect(await repo().read(context, { ...readScope, jobId: otherJob })).toMatchObject({ byRule: [] });
    expect((await runtime.query("SELECT * FROM app.inbox_metric_receipt")).rows).toEqual([]);
    for (const sql of ["UPDATE app.inbox_metric_receipt SET rejection='INVALID_METRICS_INPUT'", "DELETE FROM app.inbox_metric_receipt", "TRUNCATE app.inbox_metric_receipt"]) {
      await expect(withTenant(runtime, context, tx => tx.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
    }
    await expect(withTenant(runtime, context, tx => tx.$client.query(`INSERT INTO app.inbox_metric_receipt
      (tenant_id,job_id,receipt_id,request_hash,rejection,audit_event_id)
      VALUES($1,$2,$3,repeat('a',64),'INVALID_METRICS_INPUT',$4)`,
      [other,job,randomUUID(),randomUUID()]))).rejects.toMatchObject({ code: "42501" });
    await expect(repo().record(foreign, envelope(finding()))).rejects.toThrow("INVALID_METRICS_INPUT");
    await expect(repo().read({ tenantId: tenant } as typeof context, readScope)).rejects.toThrow("verified tenant context");
  });
  it("keeps forced RLS, composite references, immutable receipts and exact runtime grants", async () => {
    const table = "app.inbox_metric_receipt";
    expect((await db.admin.query(`SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner
      FROM pg_class WHERE oid=$1::regclass`, [table])).rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration" }]);
    for (const privilege of ["UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      expect((await db.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,$2) allowed", [table, privilege])).rows[0].allowed).toBe(false);
    }
    expect((await db.admin.query("SELECT has_table_privilege('jobguard_infrastructure',$1,'SELECT,INSERT') allowed", [table])).rows[0].allowed).toBe(false);
    expect((await db.admin.query("SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid=$1::regclass AND contype='f'", [table])).rows.map(r => r.def)).toContain("FOREIGN KEY (tenant_id, job_id) REFERENCES app.job(tenant_id, id)");
    await expect(db.admin.query("UPDATE app.inbox_metric_receipt SET rejection='INVALID_METRICS_INPUT'")).rejects.toThrow("INBOX_METRICS_IMMUTABLE");
  });
});
