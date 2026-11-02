import { describe, expect, it, vi } from "vitest";
import { SyntheticSyncDownloadApplication } from "./download.application.js";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const tenant = id(1), otherTenant = id(2), user = id(3), job = id(4), otherJob = id(5);
const request = { version: "sync-subscription-request.v1", requestedTenantId: tenant, profile: "contractor_assigned_jobs.v1" };
const row = (jobId = job, tenantId = tenant) => ({ tenantId, jobId, workOrderId: id(6), reference: "Synthetic job",
  priority: "routine", issuedOn: "2026-10-29", dueOn: null, openVisitId: null,
  bankAccount: "SYNTHETIC_BANK", providerToken: "SYNTHETIC_TOKEN", shadowSignals: ["SYNTHETIC_HIDDEN"], amountPence: 999,
  lockedBillId: id(90), residentName: "SYNTHETIC_PERSON" });
function fixture() {
  const snapshot = { version: "sync-server-snapshot.v1", environment: "synthetic_demo", sessionId: id(7), userId: user,
    activeTenantId: tenant, generation: 1,
    authority: { userId: user, tenantId: tenant, membershipId: id(8), role: "operative", status: "active", assignedJobIds: [job] },
    source: [row(), row(otherJob), row(job, otherTenant)] };
  let now = 1000;
  const readCurrentSession = vi.fn(async (session: string) => session === "synthetic-session" ? structuredClone(snapshot) : null);
  const app = new SyntheticSyncDownloadApplication({ readCurrentSession }, { environment: "synthetic_demo", enabled: true }, () => now);
  const subscribe = (selector = request) => app.subscribe("synthetic-session", { version: "sync-server-subscribe.v1", request: selector });
  const download = (token: string, overrides: Record<string, unknown> = {}, session = "synthetic-session") => app.download(session, {
    version: "sync-server-download.v1", request, token, afterJobId: null, pageSize: 1, delivered: [job], ...overrides,
  });
  return { app, snapshot, readCurrentSession, subscribe, download, setTime: (value: number) => { now = value; } };
}
function expectPurged(result: Awaited<ReturnType<ReturnType<typeof fixture>["download"]>>) {
  expect(result.page.outcome).toBe("refused");
  expect(result.page.rows).toEqual([]);
  expect(result.cleanup.tombstones).toEqual([{ jobId: job }]);
}

describe("M3-3 dark server download streams (without RLS)", () => {
  it.each([{}, { environment: "synthetic_demo" }, { environment: "production", enabled: true }, { environment: "pilot_no_charge", enabled: true }])("defaults off and refuses live configuration %j", async config => {
    const store = { readCurrentSession: vi.fn() };
    const app = new SyntheticSyncDownloadApplication(store, config);
    await expect(app.subscribe("session", {})).rejects.toMatchObject({ code: "SYNC_DISABLED" });
    await expect(app.download("session", {})).rejects.toMatchObject({ code: "SYNC_DISABLED" });
    expect(store.readCurrentSession).not.toHaveBeenCalled();
  });

  it.each(["operative", "supervisor"])("offers only assigned tenant rows for %s, even with unfiltered replication", async role => {
    const f = fixture(); f.snapshot.authority.role = role;
    const issued = await f.subscribe();
    const result = await f.download(issued.token);
    expect(result.page.rows).toEqual([{ jobId: job, workOrderId: id(6), reference: "Synthetic job", priority: "routine", issuedOn: "2026-10-29", dueOn: null, openVisitId: null }]);
    expect(result.cleanup.tombstones).toEqual([]);
    for (const forbidden of ["SYNTHETIC_BANK", "SYNTHETIC_TOKEN", "SYNTHETIC_HIDDEN", "amountPence", "lockedBillId", "SYNTHETIC_PERSON"]) {
      expect(JSON.stringify(result)).not.toContain(forbidden);
      expect(Buffer.from(issued.token.split(".")[0]!, "base64url").toString()).not.toContain(forbidden);
    }
  });

  it.each(["owner", "finance", "admin", "read_only", "unknown"])("refuses unspecified profile authority role %s", async role => {
    const f = fixture(); f.snapshot.authority.role = role;
    await expect(f.subscribe()).rejects.toMatchObject({ code: "SYNC_AUTHORITY_REQUIRED" });
  });

  it("keeps two authenticated users' streams separate on the same unfiltered source", async () => {
    const f = fixture();
    const second = structuredClone(f.snapshot);
    second.sessionId = id(30); second.userId = id(31); second.activeTenantId = otherTenant;
    second.authority = { ...second.authority, userId: id(31), tenantId: otherTenant, membershipId: id(32), role: "supervisor", assignedJobIds: [otherJob] };
    const source = [...f.snapshot.source, row(otherJob, otherTenant)];
    f.snapshot.source = source; second.source = source;
    const app = new SyntheticSyncDownloadApplication({ readCurrentSession: async session =>
      session === "first-session" ? f.snapshot : session === "second-session" ? second : null,
    }, { environment: "synthetic_demo", enabled: true }, () => 1000);
    const secondRequest = { ...request, requestedTenantId: otherTenant };
    const firstToken = await app.subscribe("first-session", { version: "sync-server-subscribe.v1", request });
    const secondToken = await app.subscribe("second-session", { version: "sync-server-subscribe.v1", request: secondRequest });
    const query = { version: "sync-server-download.v1", request, token: firstToken.token, afterJobId: null, pageSize: 10, delivered: [] };
    expect((await app.download("first-session", query)).page.rows.map(r => r.jobId)).toEqual([job]);
    expect((await app.download("second-session", { ...query, request: secondRequest, token: secondToken.token })).page.rows.map(r => r.jobId)).toEqual([otherJob]);
    expect((await app.download("second-session", { ...query, request: secondRequest })).page.rows).toEqual([]);
    // Same-tenant users also receive only their own assignments, never the first user's jobs.
    second.activeTenantId = tenant; second.authority.tenantId = tenant; second.generation++;
    const sameTenantToken = await app.subscribe("second-session", { version: "sync-server-subscribe.v1", request });
    expect((await app.download("second-session", { ...query, token: sameTenantToken.token })).page.rows.map(r => r.jobId)).toEqual([otherJob]);
  });

  it("refuses another tenant and injected role, query, projection and authority fields", async () => {
    const f = fixture(); const issued = await f.subscribe();
    await expect(f.subscribe({ ...request, requestedTenantId: otherTenant })).rejects.toMatchObject({ code: "SYNC_AUTHORITY_REQUIRED" });
    expectPurged(await f.download(issued.token, { request: { ...request, requestedTenantId: otherTenant } }));
    for (const key of ["role", "query", "projection", "authority", "tenantId", "environment"]) {
      await expect(f.app.subscribe("synthetic-session", { version: "sync-server-subscribe.v1", request: { ...request, [key]: "forged" } })).rejects.toMatchObject({ code: "SYNC_INVALID_INPUT" });
      await expect(f.download(issued.token, { [key]: "forged" })).rejects.toMatchObject({ code: "SYNC_INVALID_INPUT" });
    }
  });

  it("allows narrowing but never lets a token change its signed selector", async () => {
    const f = fixture(); const selected = { ...request, jobIds: [job, otherJob] };
    const issued = await f.subscribe(selected);
    expect((await f.download(issued.token, { request: selected })).page.rows.map(r => r.jobId)).toEqual([job]);
    expectPurged(await f.download(issued.token));
  });

  it("binds tokens to user, session, tenant, membership and generation", async () => {
    for (const mutate of [
      (f: ReturnType<typeof fixture>) => { f.snapshot.userId = id(21); f.snapshot.authority.userId = id(21); },
      (f: ReturnType<typeof fixture>) => { f.snapshot.sessionId = id(22); },
      (f: ReturnType<typeof fixture>) => { f.snapshot.activeTenantId = otherTenant; },
      (f: ReturnType<typeof fixture>) => { f.snapshot.authority.membershipId = id(23); },
      (f: ReturnType<typeof fixture>) => { f.snapshot.generation++; },
      (f: ReturnType<typeof fixture>) => { f.snapshot.authority.userId = id(24); },
    ]) {
      const f = fixture(); const issued = await f.subscribe(); mutate(f);
      expectPurged(await f.download(issued.token));
    }
  });

  it("revokes downloads and emits cleanup on session loss, role reversal and membership revocation", async () => {
    const f = fixture(); const issued = await f.subscribe();
    expectPurged(await f.download(issued.token, {}, "other-session"));
    f.snapshot.authority.status = "revoked";
    expectPurged(await f.download(issued.token));
    const goodSource = f.snapshot.source;
    // Source quality must not change the revoked principal's refusal or cleanup.
    f.snapshot.source = [{ ...row(), tenantId: "malformed" }];
    expectPurged(await f.download(issued.token));
    f.snapshot.source = goodSource;
    f.snapshot.authority.status = "active"; f.snapshot.authority.role = "finance";
    expectPurged(await f.download(issued.token));
    // Even another allowed role needs a fresh subscription.
    f.snapshot.authority.role = "supervisor";
    expectPurged(await f.download(issued.token));
    const renewed = await f.subscribe();
    expect((await f.download(renewed.token)).page.rows).toHaveLength(1);
  });

  it("assignment removal invalidates replay; resubscription and rebuild cannot restore it", async () => {
    const f = fixture(); const issued = await f.subscribe();
    f.snapshot.authority.assignedJobIds = [];
    expectPurged(await f.download(issued.token));
    const renewed = await f.subscribe();
    const result = await f.download(renewed.token);
    expect(result.page.rows).toEqual([]); expect(result.cleanup.tombstones).toEqual([{ jobId: job }]);
  });

  it("reauthorizing the same scope with a new generation cannot revive a revoked token", async () => {
    const f = fixture(); const issued = await f.subscribe();
    f.snapshot.authority.status = "revoked"; f.snapshot.generation++;
    expectPurged(await f.download(issued.token));
    f.snapshot.authority.status = "active"; f.snapshot.generation++;
    expectPurged(await f.download(issued.token));
    const renewed = await f.subscribe();
    expect((await f.download(renewed.token)).page.rows).toHaveLength(1);
  });

  it("hidden field changes never affect responses; malformed permitted projections fail closed", async () => {
    const f = fixture(); const issued = await f.subscribe();
    const before = await f.download(issued.token);
    f.snapshot.source[0]!.shadowSignals = ["CHANGED_SYNTHETIC_HIDDEN"];
    f.snapshot.source[0]!.bankAccount = "CHANGED_SYNTHETIC_BANK";
    expect(await f.download(issued.token)).toEqual(before);
    f.snapshot.source[0]!.priority = "invalid";
    const result = await f.download(issued.token);
    expect(result.page.reason).toBe("source_invalid"); expect(result.page.rows).toEqual([]);
  });

  it("rejects tampered, malformed, expired and future tokens without echoing token contents", async () => {
    const f = fixture(); const issued = await f.subscribe();
    const [body, signature] = issued.token.split(".");
    for (const token of ["SECRET.invalid", `${body}.AAAA`, `${body}.${signature}.extra`, `!${issued.token}`]) {
      const result = await f.download(token); expectPurged(result); expect(JSON.stringify(result)).not.toContain(token);
    }
    f.setTime(1060); expectPurged(await f.download(issued.token));
    f.setTime(999); expectPurged(await f.download(issued.token));
  });

  it("fails closed on duplicate permitted rows; other-tenant duplicate IDs never count", async () => {
    const f = fixture(); const issued = await f.subscribe();
    f.snapshot.source.push(row());
    const result = await f.download(issued.token);
    expect(result.page.reason).toBe("source_invalid"); expect(result.page.rows).toEqual([]);
    await expect(f.subscribe()).rejects.toMatchObject({ code: "SYNC_AUTHORITY_REQUIRED" });
  });

  it("supports 401-row interrupted/replayed pages without purging later pages, then tombstones deletion", async () => {
    const f = fixture();
    const jobs = Array.from({ length: 401 }, (_, i) => id(1000 + i));
    f.snapshot.authority.assignedJobIds = jobs;
    f.snapshot.source = [...jobs].reverse().map(j => row(j));
    const issued = await f.subscribe();
    const query = { pageSize: 200, delivered: jobs };
    const first = await f.download(issued.token, query);
    expect(await f.download(issued.token, query)).toEqual(first);
    expect(first.cleanup.tombstones).toEqual([]);
    const second = await f.download(issued.token, { ...query, afterJobId: first.page.nextAfterJobId });
    const third = await f.download(issued.token, { ...query, afterJobId: second.page.nextAfterJobId });
    expect([...first.page.rows, ...second.page.rows, ...third.page.rows].map(r => r.jobId)).toEqual(jobs);
    expect(third.page.nextAfterJobId).toBeNull();
    f.snapshot.source = f.snapshot.source.filter(r => r.jobId !== jobs[0]);
    const rebuilt = await f.download(issued.token, query);
    expect(rebuilt.cleanup.tombstones).toEqual([{ jobId: jobs[0] }]);
    expect(rebuilt.page.rows.some(r => r.jobId === jobs[0])).toBe(false);
  });

  it("sanitizes store failures, denies malformed snapshots, and rejects invalid cursors", async () => {
    const f = fixture(); const issued = await f.subscribe();
    await expect(f.download(issued.token, { afterJobId: "SELECT secrets", pageSize: 1001 })).rejects.toMatchObject({ code: "SYNC_INVALID_INPUT" });
    f.readCurrentSession.mockRejectedValueOnce(new Error("secret provider details"));
    await expect(f.download(issued.token)).rejects.toMatchObject({ message: "SYNC_UNAVAILABLE" });
    f.readCurrentSession.mockResolvedValueOnce(null);
    expectPurged(await f.download(issued.token));
  });
});
