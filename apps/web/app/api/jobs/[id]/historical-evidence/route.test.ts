import {beforeEach,afterEach,expect,it,vi} from "vitest";
const {save,history,cookie}=vi.hoisted(()=>({save:vi.fn(),history:vi.fn(),cookie:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:cookie})}));
vi.mock("../../../../lib/workspace-server",()=>({workspaceApplication:async()=>({jobSources:{importHistorical:save,historical:history}})}));
vi.mock("../../../../lib/synthetic-server",()=>({hasSyntheticSession:(value:unknown)=>!!value}));
import {GET,POST} from "./route";
const context={params:Promise.resolve({id:"job"})};
const request=(body:string)=>new Request("https://fictional.invalid/api/jobs/job/historical-evidence",{method:"POST",body});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("JOBGUARD_ENV","synthetic_demo");cookie.mockReturnValue({value:"t".repeat(43)});});
afterEach(()=>vi.unstubAllEnvs());
it("saves only through the distinct command, with no-store",async()=>{
 save.mockResolvedValue({evidenceAfterLock:true});
 const response=await POST(request('{"version":"late-source-import.v1"}'),context);
 expect(response.status).toBe(201);expect(response.headers.get("cache-control")).toBe("no-store");
 expect(await response.json()).toEqual({evidenceAfterLock:true});expect(save).toHaveBeenCalledWith("job",{version:"late-source-import.v1"});
});
it("refuses unauthenticated, real mode and malformed requests without effects",async()=>{
 cookie.mockReturnValue(undefined);expect((await POST(request("{}"),context)).status).toBe(401);
 cookie.mockReturnValue({value:"t".repeat(43)});expect((await POST(request("{"),context)).status).toBe(400);
 vi.stubEnv("JOBGUARD_ENV","pilot_no_charge");expect((await POST(request("{}"),context)).status).toBe(403);
 expect(save).not.toHaveBeenCalled();
});

it("reload reads the imported original through the authenticated source history",async()=>{
 history.mockResolvedValue([{record:{text:"Fitted outside tap."}}]);
 const response=await GET(request("{}"),context);
 expect(response.headers.get("cache-control")).toBe("no-store");
 expect(await response.json()).toEqual([{record:{text:"Fitted outside tap."}}]);expect(history).toHaveBeenCalledWith("job");
 cookie.mockReturnValue(undefined);expect((await GET(request("{}"),context)).status).toBe(401);
 expect(history).toHaveBeenCalledTimes(1);
});
