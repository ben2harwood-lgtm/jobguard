import { z } from "zod";
import { recoveryCaseCommandV1, recoveryCaseStateFullV1, recoveryCaseTypeV1 } from "@jobguard/core";
export { recoveryCaseCommandV1 };
export const recoveryCaseViewV1=z.object({id:z.string().uuid(),jobId:z.string().uuid(),caseType:recoveryCaseTypeV1,state:recoveryCaseStateFullV1,claimedNetPence:z.number().int(),landedNetPence:z.number().int(),outstandingNetPence:z.number().int(),writtenOffPence:z.number().int(),currency:z.literal("GBP"),counterparty:z.string(),book:z.string(),sourceType:z.string(),sourceRefs:z.array(z.string()),revision:z.number().int(),reviewerRef:z.string(),createdDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)});
export const recoveryCaseResponseV1=z.object({version:z.literal("recovery-case-workbench.v1"),environment:z.literal("synthetic_demo"),realExternalActions:z.literal(0),cases:z.array(recoveryCaseViewV1)});
export type RecoveryCaseResponse=z.infer<typeof recoveryCaseResponseV1>;
