import { z } from "zod";
import { addMoney, money, type Money } from "./money.js";
import { candidateM1TaxPolicy, CANDIDATE_M1_TAX_POLICY_VERSION } from "./tax.js";

const uuid=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/u);
export const finalAccountAssemblyCommandV1=z.object({version:z.literal("final-account.assemble.v1"),commandId:uuid,actorMembershipId:uuid,jobId:uuid}).strict();
export type FinalAccountSourceLine=Readonly<{kind:"baseline"|"variation";sourceId:string;scopeItemId:string;commercialRevisionId:string;description:string;netPence:number;approvalId:string|null}>;
export type FinalAccountProof=Readonly<{evidenceId:string;objectVersionId:string;scopeItemId:string;evidenceType:string;sha256:string;mandatory:boolean}>;
export type FinalAccountFinding=Readonly<{code:"performed_approved_variation_unbilled"|"final_account_unissued"|"mandatory_proof_missing";subjectRef:string;mandatory:boolean}>;
export type DraftFinalAccount=Readonly<{lines:readonly FinalAccountSourceLine[];proof:readonly FinalAccountProof[];totals:{net:Money;tax:Money;total:Money};taxPolicyVersion:typeof CANDIDATE_M1_TAX_POLICY_VERSION;issueBlocked:boolean;findings:readonly FinalAccountFinding[];canonicalSource:string}>;

function canonical(value:unknown):string{return value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?`[${value.map(canonical).join(",")}]`:`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;}

/** Pure assembly: callers must supply only the frozen baseline and exact approved revisions. */
export function assembleDraftFinalAccount(input:{baselineLines:readonly FinalAccountSourceLine[];approvedVariationLines:readonly FinalAccountSourceLine[];proof:readonly FinalAccountProof[];mandatoryProofRequirements:readonly {scopeItemId:string;evidenceType:string}[];performedApprovedVariationIds?:readonly string[];issued?:boolean}):DraftFinalAccount{
 const baseline=input.baselineLines.filter(line=>line.kind==="baseline"&&line.approvalId===null);
 const variations=input.approvedVariationLines.filter(line=>line.kind==="variation"&&line.approvalId!==null);
 const uniqueVariations=new Map(variations.map(line=>[line.sourceId,line]));
 if(uniqueVariations.size!==variations.length)throw new Error("DUPLICATE_APPROVED_VARIATION");
 const lines=Object.freeze([...baseline,...uniqueVariations.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.sourceId.localeCompare(b.sourceId)));
 let net=money(0);for(const line of lines)net=addMoney(net,money(line.netPence));
 const tax=candidateM1TaxPolicy.calculateGroup(net,"standard_rate_20"),total=addMoney(net,tax);
 const proof=Object.freeze([...input.proof].sort((a,b)=>a.scopeItemId.localeCompare(b.scopeItemId)||a.evidenceType.localeCompare(b.evidenceType)||a.evidenceId.localeCompare(b.evidenceId)));
 const missing=input.mandatoryProofRequirements.filter(req=>!proof.some(item=>item.mandatory&&item.scopeItemId===req.scopeItemId&&item.evidenceType===req.evidenceType));
 const included=new Set(variations.map(line=>line.sourceId));
 const findings:FinalAccountFinding[]=[...(input.performedApprovedVariationIds??[]).filter(id=>!included.has(id)).map(id=>({code:"performed_approved_variation_unbilled" as const,subjectRef:id,mandatory:true})),...missing.map(req=>({code:"mandatory_proof_missing" as const,subjectRef:`${req.scopeItemId}:${req.evidenceType}`,mandatory:true})),...(input.issued?[]:[{code:"final_account_unissued" as const,subjectRef:"final-account",mandatory:false}])];
 const source={lines,proof,mandatoryProofRequirements:[...input.mandatoryProofRequirements].sort((a,b)=>canonical(a).localeCompare(canonical(b))),taxPolicyVersion:CANDIDATE_M1_TAX_POLICY_VERSION};
 return Object.freeze({lines,proof,totals:{net,tax,total},taxPolicyVersion:CANDIDATE_M1_TAX_POLICY_VERSION,issueBlocked:missing.length>0,findings:Object.freeze(findings),canonicalSource:canonical(source)});
}

export const finalAccountStoredHashV1=hash;
