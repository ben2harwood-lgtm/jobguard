import { expect, it } from "vitest";
import * as core from "./index.js";
const id = "11111111-1111-4111-8111-111111111111";
const facts = (status: string | null = "active") => ({ version: "contractor-entitlement-authority.v1", environment: "synthetic_demo", tenantId: id, membershipId: id, identityUserId: id, assignment: { id, revision: 1, track: "contractor", agreementReference: `synthetic-agreement:${id}` }, status: status === null ? null : { id, revision: 1, status } });
function evaluate(input: unknown, feature = "work_orders", enablement?: unknown) {
 const fn = Reflect.get(core, "evaluateContractorEntitlement");
 expect(fn, "separately versioned evaluator exists").toBeTypeOf("function");
 const before = JSON.stringify(input);
 try { return fn(input, feature, enablement); } finally { expect(JSON.stringify(input)).toBe(before); }
}
it("only an active agreement permits contractor eligibility", () => {
 for (const status of [null, "inactive", "suspended"]) expect(evaluate(facts(status)).newWorkEligible).toBe(false);
 expect(evaluate(facts()).newWorkEligible).toBe(true);
 expect(evaluate({ ...facts(), assignment: null, status: null }).newWorkEligible).toBe(false);
 expect(evaluate({ ...facts(), assignment: { ...facts().assignment, track: "small_builder" } }).newWorkEligible).toBe(false);
});
it("suspension refuses new work", () => {
 expect(evaluate(facts("suspended"))).toMatchObject({ newWorkEligible: false, executable: false, retainedRead: "requires_current_scope_permission" });
});
it("expanded billing belongs to no plan", () => {
 expect(() => evaluate(facts(), "expanded_billing")).toThrow("INVALID_ENTITLEMENT_INPUT");
 for (const plan of ["Solo", "Builder", "Firm", "Contractor"]) expect(() => evaluate({ ...facts(), plan })).toThrow("INVALID_ENTITLEMENT_INPUT");
});
it("execution remains disabled without server enablement", () => {
 for (const feature of ["operative_roles", "site_origin_capture", "approval_chains", "work_orders", "sso"]) {
  expect(evaluate(facts(), feature)).toMatchObject({ newWorkEligible: true, executable: false });
  expect(evaluate(facts(), feature, { version: "contractor-entitlement-enablement.v1", environment: "synthetic_demo", enabled: [feature] }).executable).toBe(true);
 }
});
it("unknown and forged authority fields refuse", () => {
 for (const input of [{ ...facts(), active: true }, { ...facts(), environment: "production" }, { ...facts(), status: { ...facts().status, forged: true } }, { ...facts(), status: { id, revision: 1, status: "signed" } }, { ...facts(), assignment: null }, { ...facts(), assignment: { ...facts().assignment, agreementReference: "signed" } }]) expect(() => evaluate(input)).toThrow("INVALID_ENTITLEMENT_INPUT");
});
