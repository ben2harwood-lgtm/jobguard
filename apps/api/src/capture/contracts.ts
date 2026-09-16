import { z } from "zod";
import { proposalReviewV1 } from "@jobguard/core";
const uuid=z.string().uuid();
export const captureWorkspaceResponseV1=z.object({version:z.literal(1),environment:z.literal("synthetic_demo"),captureId:uuid,jobId:uuid,proposalId:uuid,reviewId:uuid,source:z.object({text:z.string(),version:z.literal(1)}),proposal:z.object({title:z.string(),lines:z.array(z.object({id:uuid,scopeItemId:uuid,description:z.object({value:z.string()}),quantity:z.object({value:z.string().nullable()}),unit:z.object({value:z.string().nullable()}),unitPricePence:z.object({value:z.number().int().nullable()}),room:z.string(),category:z.string(),sourceExcerpt:z.string()})),questions:z.array(z.object({question:z.object({value:z.string()})}))}),review:proposalReviewV1.nullable(),status:z.enum(["draft","quoting"])});
export type CaptureWorkspaceResponse=z.infer<typeof captureWorkspaceResponseV1>;
export const reviewSaveCommandV1=z.object({contractVersion:z.literal("proposal_review_command_v1"),expectedRevision:z.number().int().nonnegative(),review:proposalReviewV1});
export const reviewConfirmCommandV1=z.object({contractVersion:z.literal("proposal_review_confirm_v1"),commandId:uuid,expectedRevision:z.number().int().positive()});
