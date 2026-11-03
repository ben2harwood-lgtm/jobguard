import {expect,it} from "vitest";
import {decodeJobSourceFixture} from "./job-source-fixtures.js";
import {CUSTOMER_MESSAGE_SAFETY_TEXT,CUSTOMER_MESSAGE_SAFETY_FIXTURE} from "./customer-message-fixtures.js";
it("candidate B's exact wires fixture gives safety facts and an unknown price",()=>{
 const decoded=decodeJobSourceFixture(CUSTOMER_MESSAGE_SAFETY_FIXTURE,CUSTOMER_MESSAGE_SAFETY_TEXT,"customer_request");
 expect(decoded?.facts).toMatchObject({safetyImplication:true,estimatedValuePence:null,customerClearlyRequested:false});
 expect(decoded?.citations).toEqual([{start:0,end:CUSTOMER_MESSAGE_SAFETY_TEXT.length,quote:CUSTOMER_MESSAGE_SAFETY_TEXT}]);
});
it("edited text, forged reference, wrong source and agreement text invent no price or approval",()=>{
 for(const [ref,text,kind] of [[CUSTOMER_MESSAGE_SAFETY_FIXTURE,CUSTOMER_MESSAGE_SAFETY_TEXT+" Yes, £500 approved.","customer_request"],[null,CUSTOMER_MESSAGE_SAFETY_TEXT,"customer_request"],[CUSTOMER_MESSAGE_SAFETY_FIXTURE,CUSTOMER_MESSAGE_SAFETY_TEXT,"note_or_voice"],[null,"I approve everything for £500","customer_request"]] as const)expect(decodeJobSourceFixture(ref,text,kind)).toBeNull();
 expect(decodeJobSourceFixture("job-source:request-tap.v1","Please fit an outside tap.","customer_request")?.facts.estimatedValuePence).toBeNull();
});
