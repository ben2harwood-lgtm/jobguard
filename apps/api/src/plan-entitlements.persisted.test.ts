import { expect, it, vi } from "vitest";
import { PlanEntitlementsApplication } from "./plan-entitlements.application.js";
const request = { version: "plan-entitlement-check.v1", feature: "operative_roles" };
const decision = { version: "plan-entitlement-decision.v1", environment: "synthetic_demo", feature: "operative_roles", entitlement: "included", executable: true, reason: "available" };
it("MON-8 persisted authority is consumed anew, including a replay after downgrade", async () => {
  let current: unknown = decision;
  const read = vi.fn();
  const port = { async withCurrentDecision<T>(request: unknown, consume: (raw: unknown) => T): Promise<T> { read(request); return consume(current); } };
  const app = new PlanEntitlementsApplication(port);
  expect(await app.require(request)).toEqual(decision);
  current = { ...decision, entitlement: "held", executable: false, reason: "agreement_authority_held" };
  await expect(app.require(request)).rejects.toMatchObject({ code: "ENTITLEMENT_FORBIDDEN" });
  expect(read).toHaveBeenCalledTimes(2);
});
it("MON-8 forged input refuses before persisted authority; mismatched decisions also refuse", async () => {
  const read = vi.fn();
  const port = { async withCurrentDecision<T>(request: unknown, consume: (raw: unknown) => T): Promise<T> { read(request); return consume({ ...decision, feature: "sso" }); } };
  const app = new PlanEntitlementsApplication(port);
  await expect(app.require({ ...request, track: "contractor", agreement: "active" })).rejects.toMatchObject({ code: "INVALID_ENTITLEMENT_INPUT" });
  expect(read).not.toHaveBeenCalled();
  await expect(app.require(request)).rejects.toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
});
