import { afterEach, expect, it, vi } from "vitest";
import { billabilityActionRequest, billabilityAnswer, billabilityView } from "./screen";
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

afterEach(()=>vi.unstubAllGlobals());
it.each(["review","approve"])("prepares %s before POST and keeps exact retry bodies",async action=>{
 const body={action,commandId:id,expectedCaseRevision:2};
 const fetcher=vi.fn(async (_url:unknown,init?:RequestInit)=>new Response(JSON.stringify(init?.method==="POST" ? {} : {version:"recovery-billability-view.v1",csrfToken:`${action}-token`,caseId:id,caseRevision:3,lines:[],reviews:[]})));
 vi.stubGlobal("fetch",fetcher);
 await billabilityActionRequest("/billability",id,body);
 await billabilityActionRequest("/billability",id,body);
 expect(fetcher.mock.calls.map(call=>[call[0],call[1]?.method??"GET"])).toEqual([[`/billability?action=${action}`,"GET"],["/billability","POST"],[`/billability?action=${action}`,"GET"],["/billability","POST"]]);
 for(const index of [1,3]) expect(fetcher.mock.calls[index]?.[1]).toMatchObject({headers:{"x-csrf-token":`${action}-token`},body:JSON.stringify(body)});
 expect(body.expectedCaseRevision).toBe(2);
});
it.each(["refused","malformed","wrong-case"])("does not submit when preparation is %s",async failure=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify(failure==="malformed"?{}:{version:"recovery-billability-view.v1",csrfToken:"token",caseId:failure==="wrong-case"?"10000000-0000-4000-8000-000000000002":id,caseRevision:2,lines:[],reviews:[]}),{status:failure==="refused"?404:200}));
 vi.stubGlobal("fetch",fetcher);
 await expect(billabilityActionRequest("/billability",id,{action:"approve"})).rejects.toThrow();
 expect(fetcher).toHaveBeenCalledTimes(1);
});
