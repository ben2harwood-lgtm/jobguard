import { describe, expect, it, vi } from "vitest";
import { PlanEntitlementsApplication, type PlanEntitlementAuthorityPort } from "./plan-entitlements.application.js";

const facts = (plan = "Solo") => ({ version: "plan-entitlement-facts.v1", track: "small_builder", plan, catalogueVersion: "subscription_pricing_policy_v4" });
const request = { version: "plan-entitlement-check.v1", feature: "invoices", jobId: "10000000-0000-4000-8000-000000000001" };
function fixture() {
  let current: unknown = facts();
  const read = vi.fn<(jobId: string | undefined) => void>();
  const authority: PlanEntitlementAuthorityPort = {
    async withCurrentAuthority<T>(jobId: string | undefined, use: (raw: unknown) => T): Promise<T> {
      read(jobId);
      return use(current);
    },
  };
  const enablement = vi.fn(() => ({ version: "plan-entitlement-enablement.v1", environment: "synthetic_demo", enabled: ["invoices"] }));
  const app = new PlanEntitlementsApplication(authority, enablement);
  return { app, authority, read, enablement, setFacts: (value: unknown) => { current = value; } };
}
describe("MON-8 server port (unit evidence, no persisted proof)", () => {
  it("MON8-A03 MON8-A12 re-reads the supplied current authority on every check without caching", async () => {
    const f = fixture();
    expect(await f.app.require(request)).toMatchObject({ executable: true });
    f.setFacts({ version: "plan-entitlement-facts.v1", track: "contractor", agreementAuthority: "held" });
    await expect(f.app.require(request)).rejects.toMatchObject({ code: "ENTITLEMENT_FORBIDDEN" });
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(f.read).toHaveBeenCalledWith(request.jobId);
  });
  it("MON8-A05 invalid authority facts fail closed", async () => {
    const f = fixture();
    f.setFacts({ ...facts(), plan: "Firm" });
    await expect(f.app.check(request)).rejects.toMatchObject({ code: "INVALID_ENTITLEMENT_INPUT" });
  });
  it("MON8-A09 synthetic configuration cannot enable a live capability", async () => {
    const f = fixture();
    f.enablement.mockReturnValue({ version: "plan-entitlement-enablement.v1", environment: "production", enabled: ["invoices"] });
    await expect(f.app.require(request)).rejects.toMatchObject({ code: "INVALID_ENTITLEMENT_INPUT" });
  });
  it("MON8-A10 MON8-A11 current authorization refuses before entitlement or enablement is read", async () => {
    const f = fixture();
    for (const reason of ["missing session", "expired session", "revoked member", "foreign job", "wrong identity"]) {
      f.read.mockImplementationOnce(() => { throw new Error(reason); });
      await expect(f.app.require(request)).rejects.toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
    }
    expect(f.enablement).not.toHaveBeenCalled();
  });
  it("MON8-A11 concurrent request-scoped ports do not share a tenant result", async () => {
    const solo = fixture(), contractor = fixture();
    contractor.setFacts({ version: "plan-entitlement-facts.v1", track: "contractor", agreementAuthority: "held" });
    const results = await Promise.all([solo.app.check(request), contractor.app.check(request), solo.app.check(request)]);
    expect(results.map(r => r.executable)).toEqual([true, false, true]);
  });
  it("MON8-A13 MON8-A14 plan selection has no trial/payment restriction (actual lifecycle/read proofs held)", async () => {
    const f = fixture();
    const before = await f.app.check(request);
    f.setFacts(facts("Builder"));
    expect(await f.app.check(request)).toEqual(before);
  });
  it("MON8-A18 enablement is re-read; absent or disabled features remain unavailable", async () => {
    const f = fixture();
    expect(await f.app.require(request)).toMatchObject({ executable: true });
    f.enablement.mockReturnValue({ version: "plan-entitlement-enablement.v1", environment: "synthetic_demo", enabled: [] });
    await expect(f.app.require(request)).rejects.toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
    const defaults = new PlanEntitlementsApplication(f.authority);
    await expect(defaults.require(request)).rejects.toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
  });
  it("MON8-A22 unavailable authority exposes no database details or successful decision", async () => {
    const f = fixture();
    f.read.mockImplementation(() => { throw new Error("internal database detail"); });
    await expect(f.app.check(request)).rejects.toMatchObject({ message: "ENTITLEMENT_UNAVAILABLE", code: "ENTITLEMENT_UNAVAILABLE" });
  });
});
