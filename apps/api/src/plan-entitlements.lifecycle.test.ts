import { describe, expect, it, vi } from "vitest";
import { PlanEntitlementsApplication } from "./plan-entitlements.application.js";
import { SubscriptionPlanEntitlementAuthority } from "./plan-entitlements.lifecycle.js";
// Test-only MON-3 reducer inspection; no runtime deep import or persisted trial-end claim.
const trialCalendarUrl = new URL("../../../packages/core/src/free-first-job-calendar.ts", import.meta.url).href;
const { approvedTrialClockV1, reduceTrialEndsV1, trialDeadlineV1 } = await import(trialCalendarUrl);
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function fixture() {
  const credentials = { sessionToken: "s".repeat(32), requestedTenantId: id, csrfToken: "c".repeat(24), origin: "https://jobguard.invalid" };
  const provider = { authenticate: vi.fn().mockResolvedValue({ identityUserId: id, sessionId: id, csrfToken: credentials.csrfToken }),
    findMembership: vi.fn().mockResolvedValue({ id, identityUserId: id, tenantId: id, role: "owner", email: "owner@example.invalid" }) };
  const authority = { provider, allowedOrigin: credentials.origin, environment: vi.fn(() => "synthetic_demo"),
    resolve: vi.fn().mockResolvedValue({ credentials, digest: "a".repeat(64) }) };
  let plan = "Solo";
  const repository = { withCurrentAuthority: vi.fn(async (_context, _digest, _job, consume) =>
    consume({ version: "plan-entitlement-facts.v1", track: "small_builder", plan, catalogueVersion: "subscription_pricing_policy_v4" })) };
  const app = new PlanEntitlementsApplication(new SubscriptionPlanEntitlementAuthority(authority as never, repository, "session"),
    () => ({ version: "plan-entitlement-enablement.v1", environment: "synthetic_demo", enabled: ["invoices", "accounting_export"] }));
  return { authority, provider, repository, app, setPlan: (value: string) => { plan = value; } };
}
const request = { version: "plan-entitlement-check.v1", feature: "accounting_export" };
describe("MON-8 lifecycle session adapter", () => {
  it("re-authenticates and reads effective MON-2A authority on repeated checks", async () => {
    const f = fixture();
    const first = await f.app.require(request);
    f.setPlan("Builder");
    expect(await f.app.require(request)).toEqual(first);
    expect(f.authority.resolve).toHaveBeenCalledTimes(2);
    expect(f.provider.authenticate).toHaveBeenCalledTimes(2);
    expect(f.repository.withCurrentAuthority).toHaveBeenCalledWith(expect.objectContaining({ tenantId: id }), "a".repeat(64), undefined, expect.any(Function));
  });
  it("revoked sessions, foreign membership and production mode refuse before persisted facts", async () => {
    for (const target of ["authenticate", "findMembership"] as const) {
      const f = fixture(); f.provider[target].mockResolvedValue(null);
      await expect(f.app.check(request)).rejects.toThrow("ENTITLEMENT_UNAVAILABLE");
      expect(f.repository.withCurrentAuthority).not.toHaveBeenCalled();
    }
    const f = fixture(); f.authority.environment.mockReturnValue("production");
    await expect(f.app.check(request)).rejects.toThrow("ENTITLEMENT_UNAVAILABLE");
    expect(f.authority.resolve).not.toHaveBeenCalled();
  });
  it("does not consume client lifecycle/payment/hidden-data assertions", async () => {
    const f = fixture();
    for (const field of ["plan", "trial", "payment", "track", "hiddenSignals", "amountPence", "finalAccountLockId"]) {
      await expect(f.app.check({ ...request, [field]: true })).rejects.toThrow("INVALID_ENTITLEMENT_INPUT");
    }
    expect(f.repository.withCurrentAuthority).not.toHaveBeenCalled();
  });
  it("MON-3 lock, close, second activation and day 90 keep export and invoice features accessible", async () => {
    const f = fixture(), startedAt = "2026-01-01T12:00:00.000000Z";
    const deadline = trialDeadlineV1(startedAt, approvedTrialClockV1);
    const before = await f.app.require(request);
    for (const kind of ["lock", "close", "second_activation", "day_90"] as const) {
      const at = "2026-01-02T12:00:00.000000Z";
      const event = { sourceId: id, kind: kind === "day_90" ? "lock" as const : kind,
        tenantId: id, jobId: kind === "second_activation" ? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" : id,
        effectiveAt: at, recordedAt: at };
      const common = { version: "trial-end-input.v1" as const, trialId: id, tenantId: id, jobId: id, startedAt, deadline };
      expect(reduceTrialEndsV1({ ...common, asOf: startedAt, events: [] }).active).toBe(true);
      expect(reduceTrialEndsV1({ ...common, asOf: kind === "day_90" ? deadline.deadlineAt : at,
        events: kind === "day_90" ? [] : [event, event] }).active).toBe(false);
      expect(await f.app.require(request)).toEqual(before);
      expect(await f.app.require({ ...request, feature: "invoices" })).toMatchObject({ executable: true });
    }
  });

});
