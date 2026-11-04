import { decodeCustomerMessageFixture } from "./customer-message-fixtures.js";
import {createHash} from "node:crypto";
import type {Observation} from "@jobguard/core";
/** Only these reviewed fictional originals have structured facts. No heuristic or model inference. */
export function decodeJobSourceFixture(reference:string|null,text:string,kind:Observation["kind"]):Pick<Observation,"text"|"facts"|"citations">|null {
 // SV-5 Test I: an exact made-up request, not a monetary threshold or free-text inference.
 // The practice-only reader verifies the immutable original; the worker applies D13.
 if(reference===null && kind==="customer_request" && text==="Fictional practice customer request: please build a garden room for £8,000 net; written agreement is required before work starts.")
  return {text,citations:[{start:0,end:text.length,quote:text}],facts:{workReference:"practice:garden-room",scopeArea:"job",description:"Fictional £8,000 garden room change",status:"requested",estimatedValuePence:800000,safetyImplication:false,customerClearlyRequested:true,needsPriorWrittenAgreement:true,significantWork:{basis:"synthetic_fixture",sourceRef:"practice:garden-room",significant:true},activeDispute:false,silenceMateriallyWorsensDispute:false,disclosureDuty:false}};
 // Exact fictional recipe text only; arbitrary notes remain unsupported. The
 // intake writer chooses null for originals without its legacy tap reference.
 if(reference===null && text==="Fictional practice diary: fitted loft hatch. Estimated extra: £300 net." && kind==="note_or_voice")
  return {text,citations:[{start:0,end:text.length,quote:text}],facts:{workReference:"practice:loft-hatch",scopeArea:"job",description:"fitted loft hatch",status:"completed",estimatedValuePence:30000,safetyImplication:false,customerClearlyRequested:false,needsPriorWrittenAgreement:false,significantWork:null,activeDispute:false,silenceMateriallyWorsensDispute:false,disclosureDuty:false}};
 const completed=reference==="job-source:outside-tap.v1" && text==="Fitted outside tap." && kind==="note_or_voice";
 const requested=reference==="job-source:request-tap.v1" && text==="Please fit an outside tap." && kind==="customer_request";
 if(!completed&&!requested)return decodeCustomerMessageFixture(reference,text,kind);
 return {text,citations:[{start:0,end:text.length,quote:text}],facts:{workReference:"synthetic:outside-tap",scopeArea:"job",description:"outside tap",status:completed?"completed":"requested",estimatedValuePence:null,safetyImplication:false,customerClearlyRequested:requested,needsPriorWrittenAgreement:false,significantWork:null,activeDispute:false,silenceMateriallyWorsensDispute:false,disclosureDuty:false}};
}

/** Explicit batch-3 sourceFixture recipe only. Email is a fictional original, never a connector. */
export function decodeFinalCheckSourceFixture(kind:string,sha256:string) {
 const text="Outside tap fitted";
 if(!["email","message","completion_photo"].includes(kind)||sha256!==createHash("sha256").update(text).digest("hex"))return null;
 return {text,citations:[{start:0,end:text.length,quote:text}],facts:{workReference:"synthetic-outside-tap",scopeArea:"job",description:"Outside tap",status:"completed" as const,
 estimatedValuePence:null,safetyImplication:false,customerClearlyRequested:false,needsPriorWrittenAgreement:false,significantWork:null,activeDispute:false,silenceMateriallyWorsensDispute:false,disclosureDuty:false}};
}
