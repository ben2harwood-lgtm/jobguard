import { z } from "zod";

const text = z.string().trim().min(1);
const decisionId = z.string().regex(/^D(?:0[1-9]|1[0-6])$/u);
const gateId = z.enum(["G0", "G1", "G2", "G3", "G4-S", "G4-C", "G5"]);
const track = z.enum(["small-builder", "contractor"]);

// Declaration of supported release scopes, not runtime switches or approval evidence.
const smallBuilderPolicies = ["D01", "D02", "D03", "D04", "D05", "D09", "D11", "D12", "D13"];
const contractorPolicies = ["D02", "D04", "D05", "D12", "D16"];
export const paymentRailDeclarations = {
  subscription_stripe: { track: "small-builder", gate: "G4-S", policies: smallBuilderPolicies, task: "MON-2B" },
  success_fee_stripe: { track: "small-builder", gate: "G4-S", policies: smallBuilderPolicies, task: "M4-12" },
  success_fee_gocardless: { track: "small-builder", gate: "G4-S", policies: smallBuilderPolicies, task: "M4-15" },
  contractor_fee_stripe: { track: "contractor", gate: "G4-C", policies: contractorPolicies, task: "M4-12" },
  contractor_fee_gocardless: { track: "contractor", gate: "G4-C", policies: contractorPolicies, task: "M4-15" },
  customer_pay_now: { track: "small-builder", gate: "G4-S", policies: [...smallBuilderPolicies, "D06", "D10"], task: "MON-6" },
} as const;

const approval = z.strictObject({
  status: z.enum(["approved", "revoked", "superseded"]),
  approver: text,
  approvedAt: z.iso.datetime(),
  evidence: text,
});
export const releaseRecordV1Schema = z.strictObject({
  version: z.literal("release-record.v1"),
  id: text,
  commit: z.string().regex(/^[a-f0-9]{40}$/u),
  environment: z.literal("production_billing"),
  phase: z.enum(["bounded_smoke", "general"]),
  track,
  tenantIds: z.array(z.uuid()).min(1),
  jurisdictions: z.array(text).min(1),
  enabledRailIds: z.array(text).min(1),
  policies: z.array(approval.extend({ id: decisionId, policyVersion: text })),
  gates: z.array(approval.extend({ id: gateId })).min(1),
  consentEvidence: text,
  sandboxAcceptanceEvidence: text,
  rollbackDisablePlan: text,
  reconciledSmokeReview: text.optional(),
  retroactivePilotBilling: z.literal(false),
}).superRefine((record, ctx) => {
  if (record.phase === "general" && !record.reconciledSmokeReview) {
    ctx.addIssue({ code: "custom", message: "General release requires reconciled live smoke review" });
  }
});

const inventorySchema = z.strictObject({
  version: z.literal("release-inventory.v1"),
  policies: z.array(z.strictObject({
    id: decisionId, record: text, policyVersion: text,
    status: z.enum(["proposed", "approved", "superseded"]),
    gate: text, enabled: z.boolean(), releaseRecordId: text.nullable(),
  })),
  rails: z.array(z.strictObject({ id: text, gate: gateId, enabled: z.boolean(), releaseRecordId: text.nullable() })),
  releaseRecords: z.array(releaseRecordV1Schema),
});

/** Offline release evidence validation only. Never consumed as execution authority. */
export function parseReleaseInventory(input: unknown) {
  return inventorySchema.superRefine((inventory, ctx) => {
    const deny = (message: string) => ctx.addIssue({ code: "custom", message });
    const unique = (ids: string[], label: string) => {
      if (new Set(ids).size !== ids.length) deny(`Duplicate ${label}`);
    };
    unique(inventory.policies.map(p => p.id), "policy");
    unique(inventory.rails.map(r => r.id), "rail");
    unique(inventory.releaseRecords.map(r => r.id), "release record");
    const policies = new Map(inventory.policies.map(p => [p.id, p]));
    const releases = new Map(inventory.releaseRecords.map(r => [r.id, r]));
    for (let n = 1; n <= 16; n++) {
      if (!policies.has(`D${String(n).padStart(2, "0")}`)) deny(`Missing policy D${String(n).padStart(2, "0")}`);
    }
    for (const id of Object.keys(paymentRailDeclarations)) {
      if (!inventory.rails.some(r => r.id === id)) deny(`Missing declared rail ${id}`);
    }
    for (const entry of [...inventory.policies, ...inventory.rails]) {
      if (entry.enabled !== (entry.releaseRecordId !== null)) deny(`Enablement/reference mismatch for ${entry.id}`);
      if (entry.releaseRecordId && !releases.has(entry.releaseRecordId)) deny(`Missing release record for ${entry.id}`);
    }
    for (const policy of inventory.policies) {
      if (!policy.enabled) continue;
      const release = releases.get(policy.releaseRecordId!);
      const approved = release?.policies.some(p => p.id === policy.id && p.policyVersion === policy.policyVersion && p.status === "approved");
      if (policy.status !== "approved" || !approved) deny(`Missing exact policy approval for ${policy.id}`);
      const requiredGate = release?.track === "contractor" ? "G4-C" : "G4-S";
      if (!release?.gates.some(g => g.id === requiredGate && g.status === "approved")) deny(`Missing approved track gate for ${policy.id}`);
    }
    for (const release of inventory.releaseRecords) {
      unique(release.policies.map(p => p.id), "release policy");
      unique(release.gates.map(g => g.id), "release gate");
      unique(release.enabledRailIds, "release rail");
      unique(release.tenantIds, "release tenant");
      for (const id of release.enabledRailIds) {
        if (!inventory.rails.some(r => r.id === id && r.enabled && r.releaseRecordId === release.id)) deny(`Unbound release rail ${id}`);
      }
    }
    for (const rail of inventory.rails) {
      const declaration = paymentRailDeclarations[rail.id as keyof typeof paymentRailDeclarations];
      if (!Object.hasOwn(paymentRailDeclarations, rail.id)) { deny(`Undeclared rail ${rail.id}`); continue; }
      if (rail.gate !== declaration.gate) deny(`Wrong declared gate for ${rail.id}`);
      if (!rail.enabled) continue;
      const release = releases.get(rail.releaseRecordId!);
      if (!release || release.track !== declaration.track || !release.enabledRailIds.includes(rail.id) ||
          !release.gates.some(g => g.id === declaration.gate && g.status === "approved")) {
        deny(`Missing matching track gate record for ${rail.id}`);
        continue;
      }
      for (const id of declaration.policies) {
        const policy = policies.get(id);
        if (!policy?.enabled || policy.status !== "approved" || policy.releaseRecordId !== release.id ||
            !release.policies.some(p => p.id === id && p.policyVersion === policy.policyVersion && p.status === "approved")) {
          deny(`Missing required policy ${id} for ${rail.id}`);
        }
      }
    }
  }).parse(input);
}
