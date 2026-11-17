import { describe, expect, it, vi } from "vitest";
import { PlanEntitlementsApplication, planEntitlementHttpFailure } from "./plan-entitlements.application.js";

const facts = { version: "plan-entitlement-facts.v1", track: "small_builder", plan: "Solo", catalogueVersion: "subscription_pricing_policy_v4" };
const request = { version: "plan-entitlement-check.v1", feature: "invoices" };
function fixture() {
  const read = vi.fn<(jobId: string | undefined) => void>();
  const authority = {
    async withCurrentAuthority<T>(jobId: string | undefined, use: (raw: unknown) => T): Promise<T> {
      read(jobId);
      return use(facts);
    },
  };
  const app = new PlanEntitlementsApplication(authority, () => ({ version: "plan-entitlement-enablement.v1", environment: "synthetic_demo", enabled: ["invoices"] }));
  return { app, read };
}
describe("MON-8 request boundary", () => {
  it("MON8-A04 forged client authority cannot change an entitlement for any feature", async () => {
    const f = fixture();
    for (const feature of ["watchdog", "final_check", "invoices", "recovery_cases", "pay_now", "accounting_export", "operative_roles", "site_origin_capture", "approval_chains", "work_orders", "sso"]) {
      for (const field of ["tenantId", "track", "plan", "agreement", "role", "enabled", "payment", "trial", "entitlements", "capacity", "hiddenSignals"]) {
        await expect(f.app.require({ ...request, feature, [field]: true })).rejects.toMatchObject({ code: "INVALID_ENTITLEMENT_INPUT" });
      }
    }
    expect(f.read).not.toHaveBeenCalled();
  });
  it("MON8-A05 malformed requests fail before the authority port", async () => {
    const f = fixture();
    for (const raw of [null, {}, { ...request, version: "v2" }, { ...request, feature: "expanded_billing" }, { ...request, jobId: "invalid" }]) await expect(f.app.check(raw)).rejects.toMatchObject({ code: "INVALID_ENTITLEMENT_INPUT" });
    expect(f.read).not.toHaveBeenCalled();
  });
  it("MON8-A06 MON8-A07 small-builder requests cannot require operative or site-origin execution", async () => {
    const f = fixture();
    for (const feature of ["operative_roles", "site_origin_capture"]) {
      try { await f.app.require({ ...request, feature }); expect.fail("expected refusal"); }
      catch (error) { expect(planEntitlementHttpFailure(error)).toEqual({ status: 403, body: { version: "plan-entitlement-error.v1", code: "ENTITLEMENT_FORBIDDEN" } }); }
    }
  });
  it("MON8-A22 unexpected failures have the merged version/code refusal shape and no private text", () => {
    expect(planEntitlementHttpFailure(new Error("private detail"))).toEqual({ status: 503, body: { version: "plan-entitlement-error.v1", code: "ENTITLEMENT_UNAVAILABLE" } });
  });
});
