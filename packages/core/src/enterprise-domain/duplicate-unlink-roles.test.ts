import { expect, it } from "vitest";
import { assertDuplicateRepair, siteOriginated, EnterpriseDomainError, enterpriseRoles } from "./index.js";
import { actor, extra, grant, group, hash, id, withKind } from "./origin.test.js";

const roleRows = [
 ["owner", true], ["admin", true], ["supervisor", true], ["surveyor", true], ["commercial_manager", true],
 ["operative", false], ["finance", false], ["read_only", false], ["client_approver", false], ["connector", false],
] as const;
const five = ["supervisor", "surveyor", "commercial_manager", "admin", "owner"] as const;
function linked(exported = false) {
 const a = extra(), b = extra({ id: id(8), duplicateOf: a.id, state: "duplicate" }); b.origin.variationId = b.id;
 const g = group([a, b]);
 return exported ? g : { ...g, members: g.members.map(e => ({ ...e, exportLineId: null, billingFacts: [] })) };
}
const repair = () => ({ kind: "unlink", reason: "generated correction", reconciliationId: null, inputFactsHash: hash(), authorization: null });
function check(g: ReturnType<typeof linked>, a: ReturnType<typeof actor>, r: unknown, allowed: boolean) {
 const before = structuredClone({ g, a, r });
 if (allowed) expect(assertDuplicateRepair(g, a, r)).toBeUndefined();
 else {
  let error: unknown;
  try { assertDuplicateRepair(g, a, r); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(EnterpriseDomainError);
  expect(error).toHaveProperty("code", "PERMISSION_DENIED");
 }
 expect({ g, a, r }).toEqual(before);
}
it.each(roleRows)("[R1] one row per role: %s before export allowed=%s", (role, allowed) => {
 expect(roleRows).toHaveLength(10); expect(enterpriseRoles).toHaveLength(10);
 expect(roleRows.map(([name]) => name).sort()).toEqual([...enterpriseRoles].sort());
 expect(new Set(roleRows.map(([name]) => name)).size).toBe(10);
 check(linked(), actor(role), repair(), allowed);
});
it.each(five)("[R2] %s is not enough without a covering grant", role => {
 check(linked(), actor(role), repair(), true);
 for (const a of [actor(role, { grants: [] }), actor(role, { grants: [grant(role, { jobId: id(99) })] }), actor(role, { grants: [grant(role, { tenantId: id(98) })] }), actor(role, { grants: [grant(role, { membershipId: id(99) })] })]) check(linked(), a, repair(), false);
});
it.each(five)("[R3] after export %s cannot un-link", role => check(linked(true), actor(role), repair(), false));
it.each([["finance", true], ["commercial_manager", true], ["owner", false], ["admin", false]] as const)("[R4] reconciliation keeps its list: %s allowed=%s", (role, allowed) => {
 const g = linked(true);
 check(g, actor(role), { kind: "reconcile", reason: "generated correction", reconciliationId: id(80), inputFactsHash: hash(), authorization: { version: "enterprise-reconciliation-authorization.v1", decisionId: id(81), action: "ReconcileExportedDuplicate", tenantId: g.tenantId, jobId: g.jobId, canonicalId: g.canonicalId, actorId: id(31), contentHash: hash(), resolution: "approved", current: true, expired: false } }, allowed);
});
// The list named senior at origin.ts line 6 also decides who may confirm a prompt, which decides whether an extra bears a fee. ENT-4c-R2 must not widen it.
it.each([
 ["supervisor", true], ["surveyor", true], ["commercial_manager", true], ["owner", false], ["admin", false],
 ["operative", false], ["finance", false], ["read_only", false], ["client_approver", false], ["connector", false],
] as const)("[R4] prompt confirmation keeps its list: %s site-originated=%s", (role, expected) => {
 const e = withKind("jobguard_surfaced_confirmed", "contractor"); e.prompt!.confirmedBy = actor(role, { membershipId: e.origin.raisingMembershipId });
 const g = group([e]), before = structuredClone(g);
 expect(siteOriginated(g)).toBe(expected); expect(g).toEqual(before);
});
