import { approvalRulesV1, evaluateExtraApprovalRequirement, orderedExtraSteps } from "@jobguard/core";
import { createHash } from "node:crypto";
import { z } from "zod";

export const northsideSettingLabel = "Demo setting, not a real rule";
export const northsideSettingsNotice = "Demo settings, not real rules — Ben sets these before any real customer";
export const northsideSettingsV1 = z.object({
  version: z.literal("northside-settings.v1"), classification: z.literal("demo_settings"),
  label: z.literal(northsideSettingLabel), notice: z.literal(northsideSettingsNotice),
  rules: z.custom<ReturnType<typeof approvalRulesV1.parse>>(value => approvalRulesV1.safeParse(value).success),
  journey: z.tuple([z.literal("operative"), z.literal("surveyor"), z.literal("supervisor"), z.literal("owner"), z.literal("client_approver")]),
  linkLifetimeMinutes: z.number().int().positive().max(10080),
  photoUploadLifetimeMinutes: z.number().int().positive().max(1440),
  timers: z.literal("not_scheduled"), workTiming: z.literal("unavailable"), proceedPermission: z.literal("not_granted"),
}).strict();
/** Fictional fixture only. Changing this definition requires a new version; existing runs keep their snapshot. */
export const northsideSettings = northsideSettingsV1.parse({
  version: "northside-settings.v1", classification: "demo_settings", label: northsideSettingLabel, notice: northsideSettingsNotice,
  rules: {
    version: "approval-rules.v1", proceedLimit: { pence: 25000, currency: "GBP" },
    bands: [
      { upToPence: 150000, steps: [{ role: "supervisor", timeLimitMinutes: 1440, escalationRole: "commercial_manager", alternateRoles: ["surveyor"] }] },
      { upToPence: null, steps: [{ role: "supervisor", timeLimitMinutes: 1440, escalationRole: "commercial_manager", alternateRoles: ["surveyor"] }, { role: "commercial_manager", timeLimitMinutes: 1440, escalationRole: "commercial_manager", alternateRoles: ["surveyor"] }] },
    ],
    clientApproval: { kind: "threshold", abovePence: 100000, beforeWorkAbovePence: 50000, timeLimitMinutes: 2880 },
    evidence: { photosRequired: true, residentConfirmationRequired: true },
  },
  journey: ["operative", "surveyor", "supervisor", "owner", "client_approver"],
  linkLifetimeMinutes: 1440, photoUploadLifetimeMinutes: 60, timers: "not_scheduled", workTiming: "unavailable", proceedPermission: "not_granted",
});
export type NorthsideSettings = z.infer<typeof northsideSettingsV1>;
/** Uses the merged pure evaluator; equality is evaluated in exact whole pence. This grants no authority. */
export function northsideSettingsPath(netPence: number | null) {
  const id = "00000000-0000-4000-8000-000000000001", hash = "a".repeat(64);
  const proposal = evaluateExtraApprovalRequirement({ version: "extra-approval-input.v1", ruleVersionId: id,
    ruleDocumentHash: createHash("sha256").update(JSON.stringify(northsideSettings.rules)).digest("hex"), clientContractVersionId: id,
    revision: { id, hash, net: netPence === null ? null : { pence: netPence, currency: "GBP" } }, rules: northsideSettings.rules });
  return orderedExtraSteps(proposal.companySteps.map(s => s.role), proposal.comparisons.aboveClientThreshold);
}
