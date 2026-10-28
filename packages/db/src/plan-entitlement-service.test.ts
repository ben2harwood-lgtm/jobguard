import { describe, expect, it, vi } from "vitest";
import { planEntitlementFeatures } from "@jobguard/core";
import type { TenantTransaction } from "./tenant-context.js";
import { ssoRepositoryError } from "./enterprise-identity-repository.js";
import { requireServerEntitlement, serverEntitlement } from "./plan-entitlement-service.js";
const actor = "00000000-0000-4000-8000-000000000001";
function fixture() {
  let available = true;
  const query = vi.fn(async (_sql: string, values: unknown[]) => ({ rows: [{ decision: {
    version: "plan-entitlement-decision.v1", environment: "synthetic_demo", feature: values[1],
    entitlement: available ? "included" : "held", executable: available,
    reason: available ? "available" : "agreement_authority_held",
  } }] }));
  return { db: { $client: { query } } as unknown as TenantTransaction, query, revoke: () => { available = false; } };
}
describe("MON-8 server transaction service (query-double unit evidence)", () => {
  it("sends every feature to the same SQL service with the bound actor", async () => {
    const f = fixture();
    for (const feature of planEntitlementFeatures) {
      await requireServerEntitlement(f.db, actor, feature);
      expect(f.query).toHaveBeenLastCalledWith("SELECT app.mon8_feature_decision($1,$2,$3) decision", [actor, feature, "new_work"]);
    }
  });
  it("does not reuse an earlier positive result after an authority change", async () => {
    const f = fixture();
    const earlier = await serverEntitlement(f.db, actor, "operative_roles");
    expect(earlier.executable).toBe(true);
    f.revoke();
    await expect(requireServerEntitlement(f.db, actor, "operative_roles")).rejects.toMatchObject({ code: "ENTITLEMENT_FORBIDDEN" });
    expect(f.query).toHaveBeenCalledTimes(2);
  });
  it("retained reads use the explicit internal purpose, with no client entitlement flags", async () => {
    const f = fixture();
    await requireServerEntitlement(f.db, actor, "accounting_export", "retained_read");
    expect(f.query).toHaveBeenCalledWith(expect.any(String), [actor, "accounting_export", "retained_read"]);
    await expect(serverEntitlement(f.db, actor, "staff_tier" as never)).rejects.toThrow();
    expect(f.query).toHaveBeenCalledTimes(1);
  });
  it("a missing, mismatched or malformed database decision never grants a feature", async () => {
    const f = fixture();
    for (const decision of [null, { executable: true }, {
      version: "plan-entitlement-decision.v1", environment: "synthetic_demo", feature: "sso",
      entitlement: "included", executable: true, reason: "available",
    }]) {
      f.query.mockResolvedValueOnce({ rows: [{ decision }] } as never);
      await expect(serverEntitlement(f.db, actor, "work_orders")).rejects.toThrow();
    }
  });
});

it("MON-8 entitlement refusals retain the established SSO public error codes", () => {
  expect(ssoRepositoryError({code:"42501",message:"FORBIDDEN"}).code).toBe("SSO_FORBIDDEN");
  expect(ssoRepositoryError({code:"42501",message:"MODE_FORBIDDEN"}).code).toBe("SSO_ROUTE_BLOCKED");
});
