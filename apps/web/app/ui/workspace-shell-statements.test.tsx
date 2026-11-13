import * as React from "react";
import { afterEach,expect,it,vi } from "vitest";
import { WorkspaceShell } from "./workspace-shell";
import { SimulationFeeStatements } from "./simulation-fee-statements";
const state=vi.hoisted(()=>({values:[] as unknown[]}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),useState:()=>[state.values.shift(),vi.fn()],useRef:(current:unknown)=>({current}),useCallback:(fn:unknown)=>fn,useEffect:()=>undefined}));
afterEach(()=>vi.unstubAllGlobals());
const jobId="11111111-1111-4111-8111-111111111112";
function panels(node:React.ReactNode):React.ReactElement[]{
 if(Array.isArray(node))return node.flatMap(panels);
 if(!React.isValidElement<{children?:React.ReactNode}>(node))return [];
 return node.type===SimulationFeeStatements?[node]:panels(node.props.children);
}
for(const capture of [false,true])it.each(["draft","quoting","accepted","live","invoiced","paid","lost"])(`capture=${capture}: mounts statement reads only for started work (%s)`,status=>{
 vi.stubGlobal("React",React);
 const job={id:jobId,status,title:"Fictional job",revision:1};
 state.values=capture?[null,{jobId,status,proposal:{lines:[]}},null,false,""]:[job,null,null,false,""];
 expect(panels(WorkspaceShell({jobId}))).toHaveLength(["live","invoiced","paid"].includes(status)?1:0);
});
