import { describe, expect, it, vi } from "vitest";
import { LocalMinioWormStorage, SyntheticRetentionWorkflow, type SyntheticWormCommand, type WormVersion } from "./worm.js";
const tenantId = "10000000-0000-4000-8000-000000000001";
const actorId = "20000000-0000-4000-8000-000000000001";
const now = new Date("2026-10-29T10:00:00.000Z");
const context = { tenantId, actorId, retentionOfficer: true };
function command(action: "retain" | "hold" | "release" = "retain"): SyntheticWormCommand {
  const key = `synthetic/tenants/${tenantId}/evidence/one`;
  return { schemaVersion: 1, commandId: "30000000-0000-4000-8000-000000000001", tenantId, actorId,
    evidence: { tenantId, key, versionId: "version-one", status: "verified", synthetic: true }, action,
    retentionClass: "synthetic_evidence", retainUntil: "2026-10-30T10:00:00.000Z",
    approval: { resolution: "approved", tenantId, actorId, key, versionId: "version-one", action,
      retentionClass: "synthetic_evidence", retainUntil: "2026-10-30T10:00:00.000Z",
      policyVersion: "synthetic_d07_v1", expiresAt: "2026-10-29T11:00:00.000Z" } };
}
function setup() {
  const storage = { read: vi.fn(async () => ({ retainUntil: null as string | null, held: false })),
    retain: vi.fn(async (_version: WormVersion, _until: string) => {}), hold: vi.fn(async (_version: WormVersion, _held: boolean) => {}) };
  return { storage, workflow: new SyntheticRetentionWorkflow(storage, true) };
}
describe("dark D07 retention workflow", () => {
  it("is disabled by default, even for synthetic records", async () => {
    const { storage } = setup();
    await expect(new SyntheticRetentionWorkflow(storage).execute(command(), context, now)).rejects.toMatchObject({ code: "DARK_ONLY" });
    expect(storage.read).not.toHaveBeenCalled();
  });
  it("retains the exact approved version and collapses concurrent replay", async () => {
    const { workflow, storage } = setup();
    await Promise.all([workflow.execute(command(), context, now), workflow.execute(command(), context, now)]);
    expect(storage.retain).toHaveBeenCalledExactlyOnceWith({ tenantId, key: command().evidence.key, versionId: "version-one" }, command().retainUntil);
    expect(workflow.events).toHaveLength(1);
    const changed = command(); changed.evidence.versionId = "new-version"; changed.approval.versionId = "new-version";
    await expect(workflow.execute(changed, context, now)).rejects.toMatchObject({ code: "REPLAY_CONFLICT" });
  });
  it("requires separate exact approvals for hold and release, without shortening retention", async () => {
    const { workflow, storage } = setup();
    storage.read.mockResolvedValue({ retainUntil: "2026-11-01T10:00:00.000Z", held: true });
    await workflow.execute(command("hold"), context, now);
    const release = command("release"); release.commandId = "30000000-0000-4000-8000-000000000002";
    await workflow.execute(release, context, now);
    expect(storage.hold.mock.calls.map(c => c[1])).toEqual([true, false]);
    expect(storage.retain).not.toHaveBeenCalled();
    const retain = command(); retain.commandId = "30000000-0000-4000-8000-000000000003";
    await expect(workflow.execute(retain, context, now)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it.each([
    (c: SyntheticWormCommand) => { c.tenantId = "10000000-0000-4000-8000-000000000002"; },
    (c: SyntheticWormCommand) => { c.evidence.tenantId = "10000000-0000-4000-8000-000000000002"; },
    (c: SyntheticWormCommand) => { c.approval.versionId = "other-version"; },
    (c: SyntheticWormCommand) => { c.approval.action = "release"; },
    (c: SyntheticWormCommand) => { c.approval.retainUntil = "2026-10-30T09:00:00.000Z"; },
    (c: SyntheticWormCommand) => { c.approval.expiresAt = now.toISOString(); },
    (c: SyntheticWormCommand) => { c.evidence.key = `synthetic/tenants/${tenantId}/../other`; },
    (c: SyntheticWormCommand) => { c.evidence.versionId = "null"; },
  ])("refuses a substituted tenant, object, approval or bad input (%#)", async mutate => {
    const { workflow, storage } = setup(); const c = command(); mutate(c);
    await expect(workflow.execute(c, context, now)).rejects.toThrow();
    expect(storage.read).not.toHaveBeenCalled(); expect(storage.retain).not.toHaveBeenCalled();
  });
  it("refuses real data, non-officers and indefinite fixture retention", async () => {
    const { workflow, storage } = setup();
    await expect(workflow.execute({ ...command(), evidence: { ...command().evidence, synthetic: false } }, context, now)).rejects.toThrow();
    await expect(workflow.execute(command(), { ...context, retentionOfficer: false }, now)).rejects.toThrow();
    const c = command(); c.retainUntil = c.approval.retainUntil = "2099-01-01T00:00:00.000Z";
    await expect(workflow.execute(c, context, now)).rejects.toThrow();
    expect(storage.read).not.toHaveBeenCalled();
  });
  it("records an unknown outcome and refuses blind retry", async () => {
    const { workflow, storage } = setup(); storage.hold.mockRejectedValue(new Error("lost response"));
    await expect(workflow.execute(command("hold"), context, now)).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    await expect(workflow.execute(command("hold"), context, now)).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(storage.hold).toHaveBeenCalledTimes(1);
    expect(workflow.events[0]?.outcome).toBe("outcome_unknown");
  });
});
describe("local-only storage gate", () => {
  const config = { S3_ENDPOINT: "http://127.0.0.1:9000", S3_BUCKET: "synthetic-worm", S3_ACCESS_KEY_ID: "fake", S3_SECRET_ACCESS_KEY: "fake" };
  it("defaults off and refuses remote endpoints and ordinary buckets", () => {
    expect(() => new LocalMinioWormStorage(config)).toThrow("DARK_ONLY");
    expect(() => new LocalMinioWormStorage({ ...config, S3_ENDPOINT: "https://s3.eu-west-2.amazonaws.com" }, true)).toThrow("DARK_ONLY");
    expect(() => new LocalMinioWormStorage({ ...config, S3_BUCKET: "evidence-private" }, true)).toThrow("DARK_ONLY");
  });
});
