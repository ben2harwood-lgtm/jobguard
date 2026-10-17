// Real PostgreSQL only. Collection is not execution; local database execution is HELD for CI.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EnterpriseDashboardError } from "@jobguard/core";
import { ContractorRepository, contractorSessionContext } from "../src/index.js";
import { EnterpriseDashboardRepository } from "../src/enterprise-dashboard-repository.js";
import { authorityCluster, authorityWorld, bounded, dashboardQuery, expireSession, GateNotObserved, observeGate,
  outcome, revocationInput, scheduledPool, storedRows, type AuthorityCluster, type AuthorityWorld } from "./enterprise-dashboard.authority-fixtures.js";

let c: AuthorityCluster;
vi.setConfig({ testTimeout: 45000, hookTimeout: 240000 });
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await authorityCluster(); });
afterAll(async () => { try { await c?.close(); } finally { vi.unstubAllEnvs(); } });
const read = (w: AuthorityWorld, pool = c.runtime) => new EnterpriseDashboardRepository(pool).read(w.context, w.session, dashboardQuery);
type Read = Awaited<ReturnType<typeof read>>;
function populated(result: Read, w: AuthorityWorld) {
  expect(result.report.totals.captured.count).toBe(1);
  expect(result.report.contributions.filter(r => r.stage === "captured").map(r => ({ job: r.jobId, extras: r.extraIds })))
    .toEqual([{ job: w.jobId, extras: [w.extraId] }]);
}
async function refuses(w: AuthorityWorld, pool = c.runtime) {
  const result = read(w, pool);
  await expect(result).rejects.toBeInstanceOf(EnterpriseDashboardError);
  await expect(result).rejects.toMatchObject({ code: "NOT_FOUND" });
}
const revokeKinds = ["grant.revoke", "membership.revoke"] as const;

describe("TESTS-DASHBOARD-AUTHORITY-1 stored authority and tenant gate", () => {
  it("[DA1] rechecks an expired stored session despite its previously verified tenant context", async () => {
    const w = await authorityWorld(c);
    populated(await read(w), w);
    await expireSession(c, w);
    const session = (await c.admin.query("SELECT expires_at<clock_timestamp() expired,revoked_at IS NULL unrevoked FROM control_plane.contractor_practice_session WHERE session_id=$1", [w.sessionRef])).rows;
    expect(session).toEqual([{ expired: true, unrevoked: true }]);
    const before = await storedRows(c, w.p.tenantId);
    await refuses(w); // Direct repository call: no fresh bridge lookup can mask a missing repository recheck.
    await expect(contractorSessionContext(c.runtime, w.session)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await storedRows(c, w.p.tenantId)).toEqual(before);
  });

  it.each(revokeKinds)("[DA2] %s holds exclusive gate first; waiting dashboard refuses after commit", async kind => {
    const w = await authorityWorld(c), input = await revocationInput(c, w, kind);
    populated(await read(w), w);
    const first = scheduledPool(c.runtimePool(`da2_revoke_${kind}`), { hold: "exclusive" });
    const second = scheduledPool(c.runtimePool(`da2_read_${kind}`));
    const revocation = outcome(new ContractorRepository(first.pool).command(w.p, input));
    let dashboard: ReturnType<typeof outcome<Read>> | undefined;
    try {
      await bounded(first.acquired, "revocation acquired exclusive gate");
      await observeGate(c, w.p.tenantId, first.pid, "ExclusiveLock", true);
      dashboard = outcome(read(w, second.pool));
      await bounded(second.attempted, "dashboard attempted shared gate");
      expect(first.pid).not.toBe(second.pid);
      await observeGate(c, w.p.tenantId, second.pid, "ShareLock", false, first.pid);
      expect(second.sourceQueries).toBe(0);
      expect(first.commits).toBe(0);
      first.resume();
      expect(await bounded(revocation, "revocation committed")).toMatchObject({ ok: true, value: { id: input.id, kind } });
      expect(first.commits).toBe(1);
      const afterRevocation = await storedRows(c, w.p.tenantId);
      expect(await bounded(dashboard, "waiting dashboard refused")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(second.sourceQueries).toBe(1);
      await refuses(w);
      expect(await storedRows(c, w.p.tenantId)).toEqual(afterRevocation);
    } finally {
      first.resume(); second.resume();
      await Promise.allSettled([revocation, ...dashboard ? [dashboard] : []]);
    }
  });

  it.each(revokeKinds)("[DA3] dashboard holds shared gate first; %s waits until the earlier read completes", async kind => {
    const w = await authorityWorld(c), input = await revocationInput(c, w, kind);
    const before = await storedRows(c, w.p.tenantId);
    const first = scheduledPool(c.runtimePool(`da3_read_${kind}`), { hold: "shared" });
    const second = scheduledPool(c.runtimePool(`da3_revoke_${kind}`));
    const dashboard = outcome(read(w, first.pool));
    let revocation: ReturnType<typeof outcome<Awaited<ReturnType<ContractorRepository["command"]>>>> | undefined;
    try {
      await bounded(first.acquired, "dashboard acquired shared gate");
      await observeGate(c, w.p.tenantId, first.pid, "ShareLock", true);
      revocation = outcome(new ContractorRepository(second.pool).command(w.p, input));
      await bounded(second.attempted, "revocation attempted exclusive gate");
      expect(first.pid).not.toBe(second.pid);
      await observeGate(c, w.p.tenantId, second.pid, "ExclusiveLock", false, first.pid);
      expect(first.sourceQueries).toBe(0);
      expect(await storedRows(c, w.p.tenantId)).toEqual(before);
      first.resume();
      const result = await bounded(dashboard, "earlier dashboard completed");
      expect(result.ok).toBe(true);
      if (!result.ok) throw result.error;
      populated(result.value, w);
      expect(first.commits).toBe(1);
      expect(await bounded(revocation, "waiting revocation committed")).toMatchObject({ ok: true, value: { id: input.id, kind } });
      const afterRevocation = await storedRows(c, w.p.tenantId);
      // Repeat through both connections as well as the reused pool; no stale-context permission survives.
      await refuses(w, first.pool); await refuses(w, second.pool); await refuses(w);
      expect(await storedRows(c, w.p.tenantId)).toEqual(afterRevocation);
    } finally {
      first.resume(); second.resume();
      await Promise.allSettled([dashboard, ...revocation ? [revocation] : []]);
    }
  });

  it("[DA4] a refused read followed by another tenant on the same backend returns only the second tenant's facts", async () => {
    const a = await authorityWorld(c), b = await authorityWorld(c);
    populated(await read(a), a); populated(await read(b), b);
    await new ContractorRepository(c.runtime).command(a.p, await revocationInput(c, a, "grant.revoke"));
    const beforeA = await storedRows(c, a.p.tenantId), beforeB = await storedRows(c, b.p.tenantId);
    const reused = scheduledPool(c.runtime); // max:1: same actual backend, verified below, no parallel checkout.
    await refuses(a, reused.pool);
    const refusedPid = reused.pid;
    const result = await read(b, reused.pool);
    expect(reused.pid).toBe(refusedPid);
    populated(result, b);
    const json = JSON.stringify(result);
    for (const forbidden of [a.p.tenantId, a.jobId, a.extraId, a.demo.teamId, a.demo.clientId, a.demo.contractId, a.demo.operativeMembershipId]) expect(json).not.toContain(forbidden);
    expect((await c.runtime.query("SELECT nullif(current_setting('app.tenant_id',true),'') tenant")).rows).toEqual([{ tenant: null }]);
    expect(await storedRows(c, a.p.tenantId)).toEqual(beforeA);
    expect(await storedRows(c, b.p.tenantId)).toEqual(beforeB);
  });

  it("[DA5] reads leave every tenant commercial/audit row unchanged; only the identified revocation writes", async () => {
    const w = await authorityWorld(c), setup = await storedRows(c, w.p.tenantId);
    expect(setup["app.extra_origin"]).toHaveLength(1);
    expect(setup["app.audit_event"]!.length).toBeGreaterThan(0);
    populated(await read(w), w); populated(await read(w), w);
    expect(await storedRows(c, w.p.tenantId)).toEqual(setup);
    const input = await revocationInput(c, w, "grant.revoke");
    await new ContractorRepository(c.runtime).command(w.p, input);
    const revoked = await storedRows(c, w.p.tenantId);
    const changed = Object.keys(setup).filter(table => JSON.stringify(setup[table]) !== JSON.stringify(revoked[table])).sort();
    expect(changed).toEqual(["app.audit_event", "app.command_receipt", "app.role_grant_revocation", "audit_control.audit_head"]);
    for (const table of ["app.audit_event", "app.command_receipt", "app.role_grant_revocation"]) {
      expect(revoked[table]).toHaveLength(setup[table]!.length + 1);
      expect(revoked[table]).toEqual(expect.arrayContaining(setup[table]!));
    }
    expect((await c.admin.query("SELECT command_type,status FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [w.p.tenantId, input.commandId])).rows)
      .toEqual([{ command_type: "contractor.grant.revoke", status: "succeeded" }]);
    expect((await c.admin.query("SELECT event_type,subject_ref FROM app.audit_event WHERE tenant_id=$1 AND id=$2", [w.p.tenantId, input.commandId])).rows)
      .toEqual([{ event_type: "contractor.grant.revoke", subject_ref: input.id }]);
    expect((await c.admin.query("SELECT grant_id FROM app.role_grant_revocation WHERE tenant_id=$1 AND id=$2", [w.p.tenantId, input.id])).rows)
      .toEqual([{ grant_id: w.viewer.grant }]);
    await refuses(w); await refuses(w);
    expect(await storedRows(c, w.p.tenantId)).toEqual(revoked);
  });

  it("[DA2 sensitivity] omitting only the dashboard gate makes the lock-order assertion fail", async () => {
    const w = await authorityWorld(c), input = await revocationInput(c, w, "grant.revoke");
    const first = scheduledPool(c.runtimePool("da_negative_revoke"), { hold: "exclusive" });
    const second = scheduledPool(c.runtimePool("da_negative_read"), { omitDashboardGate: true });
    const revocation = outcome(new ContractorRepository(first.pool).command(w.p, input));
    let dashboard: ReturnType<typeof outcome<Read>> | undefined;
    try {
      await bounded(first.acquired, "negative-control exclusive gate");
      await observeGate(c, w.p.tenantId, first.pid, "ExclusiveLock", true);
      dashboard = outcome(read(w, second.pool));
      await bounded(second.attempted, "negative-control dashboard gate attempt");
      // Same exact assertion as DA2, with a shorter bounded observation window; its failure is required.
      await expect(observeGate(c, w.p.tenantId, second.pid, "ShareLock", false, first.pid, 1000)).rejects.toBeInstanceOf(GateNotObserved);
      const result = await bounded(dashboard, "ungated real dashboard");
      expect(result.ok).toBe(true);
      if (!result.ok) throw result.error;
      populated(result.value, w);
      expect(first.commits).toBe(0);
      first.resume();
      expect(await bounded(revocation, "negative-control revocation")).toMatchObject({ ok: true });
      await refuses(w); // Real gate restored, no mocked authorisation or substituted facts.
    } finally {
      first.resume(); second.resume();
      await Promise.allSettled([revocation, ...dashboard ? [dashboard] : []]);
    }
  });
});
