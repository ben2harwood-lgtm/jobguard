import{z}from"zod";
export const recoveryScenarioV1=z.enum(["missing_evidence","pending_money","manual_receipt","unapproved_eligibility","prevented","eligible"]);
export const recoveryScenarioCommandV1=z.object({version:z.literal("recovery-scenario-command.v1"),commandId:z.string().uuid(),scenario:recoveryScenarioV1}).strict();
export const recoveryApprovalCommandV1=z.object({version:z.literal("recovery-fee-approval-command.v1"),commandId:z.string().uuid(),policyVersion:z.literal("reference_fee_policy_v1")}).strict();
export const recoveryGuardResponseV1=z.object({version:z.literal(1),environment:z.literal("synthetic_demo"),guard:z.object({jobId:z.string().uuid(),scenario:recoveryScenarioV1.nullable(),reason:z.string(),qualifies:z.boolean(),additionalFeePence:z.number().int().nonnegative(),approved:z.boolean(),caseId:z.string().uuid().nullable(),receiptId:z.string().uuid().nullable(),evidenceId:z.string().uuid().nullable(),allocationId:z.string().uuid().nullable(),policyVersion:z.literal("reference_fee_policy_v1"),environment:z.literal("synthetic_demo")})});
export type RecoveryGuardResponse=z.infer<typeof recoveryGuardResponseV1>;
