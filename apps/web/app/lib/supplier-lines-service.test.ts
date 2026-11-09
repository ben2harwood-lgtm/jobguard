import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ authorize: vi.fn(), query: vi.fn(), create: vi.fn(), read: vi.fn(), correct: vi.fn() }));
vi.mock("@jobguard/db", () => ({
  authorizePracticeJob: state.authorize,
  withTenant: async (_pool: unknown, _context: unknown, fn: (db: unknown) => unknown) => fn({ $client: { query: state.query } }),
  SupplierLineCorrectionRepository: class { create = state.create; read = state.read; correct = state.correct; },
}));
import { SupplierLinesService } from "./supplier-lines-service";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const auth = { context: { tenantId: id(1) }, membershipId: id(2), identityUserId: id(3), digest: "server-session-digest" };
const actor = { membershipId: id(2), identityUserId: id(3) };
const service = new SupplierLinesService({} as Pool, "session-token");
const query = { version: "supplier-lines-read.v1" };
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue(auth); state.query.mockResolvedValue({ rows: [] }); });
async function confirmation() {
  const view = await service.read(id(4), query);
  return { version: "supplier-lines-confirm.v1", commandId: id(5), snapshotId: view.snapshotId,
    lineVersionIds: [...view.facts.orders, ...view.facts.receipts, ...view.facts.bills].map(row => row.versionId) };
}
describe("supplier line session boundary", () => {
  it("reading proposals confirms nothing and exposes group flags even when sources all match", async () => {
    const view = await service.read(id(4), query);
    expect(view.confirmed).toBe(false); expect(view.result.unresolved).toEqual([]);
    expect(view.result.groups[0]!.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["short_delivery", "billed_above_received"]));
    expect(state.create).not.toHaveBeenCalled(); expect(state.correct).not.toHaveBeenCalled();
    expect(state.authorize).toHaveBeenCalledWith(expect.anything(), "session-token", id(4));
    expect(state.query).toHaveBeenCalledWith(expect.any(String), [id(1), id(4)]);
  });
  it("requires every exact source version once, rejecting omissions, duplicates and invented IDs", async () => {
    const command = await confirmation();
    for (const lineVersionIds of [command.lineVersionIds.slice(1), [...command.lineVersionIds, command.lineVersionIds[0]], [id(99)]])
      await expect(service.command(id(4), { ...command, lineVersionIds })).rejects.toThrow("MATCH_SOURCE_VERSION_CONFLICT");
    expect(state.create).not.toHaveBeenCalled();
  });
  it("confirms only server-owned facts with the session tenant and actor", async () => {
    const command = await confirmation(); state.create.mockResolvedValue({ revision: 0 });
    await service.command(id(4), command);
    expect(state.create).toHaveBeenCalledWith(auth.context, actor, expect.objectContaining({ facts: expect.objectContaining({ tenantId: id(1), jobId: id(4), mappings: [] }) }));
    for (const extra of [{ tenantId: id(99) }, { actor }, { facts: {} }, { confirmed: true }])
      await expect(service.command(id(4), { ...command, ...extra })).rejects.toThrow();
    expect(state.create).toHaveBeenCalledTimes(1);
  });
  it("checks session job access before snapshot reads, confirmation and correction/replay", async () => {
    const command = await confirmation(); state.authorize.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(service.read(id(99), { ...query, snapshotId: id(6) })).rejects.toThrow("NOT_FOUND");
    await expect(service.command(id(99), command)).rejects.toThrow("NOT_FOUND");
    await expect(service.command(id(99), { version: "supplier-line-correction.v1", commandId: id(5), snapshotId: id(6), expectedRevision: 0, sourceVersionId: id(7), orderVersionId: null })).rejects.toThrow("NOT_FOUND");
    expect(state.read).not.toHaveBeenCalled(); expect(state.create).not.toHaveBeenCalled(); expect(state.correct).not.toHaveBeenCalled();
  });
  it("scopes historical snapshot lookup to the authorized tenant/job and keeps revision conflicts", async () => {
    await service.read(id(4), { ...query, snapshotId: id(6), revision: 2 });
    expect(state.read).toHaveBeenCalledWith(auth.context, actor, { version: "supplier-line-match-read.v1", jobId: id(4), snapshotId: id(6), revision: 2 });
    state.correct.mockRejectedValue(Object.assign(new Error("MATCH_REVISION_CONFLICT"), { code: "MATCH_REVISION_CONFLICT" }));
    await expect(service.command(id(4), { version: "supplier-line-correction.v1", commandId: id(5), snapshotId: id(6), expectedRevision: 0, sourceVersionId: id(7), orderVersionId: null })).rejects.toThrow("MATCH_REVISION_CONFLICT");
    expect(state.correct).toHaveBeenCalledWith(auth.context, actor, id(4), expect.objectContaining({ expectedRevision: 0, orderVersionId: null }));
  });
  it("rejects tenant query fields and malformed history requests", async () => {
    await expect(service.read(id(4), { ...query, tenantId: id(99) })).rejects.toThrow();
    await expect(service.read(id(4), { ...query, revision: -1 })).rejects.toThrow();
    await expect(service.read(id(4), { ...query, revision: 1 })).rejects.toThrow("MATCH_NOT_FOUND");
  });
});
