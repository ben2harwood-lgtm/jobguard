export type FindingClassification = "mandatory" | "advisory";
export type ProofRule = "plastering" | "electrical" | "groundwork";
export type FindingKind = "unresolved_question" | "required_proof" | "materials_bill_review";

export interface JobFactSnapshot {
  readonly version: "job-fact-snapshot.v1";
  readonly tenantId: string;
  readonly jobId: string;
  readonly revision: number;
  readonly unresolvedQuestions: readonly { readonly id: string; readonly text: string; readonly commercialBlocker: boolean }[];
  readonly scopes: readonly { readonly scopeItemId: string; readonly proofRule: ProofRule | null; readonly verifiedProofTypes: readonly string[]; readonly materialsIncluded: boolean; readonly valuePence: number }[];
}
export interface Finding {
  readonly version: "finding.v1"; readonly fingerprint: string; readonly kind: FindingKind;
  readonly classification: FindingClassification; readonly title: string; readonly detail: string;
  readonly jobId: string; readonly subjectRef: string; readonly actionType: string;
  readonly suggestionConfidence: number | null;
}
export interface SuppressionPolicy { readonly minimumAdvisoryValuePence: number; readonly minimumSuggestionConfidence: number; readonly dailyAdvisoryBudget: number }

const proof: Record<ProofRule, readonly string[]> = {
  plastering: ["pre_cover_photo", "completion_photo"], electrical: ["electrical_certificate"], groundwork: ["excavation_photo", "completion_photo"],
};
const canonical=(value:unknown):string=>value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?`[${value.map(canonical).join(",")}]`:`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
function fnv(input:string,seed:bigint){let hash=seed;for(let index=0;index<input.length;index++){hash^=BigInt(input.charCodeAt(index));hash=BigInt.asUintN(64,hash*1099511628211n);}return hash.toString(16).padStart(16,"0");}
export function findingFingerprint(identity: Readonly<Record<string, unknown>>): string { const value=canonical(identity);return [0xcbf29ce484222325n,0x84222325cbf29ce4n,0x9e3779b185ebca87n,0xd6e8feb86659fd93n].map(seed=>fnv(value,seed)).join(""); }
function finding(snapshot:JobFactSnapshot,kind:FindingKind,classification:FindingClassification,subjectRef:string,title:string,detail:string,actionType:string,confidence:number|null):Finding{return{version:"finding.v1",fingerprint:findingFingerprint({version:"finding.v1",jobId:snapshot.jobId,kind,subjectRef,actionType}),kind,classification,title,detail,jobId:snapshot.jobId,subjectRef,actionType,suggestionConfidence:confidence};}
/** Pure deterministic checks only: consumes values and returns values; persistence is an application concern. */
export function runJobChecks(snapshot: JobFactSnapshot): readonly Finding[] {
  const findings:Finding[]=[];
  for(const question of snapshot.unresolvedQuestions){findings.push(finding(snapshot,"unresolved_question",question.commercialBlocker?"mandatory":"advisory",question.id,"Answer unresolved question",question.text,"question.resolve",null));}
  for(const scope of snapshot.scopes){if(scope.proofRule)for(const required of proof[scope.proofRule])if(!scope.verifiedProofTypes.includes(required))findings.push(finding(snapshot,"required_proof","mandatory",`${scope.scopeItemId}:${required}`,"Required proof missing",`${scope.proofRule} work requires verified ${required.replaceAll("_"," ")}.`,"proof.capture",null));
    if(scope.materialsIncluded)findings.push(finding(snapshot,"materials_bill_review","advisory",scope.scopeItemId,"Check the materials bill","REVIEW SUGGESTION — compare the materials bill with the agreed scope. No overcharge has been detected.","materials.review",0.35));}
  return findings.sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint));
}
export function applyInitialSuppression(findings:readonly Finding[],policy:SuppressionPolicy,values:Readonly<Record<string,number>>):{visible:readonly Finding[];suppressed:readonly Finding[]}{let remaining=Math.max(0,policy.dailyAdvisoryBudget);const visible:Finding[]=[];const suppressed:Finding[]=[];for(const item of findings){if(item.classification==="mandatory"){visible.push(item);continue;}const value=values[item.subjectRef]??0;const eligible=value>=policy.minimumAdvisoryValuePence&&(item.suggestionConfidence??1)>=policy.minimumSuggestionConfidence&&remaining>0;if(eligible){visible.push(item);remaining--;}else suppressed.push(item);}return{visible,suppressed};}
