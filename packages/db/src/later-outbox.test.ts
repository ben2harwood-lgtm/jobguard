import { workerProtocolFixture } from "./worker-protocol-test-fixture.js";
import { outboundWorkerPool } from "./worker-pool.js";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ActionExecutor, operateOutbox, reconcileOutbox, type FakeDeliveryResult, type OutboundAdapter } from "./outbox.js";
import { verifiedTenantContextForQueuedJob, verifiedTenantContextFromMembership, type AuthenticatedMembership } from "./tenant-context.js";

vi.mock("./worker-pool.js", () => ({ outboundWorkerPool: vi.fn() }));
function fixture(status = "pending", result: FakeDeliveryResult = { kind: "succeeded", providerReference: "synthetic" }, bound = false) {
  const tenant = randomUUID(), membershipId = randomUUID();
  const context = bound ? verifiedTenantContextFromMembership(
    { tenantId: tenant, membershipId, identityUserId: randomUUID() } as AuthenticatedMembership,
    { kind: "real", credential: "a".repeat(64) },
  ) : verifiedTenantContextForQueuedJob(tenant);
  const f = workerProtocolFixture({ tenant_id: tenant, status }, bound ? membershipId : undefined);
  vi.mocked(outboundWorkerPool).mockResolvedValue(f.pool);
  const adapter: OutboundAdapter = { name: "fake_capture", supportsProviderDeduplication: false,
    deliver: vi.fn(async () => { expect(f.state.inTransaction).toBe(false); return result; }),
    reconcile: vi.fn(async () => { expect(f.state.inTransaction).toBe(false); return "not_found" as const; }) };
  return { ...f, context, id: f.row.id, adapter, audit: () => f.audit,
    failAudit: () => { f.state.auditFailure = true; }, pause: () => { f.state.enabled = false; },
    execute: () => new ActionExecutor(f.pool, new Map([[adapter.name, adapter]]), { emit: () => undefined }).execute(context, f.row.id) };
}

describe("LATER-B9 synthetic outcome protocol", () => {
  it.each(["pending", "retryable"])("M0-13a pause preserves %s work and creates no attempt or audit write", async status => {
    const f = fixture(status); const before = { ...f.row }; f.pause();
    await f.execute(); await f.execute();
    expect(f.row).toEqual(before); expect(f.audit()).toHaveLength(0);
    expect(f.adapter.deliver).not.toHaveBeenCalled();
    expect(f.query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/u.test(sql))).toBe(false);
  });
  it("L019 safeRetry boolean cannot release outcome_unknown", async () => {
    const f = fixture("outcome_unknown");
    await expect(operateOutbox(f.pool, f.context, f.id, "retry", true)).rejects.toThrow("UNSAFE_OUTBOX_COMMAND");
    expect(f.row.status).toBe("outcome_unknown"); expect(f.audit()).toHaveLength(0);
  });
  it("L027 future next_attempt_at prevents claim", async () => {
    const f = fixture("retryable"); f.row.next_attempt_at = new Date("2099-01-01");
    await f.execute(); expect(f.adapter.deliver).not.toHaveBeenCalled(); expect(f.audit()).toHaveLength(0);
  });
  it.each<FakeDeliveryResult>([{ kind: "succeeded", providerReference: "synthetic" }, { kind: "retryable", code: "temporary" }, { kind: "outcome_unknown", code: "timeout" }])("L020 each committed outcome has claim and result audit events: $kind", async result => {
    const f = fixture("pending", result); await f.execute();
    expect(f.row.status).toBe(result.kind); expect(f.audit()).toHaveLength(2);
    expect(f.audit()[1]!.eventType).toBe(`outbox.${result.kind}`);
  });
  it("seals an unbound queue outcome through the checked worker", async () => {
    const f = fixture();
    await f.execute();
    expect(f.audit().map(event => event.eventType)).toEqual(["outbox.claimed", "outbox.succeeded"]);
    expect(f.audit()[1]!.payload.references).toMatchObject({ auditActorKind: "system" });
    expect(f.query).toHaveBeenCalledWith("SELECT app.claim_worker_action($1::uuid,$2::text[]) AS claim", [f.id, [f.adapter.name]]);
    expect(f.query).toHaveBeenCalledWith(
      "SELECT app.complete_worker_action($1::uuid,$2::uuid,$3::text,$4::text,$5::text) AS completed",
      [f.id, f.token, "succeeded", "synthetic", null],
    );
    expect(f.query.mock.calls.some(([sql]) => sql.includes("FROM app.append_audit("))).toBe(false);
  });
  it.each(["execute", "reconcile"] as const)("routes bound %s through the separate worker without appending as the request actor", async operation => {
    const f = fixture(operation === "reconcile" ? "outcome_unknown" : "pending", undefined, true);
    if (operation === "execute") await f.execute();
    else await reconcileOutbox(f.pool, f.context, f.id, f.adapter);
    expect(f.audit().at(-1)!.payload.references).toMatchObject({auditActorKind: "system"});
    expect(f.query.mock.calls.some(([sql]) => sql.includes("FROM app.append_audit("))).toBe(false);
    expect(outboundWorkerPool).toHaveBeenCalledWith(f.pool);
  });
  it.each(["cancel", "retry"] as const)("routes bound %s through ordinary append without the worker probe", async operation => {
    const f = fixture("retryable", undefined, true);
    await operateOutbox(f.pool, f.context, f.id, operation);
    expect(f.audit()).toHaveLength(1);
    expect(f.audit()[0]!.payload.references).toMatchObject({auditActorKind:"bound_member"});
    expect(f.query.mock.calls.some(([sql]) => sql.includes("to_regprocedure") || sql.includes("FROM app.lp6e_append_outbox_audit("))).toBe(false);
    expect(f.query.mock.calls.some(([sql]) => sql.includes("FROM app.append_audit("))).toBe(true);
  });
  it("L020 expired authorization refusal has one audit event", async () => {
    const f = fixture(); f.row.authorization_expires_at = new Date(0); await f.execute();
    expect(f.row.status).toBe("cancelled"); expect(f.audit()).toHaveLength(1); expect(f.adapter.deliver).not.toHaveBeenCalled();
  });
  it("L020 stale claim becomes unknown with one audit event", async () => {
    const f = fixture("executing"); await f.execute(); expect(f.row.status).toBe("outcome_unknown"); expect(f.audit()).toHaveLength(1);
  });
  it.each([false, true])("L020 audit failure rolls back claim (bound=%s)", async bound => {
    const f = fixture("pending", undefined, bound); f.failAudit(); await expect(f.execute()).rejects.toThrow("synthetic audit failure");
    expect(f.row.status).toBe("pending"); expect(f.audit()).toHaveLength(0);
  });
  it.each(["retry", "cancel"] as const)("L020 operator %s commits one audit event", async command => {
    const f = fixture("retryable"); await operateOutbox(f.pool, f.context, f.id, command); expect(f.audit()).toHaveLength(1);
  });
  it("L019 L020 durable reconciliation permits retry and records provider evidence once", async () => {
    const f = fixture("outcome_unknown"); await reconcileOutbox(f.pool, f.context, f.id, f.adapter);
    expect(f.row.status).toBe("retryable"); expect(f.audit()).toHaveLength(1);
    expect(f.audit()[0]!.payload).toMatchObject({ references: { reconciliation: "not_found" } });
    await expect(reconcileOutbox(f.pool, f.context, f.id, f.adapter)).rejects.toThrow("NOT_RECONCILABLE");
    expect(f.audit()).toHaveLength(1);
  });
  it("L019 mismatched adapter cannot establish reconciliation evidence", async () => {
    const f = fixture("outcome_unknown");
    await expect(reconcileOutbox(f.pool, f.context, f.id, { ...f.adapter, name: "fake_other" })).rejects.toThrow("NOT_RECONCILABLE");
    expect(f.adapter.reconcile).not.toHaveBeenCalled();
  });
});
