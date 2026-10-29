import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planEntitlementCapacity } from "@jobguard/core";
import { approvedTrialClockV1, reduceTrialEndsV1, trialDeadlineV1 } from "../../core/src/free-first-job-calendar.js";
import { PlanEntitlementsApplication } from "../../../apps/api/src/plan-entitlements.application.js";
import { PlanEntitlementLifecycleRepository } from "../src/plan-entitlement-lifecycle-repository.js";
import { appendAuditBatch } from "../src/index.js";
import { withTenant } from "../src/tenant-context.js";
import { boundaryLock, closeWorkFixture, createWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { approvedSimulation, calendarInput, command, historicalAgreement, meterCompany, readSubscription, rows, storeMeter, terms, type SubscriptionCompany } from "./subscription-persistence-fixtures.js";

let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(); }, 60000);
afterAll(async () => closeWorkFixture(f));
function service(a: SubscriptionCompany) {
  const repository = new PlanEntitlementLifecycleRepository(f.runtime);
  const authority = { withCurrentAuthority: <T>(job: string | undefined, consume: (facts: unknown) => T) => repository.withCurrentAuthority(a.context, a.digest, job, consume) };
  return { app: new PlanEntitlementsApplication(authority, () => ({ version: "plan-entitlement-enablement.v1", environment: "synthetic_demo", enabled: ["invoices", "final_check", "accounting_export"] })),
    capacity: () => authority.withCurrentAuthority(undefined, planEntitlementCapacity) };
}
const request = (feature = "accounting_export", jobId?: string) => ({ version: "plan-entitlement-check.v1", feature, ...(jobId ? { jobId } : {}) });
async function retained(a: SubscriptionCompany) {
  return workTenant(f.runtime, a.tenantId, async db => (await db.query("SELECT id,title,status FROM app.job WHERE tenant_id=$1 ORDER BY id", [a.tenantId])).rows);
}
async function changeTrack(a: SubscriptionCompany, track: string, revision: number) {
  await withTenant(f.admin, a.context, async db => {
    const id = randomUUID(), actor = "operations:mon8-lifecycle-fixture";
    await db.$client.query("SELECT app.assign_commercial_track($1,$2,$3,$4,$5,$6)", [a.tenantId, id, track, `synthetic-agreement:${a.tenantId}`, revision, actor]);
    await appendAuditBatch(db, [{ id, version: "audit.v1", actorRef: actor, eventType: "commercial_track.assigned", subjectType: "tenant", subjectRef: a.tenantId, payload: { references: { environment: "synthetic_demo" } } }]);
  });
}
describe("MON-8 effective subscription/lifecycle authority (real PostgreSQL)", () => {
  it("upgrade replay, pending downgrade, effective downgrade and reversal use one current plan without losing retained jobs", async () => {
    const a = await meterCompany(f); await historicalAgreement(f, a, "Solo");
    const s = service(a), before = await retained(a), decision = await s.app.require(request());
    expect(await s.capacity()).toMatchObject({ plan: "Solo", included: 4, maximumPence: 4900 });
    const upgrade = { ...terms(a, "Builder", 1), kind: "change" }, id = randomUUID();
    const applied = await command(f, a, upgrade, id);
    expect(await command(f, a, upgrade, id)).toEqual(applied);
    expect(await s.capacity()).toMatchObject({ plan: "Builder", included: 7, maximumPence: 16900 });
    await expect(command(f, a, { ...upgrade, plan: "Solo" }, id)).rejects.toThrow();
    const downgrade = await command(f, a, { ...terms(a, "Solo", 2), kind: "change" });
    expect(await s.capacity()).toMatchObject({ plan: "Builder" });
    // Privileged synthetic clock fixture: no runtime backdating capability.
    await workTenant(f.admin, a.tenantId, async db => {
      await db.query("SET LOCAL session_replication_role='replica'");
      await db.query("UPDATE app.subscription_plan_change SET effective_date='2026-09-01' WHERE tenant_id=$1", [a.tenantId]);
    });
    const sourceId = await storeMeter(f, a, calendarInput(a.tenantId, 4, 9));
    const apply = { version: "subscription-command.v1", kind: "apply_change", changeId: downgrade.changeId, sourceId, expectedRevision: 2 }, applyId = randomUUID();
    expect(await command(f, a, apply, applyId)).toMatchObject({ outcome: "applied" });
    expect(await command(f, a, apply, applyId)).toMatchObject({ outcome: "applied" });
    // MON-2A's privileged historical fixture keeps the preceding upgrade from
    // outranking the now-historical downgrade's effective date.
    await workTenant(f.admin, a.tenantId, async db => {
      await db.query("SET LOCAL session_replication_role='replica'");
      await db.query("UPDATE app.subscription_agreement_revision SET effective_date='2026-09-01' WHERE tenant_id=$1", [a.tenantId]);
    });
    expect(await s.capacity()).toMatchObject({ plan: "Solo" });
    await command(f, a, { ...terms(a, "Builder", 3), kind: "change" });
    expect(await s.capacity()).toMatchObject({ plan: "Builder" });
    expect(await s.app.require(request())).toEqual(decision);
    expect(await retained(a)).toEqual(before);
    expect(await rows(f, a, "subscription_agreement_revision")).toHaveLength(4);
  });

  it("all MON-3 end boundaries, including replayed events, preserve Final Check and export access to a locked job", async () => {
    const a = await meterCompany(f); await command(f, a, terms(a)); await boundaryLock(f, a);
    const s = service(a), before = await rows(f, a, "final_account_lock");
    const startedAt = "2026-01-01T12:00:00.000000Z", deadline = trialDeadlineV1(startedAt, approvedTrialClockV1);
    for (const kind of ["lock", "close", "second_activation", "day_90"] as const) {
      const event = { sourceId: randomUUID(), tenantId: a.tenantId, jobId: kind === "second_activation" ? randomUUID() : a.jobId,
        kind: kind === "day_90" ? "lock" as const : kind, effectiveAt: "2026-01-02T12:00:00.000000Z", recordedAt: "2026-01-02T12:00:00.000000Z" };
      const ended = reduceTrialEndsV1({ version: "trial-end-input.v1", trialId: randomUUID(), tenantId: a.tenantId, jobId: a.jobId, startedAt, deadline,
        asOf: kind === "day_90" ? deadline.deadlineAt : event.effectiveAt, events: kind === "day_90" ? [] : [event, event] });
      expect(ended.active).toBe(false);
      for (const feature of ["final_check", "accounting_export", "invoices"]) expect(await s.app.require(request(feature, a.jobId))).toMatchObject({ executable: true });
    }
    expect(await rows(f, a, "final_account_lock")).toEqual(before);
  });

  it("failed simulated payment and duplicate recording preserve documents, jobs and export eligibility", async () => {
    const { a, approved } = await approvedSimulation(f), s = service(a);
    const before = await retained(a), statements = (await readSubscription(f, a)).statements;
    await command(f, a, { version: "subscription-command.v1", kind: "execute_simulation", workId: approved.workId, expectedRevision: 1 });
    const failed = { version: "subscription-command.v1", kind: "record_simulation", workId: approved.workId, resultId: randomUUID(), outcome: "failed", expectedRevision: 1 }, id = randomUUID();
    await command(f, a, failed, id); await command(f, a, failed, id);
    expect(await s.app.require(request())).toMatchObject({ executable: true });
    expect((await readSubscription(f, a)).statements).toEqual(statements);
    expect(await retained(a)).toEqual(before);
  });

  it("track change and reversal affect company eligibility, never immutable job track or retained documents", async () => {
    const a = await meterCompany(f); await command(f, a, terms(a)); const s = service(a);
    const before = await retained(a), saved = await readSubscription(f, a);
    await changeTrack(a, "contractor", 0);
    expect(await s.app.check(request())).toMatchObject({ executable: false, reason: "track_forbidden" });
    expect(await s.app.check(request("operative_roles"))).toMatchObject({ executable: false, reason: "agreement_authority_held" });
    expect(await s.app.require(request("accounting_export", a.jobId))).toMatchObject({ executable: true });
    expect(await retained(a)).toEqual(before);
    expect(await readSubscription(f, a)).toEqual(saved);
    await changeTrack(a, "small_builder", 1);
    expect(await s.app.require(request())).toMatchObject({ executable: true });
  });

  it("missing agreement, missing/foreign job, foreign session, revocation and privilege bypass fail closed", async () => {
    const a = await meterCompany(f), b = await meterCompany(f);
    await expect(service(a).capacity()).rejects.toThrow("ENTITLEMENT_UNAVAILABLE");
    await command(f, a, terms(a));
    for (const job of [b.jobId, randomUUID()]) await expect(service(a).app.check(request("invoices", job))).rejects.toThrow("ENTITLEMENT_UNAVAILABLE");
    await expect(service({ ...a, digest: b.digest }).capacity()).rejects.toThrow("ENTITLEMENT_UNAVAILABLE");
    await expect(f.runtime.query("SELECT app.mon8_subscription_context($1,$2,NULL)", [a.tenantId, a.digest])).rejects.toThrow();
    await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [a.sessionId]);
    await expect(service(a).capacity()).rejects.toThrow("ENTITLEMENT_UNAVAILABLE");
    for (const role of ["jobguard_runtime", "jobguard_infrastructure"]) {
      expect((await f.admin.query("SELECT has_table_privilege($1,'app.subscription_agreement_revision','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed", [role])).rows[0].allowed).toBe(false);
    }
    const shadows = (await f.admin.query("SELECT oid FROM pg_class WHERE relnamespace='app'::regnamespace AND relkind='r' AND relname LIKE 'shadow_%'")).rows;
    expect(shadows.length).toBeGreaterThan(0);
    for (const shadow of shadows) expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1::oid,'SELECT') allowed", [shadow.oid])).rows[0].allowed).toBe(false);
  });
  it("session revocation while waiting for the subscription writer lock refuses the stale check", async () => {
    const a = await meterCompany(f); await command(f, a, terms(a));
    const lock = await f.admin.connect();
    await lock.query("BEGIN");
    await lock.query("SELECT pg_advisory_xact_lock(hashtextextended($1,184))", [a.tenantId]);
    const pending = service(a).capacity(), rejected = expect(pending).rejects.toThrow("ENTITLEMENT_UNAVAILABLE");
    try {
      let waiting = false;
      for (let i = 0; i < 100; i++) {
        waiting = (await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) waiting")).rows[0].waiting;
        if (waiting) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [a.sessionId]);
    } finally { await lock.query("ROLLBACK"); lock.release(); }
    await rejected;
  });

});
