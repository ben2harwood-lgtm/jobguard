import {z} from "zod";
import {quoteLineV1} from "@jobguard/core";
const uuid=z.string().uuid();
export const quoteDraftCommandV1=z.object({contractVersion:z.literal("quote_draft_command_v1"),draftId:uuid,expectedRevision:z.number().int().nonnegative(),currency:z.literal("GBP"),taxPolicyVersion:z.string().min(1),blockingQuestions:z.array(z.string()).default([]),lines:z.array(quoteLineV1).min(1)});
export const quoteWorkspaceResponseV1=z.object({version:z.literal(1),environment:z.literal("synthetic_demo"),jobId:uuid,scope:z.array(z.object({scopeItemId:uuid,scopeRevisionId:uuid,description:z.string(),quantity:z.string().nullable(),unit:z.string().nullable(),unitRatePence:z.number().int().nullable()})),draft:z.object({id:uuid,revision:z.number().int(),currentRevisionId:uuid.nullable()}).nullable(),revisions:z.array(z.object({id:uuid,revision:z.number().int(),previousRevisionId:uuid.nullable(),netPence:z.number().int(),taxPence:z.number().int(),totalPence:z.number().int(),issuable:z.boolean(),blockers:z.array(z.unknown()),lines:z.array(quoteLineV1)}))});
export type QuoteWorkspaceResponse=z.infer<typeof quoteWorkspaceResponseV1>;
