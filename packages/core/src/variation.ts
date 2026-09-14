import { z } from "zod";
import { money, type Money } from "./money.js";
import { calculateNetLine, parseQuantity } from "./quantity.js";

const uuid=z.string().uuid();
const hash=z.string().regex(/^[a-f0-9]{64}$/u);
const decimal=/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;
export const aiRateSuggestionV1=z.object({kind:z.literal("ai_suggestion"),unitRatePence:z.number().int().nonnegative().nullable(),sourceLabel:z.string().min(1).max(160),sourceRef:z.string().min(1).max(300),sourceHash:hash,rateVersion:z.string().min(1).max(80)}).strict();
export type AiRateSuggestion=z.infer<typeof aiRateSuggestionV1>;
export const variationProposalV1=z.object({version:z.literal("variation-proposal.v1"),id:uuid,jobId:uuid,scopeItemId:uuid,existingScopeItemId:uuid.nullable(),lineageParentScopeItemId:uuid.nullable(),captureKind:z.enum(["text","fixture_audio_transcript"]),captureText:z.string().min(1).max(5000),description:z.string().min(1).max(500),suggestion:aiRateSuggestionV1.nullable()}).strict().superRefine((v,ctx)=>{
 if(v.existingScopeItemId!==null&&(v.scopeItemId!==v.existingScopeItemId||v.lineageParentScopeItemId!==null))ctx.addIssue({code:"custom",message:"Existing-scope variations retain their scope identity"});
 if(v.existingScopeItemId===null&&v.lineageParentScopeItemId!==null&&v.scopeItemId===v.lineageParentScopeItemId)ctx.addIssue({code:"custom",message:"New variation scope requires a new lineage-linked identity"});
});
export type VariationProposal=z.infer<typeof variationProposalV1>;
export const confirmedVariationPriceV1=z.object({quantity:z.string().regex(decimal),unit:z.string().min(1).max(40),unitRatePence:z.number().int().nonnegative(),direction:z.enum(["addition","omission"]),confirmedByMembershipId:uuid,rateProvenance:z.object({kind:z.enum(["human_entered","ai_suggestion_reviewed"]),sourceRef:z.string().min(1).max(300),sourceHash:hash,rateVersion:z.string().min(1).max(80)}).strict()}).strict();
export type ConfirmedVariationPrice=z.infer<typeof confirmedVariationPriceV1>;
export type VariationRevision=Readonly<{id:string;variationId:string;revision:number;previousRevisionId:string|null;scopeItemId:string;description:string;quantity:string;unit:string;unitRatePence:number;signedDeltaPence:number;contentHash:string;confirmedByMembershipId:string;rateProvenance:ConfirmedVariationPrice["rateProvenance"];state:"priced"}>;
export type VariationApproval=Readonly<{id:string;revisionId:string;revision:number;contentHash:string;signedDeltaPence:number;method:"customer_evidence"|"builder_attestation";actorMembershipId:string;evidenceId:string|null;approvedAt:Date}>;

export function suggestionIsAgreed(_suggestion:AiRateSuggestion|null):false{return false;}
export function priceVariation(input:{id:string;variationId:string;previous:VariationRevision|null;proposal:VariationProposal;description:string;contentHash:string;confirmed:ConfirmedVariationPrice|null}):VariationRevision{
 const proposal=variationProposalV1.parse(input.proposal);if(!input.confirmed)throw new Error("HUMAN_CONFIRMED_PRICE_REQUIRED");const confirmed=confirmedVariationPriceV1.parse(input.confirmed);
 const unsigned=calculateNetLine(parseQuantity(confirmed.quantity),money(confirmed.unitRatePence));const signed=confirmed.direction==="omission"?-unsigned.pence:unsigned.pence;
 return Object.freeze({id:uuid.parse(input.id),variationId:uuid.parse(input.variationId),revision:(input.previous?.revision??0)+1,previousRevisionId:input.previous?.id??null,scopeItemId:proposal.scopeItemId,description:z.string().min(1).max(500).parse(input.description),quantity:confirmed.quantity,unit:confirmed.unit,unitRatePence:confirmed.unitRatePence,signedDeltaPence:money(signed).pence,contentHash:hash.parse(input.contentHash),confirmedByMembershipId:confirmed.confirmedByMembershipId,rateProvenance:Object.freeze({...confirmed.rateProvenance}),state:"priced"});
}
export function approveVariation(revision:VariationRevision,input:{id:string;revisionId:string;revision:number;contentHash:string;signedDeltaPence:number;method:"customer_evidence"|"builder_attestation";actorMembershipId:string;evidenceId:string|null;approvedAt:Date},existing?:VariationApproval):VariationApproval{
 if(existing){if(existing.revisionId===input.revisionId&&existing.actorMembershipId===input.actorMembershipId&&existing.method===input.method)return existing;throw new Error("APPROVAL_IDEMPOTENCY_CONFLICT");}
 if(input.revisionId!==revision.id||input.revision!==revision.revision||input.contentHash!==revision.contentHash||input.signedDeltaPence!==revision.signedDeltaPence)throw new Error("EXACT_PRICED_REVISION_REQUIRED");
 if(input.method==="customer_evidence"&&!input.evidenceId)throw new Error("CUSTOMER_EVIDENCE_REQUIRED");if(input.method==="builder_attestation"&&input.evidenceId)throw new Error("ATTESTATION_EVIDENCE_MUST_BE_NULL");
 return Object.freeze({...input,id:uuid.parse(input.id),actorMembershipId:uuid.parse(input.actorMembershipId),evidenceId:input.evidenceId===null?null:uuid.parse(input.evidenceId)});
}
export function finalAccountEligible(state:"draft"|"priced"|"approved"|"rejected"):boolean{return state==="approved";}
export function signedVariationDelta(revision:VariationRevision):Money{return money(revision.signedDeltaPence);}
