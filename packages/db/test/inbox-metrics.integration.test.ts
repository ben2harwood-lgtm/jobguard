import { appendAuditBatch } from "../src/index.js";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_TENANT_ID, DEMO_IDENTITY_USER_ID, DEMO_ACCOUNT_ID, DEMO_MEMBERSHIP_ID,
  issuePracticeSession, authenticatePracticeSession, InboxRelevanceRepository } from "../src/index.js";
import { InboxRelevanceApplication } from "../../../apps/api/src/inbox-relevance.application.js";
import { readInboxDashboard } from "../../../apps/web/app/lib/inbox-metrics-server.js";
import { POST } from "../../../apps/web/app/api/jobs/[id]/relevance-inbox/decisions/[decisionId]/route.js";
// Only adapt the HTTP cookie/pool surfaces; all authorization, commands, SQL and metrics are real.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: practiceToken }) }) }));
vi.mock("../../../apps/web/app/lib/synthetic-server", async original => ({
  ...await original<typeof import("../../../apps/web/app/lib/synthetic-server.js")>(), syntheticPool: () => runtime,
}));
vi.mock("../../../apps/web/app/lib/workspace-server", () => ({ workspaceApplication: async () => ({
  inboxRelevance: new InboxRelevanceApplication(runtime, practiceToken),
}) }));
let practiceToken: string;
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
let actor: { membershipId: string; identityUserId: string };
const finding = async () => { const event = ({ tenantId: tenant, jobId: job, ruleId: "proof", ruleVersion: "v1",
  eventId: randomUUID(), commandId: randomUUID(), kind: "finding", findingId: randomUUID(), occurredAt: "2026-01-01T00:00:00Z" });
  await withTenant(db.admin, context, async tx => {
    const audit = await appendAuditBatch(tx, [{id:randomUUID(),version:"audit.v1",actorRef:`membership:${actor.membershipId}`,eventType:"inbox.finding_recorded",subjectType:"job",subjectRef:job,payload:{references:{jobId:job},classifications:{action:"operational"}}}]);
    await tx.$client.query(`INSERT INTO app.inbox_finding_revision
      (id,tenant_id,job_id,revision,lane,rule_id,rule_revision,action_type,source_revision,source_reference,title,explanation,permitted_action,actor_ref,subject_ref,payload_hash,audit_event_id,created_at)
      VALUES($1,$2,$3,1,'mandatory','proof','v1','provide-proof','fixture.v1',$1::uuid::text,'Synthetic proof','Synthetic source','Add proof',$4,$3,$5,$6,clock_timestamp())`,
    [event.findingId,tenant,job,`membership:${actor.membershipId}`,"a".repeat(64),audit[0]!.id]);
  });
  return event;
};
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
  const member = (await db.admin.query("SELECT id,identity_user_id FROM app.membership WHERE tenant_id=$1 AND role='owner' LIMIT 1",[tenant])).rows[0]!;
  actor={membershipId:member.id,identityUserId:member.identity_user_id};
  await db.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await db.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await db.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional metric owner')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
  await db.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  await db.bootstrapRuntimeLogin(); runtime = connect();
}, 120000);
afterAll(async () => { await runtime?.end(); await db?.stop(); });

describe("M2-7 durable synthetic metrics (real PostgreSQL)", () => {
  it("dedupes concurrent deliveries and command/event replays across fresh connections", async () => {
    const event = (await finding()), input = envelope(event);
    const results = await Promise.all([repo().record(context, actor, input), repo().record(context, actor, input)]);
    expect(results.map(r => r.replay).sort()).toEqual([false, true]);
    expect(await repo().record(context, actor, envelope(event))).toMatchObject({ status: "accepted", replay: true });
    await runtime.end(); runtime = connect();
    expect(await read()).toMatchObject({ ingestion: { accepted: 1, rejected: 0 }, byRule: [{ findings: 1 }] });
    const before = await read(); await migrate(db.admin); expect(await read()).toEqual(before);
  });
  it("stores conversions, coalescing, dismissal latency and reversals by rule/version", async () => {
    const first = (await finding()), second = (await finding());
    await repo().record(context, actor, envelope(first)); await repo().record(context, actor, envelope(second));
    const decisionId = randomUUID();
    const decision = { ...first, eventId: randomUUID(), commandId: randomUUID(), kind: "decision",
      findingIds: [first.findingId, second.findingId], decisionId };
    delete (decision as Partial<typeof first>).findingId;
    expect(await repo().record(context, actor, envelope(decision))).toMatchObject({ status: "accepted" });
    const resolution = { ...decision, eventId: randomUUID(), commandId: randomUUID(), kind: "resolution",
      resolution: "dismissed", reason: "duplicate", occurredAt: "2026-01-01T00:01:00Z" };
    delete (resolution as Partial<typeof decision>).findingIds;
    await repo().record(context, actor, envelope(resolution));
    for (const [outcome, occurredAt] of [["useful", "2026-01-01T00:02:00Z"], ["reversed", "2026-01-01T00:03:00Z"]]) {
      await repo().record(context, actor, envelope({ tenantId: tenant, jobId: job, ruleId: "proof", ruleVersion: "v1",
        eventId: randomUUID(), commandId: randomUUID(), decisionId, kind: "later_outcome", outcome, occurredAt }));
    }
    expect((await read()).byRule[0]).toMatchObject({ decisions: 1, convertedFindings: 2, coalescedCount: 1,
      dismissed: 1, reasons: { duplicate: 1 }, meanTimeToDecisionMs: 60000, laterOutcomes: { useful: 0, reversed: 1 } });
    expect((await repo().read(context, { ...readScope, asOf: "2026-01-01T00:02:30Z" })).byRule[0]?.laterOutcomes.useful).toBe(1);
  });
  it("counts malformed bodies, reference errors and identity conflicts as rejections without retaining content", async () => {
    const baseline = (await read()).ingestion;
    const valid = (await finding()); await repo().record(context, actor, envelope(valid));
    const malformed = envelope({ ...(await finding()), message: "private@example.invalid", kind: "resolution" });
    const cases = [malformed, envelope({ ...(await finding()), tenantId: other }), envelope({ ...(await finding()), jobId: otherJob }),
      envelope({ ...valid, ruleVersion: "v2" }), envelope({ ...valid, eventId: randomUUID() }),
      envelope({ ...valid, commandId: randomUUID() }), envelope({ tenantId: tenant, jobId: job, ruleId: "proof", ruleVersion: "v1",
        eventId: randomUUID(), commandId: randomUUID(), kind: "resolution", decisionId: randomUUID(),
        resolution: "confirmed", reason: "useful", occurredAt: "2026-01-01T00:00:00Z" })];
    for (const input of cases) expect(await repo().record(context, actor, input)).toMatchObject({ status: "rejected", replay: false });
    expect(await repo().record(context, actor, malformed)).toMatchObject({ status: "rejected", replay: true });
    expect((await read()).ingestion).toEqual({ accepted: baseline.accepted + 1, rejected: baseline.rejected + cases.length });
    const rows = (await db.admin.query("SELECT event,event_id,command_id FROM app.inbox_metric_receipt WHERE rejection IS NOT NULL")).rows;
    expect(rows).toHaveLength(cases.length);
    expect(rows.every(r => r.event === null && r.event_id === null && r.command_id === null)).toBe(true);
    await expect(repo().record(context, actor, { ...malformed, event: {} })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
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
    await expect(repo().record(foreign, actor, envelope((await finding())))).rejects.toThrow("INVALID_METRICS_INPUT");
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
  it("returns no metrics from a populated off-demo database and still refuses recording there", async () => {
    const database = "inbox_metrics_non_demo";
    await db.admin.query(`CREATE DATABASE ${database}`);
    const admin = new Pool({ host: "127.0.0.1", port: db.port, database, user: "postgres", password: "synthetic" });
    const reader = new Pool({ host: "127.0.0.1", port: db.port, database, user: "jobguard_runtime", password: RUNTIME_TEST_PASSWORD });
    try {
      // A deliberately readable test table isolates the database-name guard from RLS.
      // Even rows visible to the runtime role must never enter off-demo metrics.
      await admin.query(`CREATE SCHEMA app; CREATE TABLE app.inbox_metric_receipt
        (tenant_id uuid,job_id uuid,event jsonb,rejection text);
        GRANT USAGE ON SCHEMA app TO jobguard_runtime;
        GRANT SELECT ON app.inbox_metric_receipt TO jobguard_runtime`);
      await admin.query("INSERT INTO app.inbox_metric_receipt VALUES($1,$2,$3::jsonb,NULL)", [tenant, job, JSON.stringify((await finding()))]);
      expect((await reader.query("SELECT event FROM app.inbox_metric_receipt")).rows).toHaveLength(1);
      const repository = new InboxMetricsRepository(reader);
      expect(await repository.read(context, readScope)).toMatchObject({ byRule: [], ingestion: { accepted: 0, rejected: 0 } });
      await expect(repository.record(context, actor, envelope((await finding())))).rejects.toThrow("INVALID_METRICS_INPUT");
      expect((await reader.query("SELECT event FROM app.inbox_metric_receipt")).rows).toHaveLength(1);
    } finally {
      await reader.end(); await admin.end();
      await db.admin.query(`DROP DATABASE ${database}`);
    }
  });
});

it("refuses hidden or absent finding identifiers without receipts, plus invalid and revoked actors on replays", async () => {
 const absent={...(await finding()),findingId:randomUUID()};
 const before=(await db.admin.query("SELECT count(*) n FROM app.inbox_metric_receipt")).rows;
 await expect(repo().record(context,actor,envelope(absent))).rejects.toThrow("INVALID_METRICS_REFERENCE");
 expect((await db.admin.query("SELECT count(*) n FROM app.inbox_metric_receipt")).rows).toEqual(before);
 const input=envelope(await finding());await repo().record(context,actor,input);
 for(const patch of [{identityUserId:randomUUID()},{membershipId:randomUUID()}])
  await expect(repo().record(context,{...actor,...patch},input)).rejects.toThrow("INVALID_METRICS_INPUT");
 await db.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[tenant,actor.membershipId]);
 await expect(repo().record(context,actor,input)).rejects.toThrow("INVALID_METRICS_INPUT");
});

// No fixture writes metric events: the production dismissal route is the sole writer here.
describe("M2-7 actual practice dismissal to dashboard (PostgreSQL runtime grants)", () => {
  const priorEnv = process.env.JOBGUARD_ENV;
  afterAll(() => { if (priorEnv === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = priorEnv; });
  async function seeded() {
    process.env.JOBGUARD_ENV = "synthetic_demo";
    practiceToken = await issuePracticeSession(runtime);
    const owner = await authenticatePracticeSession(runtime, practiceToken);
    const live = (await db.admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND status='live'", [owner.context.tenantId, owner.digest])).rows[0].id as string;
    const app = new InboxRelevanceApplication(runtime, practiceToken);
    const inbox = await app.seed(live, { version: "inbox-seed.v1", commandId: randomUUID() });
    return { owner, live, inbox, app };
  }
  const dismiss = (live: string, decisionId: string, extra: object, commandId = randomUUID()) => POST(new Request("http://localhost", {
    method: "POST", body: JSON.stringify({ version: "inbox-dismiss.v1", commandId, ...extra }),
  }), { params: Promise.resolve({ id: live, decisionId }) });
  it("records rule/version, duplicate reason and latency once through the real route, retaining mandatory blockers", async () => {
    const { owner, live, inbox } = await seeded();
    const decision = inbox.advisory.find(item => item.ruleId === "supplier-check")!;
    const commandId = randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await dismiss(live, decision.id, { reason: "duplicate" }, commandId);
      expect(response.status).toBe(200); expect(response.headers.get("x-inbox-metrics-code")).toBeNull();
      expect((await response.json()).mandatory).toHaveLength(2);
    }
    const report = await readInboxDashboard(runtime, practiceToken, live);
    expect(report.byRule).toEqual([expect.objectContaining({ ruleId: "supplier-check", ruleVersion: "supplier-check.v1",
      findings: 2, decisions: 1, dismissed: 1, duplicateCount: 1, coalescedCount: 1, meanTimeToDecisionMs: 300000,
      laterOutcomes: { unknown: 1, recorded: null } })]);
    expect(report.mandatoryBlockers.reduce((sum, row) => sum + row.count, 0)).toBe(2);
    expect((await repo().read(owner.context, { ...readScope, jobId: live, asOf: "2099-01-01T00:00:00Z" })).ingestion).toEqual({ accepted: 4, rejected: 0 });
  });
  it("keeps no-reason behavior and refuses unknown reasons and forged authority before dismissal", async () => {
    const { owner, live, inbox, app } = await seeded();
    const decision = inbox.advisory[0]!;
    for (const extra of [{ reason: "invented" }, ...["tenantId", "actor", "ruleId", "findingIds", "eventId"].map(key => ({ reason: "duplicate", [key]: randomUUID() }))]) {
      const response = await dismiss(live, decision.id, extra);
      expect(response.status).toBe(400); expect(await response.json()).toEqual({ code: "INVALID_INBOX" });
      expect((await app.view(live)).advisory.some(item => item.id === decision.id)).toBe(true);
    }
    expect((await dismiss(live, decision.id, {})).status).toBe(200);
    expect((await app.view(live)).advisory.some(item => item.id === decision.id)).toBe(false);
    expect((await readInboxDashboard(runtime, practiceToken, live)).byRule).toEqual([]);
    expect((await repo().read(owner.context, { ...readScope, jobId: live })).ingestion).toEqual({ accepted: 0, rejected: 0 });
  });
  it("records nothing outside synthetic_demo", async () => {
    const { owner, live, inbox } = await seeded();
    process.env.JOBGUARD_ENV = "pilot_no_charge";
    const response = await dismiss(live, inbox.advisory[0]!.id, { reason: "duplicate" });
    expect(response.status).toBe(403);
    process.env.JOBGUARD_ENV = "synthetic_demo";
    expect((await repo().read(owner.context, { ...readScope, jobId: live })).ingestion).toEqual({ accepted: 0, rejected: 0 });
    expect((await new InboxRelevanceApplication(runtime, practiceToken).view(live)).advisory).toHaveLength(2);
  });
  it("records nothing for another job, another owner or another tenant; no metric can hide mandatory work", async () => {
    const first = await seeded(), second = await seeded();
    const decision = first.inbox.advisory[0]!;
    expect((await dismiss(second.live, decision.id, { reason: "duplicate" })).status).toBe(404);
    expect((await dismiss(first.live, decision.id, { reason: "duplicate" })).status).toBe(404);
    expect((await readInboxDashboard(runtime, practiceToken, second.live)).byRule).toEqual([]);
    await expect(new InboxRelevanceRepository(runtime).metricDecision(foreign, first.live, decision.id)).rejects.toThrow("DECISION_NOT_FOUND_FOR_JOB");
    expect((await repo().read(foreign, { ...readScope, jobId: first.live })).byRule).toEqual([]);
    expect((await repo().read(first.owner.context, { ...readScope, jobId: first.live })).ingestion).toEqual({ accepted: 0, rejected: 0 });
    // Mandatory dismiss behavior is inherited verbatim from the existing command, with/without telemetry.
    const commandId = randomUUID();
    const before = await second.app.dismiss(second.live, second.inbox.mandatory[0]!.id, { version: "inbox-dismiss.v1", commandId });
    const response = await dismiss(second.live, second.inbox.mandatory[0]!.id, { reason: "duplicate" }, commandId);
    expect(response.status).toBe(200); expect(response.headers.get("x-inbox-metrics-code")).toBeNull();
    expect(await response.json()).toEqual(before);
    expect((await second.app.view(second.live)).mandatory).toEqual(before.mandatory);
  });
});
