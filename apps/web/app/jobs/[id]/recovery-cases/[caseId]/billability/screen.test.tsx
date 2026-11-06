import { expect, it } from "vitest";
import { billabilityAnswer, billabilityView } from "./screen";
const id="10000000-0000-4000-8000-000000000001";
it("unreadable, wrong-id, 5xx and live answers cannot settle an uncertain command",()=>{
 const answer={version:"recovery-billability-approval.v1",productionEnabled:false,command:{commandId:id}};
 expect(billabilityAnswer(200,answer,id)).toBe(true);
 for(const [status,body,command] of [[503,answer,id],[200,{},id],[200,answer,"another"],[200,{...answer,productionEnabled:true},id]] as const) expect(billabilityAnswer(status,body,command)).toBe(false);
});
it("the read requires server revision, line identities and stored review fields",()=>{
 expect(billabilityView.safeParse({version:"recovery-billability-view.v1",csrfToken:"fictional-csrf",caseId:id,caseRevision:1,lines:[{workId:id,lineId:id}],reviews:[]}).success).toBe(true);
 expect(billabilityView.safeParse({caseId:id,lines:[]}).success).toBe(false);
});
