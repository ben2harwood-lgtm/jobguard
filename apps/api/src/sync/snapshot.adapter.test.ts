import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { SyntheticSyncSnapshotAdapter, type SyntheticSnapshotProvider } from "./snapshot.adapter.js";
import { SyntheticSyncDownloadApplication } from "./download.application.js";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const tenant = id(1), user = id(2), job = id(3), otherJob = id(4), otherTenant = id(5);
const request = { version: "sync-subscription-request.v1", requestedTenantId: tenant, profile: "contractor_assigned_jobs.v1" };
const row = (jobId: string, tenantId = tenant) => ({ tenantId, jobId, workOrderId: id(6), reference: "Synthetic",
  priority: "routine", issuedOn: "2026-10-29", dueOn: null, openVisitId: null,
  shadow: "HIDDEN", bank: "BANK", lockedBill: "LOCKED", secret: "SECRET", resident: "PERSON" });

function fixture(transactionTenantId?: string | null) {
  const snapshot = { version: "sync-provider-snapshot.v1", environment: "synthetic_demo", sessionId: id(7), userId: user,
    activeTenantId: tenant, authorityRevision: 1,
    authority: { userId: user, tenantId: tenant, membershipId: id(8), role: "operative", status: "active", assignedJobIds: [job] },
    source: [row(job), row(otherJob), row(job, otherTenant)] };
  // Explicit deterministic checkpoint fake; real SQL, concurrency and restart proofs live in the DB suite.
  const checkpoints = new Map<string, { revision: number; schema: number; hash: string; generation: number }>();
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("current_setting")) return { rows: [{ tenant_id: transactionTenantId === undefined
      ? snapshot.activeTenantId : transactionTenantId }] };
    const [u, revision, schema, hash] = values as [string, number, number, string];
    const key = `${snapshot.activeTenantId}:${u}`, previous = checkpoints.get(key);
    if (previous && (revision < previous.revision || schema < previous.schema || (revision === previous.revision && hash !== previous.hash))) throw Error("private database details");
    const generation = previous ? previous.generation + Number(revision > previous.revision || schema > previous.schema) : 1;
    checkpoints.set(key, { revision, schema, hash, generation });
    return { rows: [{ generation: String(generation) }] };
  });
  const provider: SyntheticSnapshotProvider = { withCurrentSession: async (session, read) => session === "synthetic-session"
    ? read(structuredClone(snapshot), { query } as unknown as Pick<PoolClient, "query">) : null };
  const create = (schemaVersion = 1) => {
    const store = new SyntheticSyncSnapshotAdapter(provider, { environment: "synthetic_demo", enabled: true, schemaVersion });
    return new SyntheticSyncDownloadApplication(store, { environment: "synthetic_demo", enabled: true }, () => 1000);
  };
  const subscribe = (app = create()) => app.subscribe("synthetic-session", { version: "sync-server-subscribe.v1", request });
  const download = (token: string, app = create(), overrides = {}) => app.download("synthetic-session", {
    version: "sync-server-download.v1", request, token, delivered: [job], afterJobId: null, pageSize: 10, ...overrides });
  return { snapshot, query, provider, checkpoints, create, subscribe, download };
}

function purged(result: Awaited<ReturnType<ReturnType<typeof fixture>["download"]>>) {
  expect(result.resync).toBe("required"); expect(result.page.rows).toEqual([]);
  expect(result.cleanup.tombstones).toEqual([{ jobId: job }]);
}

describe("M3-3 authenticated snapshot adapter (dark fake provider)", () => {
  it.each([otherTenant, null, ""])("refuses mismatched or missing transaction tenant %j before checkpoint mutation", async tenantId => {
    const f = fixture(tenantId);
    const store = new SyntheticSyncSnapshotAdapter(f.provider, { environment: "synthetic_demo", enabled: true, schemaVersion: 1 });
    await expect(store.readCurrentSession("synthetic-session")).rejects.toMatchObject({ code: "SYNC_AUTHORITY_REQUIRED" });
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(f.query.mock.calls[0]?.[0]).toContain("current_setting('app.tenant_id'");
    expect(f.checkpoints.size).toBe(0);
  });

  it.each([{}, { environment: "synthetic_demo" }, { environment: "production", enabled: true, schemaVersion: 1 },
    { environment: "pilot_no_charge", enabled: true, schemaVersion: 1 }])("refuses non-enabled/live use before the provider %j", async config => {
    const provider = { withCurrentSession: vi.fn() };
    await expect(new SyntheticSyncSnapshotAdapter(provider, config).readCurrentSession("session")).rejects.toMatchObject({ code: "SYNC_DISABLED" });
    expect(provider.withCurrentSession).not.toHaveBeenCalled();
  });

  it.each(["operative", "supervisor"])("serves %s through the scoped gate only; restart/replay preserve generation", async role => {
    const f = fixture(); f.snapshot.authority.role = role;
    const token = await f.subscribe(); const first = await f.download(token.token);
    expect(first.page.rows.map(r => r.jobId)).toEqual([job]); expect(first.resync).toBe("none");
    expect(await f.download(token.token, f.create())).toEqual(first);
    expect((await f.subscribe()).token).toBe(token.token);
    expect([...f.checkpoints.values()][0]?.generation).toBe(1);
    for (const value of ["HIDDEN", "BANK", "SECRET", "LOCKED", "PERSON"]) expect(JSON.stringify(first)).not.toContain(value);
    expect(JSON.stringify(f.query.mock.calls)).not.toContain("HIDDEN");
  });

  it("invalidates revoke/regrant and allowed-role reversals, including unobserved intermediate states", async () => {
    const f = fixture(); const old = await f.subscribe();
    f.snapshot.authority.status = "revoked"; f.snapshot.authorityRevision++;
    purged(await f.download(old.token));
    f.snapshot.authority.status = "active"; f.snapshot.authorityRevision++;
    purged(await f.download(old.token));
    const active = await f.subscribe();
    f.snapshot.authority.role = "finance"; f.snapshot.authorityRevision++;
    // Regrant before any download: the lifecycle counter still prevents ABA replay.
    f.snapshot.authority.role = "operative"; f.snapshot.authorityRevision++;
    purged(await f.download(active.token));
    expect((await f.download((await f.subscribe()).token)).page.rows).toHaveLength(1);
  });

  it("schema upgrade advances durably, forces resync and refuses old-server downgrade", async () => {
    const f = fixture(); const old = await f.subscribe(); const upgraded = f.create(2);
    purged(await f.download(old.token, upgraded));
    const next = await f.subscribe(upgraded);
    expect((await f.download(next.token, upgraded)).page.rows).toHaveLength(1);
    await expect(f.subscribe(f.create(1))).rejects.toMatchObject({ message: "SYNC_UNAVAILABLE" });
    expect([...f.checkpoints.values()][0]?.generation).toBe(2);
  });

  it("keeps user/tenant checkpoints distinct and cannot revive a token after switching back", async () => {
    const f = fixture(); const old = await f.subscribe();
    f.snapshot.activeTenantId = otherTenant; f.snapshot.authority.tenantId = otherTenant; f.snapshot.authorityRevision++;
    purged(await f.download(old.token));
    f.snapshot.activeTenantId = tenant; f.snapshot.authority.tenantId = tenant; f.snapshot.authorityRevision++;
    purged(await f.download(old.token));
    f.snapshot.userId = id(20); f.snapshot.authority.userId = id(20); f.snapshot.sessionId = id(21);
    purged(await f.download(old.token));
    expect((await f.download((await f.subscribe()).token)).page.rows.map(r => r.jobId)).toEqual([job]);
    expect(f.checkpoints.size).toBe(3);
  });

  it("edited tokens, foreign selectors and wrong-job requests never widen a snapshot", async () => {
    const f = fixture(); const issued = await f.subscribe();
    purged(await f.download(`${issued.token.slice(0, -5)}AAAAA`));
    purged(await f.download(issued.token, f.create(), { request: { ...request, requestedTenantId: otherTenant } }));
    const narrowed = { ...request, jobIds: [otherJob] };
    const token = await f.create().subscribe("synthetic-session", { version: "sync-server-subscribe.v1", request: narrowed });
    expect((await f.download(token.token, f.create(), { request: narrowed })).page.rows).toEqual([]);
    f.snapshot.authority.assignedJobIds = []; f.snapshot.authorityRevision++;
    purged(await f.download(issued.token));
    expect((await f.download((await f.subscribe()).token)).page.rows).toEqual([]);
  });

  it("rejects same revision/different scope, stale revisions and mismatched server authority without leaking details", async () => {
    const f = fixture(); await f.subscribe();
    f.snapshot.authority.role = "supervisor";
    await expect(f.subscribe()).rejects.toMatchObject({ message: "SYNC_UNAVAILABLE" });
    f.snapshot.authority.role = "operative"; f.snapshot.authorityRevision = 0;
    await expect(f.subscribe()).rejects.toMatchObject({ message: "SYNC_UNAVAILABLE" });
    f.snapshot.authority.userId = id(44);
    await expect(f.subscribe()).rejects.toMatchObject({ message: "SYNC_UNAVAILABLE" });
  });

  it("source deletion gives tombstones without generation churn; hidden changes are invisible", async () => {
    const f = fixture(); const issued = await f.subscribe(); const before = await f.download(issued.token);
    f.snapshot.source[0]!.shadow = "CHANGED";
    expect(await f.download(issued.token)).toEqual(before);
    f.snapshot.source = [];
    const result = await f.download(issued.token);
    expect(result.page.rows).toEqual([]); expect(result.cleanup.tombstones).toEqual([{ jobId: job }]);
    expect([...f.checkpoints.values()][0]?.generation).toBe(1);
  });
});
