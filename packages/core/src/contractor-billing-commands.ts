import { z } from "zod";
import { billingStatusV1 } from "./contractor-billing.js";
const uuid=z.string().uuid().transform(v=>v.toLowerCase());
export const billingFinaliseCommandV1=z.object({version:z.literal("billing-finalise.v1"),commandId:uuid,clientContractId:uuid}).strict();
export const billingImportCommandV1=z.object({version:z.literal("billing-import-command.v1"),commandId:uuid,transport:z.enum(["csv","api"]),sourceHash:z.string().regex(/^[a-f0-9]{64}$/u),events:z.array(billingStatusV1).min(1).max(10000)}).strict();
export const billingApproveDeliveryCommandV1=z.object({version:z.literal("billing-approve-delivery.v1"),commandId:uuid,batchId:uuid,channel:z.enum(["fake_download","fake_sftp","fake_api"]),destination:z.string().regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.invalid$/u),contentHash:z.string().regex(/^[a-f0-9]{64}$/u),expiresAt:z.string().datetime({offset:true})}).strict();
export const billingAdvanceDeliveryCommandV1=z.object({version:z.literal("billing-advance-delivery.v1"),outboxActionId:uuid,action:z.enum(["execute","reconcile"])}).strict();
export const contractorBillingErrorCodes=["BILLING_INVALID","BILLING_CONFLICT","BILLING_FORBIDDEN","BILLING_NOT_FOUND","BILLING_STALE","BILLING_DUPLICATES_UNRESOLVED","JOB_NOT_LIVE","MODE_FORBIDDEN","UNAUTHENTICATED","DATABASE_UNAVAILABLE"] as const;
export class ContractorBillingError extends Error {
 constructor(readonly code:typeof contractorBillingErrorCodes[number]){super(code);this.name="ContractorBillingError";}
}
