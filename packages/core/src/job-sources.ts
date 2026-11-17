import { z } from "zod";
import { instantV1 } from "./receipt-allocation.js";
export const MAX_JOB_SOURCE_TEXT = 8000;
export const MAX_JOB_SOURCE_BYTES = 32000;
export const JOB_SOURCE_CONTENT_TYPE = "text/plain; charset=utf-8";
export const JOB_DIARY_NOTICE = "Notes are for your records. To bill for extra work, use Log an extra. JobGuard checks your records against your final bill after you complete it.";
export const JOB_DIARY_NOTICE_VERSION = "job-diary-notice.v1";
/** Validation preserves the exact reviewed text; it never trims the stored value. */
// Zod 4 counts code points in max(); this contract also caps UTF-16 code units.
export const jobSourceTextV1 = z.string().min(1).max(MAX_JOB_SOURCE_TEXT).refine(text => text.length <= MAX_JOB_SOURCE_TEXT && text.trim().length > 0 && !text.includes("\0") && !/\p{Surrogate}/u.test(text), "Invalid reviewed text");
export const fictionalCustomerV1 = z.object({kind:z.literal("named_fictional_customer"),name:z.string().min(1).max(160).refine(name=>name.trim().length>0 && !name.includes("\0"))}).strict().readonly();
/** Schema validity supplies no creation authority: both executable intake paths remain held. */
export const diaryInputV1 = z.object({version:z.literal("job-diary-input.v1"),commandId:z.guid({ error: "Invalid uuid" }),entryMode:z.enum(["typed","dictated_text"]),onSite:z.boolean(),text:jobSourceTextV1}).strict().readonly();
export const customerMessageInputV1 = z.object({version:z.literal("customer-message-input.v1"),commandId:z.guid({ error: "Invalid uuid" }),fictionalCustomer:fictionalCustomerV1,text:jobSourceTextV1}).strict().readonly();
export const jobSourceReadQueryV1 = z.object({version:z.literal("job-source-read-query.v1").optional()}).strict();
export const jobSourceEvidenceV1 = z.object({id:z.guid({ error: "Invalid uuid" }),objectVersionId:z.string().min(1).max(300),sha256:z.string().regex(/^[a-f0-9]{64}$/u),serverReceivedAt:instantV1}).strict().readonly();
const base={id:z.guid({ error: "Invalid uuid" }),commandId:z.guid({ error: "Invalid uuid" }),text:jobSourceTextV1,evidence:jobSourceEvidenceV1,actualTesterMembershipId:z.guid({ error: "Invalid uuid" })};
export const diaryEntryV1=z.object({...base,entryMode:z.enum(["typed","dictated_text"]),onSite:z.boolean()}).strict().readonly();
export const customerMessageV1=z.object({...base,fictionalCustomer:fictionalCustomerV1}).strict().readonly();
const read={jobId:z.guid({ error: "Invalid uuid" }),environment:z.literal("synthetic_demo"),realExternalActions:z.literal(0)};
export const diaryReadV1=z.object({...read,version:z.literal("job-diary-read.v1"),entries:z.array(diaryEntryV1).readonly(),notice:z.literal(JOB_DIARY_NOTICE),noticeVersion:z.literal(JOB_DIARY_NOTICE_VERSION)}).strict().readonly();
export const customerMessageReadV1=z.object({...read,version:z.literal("customer-message-read.v1"),messages:z.array(customerMessageV1).readonly()}).strict().readonly();
export type DiaryRead=z.infer<typeof diaryReadV1>;
export type CustomerMessageRead=z.infer<typeof customerMessageReadV1>;
export class JobSourceError extends Error {
 constructor(readonly code:"INVALID_JOB_SOURCE_INPUT"|"JOB_SOURCE_FORBIDDEN"|"JOB_SOURCE_UNAVAILABLE"|"SOURCE_NOT_FINALIZED"|"SYNTHETIC_MODE_REQUIRED"){super(code)}
}
