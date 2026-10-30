import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { AccountingExportRepository, storedAccountingExportV1 } from "../src/accounting-export-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { pushStoredAccountingExport, FakeAccountingExportInbox } from "../../../apps/api/src/accounting-export.persisted.js";
import { FakeCodatAdapter } from "../../../apps/api/src/accounting-export.fake.js";
import { AccountingExportSandbox } from "../../../apps/api/src/accounting-export.sandbox.js";
import { ctx, scope, source, consent } from "../../../apps/api/src/accounting-export.test-fixtures.js";
function setup(status = "pending") {
 const adapter = new FakeCodatAdapter();
 const artifact = new AccountingExportSandbox(adapter, [source], [consent], true).preview(ctx, scope, 100).artifact;
 const entry = { version: 1, sourceId: source.sourceId, reference: "a".repeat(64), previewHash: "b".repeat(64), artifact,
  status, attemptId: status === "pending" ? null : randomUUID(), attempts: 0, externalId: null, qualifyingRecoveryProof: false };
 let observed: unknown[] | undefined;
 const observe = vi.fn(async () => { observed = adapter.find(entry.reference, scope); });
 const inbox = { adapter, observe } as unknown as FakeAccountingExportInbox;
 const execute = vi.fn(async (_context: unknown, _digest: string, op: string, _source: string, raw?: unknown) => {
  const input = raw as { attemptId: string };
  if (op === "claim") { entry.status = "outcome_unknown"; entry.attemptId = input.attemptId; entry.attempts++; }
  if (op === "reconcile") {
   if (!observed) throw new Error("EXPORT_OBSERVATION_REQUIRED");
   entry.status = observed.length ? "pushed" : "confirmed_absent";
  }
  return structuredClone(entry);
 });
 const repository = { execute } as unknown as AccountingExportRepository;
 const push = () => pushStoredAccountingExport(repository, testTenantContext(randomUUID()), "c".repeat(64), source.sourceId, inbox);
 return { adapter, execute, push, entry, observe };
}
it("claim commits unknown before create and transport failure leaves it durable", async () => {
 const f = setup(); f.adapter.next = "unknown_after";
 expect(await f.push()).toMatchObject({ status: "outcome_unknown", attempts: 1 });
 expect(f.execute.mock.calls.map(c => c[2])).toEqual(["read", "claim"]);
 expect(f.adapter.pushes).toBe(1);
 expect(await f.push()).toMatchObject({ status: "pushed" });
 expect(f.execute.mock.calls.map(c => c[2])).toEqual(["read", "claim", "read", "reconcile"]);
 expect(f.adapter.pushes).toBe(1);
});
it("confirmed absence stays visible and never authorizes another create", async () => {
 const f = setup("outcome_unknown");
 expect(await f.push()).toMatchObject({ status: "confirmed_absent" });
 expect(f.adapter.pushes).toBe(0);
 expect(await f.push()).toMatchObject({ status: "confirmed_absent" });
 expect(f.adapter.pushes).toBe(0);
});
it("claim rejection prevents all provider calls", async () => {
 const f = setup(); f.execute.mockImplementation(async (_c, _d, op) => {
  if (op === "claim") throw new Error("EXPORT_RECONCILE_REQUIRED");
  return structuredClone(f.entry);
 });
 await expect(f.push()).rejects.toThrow("EXPORT_RECONCILE_REQUIRED");
 expect(f.adapter.pushes).toBe(0);
});
it("existing imports reconcile without another create; paid cannot become recovery proof", async () => {
 const f = setup();
 f.adapter.objects.push({ id: "demo-existing", tenantId: ctx.tenantId, reference: f.entry.reference,
  contentHash: f.entry.previewHash, paid: true, payload: f.entry.artifact.target });
 await f.push(); expect(f.adapter.pushes).toBe(0);
 expect(storedAccountingExportV1.parse(f.entry).qualifyingRecoveryProof).toBe(false);
 expect(storedAccountingExportV1.safeParse({ ...f.entry, qualifyingRecoveryProof: true }).success).toBe(false);
});
it("boundary schemas refuse injected paid/proof facts before acquiring a connection", async () => {
 const connect = vi.fn(); const repo = new AccountingExportRepository({ connect } as never);
 for (const raw of [ { version: 1, attemptId: randomUUID(), paid: true },
  { version: 1, attemptId: randomUUID(), qualifyingRecoveryProof: true }, { version: 2, attemptId: randomUUID() } ]) {
  await expect(repo.execute(testTenantContext(randomUUID()), "c".repeat(64), "claim", source.sourceId, raw)).rejects.toThrow("EXPORT_INVALID_INPUT");
 }
 expect(connect).not.toHaveBeenCalled();
});

it("reconcile rejects caller-supplied matches before acquiring a connection", async () => {
 const connect = vi.fn(); const repo = new AccountingExportRepository({ connect } as never);
 for (const matches of [[], [{ id: "demo-forged" }]]) {
  await expect(repo.execute(testTenantContext(randomUUID()), "c".repeat(64), "reconcile", source.sourceId,
   { version: 1, attemptId: randomUUID(), matches })).rejects.toThrow("EXPORT_INVALID_INPUT");
 }
 expect(connect).not.toHaveBeenCalled();
});

it("lookup failure preserves unknown outcome and blocks another push", async () => {
 const f = setup(); f.adapter.next = "unknown_before";
 expect(await f.push()).toMatchObject({ status: "outcome_unknown" });
 f.observe.mockRejectedValue(new Error("lookup unavailable"));
 await expect(f.push()).rejects.toThrow("lookup unavailable");
 expect(f.entry.status).toBe("outcome_unknown");
 expect(f.adapter.pushes).toBe(1);
 expect(f.execute.mock.calls.filter(c => c[2] === "reconcile")).toHaveLength(0);
});

function inboxFixture() {
 const f = setup("outcome_unknown"), context = testTenantContext(randomUUID());
 const tenantId = `demo-${context.tenantId}`;
 f.entry.artifact.scope.tenantId = tenantId;
 f.entry.artifact.scope.mapping.tenantId = tenantId;
 f.entry.artifact.source.tenantId = tenantId;
 const entry = storedAccountingExportV1.parse(f.entry);
 const query = vi.fn(async () => ({ rowCount: 1 }));
 const inbox = new FakeAccountingExportInbox({ query } as never, f.adapter);
 return { ...f, context, entry, query, inbox };
}
it("trusted inbox derives absence from a successful lookup bound to the stored attempt", async () => {
 const f = inboxFixture();
 await f.inbox.observe(f.context, f.entry);
 expect(f.query).toHaveBeenCalledOnce();
 const [, args] = f.query.mock.calls[0]! as unknown as [string, unknown[]];
 expect(args).toEqual([f.context.tenantId, expect.any(String), f.entry.attemptId, "[]",
  f.entry.sourceId, f.entry.reference, JSON.stringify(f.entry.artifact)]);
});
it("trusted inbox refuses wrong tenant or missing attempt before recording", async () => {
 const f = inboxFixture();
 await expect(f.inbox.observe(testTenantContext(randomUUID()), f.entry)).rejects.toThrow("reference_conflict");
 await expect(f.inbox.observe(f.context, { ...f.entry, attemptId: null })).rejects.toThrow("reference_conflict");
 expect(f.query).not.toHaveBeenCalled();
});
it("failed or malformed provider lookup cannot record an empty observation", async () => {
 const f = inboxFixture();
 vi.spyOn(f.adapter, "find").mockImplementation(() => { throw new Error("lookup unavailable"); });
 await expect(f.inbox.observe(f.context, f.entry)).rejects.toThrow("lookup unavailable");
 vi.mocked(f.adapter.find).mockReturnValue([{ id: "demo-invalid" }] as never);
 await expect(f.inbox.observe(f.context, f.entry)).rejects.toThrow();
 expect(f.query).not.toHaveBeenCalled();
});
it("inbox failure cannot report a recorded observation", async () => {
 const f = inboxFixture(); f.query.mockResolvedValue({ rowCount: 0 });
 await expect(f.inbox.observe(f.context, f.entry)).rejects.toThrow("EXPORT_OBSERVATION_REQUIRED");
});
