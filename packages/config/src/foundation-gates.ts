import { z } from "zod";

// Normative excerpts: inventory rows cannot redefine or drop these requirements.
export const foundationRequirements = [
  {
    "id": "g0-m0",
    "gate": "G0",
    "planLine": 163,
    "requirement": "M0 tasks pass",
    "requiresOwnerApproval": false,
    "decisionId": null
  },
  {
    "id": "g0-contracts",
    "gate": "G0",
    "planLine": 163,
    "requirement": "contracts are versioned",
    "requiresOwnerApproval": false,
    "decisionId": null
  },
  {
    "id": "g0-policies",
    "gate": "G0",
    "planLine": 163,
    "requirement": "pending policies fail closed",
    "requiresOwnerApproval": false,
    "decisionId": null
  },
  {
    "id": "g0-postgres",
    "gate": "G0",
    "planLine": 163,
    "requirement": "critical tests run on real PostgreSQL",
    "requiresOwnerApproval": false,
    "decisionId": null
  },
  {
    "id": "g0-acceptance",
    "gate": "G0",
    "planLine": 163,
    "requirement": "separate technical acceptance",
    "requiresOwnerApproval": true,
    "decisionId": null
  },
  {
    "id": "g1-d04",
    "gate": "G1",
    "planLine": 164,
    "requirement": "Approved processor/data-flow register (D04)",
    "requiresOwnerApproval": true,
    "decisionId": "D04"
  },
  {
    "id": "g1-invoice",
    "gate": "G1",
    "planLine": 164,
    "requirement": "supported invoice/tax scope",
    "requiresOwnerApproval": true,
    "decisionId": null
  },
  {
    "id": "g1-permissions",
    "gate": "G1",
    "planLine": 164,
    "requirement": "permissions",
    "requiresOwnerApproval": false,
    "decisionId": null
  },
  {
    "id": "g1-d07",
    "gate": "G1",
    "planLine": 164,
    "requirement": "privacy/retention procedure (D07, D12)",
    "requiresOwnerApproval": true,
    "decisionId": "D07"
  },
  {
    "id": "g1-d12",
    "gate": "G1",
    "planLine": 164,
    "requirement": "privacy/retention procedure (D07, D12)",
    "requiresOwnerApproval": true,
    "decisionId": "D12"
  },
  {
    "id": "g1-secrets",
    "gate": "G1",
    "planLine": 164,
    "requirement": "secret management",
    "requiresOwnerApproval": false,
    "decisionId": null
  },
  {
    "id": "g1-alerts",
    "gate": "G1",
    "planLine": 164,
    "requirement": "alerts",
    "requiresOwnerApproval": false,
    "decisionId": null
  },
  {
    "id": "g1-backup",
    "gate": "G1",
    "planLine": 164,
    "requirement": "backup and successful restore evidence",
    "requiresOwnerApproval": false,
    "decisionId": null
  },
  {
    "id": "g1-restore",
    "gate": "G1",
    "planLine": 164,
    "requirement": "backup and successful restore evidence",
    "requiresOwnerApproval": false,
    "decisionId": null
  },
  {
    "id": "g1-outbound",
    "gate": "G1",
    "planLine": 164,
    "requirement": "outbound kill switch",
    "requiresOwnerApproval": false,
    "decisionId": null
  },
  {
    "id": "g1-terms",
    "gate": "G1",
    "planLine": 164,
    "requirement": "approved no-charge pilot terms",
    "requiresOwnerApproval": true,
    "decisionId": null
  },
  {
    "id": "g1-d13",
    "gate": "G1",
    "planLine": 164,
    "requirement": "D13 approval of the Final Check disclosure",
    "requiresOwnerApproval": true,
    "decisionId": "D13"
  },
  {
    "id": "g1-contractor-pilot",
    "gate": "G1",
    "planLine": 164,
    "requirement": "a signed pilot agreement",
    "requiresOwnerApproval": true,
    "decisionId": null
  },
  {
    "id": "g1-contractor-dpa",
    "gate": "G1",
    "planLine": 164,
    "requirement": "data processing agreement (ENT-14)",
    "requiresOwnerApproval": true,
    "decisionId": null
  },
  {
    "id": "g1-contractor-d12",
    "gate": "G1",
    "planLine": 164,
    "requirement": "D12 v4",
    "requiresOwnerApproval": true,
    "decisionId": "D12"
  },
  {
    "id": "g1-checkpoint",
    "gate": "G1",
    "planLine": 306,
    "requirement": "Keep an independently restricted checkpoint",
    "requiresOwnerApproval": false,
    "decisionId": null
  }
] as const;

export const foundationPlanRows: Record<number, string> = {
  "163": "| **G0 \u2014 foundation acceptance** | Feature rollout; status pending until the required foundation evidence and separate technical acceptance are recorded. Existing synthetic construction is not evidence that G0 has passed. | M0 tasks pass, contracts are versioned, pending policies fail closed, critical tests run on real PostgreSQL. |",
  "164": "| **G1 \u2014 real data** | Any real personal data or real commercial document send, on either track | Approved processor/data-flow register (D04); supported invoice/tax scope; permissions; privacy/retention procedure (D07, D12); secret management; alerts; backup and successful restore evidence; outbound kill switch. Small-builder pilots: approved no-charge pilot terms and D13 approval of the Final Check disclosure. Contractor pilots: a signed pilot agreement and data processing agreement (ENT-14) and D12 v4. |",
  "306": "Audit sequence allocation and head updates are serialized per tenant. Hash canonical event metadata and payload; prohibit a payload that omits actor/type/subject from integrity coverage. Define a single lock order and batch audit appends at the end of domain mutation, with no later domain lock acquisition. Keep an independently restricted checkpoint `(tenant, sequence, hash, recorded_at)` before G1; external anchoring arrives in M4. A verifier needs a trusted checkpoint to substantiate detection of tail deletion or complete-chain replacement."
};

const text = z.string().trim().min(1);
const path = text.refine(value => !value.includes("\\") && !value.startsWith("/") &&
  value.split("/").every(part => part !== ".." && part !== "." && part !== ""), "Expected repository-relative file path");
const approvalSchema = z.strictObject({
  decisionRecord: path.regex(/^docs\/decisions\/[^/]+\.md$/u),
  policyVersion: text,
  approver: text,
  approvedAt: z.iso.datetime(),
  evidencePath: path,
});
const packSchema = z.strictObject({
  version: z.literal("foundation-gates.v1"),
  // ENT-14 signatures are absent. Admission needs a separately reviewed evidence update.
  contractorPilotEvidence: z.null(),
  rows: z.array(z.strictObject({
    id: text, gate: z.enum(["G0", "G1"]), planLine: z.number().int().positive(), requirement: text,
    status: z.enum(["evidence_present", "blocked", "needs_owner_approval"]),
    evidencePaths: z.array(path), blockingReason: text.nullable(), ownerApproval: approvalSchema.nullable(),
  })),
});

/** Offline evidence index only: no runtime imports or execution authority. The reader
 * must return file contents from the checked-out commit, or undefined for absent files. */
export function validateFoundationGates(input: unknown, read: (path: string) => string | undefined) {
  const pack = packSchema.superRefine((pack, ctx) => {
    const deny = (message: string) => ctx.addIssue({ code: "custom", message });
    const exists = (file: string) => {
      const source = read(file);
      if (source === undefined) deny(`Missing evidence path: ${file}`);
      return source;
    };
    const plan = exists("BUILD_PLAN.md")?.split(/\r?\n/u);
    for (const [line, expected] of Object.entries(foundationPlanRows)) {
      if (plan?.[Number(line) - 1] !== expected) deny(`Plan requirements changed at BUILD_PLAN.md:${line}; reconcile the checklist`);
    }
    if (new Set(pack.rows.map(row => row.id)).size !== pack.rows.length) deny("Duplicate plan requirement");
    if (pack.rows.length !== foundationRequirements.length) deny("Missing or extra plan requirement");
    for (const required of foundationRequirements) {
      const row = pack.rows.find(row => row.id === required.id);
      if (!row) { deny(`Missing plan requirement: ${required.id}`); continue; }
      if (row.gate !== required.gate || row.planLine !== required.planLine || row.requirement !== required.requirement) {
        deny(`Changed plan requirement: ${required.id}`);
      }
      row.evidencePaths.forEach(exists);
      if (row.status === "evidence_present") {
        if (!row.evidencePaths.length) deny(`Evidence required: ${row.id}`);
        if (row.blockingReason !== null) deny(`Completed evidence has a blocking reason: ${row.id}`);
        if (required.requiresOwnerApproval && !row.ownerApproval) deny(`Owner approval required: ${row.id}`);
      } else if (!row.blockingReason) deny(`Blocking reason required: ${row.id}`);
      if (row.status === "needs_owner_approval" && row.ownerApproval) deny(`Approval still pending: ${row.id}`);
      if (row.ownerApproval) {
        const approval = row.ownerApproval;
        const record = exists(approval.decisionRecord);
        exists(approval.evidencePath);
        const field = (label: string) => record?.match(new RegExp(`\\*\\*${label}:\\*\\* (.+)`, "u"))?.[1];
        if (field("Status") !== "`approved`" || field("Policy version") !== `\`${approval.policyVersion}\`` ||
            !field("Dated approver evidence")?.includes(approval.approver) ||
            !field("Dated approver evidence")?.includes(approval.approvedAt) ||
            !field("Dated approver evidence")?.includes(approval.evidencePath)) {
          deny(`Real decision record with exact dated approval required: ${row.id}`);
        }
        if (required.decisionId && !approval.decisionRecord.split("/").at(-1)?.startsWith(`${required.decisionId.toLowerCase()}-`)) {
          deny(`Wrong decision record: ${row.id}`);
        }
        if (row.id === "g1-contractor-d12" && approval.policyVersion !== "third_party_data_protection_policy_v4") {
          deny("Contractor pilot requires D12 v4");
        }
      }
    }
    for (const row of pack.rows.filter(row => ["g1-contractor-pilot", "g1-contractor-dpa"].includes(row.id))) {
      if (row.status !== "blocked") deny(`ENT-14 evidence absent; contractor row stays blocked: ${row.id}`);
    }
  }).parse(input);
  const met = (gate: "G0" | "G1") => pack.rows.filter(row => row.gate === gate).every(row => row.status === "evidence_present");
  return { ...pack, gates: { G0: met("G0") ? "met" : "not_met", G1: met("G0") && met("G1") ? "met" : "not_met" } };
}
