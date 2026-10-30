import { describe, expect, it } from "vitest";
import { parseReleaseInventory, paymentRailDeclarations, releaseRecordV1Schema } from "./release-inventory.js";

const fixture = () => parseReleaseInventory({
  version: "release-inventory.v1",
  policies: Array.from({ length: 16 }, (_, i) => ({
    id: `D${String(i + 1).padStart(2, "0")}`, record: "fixture:decision",
    policyVersion: "fixture:policy-v1", status: "proposed", gate: "fixture:gate",
    enabled: false, releaseRecordId: null,
  })),
  rails: Object.entries(paymentRailDeclarations).map(([id, declaration]) => ({ id, gate: declaration.gate, enabled: false, releaseRecordId: null })),
  releaseRecords: [],
});
type Inventory = ReturnType<typeof fixture>;

// Entirely fictional approval values exercise the format; they grant no authority.
function approvedFixture(railId: keyof typeof paymentRailDeclarations = "success_fee_stripe") {
  const inventory = fixture();
  const declaration = paymentRailDeclarations[railId];
  const approval = { status: "approved" as const, approver: "fixture:reviewer", approvedAt: "2026-10-30T12:00:00Z", evidence: "fixture:approval" };
  const release = releaseRecordV1Schema.parse({
    version: "release-record.v1", id: "fixture:release", commit: "a".repeat(40),
    environment: "production_billing", phase: "bounded_smoke", track: declaration.track,
    tenantIds: ["11111111-1111-4111-8111-111111111111"], jurisdictions: ["fixture:jurisdiction"],
    enabledRailIds: [railId], policies: [], gates: [{ ...approval, id: declaration.gate }],
    consentEvidence: "fixture:consent", sandboxAcceptanceEvidence: "fixture:sandbox",
    rollbackDisablePlan: "fixture:disable", retroactivePilotBilling: false,
  });
  for (const policy of inventory.policies) {
    if (!(declaration.policies as readonly string[]).includes(policy.id)) continue;
    policy.enabled = true;
    policy.status = "approved";
    policy.releaseRecordId = release.id;
    release.policies.push({ ...approval, id: policy.id, policyVersion: policy.policyVersion });
  }
  const rail = inventory.rails.find(r => r.id === railId)!;
  rail.enabled = true;
  rail.releaseRecordId = release.id;
  inventory.releaseRecords.push(release);
  return inventory;
}

describe("M4-23 offline policy/rail release inventory", () => {
  it("rejects an undeclared rail, including object prototype names", () => {
    for (const id of ["new_bank_rail", "toString", "__proto__"]) {
      const raw = fixture();
      raw.rails.push({ id, gate: "G4-S", enabled: false, releaseRecordId: null });
      expect(() => parseReleaseInventory(raw)).toThrow(/Undeclared rail/u);
    }
  });

  it("rejects a weakened declared gate even while the rail is disabled", () => {
    const raw = fixture();
    raw.rails[0]!.gate = "G0";
    expect(() => parseReleaseInventory(raw)).toThrow(/Wrong declared gate/u);
  });

  it("rejects enablement without a release record or without the matching gate record", () => {
    const raw = fixture();
    raw.rails[0]!.enabled = true;
    expect(() => parseReleaseInventory(raw)).toThrow();
    raw.rails[0]!.releaseRecordId = "missing";
    expect(() => parseReleaseInventory(raw)).toThrow(/Missing release record/u);
    const approved = approvedFixture();
    approved.releaseRecords[0]!.gates = [];
    expect(() => parseReleaseInventory(approved)).toThrow();
  });

  it.each(Object.keys(paymentRailDeclarations) as (keyof typeof paymentRailDeclarations)[])("accepts a fully bound fictional %s release without mutation", id => {
    const raw = approvedFixture(id);
    const before = structuredClone(raw);
    expect(parseReleaseInventory(raw)).toEqual(before);
    expect(raw).toEqual(before);
  });

  const attacks: [string, (raw: Inventory) => void][] = [
    ["wrong track", raw => { raw.releaseRecords[0]!.track = "contractor"; }],
    ["wrong gate", raw => { raw.releaseRecords[0]!.gates[0]!.id = "G4-C"; }],
    ["revoked gate", raw => { raw.releaseRecords[0]!.gates[0]!.status = "revoked"; }],
    ["superseded policy", raw => { raw.policies[0]!.status = "superseded"; }],
    ["proposed policy", raw => { raw.policies[0]!.status = "proposed"; }],
    ["wrong version", raw => { raw.releaseRecords[0]!.policies[0]!.policyVersion = "old-version"; }],
    ["revoked policy approval", raw => { raw.releaseRecords[0]!.policies[0]!.status = "revoked"; }],
    ["missing required policy", raw => { raw.releaseRecords[0]!.policies.pop(); }],
    ["missing policy inventory row", raw => { raw.policies.pop(); }],
    ["missing rail inventory row", raw => { raw.rails.pop(); }],
    ["duplicate policy", raw => { raw.policies.push(raw.policies[0]!); }],
    ["duplicate rail", raw => { raw.rails.push(raw.rails[0]!); }],
    ["duplicate release", raw => { raw.releaseRecords.push(raw.releaseRecords[0]!); }],
    ["duplicate approval", raw => { raw.releaseRecords[0]!.policies.push(raw.releaseRecords[0]!.policies[0]!); }],
    ["unbound rail", raw => { raw.releaseRecords[0]!.enabledRailIds = ["undeclared"]; }],
    ["general release without reconciled smoke review", raw => { raw.releaseRecords[0]!.phase = "general"; }],
    ["unscoped tenant population", raw => { raw.releaseRecords[0]!.tenantIds = []; }],
    ["unscoped jurisdiction", raw => { raw.releaseRecords[0]!.jurisdictions = []; }],
    ["absent consent", raw => { raw.releaseRecords[0]!.consentEvidence = " "; }],
    ["absent rollback plan", raw => { raw.releaseRecords[0]!.rollbackDisablePlan = ""; }],
  ];
  it.each(attacks)("rejects %s", (_label, attack) => {
    const raw = approvedFixture();
    attack(raw);
    expect(() => parseReleaseInventory(raw)).toThrow();
  });

  it("rejects sandbox evidence presented as a production release and retroactive pilot billing", () => {
    const release = approvedFixture().releaseRecords[0]!;
    for (const environment of ["synthetic_demo", "provider_sandbox", "pilot_no_charge"]) {
      expect(() => releaseRecordV1Schema.parse({ ...release, environment })).toThrow();
    }
    expect(() => releaseRecordV1Schema.parse({ ...release, retroactivePilotBilling: true })).toThrow();
    expect(() => releaseRecordV1Schema.parse({ ...release, enabled: true })).toThrow();
    expect(() => releaseRecordV1Schema.parse({ ...release, version: "release-record.v2" })).toThrow();
    expect(() => releaseRecordV1Schema.parse({ ...release, phase: "general", reconciledSmokeReview: "fixture:review" })).not.toThrow();
  });

});
