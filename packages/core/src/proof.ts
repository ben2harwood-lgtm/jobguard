import { z } from "zod";

export const proofEvidenceTypeSchema = z.enum(["pre_cover_photo", "completion_photo", "excavation_photo", "electrical_certificate"]);
export type ProofEvidenceType = z.infer<typeof proofEvidenceTypeSchema>;
export type ProofUploadState = "uploading" | "uploaded" | "verified" | "rejected";

export interface ProofCandidate {
  readonly uploadState: ProofUploadState;
  readonly evidenceId: string | null;
  readonly evidenceType: string;
  readonly tenantId: string;
  readonly jobId: string;
  readonly scopeItemId: string;
  readonly objectVersionId: string | null;
  readonly originalPresent: boolean;
  readonly invalidated: boolean;
}

export interface ProofRequirement { readonly tenantId:string;readonly jobId:string;readonly scopeItemId:string;readonly evidenceType:ProofEvidenceType }
export type ProofGateResult={readonly satisfied:true;readonly evidenceId:string}|{readonly satisfied:false;readonly reason:"unfinished"|"rejected"|"wrong_type"|"wrong_target"|"missing_original"|"invalidated"};

/** Pure predicate used by both the completion command and proof-Decision resolution. */
export function evaluateProofGate(requirement:ProofRequirement,candidate:ProofCandidate):ProofGateResult {
  if(candidate.uploadState==="rejected")return{satisfied:false,reason:"rejected"};
  if(candidate.uploadState!=="verified"||!candidate.evidenceId||!candidate.objectVersionId)return{satisfied:false,reason:"unfinished"};
  if(candidate.evidenceType!==requirement.evidenceType)return{satisfied:false,reason:"wrong_type"};
  if(candidate.tenantId!==requirement.tenantId||candidate.jobId!==requirement.jobId||candidate.scopeItemId!==requirement.scopeItemId)return{satisfied:false,reason:"wrong_target"};
  if(!candidate.originalPresent)return{satisfied:false,reason:"missing_original"};
  if(candidate.invalidated)return{satisfied:false,reason:"invalidated"};
  return{satisfied:true,evidenceId:candidate.evidenceId};
}

export function transitionProofUpload(state:ProofUploadState,event:"bytes_uploaded"|"server_verified"|"server_rejected"):ProofUploadState {
  if(event==="server_rejected")return "rejected";
  if(state==="uploading"&&event==="bytes_uploaded")return "uploaded";
  if(state==="uploaded"&&event==="server_verified")return "verified";
  return state;
}

export function resolveProofDecision(requirement:ProofRequirement,candidate:ProofCandidate){const gate=evaluateProofGate(requirement,candidate);return gate.satisfied?{resolved:true as const,resolution:"approved" as const,evidenceId:gate.evidenceId}:{resolved:false as const,reason:gate.reason};}
