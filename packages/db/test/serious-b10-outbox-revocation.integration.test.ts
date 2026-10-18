/** L054 copied from codex/sandbox/later-b28; real PostgreSQL, synthetic data only.
 * NOT RUN locally: dispatcher prohibits sockets/PostgreSQL in this sandbox.
 * The new test expects terminal cancellation instead of the reproduction's pending status.
 * No source-branch test or existing expectation is edited.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ActionExecutor, appendOutboundAction, operateOutbox, withTenant, type OutboundAction, type OutboundAdapter } from "../src/index.js";
import { auditRows, createScimHarness, fixture, memberIn, sha256, type ScimHarness, type ScimFixture } from "./scim-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

let h: ScimHarness;
beforeAll(async () => { h = await createScimHarness("jg-serious-b10-"); }, 120_000);
afterAll(async () => { if (h) await h.close(); });

async function approvedAction(f: ScimFixture) {
  const tenantId = f.principal.tenantId, memberId = f.principal.membershipId;
  const decisionId = randomUUID(), resolutionId = randomUUID(), authorizationId = randomUUID();
  const content = "Fictional owner-approved document", contentHash = sha256(content);
  // Control-role seed of exact synthetic authorization; no runtime grants are introduced.
  await h.admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'quote','fictional-document','send_quote')", [decisionId, tenantId]);
  await h.admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolutionId, tenantId, decisionId, memberId]);
  const expiresAt = new Date(Date.now() + 600_000);
  await h.admin.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'send_quote','customer@fixture.invalid',$6,1,'synthetic.v1',$7)", [authorizationId, tenantId, decisionId, resolutionId, memberId, contentHash, expiresAt]);
  const action: OutboundAction = { version: "outbound-action.v1", id: randomUUID(), authorizationId, adapter: "fake_capture", providerEffectKey: randomUUID(), actionType: "send_quote", recipient: "customer@fixture.invalid", contentHash, immutableContent: content, aggregateRevision: 1, amountPence: null, currency: null, policyVersion: "synthetic.v1", authorizationExpiresAt: expiresAt };
  const context = testTenantContext(tenantId);
  await withTenant(h.runtime, context, db => appendOutboundAction(db, tenantId, action));
  const deliver = vi.fn<OutboundAdapter["deliver"]>(async () => ({ kind: "succeeded" as const, providerReference: `synthetic:${randomUUID()}` }));
  const adapter: OutboundAdapter = { name: "fake_capture", supportsProviderDeduplication: false, deliver, reconcile: async () => "unknown" };
  const execute = () => new ActionExecutor(h.runtime, new Map([[adapter.name, adapter]]), { emit: () => undefined }).execute(context, action.id);
  const attempts = async () => (await h.admin.query<{ n: number }>("SELECT count(*)::integer n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2", [tenantId, action.id])).rows[0]!.n;
  return { action, deliver, execute, attempts };
}

describe("SERIOUS-B10 outbox revocation", () => {
  it("L054 active SSO-linked owner control actually executes an approved action", async () => {
    const f = await fixture(h);
    expect((await h.provider.authenticate(f.bound!.sessionToken))?.identityUserId).toBe(f.principal.identityUserId);
    const queued = await approvedAction(f);
    await queued.execute();
    expect(queued.deliver).toHaveBeenCalledOnce(); expect(await queued.attempts()).toBe(1);
    expect((await h.admin.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2", [f.principal.tenantId, queued.action.id])).rows[0].status).toBe("succeeded");
  });
  describe("L054 queued owner after contractor command revocation", () => {
    let observed: { calls: number; attempts: number; status: string };
    // Preserve the LATER-B28 command/SSO setup; this regression is a normal test.
    beforeAll(async () => {
      const f = await fixture(h), queued = await approvedAction(f);
      const view = await f.contractor.query(f.principal, { version: "contractor-query.v1", resource: "organisation", tenantId: f.principal.tenantId });
      await f.contractor.command(f.principal, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: view.revision, kind: "membership.revoke", membershipId: f.principal.membershipId });
      expect((await h.admin.query("SELECT count(*)::int n FROM app.contractor_membership_revocation WHERE tenant_id=$1 AND membership_id=$2", [f.principal.tenantId, f.principal.membershipId])).rows[0].n).toBe(1);
      await queued.execute();
      observed = { calls: queued.deliver.mock.calls.length, attempts: await queued.attempts(), status: (await h.admin.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2", [f.principal.tenantId, queued.action.id])).rows[0].status };
    });
    it("L054 actually authorised owner is blocked after the actual SSO revocation mechanism", () => {
      expect(observed).toEqual({ calls: 0, attempts: 0, status: "cancelled" });
    });
  });
  async function revoke(f: ScimFixture, membershipId = f.principal.membershipId) {
    const view = await f.contractor.query(f.principal, { version: "contractor-query.v1", resource: "organisation", tenantId: f.principal.tenantId });
    await f.contractor.command(f.principal, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: view.revision, kind: "membership.revoke", membershipId });
  }
  const state = async (f: ScimFixture, id: string) => (await h.admin.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2", [f.principal.tenantId, id])).rows[0].status;

  it("records a typed refusal and one chained audit event; repeat execution and retry cannot send", async () => {
    const f = await fixture(h), queued = await approvedAction(f);
    await revoke(f);
    const before = await auditRows(h, f.principal.tenantId);
    await expect(queued.execute()).resolves.toEqual({ kind: "cancelled", code: "AUTHORIZATION_REVOKED" });
    await queued.execute();
    await expect(operateOutbox(h.runtime, testTenantContext(f.principal.tenantId), queued.action.id, "retry", true)).rejects.toThrow("UNSAFE_OUTBOX_COMMAND");
    expect(queued.deliver).not.toHaveBeenCalled();
    expect(await queued.attempts()).toBe(0);
    expect(await state(f, queued.action.id)).toBe("cancelled");
    const after = await auditRows(h, f.principal.tenantId);
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)).toMatchObject({ event_type: "outbox.authorization_revoked", subject_ref: queued.action.id, actor_ref: "system:outbox", payload: { references: { outcome: "cancelled", code: "AUTHORIZATION_REVOKED" } } });
  });

  it("rechecks revocation before retrying a previously retryable delivery", async () => {
    const f = await fixture(h), queued = await approvedAction(f);
    queued.deliver.mockResolvedValueOnce({ kind: "retryable", code: "synthetic_unavailable" });
    await queued.execute();
    expect(await state(f, queued.action.id)).toBe("retryable");
    await revoke(f);
    await expect(queued.execute()).resolves.toMatchObject({ code: "AUTHORIZATION_REVOKED" });
    expect(queued.deliver).toHaveBeenCalledOnce();
    expect(await queued.attempts()).toBe(1);
    expect(await state(f, queued.action.id)).toBe("cancelled");
  });

  it.each(["authorization", "membership"] as const)("leaves work pending, undelivered, after direct %s revocation (ruling 85 covers contractor-command revocation only)", async kind => {
    const f = await fixture(h), queued = await approvedAction(f);
    if (kind === "authorization") await h.admin.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.principal.tenantId, queued.action.authorizationId]);
    else await h.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.principal.tenantId, f.principal.membershipId]);
    await expect(queued.execute()).resolves.toBeUndefined();
    expect(queued.deliver).not.toHaveBeenCalled();
    expect(await queued.attempts()).toBe(0);
    expect(await state(f, queued.action.id)).toBe("pending");
  });

  it("a contractor revocation in flight when dispatch starts is seen after the seed-54 lock: nothing is delivered", async () => {
    const f = await fixture(h), queued = await approvedAction(f), tenantId = f.principal.tenantId;
    // Stand-in for contractor_admin_command: take the same per-tenant seed-54 lock, write the revocation, hold the transaction open.
    const revoker = await h.admin.connect();
    let dispatch: ReturnType<typeof queued.execute> | undefined;
    try {
      await revoker.query("BEGIN");
      await revoker.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,54))", [tenantId]);
      await revoker.query("INSERT INTO app.contractor_membership_revocation(tenant_id,id,membership_id) VALUES($1,$2,$3)", [tenantId, randomUUID(), f.principal.membershipId]);
      const revokerPid = (await revoker.query<{ pid: number }>("SELECT pg_backend_pid() pid")).rows[0]!.pid;
      dispatch = queued.execute();
      void dispatch.catch(() => undefined);
      // Explicit ordering: dispatch must wait for the revoker before reading authority.
      const deadline = Date.now() + 10_000;
      for (;;) {
        const blocked = await h.admin.query("SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))", [revokerPid]);
        if (blocked.rowCount) break;
        if (Date.now() >= deadline) throw new Error("Dispatch did not block behind contractor revocation");
        await new Promise(resolve => setImmediate(resolve));
      }
      expect(queued.deliver).not.toHaveBeenCalled();
      await revoker.query("COMMIT");
      await expect(dispatch).resolves.toEqual({ kind: "cancelled", code: "AUTHORIZATION_REVOKED" });
    } finally {
      await revoker.query("ROLLBACK").catch(() => undefined);
      revoker.release();
      await dispatch?.catch(() => undefined);
    }
    expect(queued.deliver).not.toHaveBeenCalled();
    expect(await queued.attempts()).toBe(0);
    expect(await state(f, queued.action.id)).toBe("cancelled");
  });

  it("ignores another member's revocation in the same tenant", async () => {
    const f = await fixture(h), queued = await approvedAction(f);
    const otherUser = randomUUID();
    await h.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [otherUser]);
    const other = await memberIn(h, otherUser, f.principal.tenantId);
    await revoke(f, other);
    await queued.execute();
    expect(queued.deliver).toHaveBeenCalledOnce();
    expect(await state(f, queued.action.id)).toBe("succeeded");
  });

  it("cannot read or cancel another tenant's revoked action", async () => {
    const f = await fixture(h), other = await fixture(h), queued = await approvedAction(f);
    await revoke(f);
    const adapter: OutboundAdapter = { name: "fake_capture", supportsProviderDeduplication: false, deliver: queued.deliver, reconcile: async () => "unknown" };
    await new ActionExecutor(h.runtime, new Map([[adapter.name, adapter]]), { emit: () => undefined }).execute(testTenantContext(other.principal.tenantId), queued.action.id);
    expect(await state(f, queued.action.id)).toBe("pending");
    expect(queued.deliver).not.toHaveBeenCalled();
    await queued.execute();
    expect(await state(f, queued.action.id)).toBe("cancelled");
  });

  it("leaves a revoked action for the executor that owns its adapter", async () => {
    const f = await fixture(h), queued = await approvedAction(f);
    await revoke(f);
    const before = await auditRows(h, f.principal.tenantId);
    await new ActionExecutor(h.runtime, new Map(), { emit: () => undefined }).execute(testTenantContext(f.principal.tenantId), queued.action.id);
    expect(await state(f, queued.action.id)).toBe("pending");
    expect(await auditRows(h, f.principal.tenantId)).toEqual(before);
    await queued.execute();
    expect(await state(f, queued.action.id)).toBe("cancelled");
    expect(queued.deliver).not.toHaveBeenCalled();
  });

  it.each(["executing", "outcome_unknown", "succeeded", "dead_letter", "cancelled"])("preserves %s history after revocation", async status => {
    const f = await fixture(h), queued = await approvedAction(f);
    // Table-owner fault seed represents work already claimed or completed, not queued work.
    await h.admin.query("UPDATE app.action_outbox SET status=$3 WHERE tenant_id=$1 AND id=$2", [f.principal.tenantId, queued.action.id, status]);
    await revoke(f);
    const before = await auditRows(h, f.principal.tenantId);
    await queued.execute();
    expect(await state(f, queued.action.id)).toBe(status);
    expect(await auditRows(h, f.principal.tenantId)).toEqual(before);
    expect(queued.deliver).not.toHaveBeenCalled();
    expect(await queued.attempts()).toBe(0);
  });

});
