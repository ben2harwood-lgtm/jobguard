import React from "react";
import {afterEach,expect,it,vi} from "vitest";
import {FinalCheckReveal} from "./final-check-reveal";
const state=vi.hoisted(()=>({values:[] as unknown[],set:vi.fn()}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),
 useState:()=>[state.values.shift(),state.set],useRef:(current:unknown)=>({current}),
 useCallback:(fn:unknown)=>fn,useEffect:()=>undefined,
}));
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
type Props={children?:React.ReactNode;onClick?:()=>void;jobId:string;onSaved:()=>Promise<void>};
function elements(node:React.ReactNode):React.ReactElement<Props>[] {
 if(Array.isArray(node))return node.flatMap(elements);
 if(!React.isValidElement<Props>(node))return [];
 return [node,...elements(node.props.children)];
}
it("consumes and validates the import response before reading history or reporting success",async()=>{
 vi.stubGlobal("React",React);
 state.values=[{state:"completed",lockId:"lock",items:[]},0,false,"",false];
 const child=elements(FinalCheckReveal({jobId:"job"})).find(node=>typeof node.type==="function"&&node.type.name==="HistoricalEvidence")!;
 expect(child).toBeDefined();
 const onSaved=vi.fn().mockResolvedValue(undefined);
 const render=()=>{
  state.values=["Fictional Alex","Fitted outside tap.","2020-01-01T10:00",false,"",[]];
  const tree=(child.type as (props:Props)=>React.ReactNode)({...child.props,onSaved});
  return elements(tree).find(node=>node.type==="button")!.props.onClick!;
 };
 let finish!:(value:unknown)=>void;
 const json=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json}).mockResolvedValueOnce({ok:true,json:async()=>[]});
 vi.stubGlobal("fetch",fetch);
 render()();
 await vi.waitFor(()=>expect(json).toHaveBeenCalledTimes(1));
 expect(fetch).toHaveBeenCalledTimes(1);expect(onSaved).not.toHaveBeenCalled();
 finish({version:"late-source-receipt.v1",jobId:"11111111-1111-4111-8111-111111111111",statedSentAt:"2020-01-01T10:00:00Z",
  evidenceAfterLock:true,environment:"synthetic_demo",realExternalActions:0,
  record:{id:"11111111-1111-4111-8111-111111111112",commandId:"11111111-1111-4111-8111-111111111113",
   text:"Fitted outside tap.",actualTesterMembershipId:"11111111-1111-4111-8111-111111111114",
   fictionalCustomer:{kind:"named_fictional_customer",name:"Fictional Alex"},
   evidence:{id:"11111111-1111-4111-8111-111111111112",objectVersionId:"version",sha256:"a".repeat(64),serverReceivedAt:"2026-11-03T00:00:00Z"}}});
 await vi.waitFor(()=>expect(onSaved).toHaveBeenCalledTimes(1));
 expect(fetch).toHaveBeenCalledTimes(2);
 fetch.mockResolvedValueOnce({ok:true,json:async()=>({invalid:"receipt"})});
 render()();
 await vi.waitFor(()=>expect(state.set).toHaveBeenCalledWith("The result is unknown. Retry the same import to check its saved receipt."));
 expect(fetch).toHaveBeenCalledTimes(3);expect(onSaved).toHaveBeenCalledTimes(1);
});
