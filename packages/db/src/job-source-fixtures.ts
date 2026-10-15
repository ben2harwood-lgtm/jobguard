import type {Observation} from "@jobguard/core";
/** Only these reviewed fictional originals have structured facts. No heuristic or model inference. */
export function decodeJobSourceFixture(reference:string|null,text:string,kind:Observation["kind"]):Pick<Observation,"text"|"facts"|"citations">|null {
 const completed=reference==="job-source:outside-tap.v1" && text==="Fitted outside tap." && kind==="note_or_voice";
 const requested=reference==="job-source:request-tap.v1" && text==="Please fit an outside tap." && kind==="customer_request";
 if(!completed&&!requested)return null;
 return {text,citations:[{start:0,end:text.length,quote:text}],facts:{workReference:"synthetic:outside-tap",scopeArea:"job",description:"outside tap",status:completed?"completed":"requested",estimatedValuePence:null,safetyImplication:false,customerClearlyRequested:requested,needsPriorWrittenAgreement:false,significantWork:null,activeDispute:false,silenceMateriallyWorsensDispute:false,disclosureDuty:false}};
}
