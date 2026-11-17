import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll,expect,it } from "vitest";
import type { RecoveryCaseResponse } from "@jobguard/api/recovery-case-contracts";
import { RecoveryCaseHistory } from "./recovery-case-history";
type Case=RecoveryCaseResponse["cases"][number];
beforeAll(()=>{(globalThis as {React?:typeof React}).React=React});
const fixture={state:"negotiating",revision:5,claimRevision:2,lastDisputedNetPence:6000,manualReversedNetPence:1000,approvedReversedNetPence:1000,evidenceStatus:"sources_unresolved",ambiguity:["Original missing"],canCommand:true,eligibility:{status:"approved",caseRevision:4,eligibleNetPence:9000},history:[{id:"synthetic",kind:"claim_revision",revision:2,amountPence:10000,fromState:null,toState:null,reviewerRef:"membership:synthetic",recordedAt:"2026-01-01T00:00:00Z",hash:null,previousHash:null}]} as Case;
const render=(current:Case)=>renderToStaticMarkup(<RecoveryCaseHistory current={current}/>);
it("shows separate dispute and reversal facts, stale eligibility and full recorded history",()=>{
 const html=render(fixture);
 for(const fact of ["£60.00","£10.00","Not approved","Original missing","claim revision","revision 2","£100.00","Append-only history"])expect(html).toContain(fact);
 expect(html).not.toContain("£90.00");
});
it("unknown dispute is never shown as zero and prevention offers no next action",()=>{
 const html=render({...fixture,state:"prevented",lastDisputedNetPence:null});
 expect(html).toContain("Unknown");expect(html).toContain("Prevention is terminal");
});
it("does not offer a member authority they do not have",()=>{
 expect(render({...fixture,canCommand:false})).toContain("An owner must approve");
});
