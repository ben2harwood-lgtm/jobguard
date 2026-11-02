import { afterEach, describe, expect, it, vi } from "vitest";
import type { TenantTransaction } from "./tenant-context.js";
import { outboundActionV1Schema } from "./outbox.js";
import { commercialOutboundClaimsEnabled } from "./commercial-outbound-pause.js";

afterEach(() => vi.unstubAllEnvs());
const fixture = (rows: unknown[] = [{ enabled: true }]) => {
  const query = vi.fn(async () => ({ rows }));
  return { query, db: { $client: { query } } as unknown as TenantTransaction };
};
describe("deployment commercial outbound override", () => {
  it("request bodies cannot introduce pause, deployment mode or approval fields", () => {
    const action = { version: "outbound-action.v1", id: "98000000-0000-4000-8000-000000000001",
      authorizationId: "97000000-0000-4000-8000-000000000001", adapter: "fake_capture",
      providerEffectKey: "synthetic", actionType: "send_quote", recipient: null,
      contentHash: "a".repeat(64), immutableContent: "Synthetic", aggregateRevision: 1,
      amountPence: null, currency: null, policyVersion: "synthetic.v1", authorizationExpiresAt: new Date("2099-01-01") };
    expect(outboundActionV1Schema.safeParse(action).success).toBe(true);
    for (const field of ["paused", "deploymentMode", "JOBGUARD_COMMERCIAL_OUTBOUND", "resumeApprovedBy"]) {
      expect(outboundActionV1Schema.safeParse({ ...action, [field]: "enabled" }).success).toBe(false);
    }
  });
  it("deployment pause cannot be overridden by an enabled database latch", async () => {
    vi.stubEnv("JOBGUARD_COMMERCIAL_OUTBOUND", "paused");
    const f = fixture();
    expect(await commercialOutboundClaimsEnabled(f.db)).toBe(false);
    expect(f.query).not.toHaveBeenCalled();
  });
  it.each([{ rows: [] }, { rows: [{ enabled: false }] }, { rows: [{ enabled: "true" }] }])("missing or non-boolean authority fails closed: $rows", async ({ rows }) => {
    vi.stubEnv("JOBGUARD_COMMERCIAL_OUTBOUND", "enabled");
    expect(await commercialOutboundClaimsEnabled(fixture(rows).db)).toBe(false);
  });
  it("invalid deployment mode fails closed", async () => {
    vi.stubEnv("JOBGUARD_COMMERCIAL_OUTBOUND", "unpause");
    const f = fixture();
    await expect(commercialOutboundClaimsEnabled(f.db)).rejects.toThrow("INVALID_COMMERCIAL_OUTBOUND_MODE");
    expect(f.query).not.toHaveBeenCalled();
  });
  it("database failure cannot release claims", async () => {
    vi.stubEnv("JOBGUARD_COMMERCIAL_OUTBOUND", "enabled");
    const f = fixture(); f.query.mockRejectedValueOnce(new Error("unavailable"));
    await expect(commercialOutboundClaimsEnabled(f.db)).rejects.toThrow("unavailable");
  });
});
